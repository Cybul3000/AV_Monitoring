import type {
  DeviceModule,
  DeviceConfig,
  DeviceStatus,
  CommandResult,
  StatusPointDefinition
} from '../_base/DeviceModule'
import { getDb } from '../../db/database'
import { loadDeviceCredentials } from '../../platform/credentials'
import { TTPTransport, parseTTPValue } from './TTPTransport'
import type { TTPResponse } from './TTPTransport'
import {
  createEmptyState,
  aggregateStatus
} from './TesiraDeviceState'
import type {
  TesiraState,
  BlockState,
  ChannelState,
  FaultEntry
} from './TesiraDeviceState'

// ── DB row types ──────────────────────────────────────────────────────────────

interface BlockConfigRow {
  id: string
  device_id: string
  block_type: 'level' | 'dialer'
  instance_tag: string
  label: string
  channel_count: number
  is_critical: number
  sort_order: number
}

interface PresetConfigRow {
  id: string
  device_id: string
  name: string
  label: string
  sort_order: number
}

// ── Per-device connection context ─────────────────────────────────────────────

interface DeviceContext {
  deviceId: string
  config: DeviceConfig
  transport: TTPTransport
  state: TesiraState
  pollTimer: ReturnType<typeof setInterval> | null
}

// ── Level clamping ────────────────────────────────────────────────────────────

const LEVEL_MIN = -100
const LEVEL_MAX = 12

function clampLevel(levelDb: number): number {
  return Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, levelDb))
}

// ── BiampTesiraModule ─────────────────────────────────────────────────────────

export class BiampTesiraModule implements DeviceModule {
  readonly type = 'biamp-tesira'
  readonly label = 'Biamp Tesira DSP'
  readonly supportedActions = ['setMute', 'toggleMute', 'setLevel', 'recallPreset', 'ping']

  private readonly _devices = new Map<string, DeviceContext>()

  // ── Status points ──────────────────────────────────────────────────────────

