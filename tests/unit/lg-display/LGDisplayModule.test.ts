import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

// ── Mock LGTCPTransport before importing LGDisplayModule ───────────────────

const mockTransportInstance = {
  setSetId: vi.fn(),
  connect: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
  send: vi.fn<[string, string], Promise<{ ok: boolean; value: string; rawValue: string }>>(),
  destroy: vi.fn(),
  on: vi.fn(),
  removeAllListeners: vi.fn(),
  isConnected: true,
  verbose: false
}

vi.mock('../../../src/main/modules/lg-display/LGTCPTransport', () => ({
  LGTCPTransport: vi.fn(() => mockTransportInstance)
}))

// ── Import after mock ──────────────────────────────────────────────────────

import { LGDisplayModule } from '../../../src/main/modules/lg-display/LGDisplayModule'

// ── Helpers ────────────────────────────────────────────────────────────────

const DEVICE_ID = 'lg-001'

function makeDefaultConfig(overrides?: Record<string, unknown>) {
  return {
    host: '10.0.0.10',
    port: 9761,
    options: { setId: 0, pollInterval: 60_000, ...overrides }
  }
}

function makeOkSend(value: string) {
  return { ok: true, value, rawValue: `a 0 OK${value}x` }
}

function makeNgSend(value = '00') {
  return { ok: false, value, rawValue: `a 0 NG${value}x` }
}

// Simulate a full poll cycle returning all-ok values
function mockFullPollConnectedPowerOn() {
  mockTransportInstance.send
    .mockResolvedValueOnce({ ok: true, value: '01', rawValue: 'a 0 OK01x' }) // power on
    .mockResolvedValueOnce({ ok: true, value: '40', rawValue: 'b 0 OK40x' }) // input HDMI 1
    .mockResolvedValueOnce({ ok: true, value: '00', rawValue: 'd 0 OK00x' }) // screen mute off
    .mockResolvedValueOnce({ ok: true, value: '00', rawValue: 'e 0 OK00x' }) // volume mute off
    .mockResolvedValueOnce({ ok: true, value: '32', rawValue: 'f 0 OK32x' }) // volume 50
}

