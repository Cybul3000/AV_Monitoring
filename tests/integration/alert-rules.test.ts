import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Mock electron for IPC
vi.mock('electron', () => {
  const handlers: Map<string, (event: unknown, payload: unknown) => unknown> = new Map()
  return {
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, handler)
      }),
      removeHandler: vi.fn(),
      _handlers: handlers
    },
    app: { getPath: vi.fn(() => os.tmpdir()) },
    BrowserWindow: vi.fn(() => ({
      webContents: { send: vi.fn() },
      isDestroyed: vi.fn(() => false)
    })),
    shell: { openExternal: vi.fn() }
  }
})

const MIGRATIONS_DIR = path.resolve(__dirname, '../../src/main/db/migrations')

describe('Alert rules integration — polling gate', () => {
  let db: Database.Database
  const deviceId = 'test-zoom-001'
  let mockWin: { webContents: { send: ReturnType<typeof vi.fn> }; isDestroyed: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    const migrationFiles = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
    for (const file of migrationFiles) {
      db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'))
    }

    // Seed hierarchy + device
    db.prepare("INSERT INTO regions (id, name) VALUES ('r1', 'Region 1')").run()
    db.prepare("INSERT INTO offices (id, region_id, name, city) VALUES ('o1', 'r1', 'Office 1', 'City')").run()
    db.prepare("INSERT INTO floors (id, office_id, name, level) VALUES ('f1', 'o1', 'Floor 1', 1)").run()
    db.prepare("INSERT INTO rooms (id, floor_id, name) VALUES ('rm1', 'f1', 'Room 1')").run()
    db.prepare(
      "INSERT INTO devices (id, room_id, device_type, name, host, status, poll_interval) VALUES (?, 'rm1', 'zoom-room', 'Zoom 1', '10.0.0.1', 'GREEN', 30000)"
    ).run(deviceId)

    mockWin = {
      webContents: { send: vi.fn() },
      isDestroyed: vi.fn(() => false)
    }

    vi.doMock('../../src/main/db/database', () => ({
      getDb: () => db,
      initDatabase: vi.fn(),
      closeDatabase: vi.fn()
    }))

    vi.doMock('../../src/main/preferences', () => ({
      getPreference: vi.fn(() => 3)
    }))
  })

  afterEach(() => {
    db.close()
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('Scenario A — alert disabled', () => {
    it('does not broadcast RED when reachable alert is disabled', async () => {
      // Disable alert for zoom-room/reachable
      db.prepare(
        "INSERT INTO alert_rules (device_type, status_point, alert_enabled) VALUES ('zoom-room', 'reachable', 0)"
      ).run()

      // Mock the zoom module to return RED
      vi.doMock('../../src/main/modules/index', () => ({
        getModule: vi.fn((type: string) => {
          if (type === 'zoom-room') {
            return {
              type: 'zoom-room',
              getStatusPoints: () => [{ id: 'reachable', label: 'Reachable', defaultAlertable: true }],
              ping: vi.fn().mockResolvedValue({ deviceId, status: 'RED', lastSeen: null })
            }
          }
          return null
        }),
        isModuleAvailable: vi.fn(() => true)
      }))

      const { registerDeviceHandlers, startPolling, stopPolling } = await import('../../src/main/ipc/device-handlers')

      registerDeviceHandlers(mockWin as never)
      startPolling(mockWin as never)

      // Give polling a moment to run
      await new Promise(r => setTimeout(r, 50))
      stopPolling()

      // Check DB status — should NOT be RED
      const devRow = db.prepare('SELECT status FROM devices WHERE id = ?').get(deviceId) as { status: string }
      expect(devRow.status).not.toBe('RED')
    })
  })

  describe('Scenario B — alert enabled', () => {
    it('broadcasts RED when reachable alert is enabled', async () => {
      // Enable alert for zoom-room/reachable
      db.prepare(
        "INSERT INTO alert_rules (device_type, status_point, alert_enabled) VALUES ('zoom-room', 'reachable', 1)"
      ).run()

      // Mock the zoom module to return RED
      vi.doMock('../../src/main/modules/index', () => ({
        getModule: vi.fn((type: string) => {
          if (type === 'zoom-room') {
            return {
              type: 'zoom-room',
              getStatusPoints: () => [{ id: 'reachable', label: 'Reachable', defaultAlertable: true }],
              ping: vi.fn().mockResolvedValue({ deviceId, status: 'RED', lastSeen: null })
            }
          }
          return null
        }),
        isModuleAvailable: vi.fn(() => true)
      }))

      const { registerDeviceHandlers, startPolling, stopPolling } = await import('../../src/main/ipc/device-handlers')

      registerDeviceHandlers(mockWin as never)
      startPolling(mockWin as never)

      // Give polling a moment to run
      await new Promise(r => setTimeout(r, 50))
      stopPolling()

      // Check DB status — should be RED
      const devRow = db.prepare('SELECT status FROM devices WHERE id = ?').get(deviceId) as { status: string }
      expect(devRow.status).toBe('RED')
    })
  })
})
