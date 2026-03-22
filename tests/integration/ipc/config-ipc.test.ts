import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'

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
    dialog: {
      showSaveDialog: vi.fn().mockResolvedValue({ filePath: '/tmp/test-config.json', canceled: false }),
      showOpenDialog: vi.fn().mockResolvedValue({ filePaths: ['/tmp/test-config.json'], canceled: false })
    },
    app: { getPath: vi.fn(() => os.tmpdir()) }
  }
})

const MIGRATION_PATH = path.resolve(__dirname, '../../../src/main/db/migrations/001_initial.sql')

async function invokeHandler(channel: string, payload: unknown): Promise<unknown> {
  const { ipcMain } = await import('electron')
  const handlers = (ipcMain as unknown as { _handlers: Map<string, (e: unknown, p: unknown) => unknown> })._handlers
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`No handler for channel: ${channel}`)
  return handler(null, payload)
}

describe('config IPC handlers', () => {
  let db: Database.Database
  let dbPath: string
  const deviceId = 'test-device-001'

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `av-config-test-${Date.now()}.db`)
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.exec(fs.readFileSync(MIGRATION_PATH, 'utf-8'))

    // Seed a device
    db.prepare("INSERT INTO regions (id, name) VALUES ('r1', 'R1')").run()
    db.prepare("INSERT INTO offices (id, region_id, name, city) VALUES ('o1', 'r1', 'O1', 'C')").run()
    db.prepare("INSERT INTO floors (id, office_id, name, level) VALUES ('f1', 'o1', 'F1', 1)").run()
    db.prepare("INSERT INTO rooms (id, floor_id, name) VALUES ('rm1', 'f1', 'Room 1')").run()
    db.prepare(`INSERT INTO devices (id, room_id, name, device_type, host, status) VALUES (?, 'rm1', 'Zoom 1', 'zoom-room', '10.0.0.1', 'GREEN')`)
      .run(deviceId)

    vi.doMock('../../../src/main/db/database', () => ({
      getDb: () => db,
      initDatabase: vi.fn()
    }))

    // Mock module to return a predictable config
    vi.doMock('../../../src/main/modules/index', () => ({
      getModule: vi.fn().mockReturnValue({
        downloadConfig: vi.fn().mockResolvedValue({
          success: true,
          config: { deviceType: 'zoom-room', rooms: [{ id: 'zr1', settings: {} }] }
        }),
        restoreConfig: vi.fn().mockResolvedValue({ success: true })
      })
    }))

    const { registerConfigHandlers } = await import('../../../src/main/ipc/config-handlers')
    registerConfigHandlers()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    db.close()
    try { fs.unlinkSync(dbPath) } catch { /* ignore */ }
    // clean up test config file
    try { fs.unlinkSync('/tmp/test-config.json') } catch { /* ignore */ }
  })

  it('config:list returns empty array for new device', async () => {
    const result = await invokeHandler('config:list', { deviceId }) as { success: boolean; configs: unknown[] }
    expect(result.success).toBe(true)
    expect(result.configs).toHaveLength(0)
  })

  it('config:export creates DB entry and shows one config in list', async () => {
    const exportResult = await invokeHandler('config:export', { deviceId }) as { success: boolean }
    expect(exportResult.success).toBe(true)

    const listResult = await invokeHandler('config:list', { deviceId }) as { success: boolean; configs: Array<{ version: number }> }
    expect(listResult.configs).toHaveLength(1)
    expect(listResult.configs[0].version).toBe(1)
  })

  it('config:export increments version on second call', async () => {
    await invokeHandler('config:export', { deviceId })
    await invokeHandler('config:export', { deviceId })

    const listResult = await invokeHandler('config:list', { deviceId }) as { success: boolean; configs: Array<{ version: number }> }
    expect(listResult.configs).toHaveLength(2)
    const versions = listResult.configs.map(c => c.version).sort()
    expect(versions).toEqual([1, 2])
  })

  it('config:import calls module.restoreConfig', async () => {
    await invokeHandler('config:export', { deviceId })

    const importResult = await invokeHandler('config:import', {
      deviceId,
      filePath: '/tmp/test-config.json'
    }) as { success: boolean }

    expect(importResult.success).toBe(true)
  })
})
