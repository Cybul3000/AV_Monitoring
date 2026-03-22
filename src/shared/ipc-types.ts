// Shared IPC payload types — used by both main process and renderer
// All channels documented in specs/001-av-room-monitor/contracts/ipc-channels.md

export type LEDStatus = 'GREEN' | 'AMBER' | 'RED' | 'GREY'

// ── Device Channels ──────────────────────────────────────────────────────────

export interface DeviceStatusEntry {
  deviceId: string
  status: LEDStatus
  lastSeen: string | null
  meta?: Record<string, unknown>
}

export interface HierarchyLEDs {
  rooms: Record<string, LEDStatus>
  floors: Record<string, LEDStatus>
  offices: Record<string, LEDStatus>
  regions: Record<string, LEDStatus>
}

export interface DeviceStatusBroadcast {
  timestamp: string
  statuses: DeviceStatusEntry[]
  hierarchy: HierarchyLEDs
}

export interface DeviceCommandRequest {
  deviceId: string
  command: string
  params?: Record<string, unknown>
}

export interface DeviceCommandResponse {
  success: boolean
  output?: string
  error?: string
}

// ── SSH Channels (Crestron) ──────────────────────────────────────────────────

export type SSHSessionState = 'CONNECTING' | 'READY' | 'BUSY' | 'CLOSED' | 'ERROR'

export interface SSHOpenResponse {
  success: boolean
  sessionState: 'CONNECTING' | 'READY' | 'ERROR'
  error?: string
}

export interface SSHSendRequest {
  deviceId: string
  command: string
}

export interface SSHOutput {
  deviceId: string
  data: string
  timestamp: string
}

export interface SSHStateChange {
  deviceId: string
  state: SSHSessionState
  reason?: string
}

// ── Configuration Channels ───────────────────────────────────────────────────

export interface ConfigExportRequest {
  deviceId: string
  savePath?: string
}

export interface ConfigExportResponse {
  success: boolean
  filePath?: string
  version?: number
  error?: string
}

export interface ConfigImportRequest {
  deviceId: string
  configJson: string
}

export interface ConfigListResponse {
  configs: Array<{
    id: string
    version: number
    exportedAt: string
    note?: string
  }>
}

// ── Network Channels ─────────────────────────────────────────────────────────

export interface NetworkStatus {
  vpnActive: boolean
  ssidMatch: boolean
  currentSsid: string | null
  timestamp: string
}

// ── Log Channels ─────────────────────────────────────────────────────────────

export type LogSeverity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'

export interface LogQueryRequest {
  deviceId?: string
  roomId?: string
  severity?: LogSeverity
  since?: string
  limit?: number
}

export interface LogEvent {
  id: string
  deviceId: string | null
  roomId: string | null
  severity: LogSeverity
  message: string
  occurredAt: string
}

export interface LogQueryResponse {
  events: LogEvent[]
}

export interface LogDownloadRequest {
  format: 'json' | 'csv'
  savePath?: string
}

export interface LogDownloadResponse {
  success: boolean
  filePath?: string
  rowCount?: number
  error?: string
}

// ── Preference Channels ──────────────────────────────────────────────────────

export interface PreferenceGetRequest {
  key: string
}

export interface PreferenceGetResponse {
  value: unknown
}

export interface PreferenceSetRequest {
  key: string
  value: unknown
}

// ── Hierarchy Channels ───────────────────────────────────────────────────────

export interface HierarchyNode {
  id: string
  name: string
  type: 'region' | 'office' | 'floor' | 'room' | 'device'
  ledStatus: LEDStatus
  // Extra fields per type
  city?: string               // office
  level?: number              // floor
  floorMapPath?: string       // floor
  mapX?: number               // room/device
  mapY?: number               // room/device
  mapW?: number               // room
  mapH?: number               // room
  deviceType?: string         // device
  host?: string               // device
  port?: number               // device
  webUiUrl?: string           // device
  lastSeen?: string | null    // device
  pollInterval?: number       // device
  children?: HierarchyNode[]
}

export interface HierarchyResponse {
  roots: HierarchyNode[]
}

export type HierarchyUpdateAction = 'create' | 'update' | 'delete'
export type HierarchyNodeType = 'region' | 'office' | 'floor' | 'room' | 'device'

export interface HierarchyUpdateRequest {
  action: HierarchyUpdateAction
  type: HierarchyNodeType
  id?: string
  parentId?: string
  data?: Record<string, unknown>
}

export interface HierarchyUpdateResponse {
  success: boolean
  id?: string
  error?: string
}

// ── OTel Channels ────────────────────────────────────────────────────────────

export interface OtelGenerateRequest {
  savePath?: string
}

export interface OtelGenerateResponse {
  success: boolean
  filePath?: string
  yaml?: string
  error?: string
}
