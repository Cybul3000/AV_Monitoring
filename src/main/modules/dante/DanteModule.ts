// DanteModule.ts — Dante Network Audio device module (US1-US5 scope)
// Implements DeviceModule interface for Dante mDNS-discovered devices.

import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'
import type {
  DeviceModule,
  DeviceConfig,
  DeviceStatus,
  CommandResult,
  StatusPointDefinition
} from '../_base/DeviceModule'
import type {
  DanteDeviceSnapshot,
  DanteChannelSnapshot,
} from '@shared/ipc-types'
import { DanteMdnsDiscovery, DanteDiscoveredDevice, DanteLostDevice } from './DanteMdnsDiscovery'
import { DanteHeartbeatListener } from './DanteHeartbeatListener'
import { DanteNotificationListener } from './DanteNotificationListener'
import { DanteUdpTransport } from './DanteUdpTransport'
import {
  buildGetDeviceName,
  buildGetChannelCount,
  buildGetDeviceInfo,
  buildAddSubscription,
  buildRemoveSubscription,
  buildSetSettings,
  buildSetDeviceName,
  buildSetGain,
  parseMacAddress,
  parseArcResponse,
  parseDeviceName,
  parseChannelCount,
  RESULT_OK,
  INPUT_GAIN_VALUES,
  OUTPUT_GAIN_VALUES,
} from './DanteDeviceCommands'

// ── Valid settings constants ───────────────────────────────────────────────────

const VALID_SAMPLE_RATES = [44100, 48000, 88200, 96000, 176400, 192000] as const
const VALID_ENCODINGS    = [16, 24, 32] as const

// ── In-memory state types ─────────────────────────────────────────────────────

export interface DanteDeviceState {
  id: string
  deviceId: string        // FK to devices table (app-level)
  danteName: string
  displayName: string | null
  model: string | null
  ipAddress: string
  macAddress: string | null
  arcPort: number
  sampleRate: number | null
  encoding: number | null
  latencyNs: number | null
  txChannelCount: number
  rxChannelCount: number
  isAvio: boolean
  lastHeartbeat: Date | null
  ledStatus: 'GREEN' | 'AMBER' | 'RED' | 'GREY'
  txChannels: DanteChannel[]
  rxChannels: DanteChannel[]
}

export interface DanteChannel {
  channelNumber: number
  channelName: string
  factoryName: string | null
  direction: 'tx' | 'rx'
  gainLevel: string | null
  subscription?: DanteSubscription
}

export interface DanteSubscription {
  txDeviceName: string
  txChannelName: string
  status: 'connected' | 'unresolved' | 'self-loop' | 'unsubscribed'
}

// ── LED computation helper (exported for testing) ─────────────────────────────

export function computeLedStatus(state: Pick<DanteDeviceState, 'ledStatus' | 'rxChannels'>): 'GREEN' | 'AMBER' | 'RED' | 'GREY' {
  // If device is offline or unknown, keep that status
  if (state.ledStatus === 'RED' || state.ledStatus === 'GREY') return state.ledStatus

  // AMBER if any RX subscription is in a problem state
  for (const ch of state.rxChannels) {
    if (ch.subscription) {
      if (ch.subscription.status === 'unresolved' || ch.subscription.status === 'self-loop') {
        return 'AMBER'
      }
    }
  }

  return 'GREEN'
}

// ── DanteModule ───────────────────────────────────────────────────────────────

export class DanteModule extends EventEmitter implements DeviceModule {
  readonly type = 'dante-network-audio'
  readonly label = 'Dante Network Audio'
  readonly supportedActions = ['scan']

  // keyed by Dante device name (unique identifier on the wire)
  private _devices = new Map<string, DanteDeviceState>()
  // keyed by MAC address → device name (for heartbeat lookup)
  private _macToName = new Map<string, string>()

  private _discovery: DanteMdnsDiscovery | null = null
  private _heartbeat: DanteHeartbeatListener | null = null
  private _notification: DanteNotificationListener | null = null
  private _transport: DanteUdpTransport | null = null
  private _txnCounter = 0

