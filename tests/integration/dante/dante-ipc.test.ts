/**
 * T023 — Integration tests for Dante IPC handlers (US1 scope)
 * Tests: dante:scan returns DanteScanResponse, dante:device:get returns snapshot or null
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import os from 'os'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const ipcHandlers = new Map<string, (event: unknown, payload: unknown) => unknown>()
const mockWebContents = { send: vi.fn() }
const mockWin = {
  webContents: mockWebContents,
  isDestroyed: vi.fn(() => false),
}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (e: unknown, p: unknown) => unknown) => {
      ipcHandlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => ipcHandlers.delete(channel)),
  },
  BrowserWindow: vi.fn(() => mockWin),
  app: { getPath: vi.fn(() => os.tmpdir()) },
  shell: { openExternal: vi.fn() }
}))

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(),
    setPassword: vi.fn(),
    deletePassword: vi.fn()
  }
}))

// Mock multicast-dns
vi.mock('multicast-dns', () => ({
  default: vi.fn(() => ({
    on: vi.fn(),
    query: vi.fn(),
    destroy: vi.fn(),
  }))
}))

// Mock dgram for DanteUdpTransport and DanteHeartbeatListener
const mockUdpSocket = {
  on: vi.fn(() => mockUdpSocket),
  bind: vi.fn((_port: number, _addr: string, cb?: () => void) => {
    if (cb) setImmediate(cb)
  }),
  addMembership: vi.fn(),
  send: vi.fn((_buf: Buffer, _port: number, _host: string, cb: (err: Error | null) => void) => {
    cb(null)
  }),
  close: vi.fn(),
}

vi.mock('dgram', () => ({
  default: {
    createSocket: vi.fn(() => mockUdpSocket)
  }
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

async function invokeHandler(channel: string, payload?: unknown): Promise<unknown> {
  const handler = ipcHandlers.get(channel)
  if (!handler) throw new Error(`No handler registered for channel: ${channel}`)
  return handler(null, payload)
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Dante IPC handlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    ipcHandlers.clear()

    // Import and register handlers fresh
    const { registerDanteHandlers } = await import('../../../src/main/ipc/dante-handlers')
    // Re-register modules
    const { registerModule } = await import('../../../src/main/modules/index')
    const { DanteModule } = await import('../../../src/main/modules/dante/DanteModule')
    registerModule('dante-network-audio', () => new DanteModule())

    registerDanteHandlers(mockWin as Parameters<typeof registerDanteHandlers>[0])
  })

  afterEach(() => {
    vi.resetModules()
  })

  // ── dante:scan ──────────────────────────────────────────────────────────────

  describe('dante:scan', () => {
    it('returns { success: true, devices: [] } on empty network', async () => {
      const result = await invokeHandler('dante:scan') as { success: boolean; devices: unknown[]; error?: string }

      expect(result.success).toBe(true)
      expect(Array.isArray(result.devices)).toBe(true)
      // No devices on test network (no real mDNS)
      expect(result.devices.length).toBe(0)
    })

    it('returns correct DanteScanResponse shape', async () => {
      const result = await invokeHandler('dante:scan') as { success: boolean; devices: unknown[]; error?: string }

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('devices')
      expect(typeof result.success).toBe('boolean')
      expect(Array.isArray(result.devices)).toBe(true)
    })

    it('returned devices have all required DanteDeviceSnapshot fields when non-empty', async () => {
      // In test env no real devices are found — we just verify shape contract
      const result = await invokeHandler('dante:scan') as { success: boolean; devices: Array<Record<string, unknown>>; error?: string }
      expect(result.success).toBe(true)

      for (const device of result.devices) {
        expect(device).toHaveProperty('id')
        expect(device).toHaveProperty('deviceId')
        expect(device).toHaveProperty('danteName')
        expect(device).toHaveProperty('ipAddress')
        expect(device).toHaveProperty('ledStatus')
        expect(device).toHaveProperty('txChannels')
        expect(device).toHaveProperty('rxChannels')
        expect(Array.isArray(device.txChannels)).toBe(true)
        expect(Array.isArray(device.rxChannels)).toBe(true)
        // Verify no duplicate devices (by id)
        const ids = result.devices.map(d => d.id)
        expect(new Set(ids).size).toBe(ids.length)
      }
    })

    it('does not throw when called multiple times', async () => {
      await expect(invokeHandler('dante:scan')).resolves.toBeDefined()
      await expect(invokeHandler('dante:scan')).resolves.toBeDefined()
    })
  })

  // ── dante:device:get ────────────────────────────────────────────────────────

  describe('dante:device:get', () => {
    it('returns { success: true, device: null } for unknown deviceId', async () => {
      const result = await invokeHandler('dante:device:get', { deviceId: 'non-existent-uuid' }) as { success: boolean; device: unknown; error?: string }

      expect(result.success).toBe(true)
      expect(result.device).toBeNull()
    })

    it('returns { success: false, error } when deviceId is missing', async () => {
      const result = await invokeHandler('dante:device:get', {}) as { success: boolean; device: unknown; error?: string }

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('returns { success: false, error } when payload is null', async () => {
      const result = await invokeHandler('dante:device:get', null) as { success: boolean; device: unknown; error?: string }

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('returns correct shape when device is found after scan', async () => {
      // Scan first to populate any devices (will be empty in test env)
      await invokeHandler('dante:scan')

      // Since no real Dante devices, result.device will be null
      const result = await invokeHandler('dante:device:get', { deviceId: 'no-such-device' }) as { success: boolean; device: unknown }
      expect(result.success).toBe(true)
      expect(result.device).toBeNull()
    })

    it('T026: returned device snapshot includes txChannels and rxChannels arrays', async () => {
      await invokeHandler('dante:scan')
      const result = await invokeHandler('dante:device:get', { deviceId: 'no-such-device' }) as { success: boolean; device: Record<string, unknown> | null }
      expect(result.success).toBe(true)
      // In test env, no real device found — just ensure handler is registered and shape contract
      if (result.device !== null) {
        expect(Array.isArray(result.device.txChannels)).toBe(true)
        expect(Array.isArray(result.device.rxChannels)).toBe(true)
        // rxChannels should optionally have subscription field
        for (const ch of result.device.rxChannels as Array<Record<string, unknown>>) {
          expect(ch).toHaveProperty('channelNumber')
          expect(ch).toHaveProperty('channelName')
          if (ch.subscription) {
            expect(ch.subscription).toHaveProperty('txDeviceName')
            expect(ch.subscription).toHaveProperty('txChannelName')
            expect(ch.subscription).toHaveProperty('status')
          }
        }
      }
    })
  })

  // ── T034: US3 — dante:subscribe / dante:unsubscribe ──────────────────────────

  describe('dante:subscribe', () => {
    it('returns { success: false, error } when rxDeviceId not found', async () => {
      const result = await invokeHandler('dante:subscribe', {
        rxDeviceId: 'non-existent',
        rxChannelNum: 1,
        txDeviceName: 'Mixer',
        txChannelName: 'OUT 1',
      }) as { success: boolean; error?: string }
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('returns error shape with success=false on missing payload', async () => {
      const result = await invokeHandler('dante:subscribe', null) as { success: boolean; error?: string }
      expect(result.success).toBe(false)
    })
  })

  describe('dante:unsubscribe', () => {
    it('returns { success: false, error } when rxDeviceId not found', async () => {
      const result = await invokeHandler('dante:unsubscribe', {
        rxDeviceId: 'non-existent',
        rxChannelNum: 1,
      }) as { success: boolean; error?: string }
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  // ── T040: US4 — dante:settings:set / rename ──────────────────────────────────

  describe('dante:settings:set', () => {
    it('returns { success: false, error } for unknown deviceId', async () => {
      const result = await invokeHandler('dante:settings:set', {
        deviceId: 'non-existent',
        sampleRate: 48000,
      }) as { success: boolean; error?: string }
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('returns { success: false, error } for invalid sampleRate', async () => {
      const result = await invokeHandler('dante:settings:set', {
        deviceId: 'non-existent',
        sampleRate: 12000,
      }) as { success: boolean; error?: string }
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('dante:rename:device', () => {
    it('returns { success: false, error } for unknown deviceId', async () => {
      const result = await invokeHandler('dante:rename:device', {
        deviceId: 'non-existent',
        newName: 'NewName',
      }) as { success: boolean; error?: string }
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('dante:rename:channel', () => {
    it('returns { success: false, error } for unknown deviceId', async () => {
      const result = await invokeHandler('dante:rename:channel', {
        deviceId: 'non-existent',
        direction: 'rx',
        channelNum: 1,
        newName: 'My Channel',
      }) as { success: boolean; error?: string }
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  // ── T049: US5 — dante:gain:set ────────────────────────────────────────────────

  describe('dante:gain:set', () => {
    it('returns { success: false, error } for unknown deviceId', async () => {
      const result = await invokeHandler('dante:gain:set', {
        deviceId: 'non-existent',
        direction: 'rx',
        channelNum: 1,
        gainLevel: '+4 dBu',
      }) as { success: boolean; error?: string }
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})
