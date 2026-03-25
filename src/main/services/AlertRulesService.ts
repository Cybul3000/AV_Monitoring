import { getDb } from '../db/database'
import { getModule } from '../modules/index'
import type { AlertRule } from '@shared/ipc-types'

export class AlertRulesService {
  /**
   * Seed default alert rules for a device type.
   * Calls module.getStatusPoints() and inserts rows with INSERT OR IGNORE
   * so calling twice is idempotent.
   */
  seedDefaults(deviceType: string): void {
    const db = getDb()
    const module = getModule(deviceType)
    if (!module) return

    const points = module.getStatusPoints()
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO alert_rules (device_type, status_point, alert_enabled) VALUES (?, ?, ?)'
    )
    for (const point of points) {
      stmt.run(deviceType, point.id, point.defaultAlertable ? 1 : 0)
    }
  }

  /**
   * Check whether a status point should trigger alerts.
   * Fail-open: returns true if no row is found (default alertable).
   */
  isAlertable(deviceType: string, statusPoint: string): boolean {
    const db = getDb()
    const row = db
      .prepare(
        'SELECT alert_enabled FROM alert_rules WHERE device_type = ? AND status_point = ?'
      )
      .get(deviceType, statusPoint) as { alert_enabled: number } | undefined

    if (!row) return true // fail-open default
    return row.alert_enabled === 1
  }

  /**
   * Get the configured expected value for a value-based alert rule.
   * Returns null if no expected value is set.
   */
  getExpectedValue(deviceType: string, statusPoint: string): string | null {
    const db = getDb()
    const row = db
      .prepare(
        'SELECT expected_value FROM alert_rules WHERE device_type = ? AND status_point = ?'
      )
      .get(deviceType, statusPoint) as { expected_value: string | null } | undefined

    return row?.expected_value ?? null
  }

  /**
   * Upsert an alert rule (INSERT OR REPLACE).
   */
  setRule(deviceType: string, statusPoint: string, enabled: boolean, expectedValue?: string | null): void {
    const db = getDb()
    db.prepare(
      'INSERT OR REPLACE INTO alert_rules (device_type, status_point, alert_enabled, expected_value) VALUES (?, ?, ?, ?)'
    ).run(deviceType, statusPoint, enabled ? 1 : 0, expectedValue ?? null)
  }

  /**
   * Get all alert rules, optionally filtered by device type.
   * Rules are enriched with options from each module's getStatusPoints().
   */
  getRules(deviceType?: string): AlertRule[] {
    const db = getDb()
    let rows: Array<{ device_type: string; status_point: string; alert_enabled: number; expected_value: string | null }>

    if (deviceType) {
      rows = db
        .prepare('SELECT device_type, status_point, alert_enabled, expected_value FROM alert_rules WHERE device_type = ?')
        .all(deviceType) as typeof rows
    } else {
      rows = db
        .prepare('SELECT device_type, status_point, alert_enabled, expected_value FROM alert_rules')
        .all() as typeof rows
    }

    return rows.map(r => {
      const mod = getModule(r.device_type)
      const point = mod?.getStatusPoints().find(p => p.id === r.status_point)
      const rule: AlertRule = {
        deviceType: r.device_type,
        statusPoint: r.status_point,
        alertEnabled: r.alert_enabled === 1,
        expectedValue: r.expected_value,
      }
      if (point?.options !== undefined) {
        rule.options = point.options
      }
      return rule
    })
  }
}

// Singleton instance for use by IPC handlers and polling
export const alertRulesService = new AlertRulesService()