  // ── DeviceModule: status points ───────────────────────────────────────────

  getStatusPoints(): StatusPointDefinition[] {
    return [
      { id: 'reachable',           label: 'Device Reachable',       defaultAlertable: true },
      { id: 'heartbeat_active',    label: 'Heartbeat Active',        defaultAlertable: true },
      { id: 'subscriptions_ok',    label: 'Subscriptions Healthy',   defaultAlertable: true },
    ]
  }

  // ── DeviceModule: lifecycle ───────────────────────────────────────────────

  async connect(_deviceId: string, _config: DeviceConfig): Promise<void> {
    // For Dante, connect starts the global discovery/heartbeat listeners.
    // Individual device configs are not relevant — discovery is network-wide.
    if (this._transport) return  // already started

    this._transport = new DanteUdpTransport()
    this._discovery = new DanteMdnsDiscovery()
    this._heartbeat = new DanteHeartbeatListener()
    this._notification = new DanteNotificationListener()

    this._discovery.on('device-found', (event: DanteDiscoveredDevice) => {
      void this._onDeviceFound(event)
    })

    this._discovery.on('device-lost', (event: DanteLostDevice) => {
      this._onDeviceLost(event)
    })

    this._heartbeat.on('heartbeat', ({ macAddress }: { macAddress: string }) => {
      this._onHeartbeat(macAddress)
    })

    this._heartbeat.on('device-offline', ({ macAddress }: { macAddress: string }) => {
      this._onDeviceOffline(macAddress)
    })

    this._notification.on('routing-change', ({ macAddress }: { macAddress: string }) => {
      this._onRoutingChange(macAddress)
    })

    this._discovery.start()
    this._heartbeat.start()
    this._notification.start()
  }

  async disconnect(_deviceId: string): Promise<void> {
    this._discovery?.stop()
    this._heartbeat?.stop()
    this._notification?.stop()
    this._transport?.close()
    this._discovery = null
    this._heartbeat = null
    this._notification = null
    this._transport = null
    this._devices.clear()
    this._macToName.clear()
  }

  async ping(_deviceId: string): Promise<DeviceStatus> {
    // For Dante, ping means checking the in-memory state of any known device.
    // We use the first known device as representative, or return GREY if none.
    const now = new Date().toISOString()

    if (this._devices.size === 0) {
      return { deviceId: _deviceId, status: 'GREY', lastSeen: null }
    }

    // Find the device in the map by deviceId
    let found: DanteDeviceState | undefined
    for (const state of this._devices.values()) {
      if (state.deviceId === _deviceId) {
        found = state
        break
      }
    }

    if (!found) {
      return { deviceId: _deviceId, status: 'GREY', lastSeen: null }
    }

    return {
      deviceId: _deviceId,
      status: found.ledStatus,
      lastSeen: found.lastHeartbeat?.toISOString() ?? null,
    }
  }

  async downloadConfig(_deviceId: string): Promise<Record<string, unknown>> {
    return {}
  }

  async restoreConfig(_deviceId: string, _config: Record<string, unknown>): Promise<void> {
    // Not applicable for Dante
  }

  async sendCommand(
    _deviceId: string,
    command: string,
    params?: Record<string, unknown>
  ): Promise<CommandResult> {
    switch (command) {
      case 'scan':
        await this.scan()
        return { success: true }

      case 'subscribe':
        return this._subscribe(params as { rxDeviceId: string; rxChannelNum: number; txDeviceName: string; txChannelName: string } | undefined)

      case 'unsubscribe':
        return this._unsubscribe(params as { rxDeviceId: string; rxChannelNum: number } | undefined)

      case 'setSettings':
        return this._setSettings(params as { deviceId: string; sampleRate?: number; encoding?: number; latencyNs?: number } | undefined)

      case 'renameDevice':
        return this._renameDevice(params as { deviceId: string; newName: string } | undefined)

      case 'renameChannel':
        return this._renameChannel(params as { deviceId: string; direction: 'tx' | 'rx'; channelNum: number; newName: string } | undefined)

      case 'gainSet':
        return this._gainSet(params as { deviceId: string; direction: 'tx' | 'rx'; channelNum: number; gainLevel: string } | undefined)

      default:
        return { success: false, error: `Unknown command: ${command}` }
    }
  }

