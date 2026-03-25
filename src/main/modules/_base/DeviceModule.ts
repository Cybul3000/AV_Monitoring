export type LEDStatus = 'GREEN' | 'AMBER' | 'RED' | 'GREY'

export interface DeviceStatus {
  deviceId: string
  status: LEDStatus
  lastSeen: string | null // ISO-8601
  /** Module-specific status point values, e.g. { micMuted: true, volumeLevel: 75 } */
  meta?: Record<string, unknown>
}

/**
 * Describes a single monitorable status point exposed by a module.
 * Used by AlertRulesService.seedDefaults() and AlertSettingsView.
 * getStatusPoints() must be synchronous and pure — no device I/O.
 */
export interface StatusPointDefinition {
  id: string              // stable snake_case key, e.g. 'reachable', 'hdmi_signal'
  label: string           // human-readable label for AlertSettingsView
  defaultAlertable: boolean // true = alert ON by default; false = informational only
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

  /**
   * Return all monitorable status points this module exposes.
   * Called by AlertRulesService.seedDefaults() and AlertSettingsView.
   * Must be synchronous — no device I/O.
   */
  getStatusPoints(): StatusPointDefinition[]

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
