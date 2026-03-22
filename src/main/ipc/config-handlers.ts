import { ipcMain, dialog } from 'electron'
import { randomUUID } from 'crypto'
import { writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { getDb } from '../db/database'
import { getModule } from '../modules/index'
import type {
  ConfigExportRequest,
  ConfigExportResponse,
  ConfigImportRequest,
  ConfigListResponse
} from '@shared/ipc-types'

export function registerConfigHandlers(): void {
  // config:export — download device config and persist as versioned JSON
  ipcMain.handle(
    'config:export',
    async (_event, req: ConfigExportRequest): Promise<ConfigExportResponse> => {
      if (!req?.deviceId) return { success: false, error: 'Invalid payload' }

      const db = getDb()
      const row = db
        .prepare('SELECT device_type, name FROM devices WHERE id = ?')
        .get(req.deviceId) as { device_type: string; name: string } | undefined

      if (!row) return { success: false, error: 'Device not found' }

      const module = getModule(row.device_type)
      if (!module) return { success: false, error: 'Module not available' }

      let config: Record<string, unknown>
      try {
        config = await module.downloadConfig(req.deviceId)
      } catch (err) {
        return { success: false, error: String(err) }
      }

      // Determine next version
      const versionRow = db
        .prepare(
          'SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM device_configs WHERE device_id = ?'
        )
        .get(req.deviceId) as { next_version: number }

      const version = versionRow.next_version
      const configJson = JSON.stringify({ version, exportedAt: new Date().toISOString(), config }, null, 2)
      const configId = randomUUID()

      db.prepare(
        'INSERT INTO device_configs (id, device_id, version, config_json) VALUES (?, ?, ?, ?)'
      ).run(configId, req.deviceId, version, configJson)

      // Save to file
      let filePath = req.savePath
      if (!filePath) {
        const result = await dialog.showSaveDialog({
          defaultPath: join(
            app.getPath('downloads'),
            `${row.name.replace(/\s+/g, '-')}-config-v${version}.json`
          ),
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })
        if (result.canceled || !result.filePath) {
          return { success: false, error: 'Save cancelled' }
        }
        filePath = result.filePath
      }

      writeFileSync(filePath, configJson, 'utf-8')
      return { success: true, filePath, version }
    }
  )

  // config:import — restore previously exported config to device
  ipcMain.handle(
    'config:import',
    async (_event, req: ConfigImportRequest): Promise<{ success: boolean; error?: string }> => {
      if (!req?.deviceId || !req?.configJson) return { success: false, error: 'Invalid payload' }

      const db = getDb()
      const row = db
        .prepare('SELECT device_type FROM devices WHERE id = ?')
        .get(req.deviceId) as { device_type: string } | undefined

      if (!row) return { success: false, error: 'Device not found' }

      const module = getModule(row.device_type)
      if (!module) return { success: false, error: 'Module not available' }

      let parsed: Record<string, unknown>
      try {
        const wrapper = JSON.parse(req.configJson) as { config: Record<string, unknown> }
        parsed = wrapper.config ?? wrapper
      } catch {
        return { success: false, error: 'Invalid config JSON' }
      }

      try {
        await module.restoreConfig(req.deviceId, parsed)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // config:list — list saved config snapshots for a device
  ipcMain.handle(
    'config:list',
    (_event, payload: { deviceId: string }): ConfigListResponse => {
      if (!payload?.deviceId) return { configs: [] }

      const db = getDb()
      const rows = db
        .prepare(
          'SELECT id, version, exported_at, note FROM device_configs WHERE device_id = ? ORDER BY version DESC'
        )
        .all(payload.deviceId) as Array<{
          id: string
          version: number
          exported_at: string
          note: string | null
        }>

      return {
        configs: rows.map(r => ({
          id: r.id,
          version: r.version,
          exportedAt: r.exported_at,
          note: r.note ?? undefined
        }))
      }
    }
  )
}
