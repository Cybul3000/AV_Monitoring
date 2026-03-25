import net from 'net'
import type {
  DeviceModule,
  DeviceConfig,
  DeviceStatus,
  CommandResult,
  StatusPointDefinition
} from '../_base/DeviceModule'
import { SSHSessionManager } from './SSHSessionManager'
import type { SSHSessionState } from '@shared/ipc-types'
import { getDb } from '../../db/database'
import { loadDeviceCredentials } from '../../platform/credentials'

const TCP_TIMEOUT_MS = 5_000

// ── DB row type ───────────────────────────────────────────────────────────────

interface SSHDeviceProfileRow {
  id: string
  device_id: string
  device_type: 'CP4' | 'VC4'
  prompt_pattern: string
  disconnect_cmd: string
  default_program_slot: number | null
}

// ── Per-device state ──────────────────────────────────────────────────────────

interface CrestronDevice {
  deviceId: string
  config: DeviceConfig
  session: SSHSessionManager | null
  sessionState: SSHSessionState
  onStateChange?: (state: SSHSessionState, reason?: string) => void
  onOutput?: (data: string) => void
}

// ── SSH profile defaults ──────────────────────────────────────────────────────

interface SSHProfile {
  promptPattern: string
  disconnectCmd: string
  deviceType: 'CP4' | 'VC4'
}

function getDefaultProfile(deviceType?: unknown): SSHProfile {
  const type = deviceType === 'VC4' ? 'VC4' : 'CP4'
  if (type === 'VC4') {
    return {
      deviceType: 'VC4',
      promptPattern: '\\[admin@[^\\]]+[\\s~]\\]\\$',
      disconnectCmd: 'exit'
    }
  }
  return {
    deviceType: 'CP4',
    promptPattern: 'CP4N>',
    disconnectCmd: 'BYE'
  }
}

// ── CrestronSSHModule ─────────────────────────────────────────────────────────

export class CrestronSSHModule implements DeviceModule {
  readonly type = 'crestron-ssh'
  readonly label = 'Crestron Series 3/4 (SSH)'
  readonly supportedActions = ['openSSH', 'closeSSH', 'sendCommand', 'reboot', 'ping']

  private readonly _devices = new Map<string, CrestronDevice>()

  // ── Status points ──────────────────────────────────────────────────────────

