import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { getDb } from '../db/database'
import { alertRulesService } from '../services/AlertRulesService'
import type { AlertRulesGetRequest, AlertRulesGetResponse, AlertRuleSetRequest } from '@shared/ipc-types'

export function registerAlertHandlers(): void {
  ipcMain.handle(
    'alert:getRules',
    (_event, req: AlertRulesGetRequest): AlertRulesGetResponse => {
      const rules = alertRulesService.getRules(req?.deviceType)
      return { rules }
    }
  )

  ipcMain.handle(
    'alert:setRule',
    (_event, req: AlertRuleSetRequest): { success: boolean; error?: string } => {
      if (!req?.deviceType || !req?.statusPoint || req?.alertEnabled === undefined) {
        return { success: false, error: 'Invalid payload' }
      }

      try {
        alertRulesService.setRule(req.deviceType, req.statusPoint, req.alertEnabled, req.expectedValue)

        // Write audit log entry
        const db = getDb()
        const now = new Date().toISOString()
        const detail = req.expectedValue != null
          ? ` (expected: ${req.expectedValue})`
          : ''
        db.prepare(
          `INSERT INTO events (id, severity, message, occurred_at) VALUES (?, ?, ?, ?)`
        ).run(
          randomUUID(),
          'INFO',
          `Alert rule updated: ${req.deviceType}/${req.statusPoint} = ${req.alertEnabled}${detail}`,
          now
        )

        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )
}