  getStatusPoints(): StatusPointDefinition[] {
    return [
      { id: 'reachable',     label: 'Device Reachable',            defaultAlertable: true  },
      { id: 'fault_free',    label: 'No Active Faults',            defaultAlertable: true  },
      { id: 'audio_levels',  label: 'Audio Level Blocks Normal',   defaultAlertable: false }
    ]
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async connect(deviceId: string, config: DeviceConfig): Promise<void> {
    const host = config.host ?? 'localhost'
    const port = config.port ?? 22
    const transportType: 'ssh' | 'telnet' = port === 22 ? 'ssh' : 'telnet'

    const state = createEmptyState(deviceId, transportType)
    const transport = new TTPTransport()

    const ctx: DeviceContext = {
      deviceId,
      config,
      transport,
      state,
      pollTimer: null
    }

    this._devices.set(deviceId, ctx)

    transport.on('disconnected', () => {
      ctx.state.connected = false
      // pollTimer keeps running — it will produce errors until reconnected
    })

    transport.on('connected', () => {
      void this._onConnected(ctx)
    })

    transport.on('push', (publishToken: string, valueStr: string) => {
      this._handlePush(ctx, publishToken, valueStr)
    })

    transport.on('error', (_err: Error) => {
      // Non-fatal: transport handles reconnect internally
    })

    const creds = await loadDeviceCredentials('biamp-tesira', deviceId, ['username', 'password'])
    const username = creds['username'] ?? 'default'
    const password = creds['password'] ?? ''

    await transport.connect(host, port, username, password)
  }

  async disconnect(deviceId: string): Promise<void> {
    const ctx = this._devices.get(deviceId)
    if (!ctx) return

    if (ctx.pollTimer) {
      clearInterval(ctx.pollTimer)
      ctx.pollTimer = null
    }

    ctx.transport.destroy()
    this._devices.delete(deviceId)
  }

  async ping(deviceId: string): Promise<DeviceStatus> {
    const ctx = this._getContext(deviceId)
    await this._runFaultPoll(ctx)

    // Also refresh all block states
    await this._refreshAllBlocks(ctx)

    const status = aggregateStatus(ctx.state)
    return {
      deviceId,
      status,
      lastSeen: ctx.state.connected ? new Date().toISOString() : null,
      meta: this._buildMeta(ctx.state)
    }
  }

  // ── Config (no-op for Biamp) ───────────────────────────────────────────────

  async downloadConfig(_deviceId: string): Promise<Record<string, unknown>> {
    return {}
  }

  async restoreConfig(_deviceId: string, _config: Record<string, unknown>): Promise<void> {
    // No-op
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  async sendCommand(
    deviceId: string,
    command: string,
    params?: Record<string, unknown>
  ): Promise<CommandResult> {
    const ctx = this._getContext(deviceId)

    try {
      switch (command) {
        case 'setMute':    return await this._cmdSetMute(ctx, params)
        case 'toggleMute': return await this._cmdToggleMute(ctx, params)
        case 'setLevel':   return await this._cmdSetLevel(ctx, params)
        case 'recallPreset': return await this._cmdRecallPreset(ctx, params)
        case 'ping':       return this._cmdToPingResult(await this.ping(deviceId))
        default:
          return { success: false, error: `Unknown command: ${command}` }
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  // ── Private: connect sequence ──────────────────────────────────────────────

  private async _onConnected(ctx: DeviceContext): Promise<void> {
    ctx.state.connected = true

    try {
      // 1. Enable verbose mode
      await this._sendSafe(ctx, 'SESSION set verbose true')

      // 2. Device info
      const deviceInfoRes = await this._sendSafe(ctx, 'DEVICE get deviceInfo')
      if (deviceInfoRes.ok) {
        const parsed = parseTTPValue(deviceInfoRes)
        ctx.state.deviceModel     = parsed['deviceModel']     ?? null
        ctx.state.firmwareVersion = parsed['firmwareVersion'] ?? null
        ctx.state.serialNumber    = parsed['serialNumber']    ?? null
      }

      // 3. Network status — best effort
      const netRes = await this._sendSafe(ctx, 'DEVICE get networkStatus')
      if (netRes.ok) {
        const parsed = parseTTPValue(netRes)
        ctx.state.hostname = parsed['hostname'] ?? parsed['hostName'] ?? null
      }

      // 4. Session aliases — log best effort
      const aliasRes = await this._sendSafe(ctx, 'SESSION get aliases')
      if (!aliasRes.ok) {
        // Non-fatal
      }

      // 5. Active fault list
      await this._runFaultPoll(ctx)

      // 6. Load and subscribe to blocks
      await this._initBlocks(ctx)

      // 7. Load presets from DB
      this._loadPresetsFromDb(ctx)

      // 8. Start poll timer
      this._startPollTimer(ctx)

    } catch {
      // Connection may have dropped mid-sequence — transport handles reconnect
    }
  }

  private async _initBlocks(ctx: DeviceContext): Promise<void> {
    const db = getDb()
    const rows = db
      .prepare('SELECT * FROM biamp_block_configs WHERE device_id = ? ORDER BY sort_order')
      .all(ctx.deviceId) as BlockConfigRow[]

    ctx.state.blocks = []

    for (const row of rows) {
      if (row.block_type === 'level') {
        await this._initLevelBlock(ctx, row)
      } else if (row.block_type === 'dialer') {
        await this._initDialerBlock(ctx, row)
      }
    }
  }

  private async _initLevelBlock(ctx: DeviceContext, row: BlockConfigRow): Promise<void> {
    const channels: ChannelState[] = []

    for (let ch = 1; ch <= row.channel_count; ch++) {
      let level: number | null = null
      let mute: boolean | null = null

      const levelRes = await this._sendSafe(ctx, `${row.instance_tag} get level ${ch}`)
      if (levelRes.ok && levelRes.value !== null) {
        const parsed = parseTTPValue(levelRes)
        const raw = parsed['value'] ?? parsed['level'] ?? null
        if (raw !== null) level = parseFloat(raw)
      }

      const muteRes = await this._sendSafe(ctx, `${row.instance_tag} get mute ${ch}`)
      if (muteRes.ok && muteRes.value !== null) {
        const parsed = parseTTPValue(muteRes)
        const raw = parsed['value'] ?? parsed['mute'] ?? null
        if (raw !== null) mute = raw === 'true'
      }

      channels.push({ index: ch, level, mute })

      // Subscribe level
      const levelToken = `${row.instance_tag}_level_${ch}`
      await this._sendSafe(ctx, `${row.instance_tag} subscribe level ${ch} ${levelToken} 500`)

      // Subscribe mute
      const muteToken = `${row.instance_tag}_mute_${ch}`
      await this._sendSafe(ctx, `${row.instance_tag} subscribe mute ${ch} ${muteToken} 100`)
    }

    const block: BlockState = {
      instanceTag: row.instance_tag,
      label: row.label,
      blockType: 'level',
      channels,
      isCritical: row.is_critical === 1
    }

    ctx.state.blocks.push(block)
  }

  private async _initDialerBlock(ctx: DeviceContext, row: BlockConfigRow): Promise<void> {
    let callState: 'IDLE' | 'ACTIVE' | 'FAULT' | null = null
    let privacyMute: boolean | null = null

    const csRes = await this._sendSafe(ctx, `${row.instance_tag} get callState 1`)
    if (csRes.ok && csRes.value !== null) {
      const parsed = parseTTPValue(csRes)
      const raw = parsed['value'] ?? parsed['callState'] ?? null
      if (raw === 'IDLE' || raw === 'ACTIVE' || raw === 'FAULT') callState = raw
    }

    const pmRes = await this._sendSafe(ctx, `${row.instance_tag} get privacyMute 1`)
    if (pmRes.ok && pmRes.value !== null) {
      const parsed = parseTTPValue(pmRes)
      const raw = parsed['value'] ?? parsed['privacyMute'] ?? null
      if (raw !== null) privacyMute = raw === 'true'
    }

    // Subscribe callState
    const csToken = `${row.instance_tag}_callState_1`
    await this._sendSafe(ctx, `${row.instance_tag} subscribe callState 1 ${csToken} 100`)

    // Subscribe privacyMute
    const pmToken = `${row.instance_tag}_privacyMute_1`
    await this._sendSafe(ctx, `${row.instance_tag} subscribe privacyMute 1 ${pmToken} 100`)

    const block: BlockState = {
      instanceTag: row.instance_tag,
      label: row.label,
      blockType: 'dialer',
      callState,
      privacyMute,
      isCritical: row.is_critical === 1
    }

    ctx.state.blocks.push(block)
  }

  private _loadPresetsFromDb(ctx: DeviceContext): void {
    const db = getDb()
    const rows = db
      .prepare('SELECT * FROM biamp_preset_configs WHERE device_id = ? ORDER BY sort_order')
      .all(ctx.deviceId) as PresetConfigRow[]

    ctx.state.presets = rows.map(r => ({ name: r.name, label: r.label }))
  }

  // ── Private: polling ───────────────────────────────────────────────────────

  private _startPollTimer(ctx: DeviceContext, intervalMs = 15_000): void {
    if (ctx.pollTimer) clearInterval(ctx.pollTimer)
    ctx.pollTimer = setInterval(() => {
      void this._runFaultPoll(ctx)
    }, intervalMs)
  }

  private async _runFaultPoll(ctx: DeviceContext): Promise<void> {
    const res = await this._sendSafe(ctx, 'DEVICE get activeFaultList')
    if (res.ok) {
      ctx.state.activeFaults = this._parseFaultList(res)
    }
  }

  private async _refreshAllBlocks(ctx: DeviceContext): Promise<void> {
    for (const block of ctx.state.blocks) {
      if (block.blockType === 'level' && block.channels) {
        for (const ch of block.channels) {
          const levelRes = await this._sendSafe(ctx, `${block.instanceTag} get level ${ch.index}`)
          if (levelRes.ok && levelRes.value !== null) {
            const parsed = parseTTPValue(levelRes)
            const raw = parsed['value'] ?? parsed['level'] ?? null
            if (raw !== null) ch.level = parseFloat(raw)
          }

          const muteRes = await this._sendSafe(ctx, `${block.instanceTag} get mute ${ch.index}`)
          if (muteRes.ok && muteRes.value !== null) {
            const parsed = parseTTPValue(muteRes)
            const raw = parsed['value'] ?? parsed['mute'] ?? null
            if (raw !== null) ch.mute = raw === 'true'
          }
        }
      } else if (block.blockType === 'dialer') {
        const csRes = await this._sendSafe(ctx, `${block.instanceTag} get callState 1`)
        if (csRes.ok && csRes.value !== null) {
          const parsed = parseTTPValue(csRes)
          const raw = parsed['value'] ?? parsed['callState'] ?? null
          if (raw === 'IDLE' || raw === 'ACTIVE' || raw === 'FAULT') block.callState = raw
        }
      }
    }
  }

  // ── Private: push event handler ────────────────────────────────────────────

  private _handlePush(ctx: DeviceContext, publishToken: string, valueStr: string): void {
    // publishToken format: {instanceTag}_{field}_{channel}
    // e.g. Level1_level_1, Level1_mute_2, Dialer1_callState_1, Dialer1_privacyMute_1

    const parts = publishToken.split('_')
    if (parts.length < 3) return

    // Field is second-to-last, channel is last, instanceTag is everything before
    const channel = parseInt(parts[parts.length - 1], 10)
    const field = parts[parts.length - 2]
    const instanceTag = parts.slice(0, parts.length - 2).join('_')

    const block = ctx.state.blocks.find(b => b.instanceTag === instanceTag)
    if (!block) return

    // Parse value from the push value string
    const mockResponse: TTPResponse = { ok: true, value: valueStr, error: null }
    const parsed = parseTTPValue(mockResponse)
    const rawValue = parsed['value'] ?? valueStr.trim()

    if (block.blockType === 'level') {
      const ch = block.channels?.find(c => c.index === channel)
      if (!ch) return

      if (field === 'level') {
        ch.level = parseFloat(rawValue)
      } else if (field === 'mute') {
        ch.mute = rawValue === 'true'
      }
    } else if (block.blockType === 'dialer') {
      if (field === 'callState') {
        if (rawValue === 'IDLE' || rawValue === 'ACTIVE' || rawValue === 'FAULT') {
          block.callState = rawValue
        }
      } else if (field === 'privacyMute') {
        block.privacyMute = rawValue === 'true'
      }
    }
  }

  // ── Private: command helpers ───────────────────────────────────────────────

  private async _cmdSetMute(ctx: DeviceContext, params?: Record<string, unknown>): Promise<CommandResult> {
    const instanceTag = params?.['instanceTag'] as string | undefined
    const channel = params?.['channel'] as number | undefined
    const mute = params?.['mute'] as boolean | undefined

    if (!instanceTag || channel === undefined || mute === undefined) {
      return { success: false, error: 'setMute requires instanceTag, channel, mute' }
    }

    const cmd = `${instanceTag} set mute ${channel} ${mute ? 'true' : 'false'}`
    const res = await ctx.transport.send(cmd)
    return { success: res.ok, error: res.error ?? undefined }
  }

  private async _cmdToggleMute(ctx: DeviceContext, params?: Record<string, unknown>): Promise<CommandResult> {
    const instanceTag = params?.['instanceTag'] as string | undefined
    const channel = params?.['channel'] as number | undefined

    if (!instanceTag || channel === undefined) {
      return { success: false, error: 'toggleMute requires instanceTag and channel' }
    }

    const cmd = `${instanceTag} toggle mute ${channel}`
    const res = await ctx.transport.send(cmd)
    return { success: res.ok, error: res.error ?? undefined }
  }

  private async _cmdSetLevel(ctx: DeviceContext, params?: Record<string, unknown>): Promise<CommandResult> {
    const instanceTag = params?.['instanceTag'] as string | undefined
    const channel = params?.['channel'] as number | undefined
    const rawLevel = params?.['levelDb'] as number | undefined

    if (!instanceTag || channel === undefined || rawLevel === undefined) {
      return { success: false, error: 'setLevel requires instanceTag, channel, levelDb' }
    }

    const levelDb = clampLevel(rawLevel)
    const cmd = `${instanceTag} set level ${channel} ${levelDb}`
    const res = await ctx.transport.send(cmd)
    return { success: res.ok, error: res.error ?? undefined }
  }

  private async _cmdRecallPreset(ctx: DeviceContext, params?: Record<string, unknown>): Promise<CommandResult> {
    const name = params?.['name'] as string | undefined

    if (!name) {
      return { success: false, error: 'recallPreset requires name' }
    }

    const cmd = `DEVICE recallPresetByName "${name}"`
    const res = await ctx.transport.send(cmd)
    return { success: res.ok, error: res.error ?? undefined }
  }

  private _cmdToPingResult(status: DeviceStatus): CommandResult {
    return {
      success: status.status !== 'RED' && status.status !== 'GREY',
      output: status.status
    }
  }

  // ── Private: fault parsing ─────────────────────────────────────────────────

  private _parseFaultList(res: TTPResponse): FaultEntry[] {
    if (!res.ok || !res.value) return []

    const faults: FaultEntry[] = []
    // activeFaultList is a list of fault objects
    // +OK "list":[{...} {...}] or +OK "value":[] when empty
    const raw = res.value.trim()

    // Empty list
    if (raw.includes('[]') || raw === '"list":[]' || raw === '"value":[]') return []

    // Parse individual fault entries like {"description":"..." "severity":"..." "code":N}
    const faultRe = /\{([^}]+)\}/g
    let match: RegExpExecArray | null
    while ((match = faultRe.exec(raw)) !== null) {
      const entry = match[1]
      const desc = entry.match(/"description"\s*:\s*"([^"]+)"/)
      const sev = entry.match(/"severity"\s*:\s*"([^"]+)"/)
      const code = entry.match(/"code"\s*:\s*(\d+)/)

      if (desc) {
        faults.push({
          description: desc[1],
          severity: sev?.[1],
          code: code ? parseInt(code[1], 10) : undefined
        })
      }
    }

    return faults
  }

  // ── Private: utilities ─────────────────────────────────────────────────────

  /**
   * Send a command without throwing on error. Non-fatal errors (like -ERR address
   * not found or -CANNOT_DELIVER) are returned as ok:false and do NOT crash the module.
   */
  private async _sendSafe(ctx: DeviceContext, command: string): Promise<TTPResponse> {
    try {
      return await ctx.transport.send(command)
    } catch {
      return { ok: false, value: null, error: 'send failed' }
    }
  }

  private _getContext(deviceId: string): DeviceContext {
    const ctx = this._devices.get(deviceId)
    if (!ctx) throw new Error(`BiampTesiraModule: device ${deviceId} not connected`)
    return ctx
  }

  private _buildMeta(state: TesiraState): Record<string, unknown> {
    return {
      deviceModel:     state.deviceModel,
      firmwareVersion: state.firmwareVersion,
      serialNumber:    state.serialNumber,
      hostname:        state.hostname,
      activeFaults:    state.activeFaults,
      blocks:          state.blocks,
      presets:         state.presets,
      transportType:   state.transportType
    }
  }
}
