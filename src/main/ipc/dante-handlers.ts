// dante-handlers.ts — IPC handlers for Dante Network Audio module (US1–US5 scope)
import { ipcMain, BrowserWindow } from 'electron'
import { getModule } from '../modules/index'
import type {
  DanteScanResponse,
  DanteDeviceGetRequest,
  DanteUpdateBroadcast,
  DanteSubscribeRequest,
  DanteSubscribeResponse,
  DanteUnsubscribeRequest,
  DanteSettingsSetRequest,
  DanteRenameDeviceRequest,
  DanteRenameChannelRequest,
  DanteGainSetRequest,
} from '@shared/ipc-types'
import type { DanteModule } from '../modules/dante/DanteModule'

let _win: BrowserWindow | null = null

// ── Helpers ────────────────────────────────────────────────────────────────────

function getDanteModule(): DanteModule | null {
  return getModule('dante-network-audio') as DanteModule | null
}

function broadcastUpdate(): void {
  if (!_win || _win.isDestroyed()) return
  const mod = getDanteModule()
  if (!mod) return

  const broadcast: DanteUpdateBroadcast = {
    timestamp: new Date().toISOString(),
    devices: mod.getDeviceSnapshots(),
  }
  _win.webContents.send('dante:update', broadcast)
}

// ── Registration ───────────────────────────────────────────────────────────────

export function registerDanteHandlers(win: BrowserWindow): void {
  _win = win

  // Wire module update events to push broadcasts
  const mod = getDanteModule()
  if (mod) {
    mod.on('update', () => broadcastUpdate())
  }

  // ── dante:scan ────────────────────────────────────────────────────────────

  ipcMain.handle('dante:scan', async (): Promise<DanteScanResponse> => {
    const module = getDanteModule()
    if (!module) {
      return { success: false, devices: [], error: 'Dante module not available' }
    }

    try {
      // Ensure module is started (no-op if already running)
      await module.connect('dante-global', {})
      await module.scan()

      const devices = module.getDeviceSnapshots()
      return { success: true, devices }
    } catch (err) {
      return { success: false, devices: [], error: String(err) }
    }
  })

  // ── dante:device:get ──────────────────────────────────────────────────────

  ipcMain.handle(
    'dante:device:get',
    async (_event, req: DanteDeviceGetRequest): Promise<{ success: boolean; device: ReturnType<DanteModule['getDeviceSnapshot']>; error?: string }> => {
      const module = getDanteModule()
      if (!module) {
        return { success: false, device: null, error: 'Dante module not available' }
      }

      if (!req?.deviceId) {
        return { success: false, device: null, error: 'Missing deviceId' }
      }

      const device = module.getDeviceSnapshot(req.deviceId)
      return { success: true, device }
    }
  )

  // ── dante:subscribe ───────────────────────────────────────────────────────

  ipcMain.handle(
    'dante:subscribe',
    async (_event, req: DanteSubscribeRequest): Promise<DanteSubscribeResponse> => {
      const module = getDanteModule()
      if (!module) {
        return { success: false, error: 'Dante module not available' }
      }

      if (!req?.rxDeviceId) {
        return { success: false, error: 'Missing rxDeviceId' }
      }

      const result = await module.sendCommand(req.rxDeviceId, 'subscribe', req as unknown as Record<string, unknown>)
      return result
    }
  )

  // ── dante:unsubscribe ─────────────────────────────────────────────────────

  ipcMain.handle(
    'dante:unsubscribe',
    async (_event, req: DanteUnsubscribeRequest): Promise<{ success: boolean; error?: string }> => {
      const module = getDanteModule()
      if (!module) {
        return { success: false, error: 'Dante module not available' }
      }

      if (!req?.rxDeviceId) {
        return { success: false, error: 'Missing rxDeviceId' }
      }

      const result = await module.sendCommand(req.rxDeviceId, 'unsubscribe', req as unknown as Record<string, unknown>)
      return result
    }
  )

  // ── dante:settings:set ────────────────────────────────────────────────────

  ipcMain.handle(
    'dante:settings:set',
    async (_event, req: DanteSettingsSetRequest): Promise<{ success: boolean; error?: string }> => {
      const module = getDanteModule()
      if (!module) {
        return { success: false, error: 'Dante module not available' }
      }

      if (!req?.deviceId) {
        return { success: false, error: 'Missing deviceId' }
      }

      const result = await module.sendCommand(req.deviceId, 'setSettings', req as unknown as Record<string, unknown>)
      return result
    }
  )

  // ── dante:rename:device ───────────────────────────────────────────────────

  ipcMain.handle(
    'dante:rename:device',
    async (_event, req: DanteRenameDeviceRequest): Promise<{ success: boolean; error?: string }> => {
      const module = getDanteModule()
      if (!module) {
        return { success: false, error: 'Dante module not available' }
      }

      if (!req?.deviceId) {
        return { success: false, error: 'Missing deviceId' }
      }

      const result = await module.sendCommand(req.deviceId, 'renameDevice', req as unknown as Record<string, unknown>)
      return result
    }
  )

  // ── dante:rename:channel ──────────────────────────────────────────────────

  ipcMain.handle(
    'dante:rename:channel',
    async (_event, req: DanteRenameChannelRequest): Promise<{ success: boolean; error?: string }> => {
      const module = getDanteModule()
      if (!module) {
        return { success: false, error: 'Dante module not available' }
      }

      if (!req?.deviceId) {
        return { success: false, error: 'Missing deviceId' }
      }

      const result = await module.sendCommand(req.deviceId, 'renameChannel', req as unknown as Record<string, unknown>)
      return result
    }
  )

  // ── dante:gain:set ────────────────────────────────────────────────────────

  ipcMain.handle(
    'dante:gain:set',
    async (_event, req: DanteGainSetRequest): Promise<{ success: boolean; error?: string }> => {
      const module = getDanteModule()
      if (!module) {
        return { success: false, error: 'Dante module not available' }
      }

      if (!req?.deviceId) {
        return { success: false, error: 'Missing deviceId' }
      }

      const result = await module.sendCommand(req.deviceId, 'gainSet', req as unknown as Record<string, unknown>)
      return result
    }
  )
}
