import type {
  DeviceModule,
  DeviceConfig,
  DeviceStatus,
  CommandResult,
  StatusPointDefinition
} from '../_base/DeviceModule'
import { LGTCPTransport } from './LGTCPTransport'
import type { LEDStatus } from '../_base/DeviceModule'

const DEFAULT_PORT = 9761
const DEFAULT_POLL_INTERVAL_MS = 5_000

// Input source hex codes → human-readable labels
const INPUT_CODE_MAP: Record<number, string> = {
  0x00: 'DTV',
  0x10: 'AV',
  0x20: 'Component',
  0x40: 'HDMI 1',
  0x41: 'HDMI 2',
  0x42: 'HDMI 3',
  0x60: 'DisplayPort',
  0x90: 'HDMI 4'
}

interface LGDeviceState {
  power: 'on' | 'off' | null
  input: string | null
  screenMute: boolean | null
  volumeMute: boolean | null
  volume: number | null
  connected: boolean
}

interface ConnectedDevice {
  deviceId: string
  config: DeviceConfig
  transport: LGTCPTransport
  state: LGDeviceState
  pollTimer: ReturnType<typeof setInterval> | null
  /** True once at least one full poll cycle has completed */
  polled: boolean
}

export class LGDisplayModule implements DeviceModule {
  readonly type = 'lg-display'
  readonly label = 'LG Pro Display'
  readonly supportedActions = [
    'powerOn',
    'powerOff',
    'setInput',
    'screenMuteOn',
    'screenMuteOff',
    'volumeMuteOn',
    'volumeMuteOff',
    'setVolume',
    'volumeUp',
    'volumeDown'
  ]

  private _devices = new Map<string, ConnectedDevice>()

  // ── Status points ──────────────────────────────────────────────────────────

