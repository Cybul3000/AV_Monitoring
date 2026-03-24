import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Mock electron (not available in test environment)
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => os.tmpdir()) }
}))

const MIGRATION_001 = path.resolve(__dirname, '../../src/main/db/migrations/001_initial.sql')
const MIGRATION_002 = path.resolve(__dirname, '../../src/main/db/migrations/002_alert_rules.sql')

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(fs.readFileSync(MIGRATION_001, 'utf-8'))
  db.exec(fs.readFileSync(MIGRATION_002, 'utf-8'))
  return db
}

describe('AlertRulesService', () => {
  let db: Database.Database

  beforeEach(async () => {
    db = createTestDb()

    vi.doMock('../../src/main/db/database', () => ({
      getDb: () => db,
      initDatabase: vi.fn()
    }))

    // Mock the module registry to return a zoom-room module with getStatusPoints
    vi.doMock('../../src/main/modules/index', () => ({
      getModule: vi.fn((type: string) => {
        if (type === 'zoom-room') {
          return {
            getStatusPoints: () => [
              { id: 'reachable', label: 'Reachable', defaultAlertable: true }
            ]
          }
        }
        return null
      })
    }))
  })

  afterEach(() => {
    db.close()
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('isAlertable returns true by default (no row in table)', async () => {
    const { AlertRulesService } = await import('../../src/main/services/AlertRulesService')
    const svc = new AlertRulesService()
    expect(svc.isAlertable('zoom-room', 'reachable')).toBe(true)
  })

  it('setRule persists change; subsequent isAlertable returns false', async () => {
    const { AlertRulesService } = await import('../../src/main/services/AlertRulesService')
    const svc = new AlertRulesService()
    svc.setRule('zoom-room', 'reachable', false)
    expect(svc.isAlertable('zoom-room', 'reachable')).toBe(false)
  })

  it('seedDefaults inserts a row for reachable with alert_enabled = 1', async () => {
    const { AlertRulesService } = await import('../../src/main/services/AlertRulesService')
    const svc = new AlertRulesService()
    svc.seedDefaults('zoom-room')
    const row = db
      .prepare("SELECT alert_enabled FROM alert_rules WHERE device_type = 'zoom-room' AND status_point = 'reachable'")
      .get() as { alert_enabled: number } | undefined
    expect(row).toBeDefined()
    expect(row?.alert_enabled).toBe(1)
  })

  it('seedDefaults is idempotent — calling twice does not duplicate rows', async () => {
    const { AlertRulesService } = await import('../../src/main/services/AlertRulesService')
    const svc = new AlertRulesService()
    svc.seedDefaults('zoom-room')
    svc.seedDefaults('zoom-room')
    const rows = db
      .prepare("SELECT * FROM alert_rules WHERE device_type = 'zoom-room'")
      .all() as unknown[]
    expect(rows).toHaveLength(1)
  })

  it('getRules() returns all rules', async () => {
    const { AlertRulesService } = await import('../../src/main/services/AlertRulesService')
    const svc = new AlertRulesService()
    svc.seedDefaults('zoom-room')
    const rules = svc.getRules()
    expect(rules.length).toBeGreaterThan(0)
    expect(rules[0]).toMatchObject({
      deviceType: 'zoom-room',
      statusPoint: 'reachable',
      alertEnabled: true
    })
  })

  it('getRules(deviceType) filters by device type', async () => {
    const { AlertRulesService } = await import('../../src/main/services/AlertRulesService')
    const svc = new AlertRulesService()
    svc.seedDefaults('zoom-room')
    // Manually insert a rule for a different type
    db.prepare("INSERT INTO alert_rules (device_type, status_point, alert_enabled) VALUES (?, ?, ?)")
      .run('lg-display', 'power', 1)

    const zoomRules = svc.getRules('zoom-room')
    expect(zoomRules.every(r => r.deviceType === 'zoom-room')).toBe(true)
    expect(zoomRules.length).toBe(1)

    const allRules = svc.getRules()
    expect(allRules.length).toBe(2)
  })
})
