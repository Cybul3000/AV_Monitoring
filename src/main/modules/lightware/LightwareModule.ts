import type {
  DeviceModule,
  DeviceConfig,
  DeviceStatus,
  CommandResult,
  StatusPointDefinition,
} from '../_base/DeviceModule'
import { LightwareLW3Transport } from './LightwareLW3Transport'
import {
  createEmptyState,
  aggregateStatus,
  type LightwareState,
  type PortState,
} from './LightwareDeviceState'

const DEFAULT_LW3_PORT = 6107
const POLL_INTERVAL_MS = 10_000

interface ActiveDevice {
  deviceId: string
  config: DeviceConfig
  state: LightwareState
  transport: LightwareLW3Transport
  pollTimer: ReturnType<typeof setInterval> | null
  lastSeen: string | null
}

export class LightwareModule implements DeviceModule {
  readonly type = 'lightware-matrix'
  readonly label = 'Lightware Matrix Switcher'
  readonly supportedActions = ['switch', 'switchAll', 'disconnect', 'recallPreset', 'ping']

  private _devices = new Map<string, ActiveDevice>()

  // ── Status points ──────────────────────────────────────────────────────────

  getStatusPoints(): StatusPointDefinition[] {
    return [
      { id: 'reachable', label: 'Device Reachable', defaultAlertable: true },
      { id: 'signal_locked', label: 'All Ports Signal Locked', defaultAlertable: true },
      { id: 'hardware_fault', label: 'Hardware Fault', defaultAlertable: true },
    ]
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async connect(deviceId: string, config: DeviceConfig): Promise<void> {
    // Tear down any existing connection for this device
    if (this._devices.has(deviceId)) {
      await this.disconnect(deviceId)
    }

    const state = createEmptyState(deviceId)
    const transport = new LightwareLW3Transport()

    const device: ActiveDevice = {
      deviceId,
      config,
      state,
      transport,
      pollTimer: null,
      lastSeen: null,
    }
    this._devices.set(deviceId, device)

    // Wire up CHG push events
    transport.on('change', (path, value) => {
      this._handleChange(deviceId, path, value)
    })

    transport.on('connected', () => {
      device.state.connected = true
      device.state.hasEverConnected = true
      device.lastSeen = new Date().toISOString()
      // Run connect snapshot (fire-and-forget; errors logged internally)
      this._runConnectSequence(deviceId).catch(() => {/* handled internally */})
    })

    transport.on('disconnected', () => {
      device.state.connected = false
      if (device.pollTimer) {
        clearInterval(device.pollTimer)
        device.pollTimer = null
      }
    })

    const host = config.host ?? 'localhost'
    const port = config.port ?? DEFAULT_LW3_PORT
    await transport.connect(host, port)
  }

  async disconnect(deviceId: string): Promise<void> {
    const device = this._devices.get(deviceId)
    if (!device) return

    if (device.pollTimer) {
      clearInterval(device.pollTimer)
      device.pollTimer = null
    }
    device.transport.destroy()
    this._devices.delete(deviceId)
  }

  async ping(deviceId: string): Promise<DeviceStatus> {
    const device = this._devices.get(deviceId)
    if (!device) {
      return {
        deviceId,
        status: 'GREY',
        lastSeen: null,
      }
    }

    // Only re-run snapshot if currently connected; no-op otherwise
    if (device.state.connected) {
      try {
        await this._runConnectSequence(deviceId)
        device.lastSeen = new Date().toISOString()
      } catch {
        // Non-fatal — return current state
      }
    }

    return this._buildStatus(device)
  }

  // ── Config ─────────────────────────────────────────────────────────────────

  async downloadConfig(_deviceId: string): Promise<Record<string, unknown>> {
    return {}
  }

  async restoreConfig(_deviceId: string, _config: Record<string, unknown>): Promise<void> {
    // Not supported in v1
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  async sendCommand(
    deviceId: string,
    command: string,
    params?: Record<string, unknown>
  ): Promise<CommandResult> {
    const device = this._devices.get(deviceId)
    if (!device) {
      return { success: false, error: `Device ${deviceId} not connected` }
    }

    if (!device.state.connected) {
      return { success: false, error: 'Device not reachable' }
    }

    const family = device.state.deviceFamily
    const isMX2 = family === 'MX2'

    switch (command) {
      case 'switch': {
        const input = params?.input as string | undefined
        const output = params?.output as string | undefined
        if (!input || !output) {
          return { success: false, error: 'switch requires input and output params' }
        }
        const xpPath = isMX2 ? '/MEDIA/XP/VIDEO' : '/MEDIA/VIDEO/XP'
        const result = await device.transport.send(`CALL ${xpPath}:switch(${input}:${output})`)
        return result.ok
          ? { success: true, output: result.value }
          : { success: false, error: result.value || result.rawLines.join(' ') }
      }

      case 'switchAll': {
        const input = params?.input as string | undefined
        if (!input) {
          return { success: false, error: 'switchAll requires input param' }
        }
        const xpPath = isMX2 ? '/MEDIA/XP/VIDEO' : '/MEDIA/VIDEO/XP'
        const result = await device.transport.send(`CALL ${xpPath}:switchAll(${input})`)
        return result.ok
          ? { success: true, output: result.value }
          : { success: false, error: result.value || result.rawLines.join(' ') }
      }

      case 'disconnect': {
        const output = params?.output as string | undefined
        if (!output) {
          return { success: false, error: 'disconnect requires output param' }
        }
        const xpPath = isMX2 ? '/MEDIA/XP/VIDEO' : '/MEDIA/VIDEO/XP'
        const result = await device.transport.send(`CALL ${xpPath}:switch(0:${output})`)
        return result.ok
          ? { success: true, output: result.value }
          : { success: false, error: result.value || result.rawLines.join(' ') }
      }

      case 'recallPreset': {
        if (isMX2) {
          const name = params?.name as string | undefined
          if (!name) return { success: false, error: 'recallPreset requires name param for MX2' }
          const result = await device.transport.send(`CALL /MEDIA/PRESET/${name}:load()`)
          return result.ok
            ? { success: true, output: result.value }
            : { success: false, error: result.value || result.rawLines.join(' ') }
        } else {
          const index = params?.index as number | undefined
          if (index === undefined) return { success: false, error: 'recallPreset requires index param for MMX' }
          const result = await device.transport.send(`CALL /PRESETS/AVC:load(${index})`)
          return result.ok
            ? { success: true, output: result.value }
            : { success: false, error: result.value || result.rawLines.join(' ') }
        }
      }

      case 'ping': {
        const status = await this.ping(deviceId)
        return { success: true, output: status.status }
      }

      default:
        return { success: false, error: `Unknown command: ${command}` }
    }
  }

  // ── Connect sequence ───────────────────────────────────────────────────────

  private async _runConnectSequence(deviceId: string): Promise<void> {
    const device = this._devices.get(deviceId)
    if (!device) return

    const t = device.transport
    const state = device.state

    // 1. Product name + device family detection
    const productRes = await t.send('GET /.ProductName')
    if (productRes.ok) {
      state.productName = productRes.value
      state.deviceFamily = productRes.value.toUpperCase().includes('MX2') ? 'MX2' : 'MMX'
    }

    // 2. Firmware version
    const fwRes = await t.send('GET /.FirmwareVersion')
    if (fwRes.ok) state.firmwareVersion = fwRes.value

    // 3. Serial number
    const snRes = await t.send('GET /.SerialNumber')
    if (snRes.ok) state.serialNumber = snRes.value

    // 4. GETALL /MEDIA/VIDEO → enumerate ports
    const getAllRes = await t.send('GETALL /MEDIA/VIDEO')
    if (getAllRes.ok) {
      this._parseGetAll(getAllRes.rawLines, state)
    }

    // 5. Routing state: DestinationConnectionList
    const isMX2 = state.deviceFamily === 'MX2'
    const xpPath = isMX2 ? '/MEDIA/XP/VIDEO' : '/MEDIA/VIDEO/XP'
    const routingRes = await t.send(`GET ${xpPath}.DestinationConnectionList`)
    if (routingRes.ok) {
      this._parseDestinationConnectionList(routingRes.value, state)
    }

    // 6. Presets (best effort)
    try {
      if (isMX2) {
        const presetsRes = await t.send('GET /MEDIA/PRESET')
        if (presetsRes.ok) {
          this._parsePresetsResponse(presetsRes.rawLines, state)
        }
      } else {
        const presetsRes = await t.send('GET /PRESETS/AVC/*.Name')
        if (presetsRes.ok) {
          this._parseMMXPresetsResponse(presetsRes.rawLines, state)
        }
      }
    } catch {
      // Non-fatal
    }

    // 7. Subscribe to changes
    await t.send('OPEN /MEDIA/VIDEO')
    if (isMX2) {
      await t.send('OPEN /MEDIA/XP/VIDEO')
    } else {
      await t.send('OPEN /MEDIA/VIDEO/XP')
    }

    // 8. Start health poll
    if (!device.pollTimer) {
      device.pollTimer = setInterval(() => {
        this._pollHealth(deviceId).catch(() => {/* non-fatal */})
      }, POLL_INTERVAL_MS)
    }

    device.lastSeen = new Date().toISOString()
  }

  // ── Health poll ────────────────────────────────────────────────────────────

  private async _pollHealth(deviceId: string): Promise<void> {
    const device = this._devices.get(deviceId)
    if (!device || !device.state.connected) return

    const t = device.transport

    const tempRes = await t.send('GET /SYS.Temperature')
    if (tempRes.ok) {
      const parsed = parseFloat(tempRes.value)
      device.state.temperature = isNaN(parsed) ? null : parsed
    }

    const fanRes = await t.send('GET /SYS.FanStatus')
    if (fanRes.ok) {
      device.state.fanStatus = fanRes.value || null
    }

    device.lastSeen = new Date().toISOString()
  }

  // ── CHG event handling ─────────────────────────────────────────────────────

  private _handleChange(deviceId: string, path: string, value: string): void {
    const device = this._devices.get(deviceId)
    if (!device) return

    const state = device.state

    // Signal present on input port: /MEDIA/VIDEO.SignalPresent_I1
    const signalMatch = /\/MEDIA\/VIDEO\.SignalPresent_([IO]\d+)/.exec(path)
    if (signalMatch) {
      const portId = signalMatch[1]
      const port = state.ports.get(portId)
      if (port) {
        port.signalLocked = value.toLowerCase() === 'true'
      } else {
        state.ports.set(portId, {
          portId,
          direction: portId.startsWith('I') ? 'input' : 'output',
          label: portId,
          signalLocked: value.toLowerCase() === 'true',
          connectedSource: null,
        })
      }
      device.lastSeen = new Date().toISOString()
      return
    }

    // Routing: DestinationConnectionList
    const isMX2 = state.deviceFamily === 'MX2'
    const xpChangePath = isMX2 ? '/MEDIA/XP/VIDEO.DestinationConnectionList' : '/MEDIA/VIDEO/XP.DestinationConnectionList'
    if (path === xpChangePath) {
      this._parseDestinationConnectionList(value, state)
      device.lastSeen = new Date().toISOString()
    }
  }

  // ── Parsing helpers ────────────────────────────────────────────────────────

  /**
   * Parse GETALL /MEDIA/VIDEO response lines.
   * Each pw line: "pw /MEDIA/VIDEO.SignalPresent_I1=true" or "pw /MEDIA/VIDEO.PortName_I1=HDMI 1"
   */
  private _parseGetAll(rawLines: string[], state: LightwareState): void {
    for (const line of rawLines) {
      if (!line.startsWith('pw ')) continue

      const eqIdx = line.indexOf('=')
      if (eqIdx === -1) continue

      const propPath = line.slice(3, eqIdx).trim()  // "/MEDIA/VIDEO.PropName_Xx"
      const value = line.slice(eqIdx + 1)

      const dotIdx = propPath.lastIndexOf('.')
      if (dotIdx === -1) continue
      const prop = propPath.slice(dotIdx + 1) // "SignalPresent_I1" or "PortName_I1"

      // Extract portId from property suffix: _I1, _O2, etc.
      const portMatch = /^(SignalPresent|PortName)_([IO]\d+)$/.exec(prop)
      if (!portMatch) continue

      const propType = portMatch[1]
      const portId = portMatch[2]
      const direction: 'input' | 'output' = portId.startsWith('I') ? 'input' : 'output'

      if (!state.ports.has(portId)) {
        state.ports.set(portId, {
          portId,
          direction,
          label: portId,
          signalLocked: null,
          connectedSource: null,
        })
      }

      const port = state.ports.get(portId)!
      if (propType === 'SignalPresent') {
        port.signalLocked = value.toLowerCase() === 'true'
      } else if (propType === 'PortName') {
        port.label = value.trim() || portId
      }
    }
  }

  /**
   * Parse DestinationConnectionList value: "I3:O1;I1:O2;0:O3"
   * Sets connectedSource on each output port.
   */
  private _parseDestinationConnectionList(value: string, state: LightwareState): void {
    if (!value) return

    const entries = value.split(';')
    for (const entry of entries) {
      const colonIdx = entry.indexOf(':')
      if (colonIdx === -1) continue

      const source = entry.slice(0, colonIdx).trim()
      const dest = entry.slice(colonIdx + 1).trim()

      if (!dest) continue

      // dest is output port id, source is input port id or '0' for disconnected
      const outputPort = state.ports.get(dest)
      if (outputPort) {
        outputPort.connectedSource = source === '0' ? '0' : source
      } else {
        // Create the port if we haven't seen it in GETALL yet
        state.ports.set(dest, {
          portId: dest,
          direction: 'output',
          label: dest,
          signalLocked: null,
          connectedSource: source === '0' ? '0' : source,
        })
      }
    }
  }

  /**
   * Parse MX2 preset GET /MEDIA/PRESET response.
   * Lines: "pw /MEDIA/PRESET.Name_1=Conference Mode"
   */
  private _parsePresetsResponse(rawLines: string[], state: LightwareState): void {
    const presets: Array<{ index: number; name: string }> = []

    for (const line of rawLines) {
      if (!line.startsWith('pw ')) continue

      const eqIdx = line.indexOf('=')
      if (eqIdx === -1) continue

      const propPath = line.slice(3, eqIdx).trim()
      const name = line.slice(eqIdx + 1).trim()

      const dotIdx = propPath.lastIndexOf('.')
      if (dotIdx === -1) continue
      const prop = propPath.slice(dotIdx + 1)

      const indexMatch = /^Name_(\d+)$/.exec(prop)
      if (indexMatch) {
        presets.push({ index: parseInt(indexMatch[1], 10), name })
      }
    }

    if (presets.length > 0) {
      state.presets = presets
    }
  }

  /**
   * Parse MMX preset GET /PRESETS/AVC/*.Name response.
   * Lines: "pw /PRESETS/AVC/1.Name=Presentation Mode"
   */
  private _parseMMXPresetsResponse(rawLines: string[], state: LightwareState): void {
    const presets: Array<{ index: number; name: string }> = []

    for (const line of rawLines) {
      if (!line.startsWith('pw ')) continue

      const eqIdx = line.indexOf('=')
      if (eqIdx === -1) continue

      const propPath = line.slice(3, eqIdx).trim()
      const name = line.slice(eqIdx + 1).trim()

      // Path: /PRESETS/AVC/1.Name
      const indexMatch = /\/PRESETS\/AVC\/(\d+)\.Name/.exec(propPath)
      if (indexMatch) {
        presets.push({ index: parseInt(indexMatch[1], 10), name })
      }
    }

    if (presets.length > 0) {
      state.presets = presets
    }
  }

  // ── Status builder ─────────────────────────────────────────────────────────

  private _buildStatus(device: ActiveDevice): DeviceStatus {
    const state = device.state
    const led = aggregateStatus(state)

    const ports: Array<{
      portId: string
      direction: 'input' | 'output'
      label: string
      signalLocked: boolean | null
      connectedSource: string | null
    }> = Array.from(state.ports.values()).map(p => ({
      portId: p.portId,
      direction: p.direction,
      label: p.label,
      signalLocked: p.signalLocked,
      connectedSource: p.connectedSource,
    }))

    return {
      deviceId: device.deviceId,
      status: led,
      lastSeen: device.lastSeen,
      meta: {
        productName: state.productName,
        firmwareVersion: state.firmwareVersion,
        serialNumber: state.serialNumber,
        ports,
        presets: state.presets,
        temperature: state.temperature,
        fanStatus: state.fanStatus,
      },
    }
  }
}