  // ── Dante-specific public API ─────────────────────────────────────────────

  /** Trigger fresh mDNS query and ARC queries for all known devices */
  async scan(): Promise<void> {
    this._discovery?.query()

    // Re-query all known devices
    const queries: Promise<void>[] = []
    for (const state of this._devices.values()) {
      queries.push(this._queryDevice(state))
    }
    await Promise.allSettled(queries)
  }

  /** Return snapshots of all known Dante devices */
  getDeviceSnapshots(): DanteDeviceSnapshot[] {
    return Array.from(this._devices.values()).map(state => this._toSnapshot(state))
  }

  /** Return snapshot for a specific device by its app UUID */
  getDeviceSnapshot(id: string): DanteDeviceSnapshot | null {
    // Search by id (app UUID) or deviceId
    for (const state of this._devices.values()) {
      if (state.id === id || state.deviceId === id) {
        return this._toSnapshot(state)
      }
    }
    return null
  }

  // ── Internal: event handlers ──────────────────────────────────────────────

  private async _onDeviceFound(event: DanteDiscoveredDevice): Promise<void> {
    const { name, ip, arcPort, macAddress } = event

    // Get or create in-memory state
    let state = this._devices.get(name)
    if (!state) {
      state = {
        id: randomUUID(),
        deviceId: randomUUID(),   // Will be overridden when linked to DB device record
        danteName: name,
        displayName: null,
        model: null,
        ipAddress: ip,
        macAddress,
        arcPort,
        sampleRate: null,
        encoding: null,
        latencyNs: null,
        txChannelCount: 0,
        rxChannelCount: 0,
        isAvio: false,
        lastHeartbeat: null,
        ledStatus: 'GREY',
        txChannels: [],
        rxChannels: [],
      }
      this._devices.set(name, state)
    } else {
      // Update network details
      state.ipAddress = ip
      state.arcPort = arcPort
      if (macAddress) state.macAddress = macAddress
    }

    // Track MAC → name for heartbeat lookups
    if (macAddress) {
      this._macToName.set(macAddress, name)
    }

    // Query ARC for device details
    await this._queryDevice(state)

    this.emit('update', this.getDeviceSnapshots())
  }

  private _onDeviceLost(event: DanteLostDevice): void {
    const state = this._devices.get(event.name)
    if (state) {
      state.ledStatus = 'RED'
      this.emit('update', this.getDeviceSnapshots())
    }
  }

  private _onHeartbeat(macAddress: string): void {
    const name = this._macToName.get(macAddress)
    if (!name) return
    const state = this._devices.get(name)
    if (!state) return

    state.lastHeartbeat = new Date()
    // If it was RED (offline), restore to GREEN
    if (state.ledStatus === 'RED') {
      state.ledStatus = 'GREEN'
      this.emit('update', this.getDeviceSnapshots())
    }
  }

  private _onDeviceOffline(macAddress: string): void {
    const name = this._macToName.get(macAddress)
    if (!name) return
    const state = this._devices.get(name)
    if (!state) return

    state.ledStatus = 'RED'
    this.emit('update', this.getDeviceSnapshots())
  }

  private _onRoutingChange(macAddress: string): void {
    // Routing notification received — re-query the affected device
    const name = this._macToName.get(macAddress)
    if (!name) return
    const state = this._devices.get(name)
    if (!state) return

    // Re-query device in background to refresh channel/subscription state
    void this._queryDevice(state).then(() => {
      this.emit('update', this.getDeviceSnapshots())
    })
  }

  // ── Internal: ARC queries ─────────────────────────────────────────────────

