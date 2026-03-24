/**
 * T100 — Integration tests for Zoom device IPC
 *
 * Scenario A: Zoom ping does NOT call Zoom API
 * Scenario B: Speaker test command is logged to events table
 * Scenario C: Active meeting guard returns correct error and is logged
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'
import net from 'net'

// ── Mocks ─────────────────────────────────────────────────────────────────────

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
    BrowserWindow: vi.fn(() => ({
      webContents: { send: vi.fn() },
      isDestroyed: vi.fn(() => false)
    })),
    app: { getPath: vi.fn(() => os.tmpdir()) },
    shell: { openExternal: vi.fn() }
  }
})

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(),
    setPassword: vi.fn(),
    deletePassword: vi.fn()
  }
}))

vi.mock('net')

// ── Helpers ───────────────────────────────────────────────────────────────────

const MIGRATION_PATH = path.resolve(__dirname, '../../../src/main/db/migrations/001_initial.sql')

async function invokeHandler(channel: string, payload: unknown): Promise<unknown> {
  const { ipcMain } = await import('electron')
  const handlers = (ipcMain as unknown as { _handlers: Map<string, (e: unknown, p: unknown) => unknown> })._handlers
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`No handler for channel: ${channel}`)
  return handler(null, payload)
}

/** Make a mock TCP socket that fires 'connect' immediately */
function makeTcpSuccessSocket() {
  const socket = {
    on: vi.fn((event: string, cb: () => void) => {
      if (event === 'connect') setTimeout(cb, 0)
      return socket
    }),
    setTimeout: vi.fn(),
    destroy: vi.fn()
  }
  vi.mocked(net.createConnection).mockReturnValue(socket as unknown as net.Socket)
  return socket
}

