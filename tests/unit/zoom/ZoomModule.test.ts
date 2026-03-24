import { describe, it, expect, vi, beforeEach } from 'vitest'
import net from 'net'

// Mock keytar before importing ZoomModule
vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(),
    setPassword: vi.fn(),
    deletePassword: vi.fn()
  }
}))

// Mock electron (not available in test env)
vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp') }
}))

// Mock net module for TCP probe tests
vi.mock('net')

import keytar from 'keytar'
import { ZoomModule } from '../../../src/main/modules/zoom/ZoomModule'

const MOCK_DEVICE_ID = 'zoom-test-001'
const MOCK_TOKEN = 'mock-token-abc123'

async function createConnectedModule(config?: { host?: string; port?: number; roomId?: string }) {
  const mod = new ZoomModule()
  await mod.connect(MOCK_DEVICE_ID, {
    host: config?.host ?? '10.0.0.50',
    port: config?.port ?? 443,
    options: config?.roomId ? { roomId: config.roomId } : {}
  })
  return mod
}

describe('ZoomModule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(global, 'fetch').mockImplementation(() => Promise.reject(new Error('fetch not mocked')))
  })

  // ── Existing tests (aligned to DeviceModule contract) ─────────────────────

  describe('connect', () => {
    it('connects successfully without calling Zoom API', async () => {
      const mod = new ZoomModule()
      // connect should not throw; no Zoom API call needed for TCP-based ping
      await expect(mod.connect(MOCK_DEVICE_ID, { host: '10.0.0.50', port: 443 })).resolves.toBeUndefined()
      // fetch should NOT have been called (no OAuth on connect)
      expect(vi.mocked(global.fetch)).not.toHaveBeenCalled()
    })
  })

  // ── T096: ping() uses TCP probe only — NO Zoom API ─────────────────────────

  describe('ping (TCP probe)', () => {
    it('returns GREEN when TCP connection succeeds', async () => {
      const mockSocket = {
        on: vi.fn((event: string, cb: () => void) => {
          if (event === 'connect') setTimeout(cb, 0)
          return mockSocket
        }),
        destroy: vi.fn()
      }
      vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as net.Socket)

      const mod = await createConnectedModule({ host: '10.0.0.50', port: 443 })
      const status = await mod.ping(MOCK_DEVICE_ID)

      expect(status.status).toBe('GREEN')
      expect(status.deviceId).toBe(MOCK_DEVICE_ID)
      expect(status.lastSeen).toBeTruthy()
      // Must NOT have called Zoom API
      expect(vi.mocked(global.fetch)).not.toHaveBeenCalled()
    })

    it('returns RED when TCP connection is refused', async () => {
      const mockSocket = {
        on: vi.fn((event: string, cb: (err?: Error) => void) => {
          if (event === 'error') setTimeout(() => cb(new Error('ECONNREFUSED')), 0)
          return mockSocket
        }),
        destroy: vi.fn()
      }
      vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as net.Socket)

      const mod = await createConnectedModule({ host: '10.0.0.50', port: 443 })
      const status = await mod.ping(MOCK_DEVICE_ID)

      expect(status.status).toBe('RED')
      expect(status.lastSeen).toBeNull()
      // Must NOT have called Zoom API
      expect(vi.mocked(global.fetch)).not.toHaveBeenCalled()
    })

    it('returns RED when TCP connection times out', async () => {
      const mockSocket = {
        on: vi.fn((event: string, cb: (err?: Error) => void) => {
          if (event === 'timeout') setTimeout(() => cb(), 0)
          return mockSocket
        }),
        setTimeout: vi.fn(),
        destroy: vi.fn()
      }
      vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as net.Socket)

      const mod = await createConnectedModule({ host: '10.0.0.50', port: 443 })
      const status = await mod.ping(MOCK_DEVICE_ID)

      expect(status.status).toBe('RED')
      expect(status.lastSeen).toBeNull()
    })

    it('uses net.createConnection — not fetch', async () => {
      const mockSocket = {
        on: vi.fn((event: string, cb: () => void) => {
          if (event === 'connect') setTimeout(cb, 0)
          return mockSocket
        }),
        destroy: vi.fn()
      }
      vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as net.Socket)

      const mod = await createConnectedModule()
      await mod.ping(MOCK_DEVICE_ID)

      expect(net.createConnection).toHaveBeenCalled()
      expect(vi.mocked(global.fetch)).not.toHaveBeenCalled()
    })
  })

  // ── T096: getStatusPoints() ───────────────────────────────────────────────

  describe('getStatusPoints', () => {
    it('returns exactly one status point: reachable', () => {
      const mod = new ZoomModule()
      const points = mod.getStatusPoints()

      expect(points).toHaveLength(1)
      expect(points[0]).toEqual({
        id: 'reachable',
        label: 'Device Reachable',
        defaultAlertable: true
      })
    })

    it('is synchronous and pure — no device I/O', () => {
      const mod = new ZoomModule()
      // Call twice — same result, no side effects
      const p1 = mod.getStatusPoints()
      const p2 = mod.getStatusPoints()
      expect(p1).toEqual(p2)
    })
  })

  // ── T096: runSpeakerTest() via sendCommand('speakerTest') ─────────────────

  describe('sendCommand speakerTest', () => {
    it('returns success:true with output "pass" or "fail" when room not in meeting', async () => {
      // Mock keytar for _getAccessToken
      vi.mocked(keytar.getPassword)
        .mockResolvedValueOnce('mock-account-id')   // accountId
        .mockResolvedValueOnce('mock-client-id')    // clientId
        .mockResolvedValueOnce('mock-client-secret') // clientSecret

      vi.spyOn(global, 'fetch')
        // OAuth token
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: MOCK_TOKEN, expires_in: 3600 })
        } as Response)
        // Meeting info — not in meeting
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'Available' })
        } as Response)
        // Speaker test endpoint
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'pass' })
        } as Response)

      const mod = await createConnectedModule({ roomId: 'zr-abc123' })
      const result = await mod.sendCommand(MOCK_DEVICE_ID, 'speakerTest', { roomId: 'zr-abc123' })

      expect(result.success).toBe(true)
      expect(['pass', 'fail']).toContain(result.output)
    })

    it('returns success:false error "Room in active meeting" when room is in meeting', async () => {
      vi.mocked(keytar.getPassword)
        .mockResolvedValueOnce('mock-account-id')
        .mockResolvedValueOnce('mock-client-id')
        .mockResolvedValueOnce('mock-client-secret')

      vi.spyOn(global, 'fetch')
        // OAuth token
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: MOCK_TOKEN, expires_in: 3600 })
        } as Response)
        // Meeting info — in meeting
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'InMeeting' })
        } as Response)

      const mod = await createConnectedModule({ roomId: 'zr-abc123' })
      const result = await mod.sendCommand(MOCK_DEVICE_ID, 'speakerTest', { roomId: 'zr-abc123' })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Room in active meeting')
    })

    it('returns success:false with error when roomId not provided', async () => {
      const mod = await createConnectedModule()
      const result = await mod.sendCommand(MOCK_DEVICE_ID, 'speakerTest')

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/roomId/i)
    })
  })

  // ── Existing command tests (updated to match current implementation) ───────

  describe('sendCommand reboot', () => {
    it('reboot command calls Zoom API', async () => {
      vi.mocked(keytar.getPassword)
        .mockResolvedValueOnce('acct')
        .mockResolvedValueOnce('cid')
        .mockResolvedValueOnce('csec')

      const fetchMock = vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: MOCK_TOKEN, expires_in: 3600 })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
          json: async () => ({})
        } as Response)

      const mod = await createConnectedModule()
      const result = await mod.sendCommand(MOCK_DEVICE_ID, 'reboot', { roomId: 'zr1' })

      expect(result.success).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(2) // token + reboot PATCH
    })

    it('reboot without roomId returns failure', async () => {
      const mod = await createConnectedModule()
      const result = await mod.sendCommand(MOCK_DEVICE_ID, 'reboot')
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/roomId/i)
    })
  })

  describe('sendCommand openWebUI', () => {
    it('openWebUI returns success', async () => {
      const mod = await createConnectedModule()
      const result = await mod.sendCommand(MOCK_DEVICE_ID, 'openWebUI')
      expect(result.success).toBe(true)
    })
  })

  describe('sendCommand unknown', () => {
    it('returns failure for unknown command', async () => {
      const mod = await createConnectedModule()
      const result = await mod.sendCommand(MOCK_DEVICE_ID, 'unknownCmd')
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/unknown/i)
    })
  })

  // ── downloadConfig / restoreConfig ─────────────────────────────────────────

  describe('downloadConfig', () => {
    it('returns config object with rooms', async () => {
      vi.mocked(keytar.getPassword)
        .mockResolvedValueOnce('acct')
        .mockResolvedValueOnce('cid')
        .mockResolvedValueOnce('csec')

      const mockRooms = [{ id: 'zr1', name: 'Room A' }]
      const mockSettings = { audio: { input_volume: 80 } }

      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: MOCK_TOKEN, expires_in: 3600 })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ total_records: 1, rooms: mockRooms })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSettings
        } as Response)

      const mod = await createConnectedModule()
      const result = await mod.downloadConfig(MOCK_DEVICE_ID)

      expect(result).toBeDefined()
      expect(result.schemaVersion).toBe(1)
      expect(Array.isArray(result.rooms)).toBe(true)
    })
  })
})