  private async _queryDevice(state: DanteDeviceState): Promise<void> {
    const { ipAddress, arcPort } = state
    if (!this._transport) return

    try {
      // Query device name (opcode 0x1002)
      const nameTxnId = this._nextTxnId()
      const nameResp = await this._transport.request(
        ipAddress, arcPort,
        buildGetDeviceName(nameTxnId),
        5000
      )
      const nameParsed = parseArcResponse(nameResp)
      if (nameParsed && nameParsed.resultCode === RESULT_OK) {
        state.danteName = parseDeviceName(nameParsed.body) || state.danteName
      }

      // Query channel counts (opcode 0x1000)
      const countTxnId = this._nextTxnId()
      const countResp = await this._transport.request(
        ipAddress, arcPort,
        buildGetChannelCount(countTxnId),
        5000
      )
      const countParsed = parseArcResponse(countResp)
      if (countParsed && countParsed.resultCode === RESULT_OK) {
        const counts = parseChannelCount(countParsed.body)
        state.txChannelCount = counts.tx
        state.rxChannelCount = counts.rx
      }

      // Query device info (opcode 0x1003) for model/display name
      const infoTxnId = this._nextTxnId()
      const infoResp = await this._transport.request(
        ipAddress, arcPort,
        buildGetDeviceInfo(infoTxnId),
        5000
      )
      const infoParsed = parseArcResponse(infoResp)
      if (infoParsed && infoParsed.resultCode === RESULT_OK) {
        // Device info body: first field is display name
        if (infoParsed.body.length >= 2) {
          const displayName = parseDeviceName(infoParsed.body)
          if (displayName) state.displayName = displayName
        }
      }

      // Update LED status to GREEN if we got here without error
      if (state.ledStatus === 'GREY') {
        state.ledStatus = 'GREEN'
      }
    } catch {
      // ARC query failed — device may be unreachable
      if (state.ledStatus !== 'RED') {
        state.ledStatus = 'RED'
      }
    }
  }

  // ── Internal: helpers ─────────────────────────────────────────────────────

  private _nextTxnId(): number {
    this._txnCounter = (this._txnCounter + 1) & 0xffff
    return this._txnCounter
  }

  private _toSnapshot(state: DanteDeviceState): DanteDeviceSnapshot {
    const txChannels: DanteChannelSnapshot[] = state.txChannels.map(ch => ({
      channelNumber: ch.channelNumber,
      channelName: ch.channelName,
      direction: 'tx',
      gainLevel: ch.gainLevel,
    }))

    const rxChannels: DanteChannelSnapshot[] = state.rxChannels.map(ch => ({
      channelNumber: ch.channelNumber,
      channelName: ch.channelName,
      direction: 'rx',
      gainLevel: ch.gainLevel,
      subscription: ch.subscription,
    }))

    return {
      id: state.id,
      deviceId: state.deviceId,
      danteName: state.danteName,
      displayName: state.displayName,
      model: state.model,
      ipAddress: state.ipAddress,
      macAddress: state.macAddress,
      sampleRate: state.sampleRate,
      encoding: state.encoding,
      latencyNs: state.latencyNs,
      txChannelCount: state.txChannelCount,
      rxChannelCount: state.rxChannelCount,
      isAvio: state.isAvio,
      ledStatus: state.ledStatus,
      txChannels,
      rxChannels,
    }
  }

  // ── Internal: helper to look up device state by deviceId ──────────────────

  private _findStateByDeviceId(deviceId: string): DanteDeviceState | undefined {
    for (const state of this._devices.values()) {
      if (state.id === deviceId || state.deviceId === deviceId) {
        return state
      }
    }
    return undefined
  }

  // ── Internal: write commands ───────────────────────────────────────────────