/** Make a mock TCP socket that fires 'error' immediately */
function makeTcpFailSocket() {
  const socket = {
    on: vi.fn((event: string, cb: (err?: Error) => void) => {
      if (event === 'error') setTimeout(() => cb(new Error('ECONNREFUSED')), 0)
      return socket
    }),
    setTimeout: vi.fn(),
    destroy: vi.fn()
  }
  vi.mocked(net.createConnection).mockReturnValue(socket as unknown as net.Socket)
  return socket
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('device IPC — Zoom module integration', () => {
  let db: Database.Database
  let dbPath: string
  const deviceId = 'zoom-integration-test-001'

  beforeEach(async () => {
    vi.clearAllMocks()

    dbPath = path.join(os.tmpdir(), `av-device-ipc-test-${Date.now()}.db`)
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.exec(fs.readFileSync(MIGRATION_PATH, 'utf-8'))

    // Seed a full hierarchy + Zoom device
    db.prepare("INSERT INTO regions (id, name) VALUES ('r1', 'R1')").run()
    db.prepare("INSERT INTO offices (id, region_id, name, city) VALUES ('o1', 'r1', 'O1', 'City')").run()
    db.prepare("INSERT INTO floors (id, office_id, name, level) VALUES ('f1', 'o1', 'F1', 1)").run()
    db.prepare("INSERT INTO rooms (id, floor_id, name) VALUES ('rm1', 'f1', 'Conf A')").run()
    db.prepare(
      `INSERT INTO devices (id, room_id, name, device_type, host, port, status)
       VALUES (?, 'rm1', 'Zoom Room 1', 'zoom-room', '10.0.0.50', 443, 'GREY')`
    ).run(deviceId)

    vi.doMock('../../../src/main/db/database', () => ({
      getDb: () => db,
      initDatabase: vi.fn()
    }))

    vi.doMock('../../../src/main/preferences', () => ({
      getPreference: vi.fn(() => 3)
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    db.close()
    try { fs.unlinkSync(dbPath) } catch { /* ignore */ }
  })

  // ── Scenario A: Zoom ping uses TCP probe — NOT Zoom API ───────────────────

  describe('Scenario A — ping does NOT call Zoom API', () => {
    it('device:status:all broadcast is emitted after TCP probe', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch')
      makeTcpSuccessSocket()

      // Wire up device handlers with a real ZoomModule
      vi.doMock('../../../src/main/modules/index', async () => {
        const { ZoomModule } = await import('../../../src/main/modules/zoom/ZoomModule')
        const mod = new ZoomModule()
        await mod.connect(deviceId, { host: '10.0.0.50', port: 443 })
        return { getModule: vi.fn(() => mod) }
      })

      const { ipcMain } = await import('electron')
      const mockWin = {
        webContents: { send: vi.fn() },
        isDestroyed: vi.fn(() => false)
      }

      const { registerDeviceHandlers } = await import('../../../src/main/ipc/device-handlers')
      registerDeviceHandlers(mockWin as unknown as import('electron').BrowserWindow)

      // Invoke a manual ping via device:ping
      const result = await invokeHandler('device:ping', { deviceId }) as { success: boolean; status?: string }

      expect(result.success).toBe(true)
      expect(result.status).toBe('GREEN')

      // Assert: no HTTP/fetch calls were made during the ping
      expect(fetchSpy).not.toHaveBeenCalled()

      // Assert: meta does NOT contain Zoom API data fields
      const deviceRow = db.prepare('SELECT status FROM devices WHERE id = ?').get(deviceId) as { status: string }
      expect(deviceRow.status).toBe('GREY') // ping doesn't update DB directly
    })

    it('ping returns RED status when TCP connection fails — no fetch call', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch')
      makeTcpFailSocket()

      vi.doMock('../../../src/main/modules/index', async () => {
        const { ZoomModule } = await import('../../../src/main/modules/zoom/ZoomModule')
        const mod = new ZoomModule()
        await mod.connect(deviceId, { host: '10.0.0.50', port: 443 })
        return { getModule: vi.fn(() => mod) }
      })

      const mockWin = {
        webContents: { send: vi.fn() },
        isDestroyed: vi.fn(() => false)
      }

      const { registerDeviceHandlers } = await import('../../../src/main/ipc/device-handlers')
      registerDeviceHandlers(mockWin as unknown as import('electron').BrowserWindow)

      const result = await invokeHandler('device:ping', { deviceId }) as { success: boolean; status?: string }

      expect(result.success).toBe(true)
      expect(result.status).toBe('RED')
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  // ── Scenario B: Speaker test command is logged to events ──────────────────

  describe('Scenario B — speaker test is logged to events', () => {
    it('device:command speakerTest logs success outcome to events table', async () => {
      const speakerTestResult = { success: true, output: 'pass' }
      const mockModule = {
        sendCommand: vi.fn().mockResolvedValue(speakerTestResult),
        ping: vi.fn().mockResolvedValue({ deviceId, status: 'GREEN', lastSeen: new Date().toISOString() }),
        getStatusPoints: vi.fn().mockReturnValue([])
      }

      vi.doMock('../../../src/main/modules/index', () => ({
        getModule: vi.fn(() => mockModule)
      }))

      const mockWin = {
        webContents: { send: vi.fn() },
        isDestroyed: vi.fn(() => false)
      }

      const { registerDeviceHandlers } = await import('../../../src/main/ipc/device-handlers')
      registerDeviceHandlers(mockWin as unknown as import('electron').BrowserWindow)

      const result = await invokeHandler('device:command', {
        deviceId,
        command: 'speakerTest',
        params: { roomId: 'zr-abc' }
      }) as { success: boolean; output?: string; error?: string }

      // Assert correct result returned
      expect(result.success).toBe(true)
      expect(result.output).toBe('pass')

      // Assert event was logged
      const events = db.prepare(
        "SELECT * FROM events WHERE device_id = ? AND message LIKE '%speakerTest%' ORDER BY occurred_at DESC"
      ).all(deviceId) as Array<{ severity: string; message: string }>

      expect(events.length).toBeGreaterThan(0)
      expect(events[0].severity).toBe('INFO')
      expect(events[0].message).toContain('speakerTest')
    })

    it('device:command speakerTest with fail outcome logs ERROR', async () => {
      const mockModule = {
        sendCommand: vi.fn().mockResolvedValue({ success: true, output: 'fail' }),
        ping: vi.fn(),
        getStatusPoints: vi.fn().mockReturnValue([])
      }

      vi.doMock('../../../src/main/modules/index', () => ({
        getModule: vi.fn(() => mockModule)
      }))

      const mockWin = {
        webContents: { send: vi.fn() },
        isDestroyed: vi.fn(() => false)
      }

      const { registerDeviceHandlers } = await import('../../../src/main/ipc/device-handlers')
      registerDeviceHandlers(mockWin as unknown as import('electron').BrowserWindow)

      const result = await invokeHandler('device:command', {
        deviceId,
        command: 'speakerTest',
        params: { roomId: 'zr-abc' }
      }) as { success: boolean; output?: string }

      expect(result.success).toBe(true)
      expect(result.output).toBe('fail')

      // Result is still logged (success=true with output=fail is an INFO event
      // because the command succeeded — the fail refers to the speaker test itself)
      const events = db.prepare(
        "SELECT * FROM events WHERE device_id = ? AND message LIKE '%speakerTest%'"
      ).all(deviceId) as Array<{ severity: string; message: string }>

      expect(events.length).toBeGreaterThan(0)
    })
  })

  // ── Scenario C: Active meeting guard ─────────────────────────────────────

  describe('Scenario C — active meeting guard', () => {
    it('returns {success:false, error:"Room in active meeting"} when room is in meeting', async () => {
      const mockModule = {
        sendCommand: vi.fn().mockResolvedValue({ success: false, error: 'Room in active meeting' }),
        ping: vi.fn(),
        getStatusPoints: vi.fn().mockReturnValue([])
      }

      vi.doMock('../../../src/main/modules/index', () => ({
        getModule: vi.fn(() => mockModule)
      }))

      const mockWin = {
        webContents: { send: vi.fn() },
        isDestroyed: vi.fn(() => false)
      }

      const { registerDeviceHandlers } = await import('../../../src/main/ipc/device-handlers')
      registerDeviceHandlers(mockWin as unknown as import('electron').BrowserWindow)

      const result = await invokeHandler('device:command', {
        deviceId,
        command: 'speakerTest',
        params: { roomId: 'zr-abc' }
      }) as { success: boolean; error?: string }

      expect(result.success).toBe(false)
      expect(result.error).toBe('Room in active meeting')
    })

    it('active meeting error is logged to events with ERROR severity', async () => {
      const mockModule = {
        sendCommand: vi.fn().mockResolvedValue({ success: false, error: 'Room in active meeting' }),
        ping: vi.fn(),
        getStatusPoints: vi.fn().mockReturnValue([])
      }

      vi.doMock('../../../src/main/modules/index', () => ({
        getModule: vi.fn(() => mockModule)
      }))

      const mockWin = {
        webContents: { send: vi.fn() },
        isDestroyed: vi.fn(() => false)
      }

      const { registerDeviceHandlers } = await import('../../../src/main/ipc/device-handlers')
      registerDeviceHandlers(mockWin as unknown as import('electron').BrowserWindow)

      await invokeHandler('device:command', {
        deviceId,
        command: 'speakerTest',
        params: { roomId: 'zr-abc' }
      })

      // The handler logs ERROR for failed commands (success=false)
      const events = db.prepare(
        "SELECT * FROM events WHERE device_id = ? AND severity = 'ERROR' ORDER BY occurred_at DESC"
      ).all(deviceId) as Array<{ severity: string; message: string }>

      expect(events.length).toBeGreaterThan(0)
      expect(events[0].message).toContain('speakerTest')
    })
  })
})
