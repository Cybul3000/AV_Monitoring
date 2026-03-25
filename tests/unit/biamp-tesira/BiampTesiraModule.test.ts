import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

// ── Module mocks (no external references inside factory functions) ─────────────

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(),
    setPassword: vi.fn(),
    deletePassword: vi.fn()
  }
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', isPackaged: false }
}))

vi.mock('../../../src/main/db/database', () => ({
  getDb: () => ({
    prepare: () => ({
      all: () => []
    })
  })
}))

vi.mock('../../../src/main/platform/credentials', () => ({
  loadDeviceCredentials: async () => ({ username: 'admin', password: 'pass' })
}))

// ── TTPTransport mock ─────────────────────────────────────────────────────────

// The transport mock class is defined at module level so it can be re-used and
// its instance can be captured for test assertions.

interface MockTransportInstance extends EventEmitter {
  connect: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
}

// Single shared instance, replaced per-test in beforeEach
let mockTransport: MockTransportInstance

function createMockTransport(): MockTransportInstance {
  const t = new EventEmitter() as MockTransportInstance
  t.connect = vi.fn(async () => {
    setImmediate(() => t.emit('connected'))
  })
  t.destroy = vi.fn()
  t.send = vi.fn(async () => ({ ok: true, value: null, error: null }))
  return t
}

vi.mock('../../../src/main/modules/biamp-tesira/TTPTransport', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/main/modules/biamp-tesira/TTPTransport')>()
  return {
    ...original,
    // Return the module-level mockTransport instance each time `new TTPTransport()` is called
    TTPTransport: function MockTTPTransportCtor(this: unknown) {
      return mockTransport
    }
  }
})

// ── Imports (after vi.mock declarations) ──────────────────────────────────────

import { BiampTesiraModule } from '../../../src/main/modules/biamp-tesira/BiampTesiraModule'
import * as TesiraDeviceState from '../../../src/main/modules/biamp-tesira/TesiraDeviceState'

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEVICE_ID = 'biamp-test-001'