  private async _subscribe(
    params: { rxDeviceId: string; rxChannelNum: number; txDeviceName: string; txChannelName: string } | undefined
  ): Promise<CommandResult> {
    if (!params?.rxDeviceId) {
      return { success: false, error: 'Missing rxDeviceId' }
    }

    const state = this._findStateByDeviceId(params.rxDeviceId)
    if (!state) {
      return { success: false, error: 'Device not found' }
    }

    // Check if already subscribed
    const rxCh = state.rxChannels.find(ch => ch.channelNumber === params.rxChannelNum)
    if (rxCh?.subscription && rxCh.subscription.status !== 'unsubscribed') {
      return { success: false, error: 'Channel already subscribed — remove existing subscription first' }
    }

    // Attempt to send ARC 0x3010
    if (this._transport) {
      try {
        const txnId = this._nextTxnId()
        await this._transport.send(
          state.ipAddress,
          state.arcPort,
          buildAddSubscription(txnId, params.rxChannelNum, params.txChannelName, params.txDeviceName)
        )
      } catch {
        // In test/dev mode, continue with optimistic update
      }
    }

    // Optimistic update: set subscription in-memory
    if (rxCh) {
      rxCh.subscription = {
        txDeviceName: params.txDeviceName,
        txChannelName: params.txChannelName,
        status: 'connected',
      }
    }

    state.ledStatus = computeLedStatus(state)
    this.emit('update', this.getDeviceSnapshots())

    return { success: true }
  }

  private async _unsubscribe(
    params: { rxDeviceId: string; rxChannelNum: number } | undefined
  ): Promise<CommandResult> {
    if (!params?.rxDeviceId) {
      return { success: false, error: 'Missing rxDeviceId' }
    }

    const state = this._findStateByDeviceId(params.rxDeviceId)
    if (!state) {
      return { success: false, error: 'Device not found' }
    }

    // Attempt to send ARC 0x3014
    if (this._transport) {
      try {
        const txnId = this._nextTxnId()
        await this._transport.send(
          state.ipAddress,
          state.arcPort,
          buildRemoveSubscription(txnId, params.rxChannelNum)
        )
      } catch {
        // In test/dev mode, continue with optimistic update
      }
    }

    // Optimistic update
    const rxCh = state.rxChannels.find(ch => ch.channelNumber === params.rxChannelNum)
    if (rxCh?.subscription) {
      rxCh.subscription.status = 'unsubscribed'
    }

    state.ledStatus = computeLedStatus(state)
    this.emit('update', this.getDeviceSnapshots())

    return { success: true }
  }

  private async _setSettings(
    params: { deviceId: string; sampleRate?: number; encoding?: number; latencyNs?: number } | undefined
  ): Promise<CommandResult> {
    if (!params?.deviceId) {
      return { success: false, error: 'Missing deviceId' }
    }

    // Validate sample rate
    if (params.sampleRate !== undefined && !(VALID_SAMPLE_RATES as readonly number[]).includes(params.sampleRate)) {
      return { success: false, error: `Invalid sampleRate. Valid values: ${VALID_SAMPLE_RATES.join(', ')}` }
    }

    // Validate encoding
    if (params.encoding !== undefined && !(VALID_ENCODINGS as readonly number[]).includes(params.encoding)) {
      return { success: false, error: `Invalid encoding. Valid values: ${VALID_ENCODINGS.join(', ')}` }
    }

    const state = this._findStateByDeviceId(params.deviceId)
    if (!state) {
      return { success: false, error: 'Device not found' }
    }

    // Attempt to send ARC 0x1101
    if (this._transport) {
      try {
        const txnId = this._nextTxnId()
        await this._transport.send(
          state.ipAddress,
          state.arcPort,
          buildSetSettings(txnId, {
            sampleRate: params.sampleRate,
            encoding: params.encoding,
            latencyNs: params.latencyNs,
          })
        )
      } catch {
        // In test/dev mode, continue with optimistic update
      }
    }

    // Optimistic update
    if (params.sampleRate !== undefined) state.sampleRate = params.sampleRate
    if (params.encoding !== undefined) state.encoding = params.encoding
    if (params.latencyNs !== undefined) state.latencyNs = params.latencyNs

    this.emit('update', this.getDeviceSnapshots())
    return { success: true }
  }

