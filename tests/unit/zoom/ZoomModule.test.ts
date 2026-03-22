import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock keytar before importing ZoomModule
vi.mock('keytar', () => ({
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn()
}))

// Mock electron (not available in test env)
vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp') }
}))

import * as keytar from 'keytar'
import { ZoomModule } from '../../../src/main/modules/zoom/ZoomModule'

const MOCK_DEVICE_ID = 'zoom-test-001'
const MOCK_TOKEN = 'mock-token-abc123'

// Helper to create a ZoomModule instance with a pre-loaded token
async function createModule() {
  const mod = new ZoomModule()
  return mod
}

describe('ZoomModule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(global, 'fetch').mockImplementation(() => Promise.reject(new Error('fetch not mocked')))
  })

  describe('connect', () => {
    it('fetches OAuth token on connect', async () => {
      vi.mocked(keytar.getPassword)
        .mockResolvedValueOnce('mock-account-id')
        .mockResolvedValueOnce('mock-client-id')
        .mockResolvedValueOnce('mock-client-secret')

      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: MOCK_TOKEN, expires_in: 3600 })
      } as Response)

      const mod = await createModule()
      await mod.connect(MOCK_DEVICE_ID)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('oauth/token'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('sets status to AMBER when credentials missing', async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue(null)

      const mod = await createModule()
      const status = await mod.connect(MOCK_DEVICE_ID)

      expect(status.led).toBe('AMBER')
      expect(status.message).toMatch(/credential|not configured/i)
    })
  })

  describe('ping', () => {
    it('returns GREEN status when rooms API responds', async () => {
      vi.mocked(keytar.getPassword)
        .mockResolvedValueOnce('mock-account-id')
        .mockResolvedValueOnce('mock-client-id')
        .mockResolvedValueOnce('mock-client-secret')

      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: MOCK_TOKEN, expires_in: 3600 })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ rooms: [{ id: 'zr1', name: 'Room 1', status: 'Available' }] })
        } as Response)

      const mod = await createModule()
      await mod.connect(MOCK_DEVICE_ID)
      const status = await mod.ping(MOCK_DEVICE_ID)

      expect(status.led).toBe('GREEN')
    })

    it('returns RED status when API call fails', async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue(null)

      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))

      const mod = await createModule()
      const status = await mod.ping(MOCK_DEVICE_ID)

      expect(status.led).toBe('RED')
      expect(status.message).toBeTruthy()
    })

    it('returns AMBER status when some rooms are in meeting', async () => {
      vi.mocked(keytar.getPassword)
        .mockResolvedValueOnce('acct')
        .mockResolvedValueOnce('cid')
        .mockResolvedValueOnce('csec')

      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: MOCK_TOKEN, expires_in: 3600 })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            rooms: [
              { id: 'zr1', name: 'Room 1', status: 'In_Meeting' },
              { id: 'zr2', name: 'Room 2', status: 'Available' }
            ]
          })
        } as Response)

      const mod = await createModule()
      await mod.connect(MOCK_DEVICE_ID)
      const status = await mod.ping(MOCK_DEVICE_ID)

      expect(['AMBER', 'GREEN']).toContain(status.led)
    })
  })

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
          json: async () => ({ rooms: mockRooms })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ settings: mockSettings })
        } as Response)

      const mod = await createModule()
      await mod.connect(MOCK_DEVICE_ID)
      const result = await mod.downloadConfig(MOCK_DEVICE_ID)

      expect(result.success).toBe(true)
      expect(result.config).toBeDefined()
      expect(result.config?.deviceType).toBe('zoom-room')
    })
  })

  describe('sendCommand', () => {
    it('reboot command calls POST to Zoom API', async () => {
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
          json: async () => ({ rooms: [{ id: 'zr1', name: 'Room 1' }] })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({})
        } as Response)

      const mod = await createModule()
      await mod.connect(MOCK_DEVICE_ID)
      await mod.ping(MOCK_DEVICE_ID)
      const result = await mod.sendCommand(MOCK_DEVICE_ID, 'reboot')

      expect(result.success).toBe(true)
      // Should have called fetch at least 3 times (token + rooms + reboot)
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('openWebUI opens URL via shell.openExternal', async () => {
      const { shell } = await import('electron')
      vi.mocked(keytar.getPassword).mockResolvedValue(null)

      const mod = await createModule()
      const result = await mod.sendCommand(MOCK_DEVICE_ID, 'openWebUI', { url: 'https://zoom.us/rooms' })

      expect(shell.openExternal).toHaveBeenCalledWith('https://zoom.us/rooms')
      expect(result.success).toBe(true)
    })
  })
})
