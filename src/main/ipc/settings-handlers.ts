import { ipcMain, dialog } from 'electron'
import { writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { getDb } from '../db/database'
import { getAllPreferences, setPreference } from '../preferences'
import type { PreferencesSchema } from '../preferences'
import type {
  SettingsExportRequest,
  SettingsExportResponse,
  SettingsImportRequest,
  SettingsImportResponse
} from '@shared/ipc-types'

interface AlertRuleRow {
  device_type: string
  status_point: string
  alert_enabled: number
}

interface SettingsFile {
  version: number
  exportedAt: string
  alertRules: AlertRuleRow[]
  preferences: Partial<PreferencesSchema>
}

export function registerSettingsHandlers(): void {
  // ── settings:export ─────────────────────────────────────────────────────────

  ipcMain.handle(
    'settings:export',
    async (
      _event,
      req: SettingsExportRequest
    ): Promise<SettingsExportResponse> => {
      try {
        const db = getDb()
        const alertRules = db
          .prepare('SELECT device_type, status_point, alert_enabled FROM alert_rules')
          .all() as AlertRuleRow[]

        const preferences = getAllPreferences()

        const payload: SettingsFile = {
          version: 1,
          exportedAt: new Date().toISOString(),
          alertRules,
          preferences
        }

        const json = JSON.stringify(payload, null, 2)

        let filePath = req?.savePath
        if (!filePath) {
          const result = await dialog.showSaveDialog({
            defaultPath: join(app.getPath('downloads'), 'av-monitoring-settings.json'),
            filters: [{ name: 'JSON', extensions: ['json'] }]
          })
          if (result.canceled || !result.filePath) {
            return { success: false, error: 'Save cancelled' }
          }
          filePath = result.filePath
        }

        writeFileSync(filePath, json, 'utf-8')
        return { success: true, filePath }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // ── settings:import ─────────────────────────────────────────────────────────

  ipcMain.handle(
    'settings:import',
    (
      _event,
      req: SettingsImportRequest
    ): SettingsImportResponse => {
      if (!req?.filePath) {
        return { success: false, error: 'filePath is required' }
      }

      try {
        const raw = readFileSync(req.filePath, 'utf-8')
        const data = JSON.parse(raw) as SettingsFile

        if (typeof data.version !== 'number') {
          return { success: false, error: 'Invalid settings file: missing version field' }
        }

        const db = getDb()
        let rulesApplied = 0
        let prefsApplied = 0

        // Apply atomically inside a transaction
        const applyAll = db.transaction(() => {
          // Upsert alert rules
          const upsertRule = db.prepare(
            `INSERT INTO alert_rules (device_type, status_point, alert_enabled)
             VALUES (?, ?, ?)
             ON CONFLICT (device_type, status_point) DO UPDATE SET alert_enabled = excluded.alert_enabled`
          )
          for (const rule of data.alertRules ?? []) {
            upsertRule.run(rule.device_type, rule.status_point, rule.alert_enabled)
            rulesApplied++
          }

          // Apply preferences
          for (const [key, value] of Object.entries(data.preferences ?? {})) {
            setPreference(key as keyof PreferencesSchema, value as never)
            prefsApplied++
          }
        })

        applyAll()

        return { success: true, rulesApplied, prefsApplied }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )
}