async function createConnectedModule(): Promise<BiampTesiraModule> {
  const mod = new BiampTesiraModule()

  // connect() fires transport.connect() which emits 'connected' via setImmediate
  // We must wait for the _onConnected sequence to complete
  const connectDone = new Promise<void>(resolve => {
    // _onConnected is invoked when 'connected' fires; it sends several commands.
    // We give it a tick after connection fires.
    mockTransport.once('connected', () => {
      // Wait for all microtasks (_onConnected is async with many awaits) to settle
      setImmediate(resolve)
    })
  })

  await mod.connect(DEVICE_ID, { host: '10.0.0.10', port: 22 })
  await connectDone

  return mod
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BiampTesiraModule', () => {
  beforeEach(() => {
    mockTransport = createMockTransport()
    vi.clearAllMocks()
  })

  // ── getStatusPoints ──────────────────────────────────────────────────────

  describe('getStatusPoints()', () => {
    it('returns expected status points', () => {
      const mod = new BiampTesiraModule()
      const points = mod.getStatusPoints()

      expect(points).toHaveLength(3)
      expect(points[0]).toEqual({ id: 'reachable',    label: 'Device Reachable',          defaultAlertable: true  })
      expect(points[1]).toEqual({ id: 'fault_free',   label: 'No Active Faults',          defaultAlertable: true  })
      expect(points[2]).toEqual({ id: 'audio_levels', label: 'Audio Level Blocks Normal', defaultAlertable: false })
    })

    it('is synchronous and pure', () => {
      const mod = new BiampTesiraModule()
      const p1 = mod.getStatusPoints()
      const p2 = mod.getStatusPoints()
      expect(p1).toEqual(p2)
    })
  })

  // ── connect sequence ─────────────────────────────────────────────────────

  describe('connect()', () => {
    it('sends SESSION set verbose true as first command after connection', async () => {
      await createConnectedModule()

      const calls = mockTransport.send.mock.calls.map(c => c[0] as string)
      expect(calls[0]).toBe('SESSION set verbose true')
    })
  })

  // ── LED aggregation (tested directly on TesiraDeviceState) ───────────────

  describe('aggregateStatus()', () => {
    it('LED = GREEN when no faults and no critical mutes', () => {
      const state = TesiraDeviceState.createEmptyState(DEVICE_ID, 'ssh')
      state.connected = true
      state.deviceModel = 'TesiraFORTE'

      expect(TesiraDeviceState.aggregateStatus(state)).toBe('GREEN')
    })

    it('LED = AMBER when any non-critical fault present', () => {
      const state = TesiraDeviceState.createEmptyState(DEVICE_ID, 'ssh')
      state.connected = true
      state.deviceModel = 'TesiraFORTE'
      state.activeFaults = [{ description: 'Low voltage warning', severity: 'warning' }]

      expect(TesiraDeviceState.aggregateStatus(state)).toBe('AMBER')
    })

    it('LED = RED when fault severity is critical (case-insensitive)', () => {
      const state = TesiraDeviceState.createEmptyState(DEVICE_ID, 'ssh')
      state.connected = true
      state.deviceModel = 'TesiraFORTE'
      state.activeFaults = [{ description: 'Hardware failure', severity: 'Critical' }]

      expect(TesiraDeviceState.aggregateStatus(state)).toBe('RED')
    })

    it('LED = RED when disconnected after being seen', () => {
      const state = TesiraDeviceState.createEmptyState(DEVICE_ID, 'ssh')
      state.connected = false
      state.deviceModel = 'TesiraFORTE'  // Was previously seen

      expect(TesiraDeviceState.aggregateStatus(state)).toBe('RED')
    })

    it('LED = GREY when never connected (deviceModel still null)', () => {
      const state = TesiraDeviceState.createEmptyState(DEVICE_ID, 'ssh')
      // connected=false AND deviceModel=null → never connected

      expect(TesiraDeviceState.aggregateStatus(state)).toBe('GREY')
    })

    it('LED = AMBER when isCritical level block has a muted channel', () => {
      const state = TesiraDeviceState.createEmptyState(DEVICE_ID, 'ssh')
      state.connected = true
      state.deviceModel = 'TesiraFORTE'
      state.blocks = [{
        instanceTag: 'Level1',
        label: 'Main Level',
        blockType: 'level',
        isCritical: true,
        channels: [{ index: 1, level: -10, mute: true }]
      }]

      expect(TesiraDeviceState.aggregateStatus(state)).toBe('AMBER')
    })

    it('LED = AMBER when dialer block is in FAULT callState', () => {
      const state = TesiraDeviceState.createEmptyState(DEVICE_ID, 'ssh')
      state.connected = true
      state.deviceModel = 'TesiraFORTE'
      state.blocks = [{
        instanceTag: 'Dialer1',
        label: 'SIP Dialer',
        blockType: 'dialer',
        callState: 'FAULT'
      }]

      expect(TesiraDeviceState.aggregateStatus(state)).toBe('AMBER')
    })
  })

  // ── sendCommand: setMute ─────────────────────────────────────────────────

  describe('sendCommand setMute', () => {
    it('sends correct TTP command for mute=true', async () => {
      const mod = await createConnectedModule()
      mockTransport.send.mockResolvedValue({ ok: true, value: null, error: null })

      const result = await mod.sendCommand(DEVICE_ID, 'setMute', {
        instanceTag: 'Level1',
        channel: 1,
        mute: true
      })

      expect(result.success).toBe(true)
      const cmds = mockTransport.send.mock.calls.map(c => c[0] as string)
      expect(cmds).toContain('Level1 set mute 1 true')
    })

    it('sends correct TTP command for mute=false (unmute)', async () => {
      const mod = await createConnectedModule()
      mockTransport.send.mockResolvedValue({ ok: true, value: null, error: null })

      await mod.sendCommand(DEVICE_ID, 'setMute', {
        instanceTag: 'Level1',
        channel: 2,
        mute: false
      })

      const cmds = mockTransport.send.mock.calls.map(c => c[0] as string)
      expect(cmds).toContain('Level1 set mute 2 false')
    })
  })

  // ── sendCommand: setLevel clamp ──────────────────────────────────────────

  describe('sendCommand setLevel', () => {
    it('clamps levelDb of -150 to -100', async () => {
      const mod = await createConnectedModule()
      mockTransport.send.mockResolvedValue({ ok: true, value: null, error: null })

      await mod.sendCommand(DEVICE_ID, 'setLevel', {
        instanceTag: 'Level1',
        channel: 1,
        levelDb: -150
      })

      const cmds = mockTransport.send.mock.calls.map(c => c[0] as string)
      expect(cmds).toContain('Level1 set level 1 -100')
    })

    it('clamps levelDb of 50 to 12', async () => {
      const mod = await createConnectedModule()
      mockTransport.send.mockResolvedValue({ ok: true, value: null, error: null })

      await mod.sendCommand(DEVICE_ID, 'setLevel', {
        instanceTag: 'Level1',
        channel: 1,
        levelDb: 50
      })

      const cmds = mockTransport.send.mock.calls.map(c => c[0] as string)
      expect(cmds).toContain('Level1 set level 1 12')
    })

    it('passes through in-range level unchanged', async () => {
      const mod = await createConnectedModule()
      mockTransport.send.mockResolvedValue({ ok: true, value: null, error: null })

      await mod.sendCommand(DEVICE_ID, 'setLevel', {
        instanceTag: 'Level1',
        channel: 1,
        levelDb: -20
      })

      const cmds = mockTransport.send.mock.calls.map(c => c[0] as string)
      expect(cmds).toContain('Level1 set level 1 -20')
    })
  })

  // ── sendCommand: recallPreset ────────────────────────────────────────────

  describe('sendCommand recallPreset', () => {
    it('sends correct DEVICE recallPresetByName command', async () => {
      const mod = await createConnectedModule()
      mockTransport.send.mockResolvedValue({ ok: true, value: null, error: null })

      const result = await mod.sendCommand(DEVICE_ID, 'recallPreset', { name: 'Morning' })

      expect(result.success).toBe(true)
      const cmds = mockTransport.send.mock.calls.map(c => c[0] as string)
      expect(cmds).toContain('DEVICE recallPresetByName "Morning"')
    })
  })

  // ── Error resilience ─────────────────────────────────────────────────────

  describe('error resilience', () => {
    it('-ERR address not found does not crash module during connect sequence', async () => {
      mockTransport.send.mockResolvedValue({
        ok: false,
        value: null,
        error: '-ERR address not found'
      })

      await expect(createConnectedModule()).resolves.toBeDefined()
    })

    it('-CANNOT_DELIVER does not crash module during connect sequence', async () => {
      mockTransport.send.mockResolvedValue({
        ok: false,
        value: null,
        error: '-CANNOT_DELIVER'
      })

      await expect(createConnectedModule()).resolves.toBeDefined()
    })

    it('-ERR during sendCommand returns success:false instead of throwing', async () => {
      const mod = await createConnectedModule()

      mockTransport.send.mockResolvedValue({
        ok: false,
        value: null,
        error: '-ERR invalid instance tag'
      })

      const result = await mod.sendCommand(DEVICE_ID, 'setMute', {
        instanceTag: 'NonExistent',
        channel: 1,
        mute: true
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})
