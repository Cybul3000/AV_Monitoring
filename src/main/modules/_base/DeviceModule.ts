export type LEDStatus = 'GREEN' | 'AMBER' | 'RED' | 'GREY'

export interface DeviceStatus {
  deviceId: string
  status: LEDStatus
  lastSeen: string | null // ISO-8601
  meta?: Record<string, unknown> // module-specific additional state
}

export interface DeviceConfig {
  host?: string
  port?: number
  credentials?: Record<string, string> // values loaded from keychain — NEVER stored
  options?: Record<string, unknown>
}

export interface CommandResult {
  success: boolean
  output?: string
  error?: string
}

export interface DeviceModule {
  /** Unique device type identifier — must match device-registry.json */
  readonly type: string

  /** Human-readable label for the module */
  readonly label: string

  /** List of supported control action names, e.g. ['reboot', 'openWebUI'] */
  readonly supportedActions: string[]

  /** Start polling / monitoring the device */
  connect(deviceId: string, config: DeviceConfig): Promise<void>

  /** Stop polling and close connections cleanly */
  disconnect(deviceId: string): Promise<void>

  /** Request an immediate status check (outside poll interval) */
  ping(deviceId: string): Promise<DeviceStatus>

  /** Download current device configuration as a serialisable object */
  downloadConfig(deviceId: string): Promise<Record<string, unknown>>

  /** Push a previously downloaded config back to the device */
  restoreConfig(deviceId: string, config: Record<string, unknown>): Promise<void>

  /** Execute a named command with optional parameters */
  sendCommand(
    deviceId: string,
    command: string,
    params?: Record<string, unknown>
  ): Promise<CommandResult>
}