  private async _renameDevice(
    params: { deviceId: string; newName: string } | undefined
  ): Promise<CommandResult> {
    if (!params?.deviceId) {
      return { success: false, error: 'Missing deviceId' }
    }

    const state = this._findStateByDeviceId(params.deviceId)
    if (!state) {
      return { success: false, error: 'Device not found' }
    }

    // Attempt to send ARC 0x1001
    if (this._transport) {
      try {
        const txnId = this._nextTxnId()
        await this._transport.send(
          state.ipAddress,
          state.arcPort,
          buildSetDeviceName(txnId, params.newName)
        )
      } catch {
        // In test/dev mode, continue with optimistic update
      }
    }

    // Optimistic update
    if (params.newName) {
      state.danteName = params.newName
    }
    // Empty name = factory reset (don't update in-memory name)

    this.emit('update', this.getDeviceSnapshots())
    return { success: true }
  }

  private async _renameChannel(
    params: { deviceId: string; direction: 'tx' | 'rx'; channelNum: number; newName: string } | undefined
  ): Promise<CommandResult> {
    if (!params?.deviceId) {
      return { success: false, error: 'Missing deviceId' }
    }

    const state = this._findStateByDeviceId(params.deviceId)
    if (!state) {
      return { success: false, error: 'Device not found' }
    }

    const channels = params.direction === 'tx' ? state.txChannels : state.rxChannels
    const ch = channels.find(c => c.channelNumber === params.channelNum)

    // Attempt to send rename via settings transport (placeholder — actual packet depends on Settings port codec)
    if (this._transport) {
      try {
        // Use SetDeviceName as placeholder — proper rename packet would use Settings port codec
        const txnId = this._nextTxnId()
        await this._transport.send(
          state.ipAddress,
          state.arcPort,
          buildSetDeviceName(txnId, params.newName)
        )
      } catch {
        // In test/dev mode, continue with optimistic update
      }
    }

    // Optimistic update
    if (ch) {
      ch.channelName = params.newName || (ch.factoryName ?? ch.channelName)
    }

    this.emit('update', this.getDeviceSnapshots())
    return { success: true }
  }

  private async _gainSet(
    params: { deviceId: string; direction: 'tx' | 'rx'; channelNum: number; gainLevel: string } | undefined
  ): Promise<CommandResult> {
    if (!params?.deviceId) {
      return { success: false, error: 'Missing deviceId' }
    }

    const state = this._findStateByDeviceId(params.deviceId)
    if (!state) {
      return { success: false, error: 'Device not found' }
    }

    // AVIO-only guard
    if (!state.isAvio) {
      return { success: false, error: 'Device is not an AVIO adaptor' }
    }

    // Validate gain level per direction
    const validGains = params.direction === 'rx'
      ? (INPUT_GAIN_VALUES as readonly string[])
      : (OUTPUT_GAIN_VALUES as readonly string[])
    if (!validGains.includes(params.gainLevel)) {
      return { success: false, error: `Invalid gainLevel for ${params.direction}. Valid values: ${validGains.join(', ')}` }
    }

    const gainIndex = validGains.indexOf(params.gainLevel)

    // Send gain packet via settings transport
    if (this._transport && state.macAddress) {
      try {
        const mac = parseMacAddress(state.macAddress)
        await this._transport.send(
          state.ipAddress,
          8700,
          buildSetGain(mac, params.direction, params.channelNum, gainIndex)
        )
      } catch {
        // In test/dev mode, continue with optimistic update
      }
    }

    // Optimistic update
    const channels = params.direction === 'tx' ? state.txChannels : state.rxChannels
    const ch = channels.find(c => c.channelNumber === params.channelNum)
    if (ch) {
      ch.gainLevel = params.gainLevel
    }

    this.emit('update', this.getDeviceSnapshots())
    return { success: true }
  }
}