  getStatusPoints(): StatusPointDefinition[] {
    return [
      { id: 'reachable',    label: 'Device Reachable', defaultAlertable: true },
      { id: 'power_on',     label: 'Power State',      defaultAlertable: true },
      { id: 'screen_mute',  label: 'Screen Mute',      defaultAlertable: false },
      { id: 'volume_mute',  label: 'Volume Mute',      defaultAlertable: false }
    ]
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async connect(deviceId: string, config: DeviceConfig): Promise<void> {
    const host = config.host ?? 'localhost'
    const port = config.port ?? DEFAULT_PORT
    const setId = (config.options?.setId as number | undefined) ?? 0
    const pollIntervalMs = (config.options?.pollInterval as number | undefined) ?? DEFAULT_POLL_INTERVAL_MS

    const transport = new LGTCPTransport()
    transport.setSetId(setId)

    const initialState: LGDeviceState = {
      power: null,
      input: null,
      screenMute: null,
      volumeMute: null,
      volume: null,
      connected: false
    }

    const device: ConnectedDevice = {
      deviceId,
      config,
      transport,
      state: initialState,
      pollTimer: null,
      polled: false
    }

    this._devices.set(deviceId, device)

    transport.on('connected', () => {
      device.state.connected = true
    })

    transport.on('disconnected', () => {
      device.state.connected = false
    })

    try {
      await transport.connect(host, port)
    } catch {
      // Non-fatal — auto-reconnect will retry in background
    }

    // Start periodic poll
    device.pollTimer = setInterval(() => {
      void this._pollDevice(deviceId)
    }, pollIntervalMs)

    // Kick off an immediate first poll (best-effort)
    void this._pollDevice(deviceId)
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

  // ── Ping ───────────────────────────────────────────────────────────────────

  async ping(deviceId: string): Promise<DeviceStatus> {
    try {
      await this._pollDevice(deviceId)
    } catch (err) {
      return {
        deviceId,
        status: 'RED',
        lastSeen: null,
        meta: this._buildMeta(deviceId)
      }
    }

    const device = this._devices.get(deviceId)
    if (!device) {
      return { deviceId, status: 'RED', lastSeen: null }
    }

    return {
      deviceId,
      status: this._calculateLED(device),
      lastSeen: device.state.connected ? new Date().toISOString() : null,
      meta: this._buildMeta(deviceId)
    }
  }

  // ── Config download / restore ──────────────────────────────────────────────

  async downloadConfig(_deviceId: string): Promise<Record<string, unknown>> {
    return {}
  }

  async restoreConfig(_deviceId: string, _config: Record<string, unknown>): Promise<void> {
    // Not supported for LG displays
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  async sendCommand(
    deviceId: string,
    command: string,
    params?: Record<string, unknown>
  ): Promise<CommandResult> {
    const device = this._getDevice(deviceId)
    const setId = this._getSetIdHex(device)

    try {
      switch (command) {
        case 'powerOn':
          return await this._sendLGCommand(device, 'ka', setId, '01')
        case 'powerOff':
          return await this._sendLGCommand(device, 'ka', setId, '00')
        case 'setInput': {
          const inputCode = params?.inputCode as string | undefined
          if (!inputCode) return { success: false, error: 'inputCode param required' }
          return await this._sendLGCommand(device, 'xb', setId, inputCode)
        }
        case 'screenMuteOn':
          return await this._sendLGCommand(device, 'kd', setId, '01')
        case 'screenMuteOff':
          return await this._sendLGCommand(device, 'kd', setId, '00')
        case 'volumeMuteOn':
          return await this._sendLGCommand(device, 'ke', setId, '01')
        case 'volumeMuteOff':
          return await this._sendLGCommand(device, 'ke', setId, '00')
        case 'setVolume': {
          const level = params?.level as number | undefined
          if (level === undefined) return { success: false, error: 'level param required' }
          const clamped = Math.max(0, Math.min(100, level))
          const hex = clamped.toString(16).padStart(2, '0').toUpperCase()
          return await this._sendLGCommand(device, 'kf', setId, hex)
        }
        case 'volumeUp': {
          const current = device.state.volume ?? 0
          const next = Math.min(100, current + 10)
          const hex = next.toString(16).padStart(2, '0').toUpperCase()
          return await this._sendLGCommand(device, 'kf', setId, hex)
        }
        case 'volumeDown': {
          const current = device.state.volume ?? 0
          const next = Math.max(0, current - 10)
          const hex = next.toString(16).padStart(2, '0').toUpperCase()
          return await this._sendLGCommand(device, 'kf', setId, hex)
        }
        default:
          return { success: false, error: `Unknown command: ${command}` }
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _getDevice(deviceId: string): ConnectedDevice {
    const device = this._devices.get(deviceId)
    if (!device) throw new Error(`Device ${deviceId} not connected`)
    return device
  }

  private _getSetIdHex(device: ConnectedDevice): string {
    const setId = (device.config.options?.setId as number | undefined) ?? 0
    return setId.toString(16).padStart(2, '0').toUpperCase()
  }

  private async _sendLGCommand(
    device: ConnectedDevice,
    commandCode: string,
    setIdHex: string,
    data: string
  ): Promise<CommandResult> {
    // Inline the set ID into the data bytes for the transport
    // The transport formats: `{commandCode} {setId_from_transport} {data}\r`
    // but we pass setId from config to the transport via setSetId().
    // Here we just use the transport.send() directly.
    const result = await device.transport.send(commandCode, data.toLowerCase())
    if (!result.ok) {
      console.warn(`[LGDisplayModule] NG response for ${commandCode}: ${result.rawValue}`)
    }
    return {
      success: result.ok,
      output: result.ok ? result.value : undefined,
      error: result.ok ? undefined : `Device returned NG for ${commandCode}`
    }
  }

  private async _pollDevice(deviceId: string): Promise<void> {
    const device = this._devices.get(deviceId)
    if (!device) return

    // ka ff — power state
    try {
      const powerRes = await device.transport.send('ka', 'ff')
      if (powerRes.ok) {
        device.state.power = parseInt(powerRes.value, 16) === 0x01 ? 'on' : 'off'
      } else {
        console.warn(`[LGDisplayModule] NG on power query for ${deviceId}`)
      }
    } catch { /* transport not connected; state stays as-is */ }

    // xb ff — input source
    try {
      const inputRes = await device.transport.send('xb', 'ff')
      if (inputRes.ok) {
        const code = parseInt(inputRes.value, 16)
        device.state.input = INPUT_CODE_MAP[code] ?? `0x${inputRes.value.toUpperCase()}`
      } else {
        console.warn(`[LGDisplayModule] NG on input query for ${deviceId}`)
      }
    } catch { /* ignore */ }

    // kd ff — screen mute
    try {
      const screenMuteRes = await device.transport.send('kd', 'ff')
      if (screenMuteRes.ok) {
        device.state.screenMute = parseInt(screenMuteRes.value, 16) === 0x01
      } else {
        console.warn(`[LGDisplayModule] NG on screen mute query for ${deviceId}`)
      }
    } catch { /* ignore */ }

    // ke ff — volume mute
    try {
      const volMuteRes = await device.transport.send('ke', 'ff')
      if (volMuteRes.ok) {
        device.state.volumeMute = parseInt(volMuteRes.value, 16) === 0x01
      } else {
        console.warn(`[LGDisplayModule] NG on volume mute query for ${deviceId}`)
      }
    } catch { /* ignore */ }

    // kf ff — volume level
    try {
      const volRes = await device.transport.send('kf', 'ff')
      if (volRes.ok) {
        device.state.volume = parseInt(volRes.value, 16)
      } else {
        console.warn(`[LGDisplayModule] NG on volume query for ${deviceId}`)
      }
    } catch { /* ignore */ }

    device.polled = true
  }

  private _calculateLED(device: ConnectedDevice): LEDStatus {
    if (!device.state.connected) return 'RED'
    if (!device.polled) return 'GREY'
    if (device.state.power === 'off') return 'AMBER'
    if (device.state.screenMute === true) return 'AMBER'
    return 'GREEN'
  }

  private _buildMeta(deviceId: string): Record<string, unknown> {
    const device = this._devices.get(deviceId)
    if (!device) return {}
    const s = device.state
    return {
      power: s.power,
      input: s.input,
      screenMute: s.screenMute,
      volumeMute: s.volumeMute,
      volume: s.volume,
      connected: s.connected
    }
  }

  // ── Internal broadcast helper ──────────────────────────────────────────────
  // (Called at the end of poll to emit status — consumed by device-handlers.ts
  //  which listens via the module registry. Broadcast is handled externally.)
}