  getStatusPoints(): StatusPointDefinition[] {
    return [
      { id: 'reachable',    label: 'Device Reachable',      defaultAlertable: true  },
      { id: 'ssh_session',  label: 'SSH Session Active',    defaultAlertable: false }
    ]
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async connect(deviceId: string, config: DeviceConfig): Promise<void> {
    // Store config only — SSH opened on-demand via sendCommand('openSSH')
    this._devices.set(deviceId, {
      deviceId,
      config,
      session: null,
      sessionState: 'CLOSED'
    })
  }

  async disconnect(deviceId: string): Promise<void> {
    const device = this._devices.get(deviceId)
    if (device?.session) {
      await device.session.close()
    }
    this._devices.delete(deviceId)
  }

  // ── Ping — TCP probe only ─────────────────────────────────────────────────

  async ping(deviceId: string): Promise<DeviceStatus> {
    const device = this._getDevice(deviceId)
    const host = device.config.host ?? 'localhost'
    const port = device.config.port ?? 22

    return new Promise<DeviceStatus>(resolve => {
      let settled = false

      const settle = (status: DeviceStatus) => {
        if (settled) return
        settled = true
        try { socket.destroy() } catch { /* ignore */ }
        resolve(status)
      }

      const socket = net.createConnection({ host, port })

      if (typeof socket.setTimeout === 'function') {
        socket.setTimeout(TCP_TIMEOUT_MS)
      }

      socket.on('connect', () => {
        settle({ deviceId, status: 'GREEN', lastSeen: new Date().toISOString() })
      })

      socket.on('timeout', () => {
        settle({ deviceId, status: 'RED', lastSeen: null })
      })

      socket.on('error', () => {
        settle({ deviceId, status: 'RED', lastSeen: null })
      })

      setTimeout(() => {
        settle({ deviceId, status: 'RED', lastSeen: null })
      }, TCP_TIMEOUT_MS + 500)
    })
  }

  // ── Config download / restore (not applicable for Crestron SSH) ───────────

  async downloadConfig(_deviceId: string): Promise<Record<string, unknown>> {
    return {}
  }

  async restoreConfig(_deviceId: string, _config: Record<string, unknown>): Promise<void> {
    // Not applicable
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  async sendCommand(
    deviceId: string,
    command: string,
    params?: Record<string, unknown>
  ): Promise<CommandResult> {
    switch (command) {
      case 'openSSH':
        return this._openSSH(deviceId)
      case 'closeSSH':
        return this._closeSSH(deviceId)
      case 'sendCommand':
        return this._sendRawCommand(deviceId, params?.command as string)
      case 'reboot':
        return this._reboot(deviceId)
      case 'ping':
        return this._pingCommand(deviceId)
      default:
        return { success: false, error: `Unknown command: ${command}` }
    }
  }

  // ── Callback registration ─────────────────────────────────────────────────

  registerCallbacks(
    deviceId: string,
    onStateChange: (state: SSHSessionState, reason?: string) => void,
    onOutput: (data: string) => void
  ): void {
    const device = this._devices.get(deviceId)
    if (!device) return
    device.onStateChange = onStateChange
    device.onOutput = onOutput

    // Wire callbacks to existing session if one is already open
    if (device.session) {
      device.session.on('state', onStateChange)
      device.session.on('output', onOutput)
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _getDevice(deviceId: string): CrestronDevice {
    const device = this._devices.get(deviceId)
    if (!device) throw new Error(`Device ${deviceId} not connected`)
    return device
  }

  private _loadProfile(deviceId: string, device: CrestronDevice): SSHProfile {
    try {
      const db = getDb()
      const row = db
        .prepare('SELECT * FROM ssh_device_profiles WHERE device_id = ?')
        .get(deviceId) as SSHDeviceProfileRow | undefined

      if (row) {
        return {
          deviceType: row.device_type,
          promptPattern: row.prompt_pattern,
          disconnectCmd: row.disconnect_cmd
        }
      }
    } catch {
      // DB not available (e.g., in tests) — fall through to defaults
    }

    return getDefaultProfile(device.config.options?.deviceType)
  }

  private async _openSSH(deviceId: string): Promise<CommandResult> {
    const device = this._getDevice(deviceId)

    // Close existing session if any
    if (device.session) {
      await device.session.close()
      device.session = null
    }

    let creds: Record<string, string>
    try {
      creds = await loadDeviceCredentials('crestron-ssh', deviceId, ['password'])
    } catch (err) {
      return { success: false, error: `Failed to load credentials: ${String(err)}` }
    }

    if (!creds.password) {
      return { success: false, error: 'No password found in keychain for this device' }
    }

    const profile = this._loadProfile(deviceId, device)
    const session = new SSHSessionManager()
    device.session = session

    // Wire event callbacks
    session.on('state', (state: SSHSessionState, reason?: string) => {
      device.sessionState = state
      device.onStateChange?.(state, reason)
    })

    session.on('output', (data: string) => {
      device.onOutput?.(data)
    })

    // Start connecting (non-blocking — state changes will fire via events)
    session.open({
      host: device.config.host ?? 'localhost',
      port: device.config.port ?? 22,
      username: 'admin',
      password: creds.password,
      deviceType: profile.deviceType,
      promptPattern: profile.promptPattern,
      disconnectCmd: profile.disconnectCmd
    }).catch(() => {
      // State/error will be emitted via the 'state' event
    })

    return { success: true, output: 'CONNECTING' }
  }

  private async _closeSSH(deviceId: string): Promise<CommandResult> {
    const device = this._getDevice(deviceId)
    if (!device.session) {
      return { success: true, output: 'No active session' }
    }
    await device.session.close()
    device.session = null
    device.sessionState = 'CLOSED'
    return { success: true }
  }

  private async _sendRawCommand(deviceId: string, command: string): Promise<CommandResult> {
    const device = this._getDevice(deviceId)
    if (!device.session) {
      return { success: false, error: 'No active SSH session' }
    }
    if (device.sessionState !== 'READY') {
      return { success: false, error: `Session not ready (state: ${device.sessionState})` }
    }
    try {
      await device.session.send(command)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  private async _reboot(deviceId: string): Promise<CommandResult> {
    const device = this._getDevice(deviceId)
    if (!device.session) {
      return { success: false, error: 'No active SSH session' }
    }
    if (device.sessionState !== 'READY') {
      return { success: false, error: `Session not ready (state: ${device.sessionState})` }
    }
    try {
      await device.session.send('REBOOT')
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  private async _pingCommand(deviceId: string): Promise<CommandResult> {
    try {
      const status = await this.ping(deviceId)
      return { success: true, output: status.status }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }
}
