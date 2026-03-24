import { contextBridge, ipcRenderer } from 'electron'
import type {
  DeviceCommandRequest,
  DeviceCommandResponse,
  DeviceStatusBroadcast,
  SSHOpenResponse,
  SSHSendRequest,
  SSHOutput,
  SSHStateChange,
  ConfigExportRequest,
  ConfigExportResponse,
  ConfigImportRequest,
  ConfigListResponse,
  NetworkStatus,
  LogQueryRequest,
  LogQueryResponse,
  LogDownloadRequest,
  LogDownloadResponse,
  HierarchyResponse,
  HierarchyUpdateRequest,
  HierarchyUpdateResponse,
  OtelGenerateRequest,
  OtelGenerateResponse,
  SettingsExportRequest,
  SettingsExportResponse,
  SettingsImportRequest,
  SettingsImportResponse,
  ZoomImportRequest,
  ZoomImportResponse,
  AlertRulesGetRequest,
  AlertRulesGetResponse,
  AlertRuleSetRequest
} from '@shared/ipc-types'

const api = {
  // ── Device ──────────────────────────────────────────────────────────────────
  deviceCommand: (req: DeviceCommandRequest): Promise<DeviceCommandResponse> =>
    ipcRenderer.invoke('device:command', req),

  devicePing: (deviceId: string): Promise<unknown> =>
    ipcRenderer.invoke('device:ping', { deviceId }),

  onDeviceStatusAll: (cb: (payload: DeviceStatusBroadcast) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: DeviceStatusBroadcast) => cb(payload)
    ipcRenderer.on('device:status:all', handler)
    return () => ipcRenderer.removeListener('device:status:all', handler)
  },

  // ── SSH (Crestron) ───────────────────────────────────────────────────────────
  sshOpen: (deviceId: string): Promise<SSHOpenResponse> =>
    ipcRenderer.invoke('ssh:open', { deviceId }),

  sshClose: (deviceId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('ssh:close', { deviceId }),

  sshSend: (req: SSHSendRequest): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('ssh:send', req),

  onSshOutput: (cb: (payload: SSHOutput) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: SSHOutput) => cb(payload)
    ipcRenderer.on('ssh:output', handler)
    return () => ipcRenderer.removeListener('ssh:output', handler)
  },

  onSshState: (cb: (payload: SSHStateChange) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: SSHStateChange) => cb(payload)
    ipcRenderer.on('ssh:state', handler)
    return () => ipcRenderer.removeListener('ssh:state', handler)
  },

  // ── Config ───────────────────────────────────────────────────────────────────
  configExport: (req: ConfigExportRequest): Promise<ConfigExportResponse> =>
    ipcRenderer.invoke('config:export', req),

  configImport: (req: ConfigImportRequest): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('config:import', req),

  configList: (deviceId: string): Promise<ConfigListResponse> =>
    ipcRenderer.invoke('config:list', { deviceId }),

  // ── Network ──────────────────────────────────────────────────────────────────
  networkGet: (): Promise<NetworkStatus> =>
    ipcRenderer.invoke('network:get'),

  onNetworkStatus: (cb: (payload: NetworkStatus) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: NetworkStatus) => cb(payload)
    ipcRenderer.on('network:status', handler)
    return () => ipcRenderer.removeListener('network:status', handler)
  },

  // ── Logs ─────────────────────────────────────────────────────────────────────
  logQuery: (req: LogQueryRequest): Promise<LogQueryResponse> =>
    ipcRenderer.invoke('log:query', req),

  logDownload: (req: LogDownloadRequest): Promise<LogDownloadResponse> =>
    ipcRenderer.invoke('log:download', req),

  // ── Preferences ──────────────────────────────────────────────────────────────
  preferencesGet: (key: string): Promise<{ value: unknown }> =>
    ipcRenderer.invoke('preferences:get', { key }),

  preferencesSet: (key: string, value: unknown): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('preferences:set', { key, value }),

  preferencesGetAll: (): Promise<{ preferences: Record<string, unknown> }> =>
    ipcRenderer.invoke('preferences:getAll'),

  // ── Hierarchy ────────────────────────────────────────────────────────────────
  hierarchyGet: (): Promise<HierarchyResponse> =>
    ipcRenderer.invoke('hierarchy:get'),

  hierarchyUpdate: (req: HierarchyUpdateRequest): Promise<HierarchyUpdateResponse> =>
    ipcRenderer.invoke('hierarchy:update', req),

  // ── OTel ─────────────────────────────────────────────────────────────────────
  otelGenerateConfig: (req: OtelGenerateRequest): Promise<OtelGenerateResponse> =>
    ipcRenderer.invoke('otel:generateConfig', req),

  // ── Settings Export/Import ────────────────────────────────────────────────
  settingsExport: (req: SettingsExportRequest): Promise<SettingsExportResponse> =>
    ipcRenderer.invoke('settings:export', req),

  settingsImport: (req: SettingsImportRequest): Promise<SettingsImportResponse> =>
    ipcRenderer.invoke('settings:import', req),

  // ── Zoom ──────────────────────────────────────────────────────────────────
  zoomImportRooms: (req: ZoomImportRequest): Promise<ZoomImportResponse> =>
    ipcRenderer.invoke('zoom:importRooms', req),

  zoomSaveCredentials: (payload: {
    clientId: string
    clientSecret: string
    accountId: string
  }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('zoom:saveCredentials', payload),

  zoomGetCredentials: (): Promise<{ clientId: string; accountId: string; secretActive: boolean }> =>
    ipcRenderer.invoke('zoom:getCredentials'),

  // ── Alert Rules ───────────────────────────────────────────────────────────
  alertGetRules: (req?: AlertRulesGetRequest): Promise<AlertRulesGetResponse> =>
    ipcRenderer.invoke('alert:getRules', req ?? {}),

  alertSetRule: (req: AlertRuleSetRequest): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('alert:setRule', req),

  // ── Registry ──────────────────────────────────────────────────────────────
  registryList: (): Promise<{ success: boolean; entries?: Array<{ type: string; label: string; configFields: unknown[]; moduleAvailable: boolean }>; error?: string }> =>
    ipcRenderer.invoke('registry:list'),

  // ── Dialogs ───────────────────────────────────────────────────────────────
  selectFile: (options?: { filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectFile', options)
}

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('platform', process.platform)

// Expose type for TypeScript in renderer
export type Api = typeof api
