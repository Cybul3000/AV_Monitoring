import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Mock electron ipcMain before importing handlers
vi.mock('electron', () => {
  const handlers: Map<string, (event: unknown, payload: unknown) => unknown> = new Map()
  return {
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, handler)
      }),
      removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
      _handlers: handlers
    },
    app: {
      getPath: vi.fn(() => os.tmpdir())
    }
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

describe('hierarchy IPC handlers', () => {
  let db: Database.Database
  let dbPath: string

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `av-hierarchy-test-${Date.now()}.db`)
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.exec(fs.readFileSync(MIGRATION_PATH, 'utf-8'))

    // Override the db module to use our test DB
    vi.doMock('../../../src/main/db/database', () => ({
      getDb: () => db,
      initDatabase: vi.fn()
    }))

    const { registerHierarchyHandlers } = await import('../../../src/main/ipc/hierarchy-handlers')
    registerHierarchyHandlers()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    db.close()
    try { fs.unlinkSync(dbPath) } catch { /* ignore */ }
  })

  it('hierarchy:get returns empty roots array initially', async () => {
    const result = await invokeHandler('hierarchy:get', {}) as { roots: unknown[] }
    expect(Array.isArray(result.roots)).toBe(true)
    expect(result.roots).toHaveLength(0)
  })

  it('hierarchy:update creates a region', async () => {
    const createResult = await invokeHandler('hierarchy:update', {
      action: 'create',
      type: 'region',
      data: { name: 'EMEA' }
    }) as { success: boolean; id: string }

    expect(createResult.success).toBe(true)
    expect(createResult.id).toBeTruthy()

    const getResult = await invokeHandler('hierarchy:get', {}) as { roots: Array<{ name: string }> }
    expect(getResult.roots).toHaveLength(1)
    expect(getResult.roots[0].name).toBe('EMEA')
  })

  it('hierarchy:update create + get verifies node present', async () => {
    await invokeHandler('hierarchy:update', {
      action: 'create', type: 'region', data: { name: 'APAC' }
    })

    const result = await invokeHandler('hierarchy:get', {}) as { roots: Array<{ name: string }> }
    const names = result.roots.map((n: { name: string }) => n.name)
    expect(names).toContain('APAC')
  })

  it('hierarchy:update delete cascades', async () => {
    const createRegion = await invokeHandler('hierarchy:update', {
      action: 'create', type: 'region', data: { name: 'EMEA' }
    }) as { success: boolean; id: string }
    const regionId = createRegion.id

    await invokeHandler('hierarchy:update', {
      action: 'create', type: 'office', parentId: regionId,
      data: { name: 'London', city: 'London' }
    })

    // Delete region → office should also be gone
    await invokeHandler('hierarchy:update', {
      action: 'delete', type: 'region', id: regionId
    })

    const offices = db.prepare('SELECT * FROM offices').all()
    expect(offices).toHaveLength(0)
  })

  it('full hierarchy create chain resolves correctly', async () => {
    const { id: regionId } = await invokeHandler('hierarchy:update', {
      action: 'create', type: 'region', data: { name: 'EMEA' }
    }) as { id: string }

    const { id: officeId } = await invokeHandler('hierarchy:update', {
      action: 'create', type: 'office', parentId: regionId,
      data: { name: 'London HQ', city: 'London' }
    }) as { id: string }

    const { id: floorId } = await invokeHandler('hierarchy:update', {
      action: 'create', type: 'floor', parentId: officeId,
      data: { name: 'Ground Floor', level: 1 }
    }) as { id: string }

    const { id: roomId } = await invokeHandler('hierarchy:update', {
      action: 'create', type: 'room', parentId: floorId,
      data: { name: 'Boardroom' }
    }) as { id: string }

    const { id: deviceId } = await invokeHandler('hierarchy:update', {
      action: 'create', type: 'device', parentId: roomId,
      data: { name: 'Zoom 1', deviceType: 'zoom-room', host: '10.0.0.1' }
    }) as { id: string }

    expect(deviceId).toBeTruthy()

    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId) as { name: string }
    expect(device.name).toBe('Zoom 1')
  })
})