function mockFullPollConnectedPowerOff() {
  mockTransportInstance.send
    .mockResolvedValueOnce({ ok: true, value: '00', rawValue: 'a 0 OK00x' }) // power off
    .mockResolvedValueOnce({ ok: true, value: '40', rawValue: 'b 0 OK40x' })
    .mockResolvedValueOnce({ ok: true, value: '00', rawValue: 'd 0 OK00x' })
    .mockResolvedValueOnce({ ok: true, value: '00', rawValue: 'e 0 OK00x' })
    .mockResolvedValueOnce({ ok: true, value: '32', rawValue: 'f 0 OK32x' })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('LGDisplayModule', () => {
  let mod: LGDisplayModule

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mod = new LGDisplayModule()

    // Default: transport.on() stores callbacks so we can fire them manually
    mockTransportInstance.on.mockImplementation(
      (event: string, cb: (...args: unknown[]) => void) => {
        // Store for later triggering if needed
        void event; void cb
      }
    )
    mockTransportInstance.connect.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── getStatusPoints ────────────────────────────────────────────────────────

  describe('getStatusPoints', () => {
    it('returns exactly 4 status points', () => {
      const points = mod.getStatusPoints()
      expect(points).toHaveLength(4)
    })

    it('returns expected point definitions', () => {
      const points = mod.getStatusPoints()
      expect(points).toEqual([
        { id: 'reachable',   label: 'Device Reachable', defaultAlertable: true },
        { id: 'power_on',    label: 'Power State',      defaultAlertable: true },
        { id: 'screen_mute', label: 'Screen Mute',      defaultAlertable: false },
        { id: 'volume_mute', label: 'Volume Mute',      defaultAlertable: false }
      ])
    })

    it('is synchronous and pure — same result on repeated calls', () => {
      expect(mod.getStatusPoints()).toEqual(mod.getStatusPoints())
    })
  })

  // ── connect ────────────────────────────────────────────────────────────────

  describe('connect', () => {
    it('stores device config and creates a transport', async () => {
      // Suppress the fire-and-forget poll by making send resolve immediately
      mockTransportInstance.send.mockResolvedValue(makeOkSend('01'))

      await mod.connect(DEVICE_ID, makeDefaultConfig())

      // Transport was constructed and connect() called
      const { LGTCPTransport } = await import('../../../src/main/modules/lg-display/LGTCPTransport')
      expect(LGTCPTransport).toHaveBeenCalledTimes(1)
      expect(mockTransportInstance.connect).toHaveBeenCalledWith('10.0.0.10', 9761)
    })

    it('applies setId from config.options', async () => {
      mockTransportInstance.send.mockResolvedValue(makeOkSend('01'))
      await mod.connect(DEVICE_ID, makeDefaultConfig({ setId: 3 }))
      expect(mockTransportInstance.setSetId).toHaveBeenCalledWith(3)
    })

    it('does not throw when transport.connect rejects (auto-reconnect handles it)', async () => {
      mockTransportInstance.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'))
      mockTransportInstance.send.mockResolvedValue(makeOkSend('01'))
      await expect(mod.connect(DEVICE_ID, makeDefaultConfig())).resolves.toBeUndefined()
    })
  })

  // ── disconnect ─────────────────────────────────────────────────────────────

  describe('disconnect', () => {
    it('destroys the transport and clears the poll timer', async () => {
      mockTransportInstance.send.mockResolvedValue(makeOkSend('01'))
      await mod.connect(DEVICE_ID, makeDefaultConfig())
      await mod.disconnect(DEVICE_ID)
      expect(mockTransportInstance.destroy).toHaveBeenCalledTimes(1)
    })

    it('is a no-op for unknown device', async () => {
      await expect(mod.disconnect('nonexistent')).resolves.toBeUndefined()
    })
  })

  // ── ping ───────────────────────────────────────────────────────────────────

  describe('ping', () => {
    it('returns GREEN when connected and power=on', async () => {
      // Use command-specific mock so both the fire-and-forget poll and
      // the timed poll return consistent values regardless of call order
      mockTransportInstance.send.mockImplementation((cmd: string) => {
        const vals: Record<string, string> = { ka: '01', xb: '40', kd: '00', ke: '00', kf: '32' }
        const v = vals[cmd] ?? '01'
        return Promise.resolve({ ok: true, value: v, rawValue: `a 0 OK${v}x` })
      })
      await mod.connect(DEVICE_ID, makeDefaultConfig())

      const connectedCb = mockTransportInstance.on.mock.calls.find(
        (c: [string, unknown]) => c[0] === 'connected'
      )?.[1] as (() => void) | undefined
      connectedCb?.()

      await vi.advanceTimersByTimeAsync(60_000)

      const status = await mod.ping(DEVICE_ID)
      expect(status.status).toBe('GREEN')
      expect(status.deviceId).toBe(DEVICE_ID)
    })

    it('returns AMBER when power=off', async () => {
      mockTransportInstance.send.mockImplementation((cmd: string) => {
        const vals: Record<string, string> = { ka: '00', xb: '40', kd: '00', ke: '00', kf: '32' }
        const v = vals[cmd] ?? '00'
        return Promise.resolve({ ok: true, value: v, rawValue: `a 0 OK${v}x` })
      })
      await mod.connect(DEVICE_ID, makeDefaultConfig())

      const connectedCb = mockTransportInstance.on.mock.calls.find(
        (c: [string, unknown]) => c[0] === 'connected'
      )?.[1] as (() => void) | undefined
      connectedCb?.()

      await vi.advanceTimersByTimeAsync(60_000)

      const status = await mod.ping(DEVICE_ID)
      expect(status.status).toBe('AMBER')
    })

    it('returns RED when transport.send throws', async () => {
      mockTransportInstance.send.mockRejectedValue(new Error('Transport not connected'))
      await mod.connect(DEVICE_ID, makeDefaultConfig())

      // Override send to throw on the ping poll
      mockTransportInstance.send.mockRejectedValue(new Error('Transport not connected'))

      const status = await mod.ping(DEVICE_ID)
      expect(status.status).toBe('RED')
      expect(status.deviceId).toBe(DEVICE_ID)
    })

    it('includes meta in the returned status', async () => {
      mockTransportInstance.send.mockResolvedValue(makeOkSend('01'))
      await mod.connect(DEVICE_ID, makeDefaultConfig())

      mockTransportInstance.send.mockClear()
      mockFullPollConnectedPowerOn()

      const connectedCb = mockTransportInstance.on.mock.calls.find(
        (c: [string, unknown]) => c[0] === 'connected'
      )?.[1] as (() => void) | undefined
      connectedCb?.()

      const status = await mod.ping(DEVICE_ID)
      expect(status.meta).toBeDefined()
      expect(status.meta).toHaveProperty('power')
      expect(status.meta).toHaveProperty('connected')
    })
  })

  // ── sendCommand ────────────────────────────────────────────────────────────

  describe('sendCommand', () => {
    beforeEach(async () => {
      // Connect with a stable send mock
      mockTransportInstance.send.mockResolvedValue(makeOkSend('01'))
      await mod.connect(DEVICE_ID, makeDefaultConfig())
      mockTransportInstance.send.mockClear()
    })

    it('powerOn sends ka with data 01', async () => {
      mockTransportInstance.send.mockResolvedValue(makeOkSend('01'))
      const result = await mod.sendCommand(DEVICE_ID, 'powerOn')
      expect(result.success).toBe(true)
      expect(mockTransportInstance.send).toHaveBeenCalledWith('ka', '01')
    })

    it('powerOff sends ka with data 00', async () => {
      mockTransportInstance.send.mockResolvedValue(makeOkSend('00'))
      await mod.sendCommand(DEVICE_ID, 'powerOff')
      expect(mockTransportInstance.send).toHaveBeenCalledWith('ka', '00')
    })

    it('setInput sends xb with provided inputCode', async () => {
      mockTransportInstance.send.mockResolvedValue(makeOkSend('40'))
      const result = await mod.sendCommand(DEVICE_ID, 'setInput', { inputCode: '40' })
      expect(result.success).toBe(true)
      expect(mockTransportInstance.send).toHaveBeenCalledWith('xb', '40')
    })

    it('setInput returns failure when inputCode missing', async () => {
      const result = await mod.sendCommand(DEVICE_ID, 'setInput')
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/inputCode/)
    })

    it('screenMuteOn sends kd with data 01', async () => {
      mockTransportInstance.send.mockResolvedValue(makeOkSend('01'))
      await mod.sendCommand(DEVICE_ID, 'screenMuteOn')
      expect(mockTransportInstance.send).toHaveBeenCalledWith('kd', '01')
    })

    it('screenMuteOff sends kd with data 00', async () => {
      mockTransportInstance.send.mockResolvedValue(makeOkSend('00'))
      await mod.sendCommand(DEVICE_ID, 'screenMuteOff')
      expect(mockTransportInstance.send).toHaveBeenCalledWith('kd', '00')
    })

    it('volumeMuteOn sends ke with data 01', async () => {
      mockTransportInstance.send.mockResolvedValue(makeOkSend('01'))
      await mod.sendCommand(DEVICE_ID, 'volumeMuteOn')
      expect(mockTransportInstance.send).toHaveBeenCalledWith('ke', '01')
    })

    it('volumeMuteOff sends ke with data 00', async () => {
      mockTransportInstance.send.mockResolvedValue(makeOkSend('00'))
      await mod.sendCommand(DEVICE_ID, 'volumeMuteOff')
      expect(mockTransportInstance.send).toHaveBeenCalledWith('ke', '00')
    })

    it('setVolume(75) sends kf with hex 4b', async () => {
      mockTransportInstance.send.mockResolvedValue(makeOkSend('4b'))
      const result = await mod.sendCommand(DEVICE_ID, 'setVolume', { level: 75 })
      expect(result.success).toBe(true)
      // 75 decimal = 0x4B
      expect(mockTransportInstance.send).toHaveBeenCalledWith('kf', '4b')
    })

    it('setVolume clamps values above 100', async () => {
      mockTransportInstance.send.mockResolvedValue(makeOkSend('64'))
      await mod.sendCommand(DEVICE_ID, 'setVolume', { level: 150 })
      // 100 decimal = 0x64
      expect(mockTransportInstance.send).toHaveBeenCalledWith('kf', '64')
    })

    it('setVolume clamps values below 0', async () => {
      mockTransportInstance.send.mockResolvedValue(makeOkSend('00'))
      await mod.sendCommand(DEVICE_ID, 'setVolume', { level: -10 })
      expect(mockTransportInstance.send).toHaveBeenCalledWith('kf', '00')
    })

    it('setVolume returns failure when level param missing', async () => {
      const result = await mod.sendCommand(DEVICE_ID, 'setVolume')
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/level/)
    })

    it('volumeUp increments volume by 10 (clamped at 100)', async () => {
      // Set up volume=95 (0x5F) via the timed poll, then volumeUp should send 0x64
      mockTransportInstance.send.mockImplementation((cmd: string, _data: string) => {
        if (cmd === 'kf') {
          return Promise.resolve({ ok: true, value: '5f', rawValue: 'f 0 OK5fx' })
        }
        return Promise.resolve({ ok: true, value: '01', rawValue: 'a 0 OK01x' })
      })
      await vi.advanceTimersByTimeAsync(60_000)

      mockTransportInstance.send.mockResolvedValue(makeOkSend('64'))
      const result = await mod.sendCommand(DEVICE_ID, 'volumeUp')
      expect(result.success).toBe(true)
      expect(mockTransportInstance.send).toHaveBeenLastCalledWith('kf', '64')
    })

    it('volumeDown decrements volume by 10 (clamped at 0)', async () => {
      // Set volume=5 (0x05) via the timed poll, then volumeDown should send 0x00
      mockTransportInstance.send.mockImplementation((cmd: string, _data: string) => {
        if (cmd === 'kf') {
          return Promise.resolve({ ok: true, value: '05', rawValue: 'f 0 OK05x' })
        }
        return Promise.resolve({ ok: true, value: '01', rawValue: 'a 0 OK01x' })
      })
      await vi.advanceTimersByTimeAsync(60_000)

      mockTransportInstance.send.mockResolvedValue(makeOkSend('00'))
      const result = await mod.sendCommand(DEVICE_ID, 'volumeDown')
      expect(result.success).toBe(true)
      expect(mockTransportInstance.send).toHaveBeenLastCalledWith('kf', '00')
    })

    it('returns failure for unknown command', async () => {
      const result = await mod.sendCommand(DEVICE_ID, 'unknownCommand')
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/unknown/i)
    })

    // ── NG response handling ────────────────────────────────────────────────

    it('NG response does not crash — returns success:false with error message', async () => {
      mockTransportInstance.send.mockResolvedValue(makeNgSend('00'))
      const result = await mod.sendCommand(DEVICE_ID, 'powerOn')
      // Must not throw; should return a structured failure
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('NG response during poll is handled gracefully', async () => {
      // All queries return NG — state stays null but no exception thrown
      mockTransportInstance.send.mockResolvedValue(makeNgSend('00'))
      await expect(mod.ping(DEVICE_ID)).resolves.toBeDefined()
    })
  })

  // ── downloadConfig / restoreConfig ─────────────────────────────────────────

  describe('downloadConfig / restoreConfig', () => {
    it('downloadConfig returns empty object', async () => {
      mockTransportInstance.send.mockResolvedValue(makeOkSend('01'))
      await mod.connect(DEVICE_ID, makeDefaultConfig())
      const config = await mod.downloadConfig(DEVICE_ID)
      expect(config).toEqual({})
    })

    it('restoreConfig resolves without error', async () => {
      mockTransportInstance.send.mockResolvedValue(makeOkSend('01'))
      await mod.connect(DEVICE_ID, makeDefaultConfig())
      await expect(mod.restoreConfig(DEVICE_ID, {})).resolves.toBeUndefined()
    })
  })
})
