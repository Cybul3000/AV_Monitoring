import { describe, it, expect, vi, beforeEach } from 'vitest'
import net from 'net'
import { EventEmitter } from 'events'

// Mock keytar
vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(),
    setPassword: vi.fn(),
    deletePassword: vi.fn()
  }
}))

// Mock electron
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp'), isPackaged: false }
}))

// Mock credentials module so loadDeviceCredentials is a vi.fn()
vi.mock('../../../src/main/platform/credentials', () => ({
  loadDeviceCredentials: vi.fn()
}))

// Mock net module
vi.mock('net')

// Mock better-sqlite3
vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => ({
    pragma: vi.fn(),
    exec: vi.fn(),
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
      run: vi.fn()
    }))
  }))
}))

// Mock database module
vi.mock('../../../src/main/db/database', () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
      run: vi.fn()
    }))
  }))
}))

// Mock SSHSessionManager
const mockSessionOpen = vi.fn()
const mockSessionClose = vi.fn()
const mockSessionSend = vi.fn()
const mockSessionDestroy = vi.fn()

class MockSSHSessionManager extends EventEmitter {
  private _state = 'CLOSED'
  get state() { return this._state }
  open = mockSessionOpen
  close = mockSessionClose
  send = mockSessionSend
  destroy = mockSessionDestroy

  simulateState(state: string, reason?: string) {
    this._state = state
    this.emit('state', state, reason)
  }
  simulateOutput(data: string) {
    this.emit('output', data)
  }
}

let mockSessionInstance: MockSSHSessionManager

vi.mock('../../../src/main/modules/crestron-ssh/SSHSessionManager', () => ({
  SSHSessionManager: vi.fn().mockImplementation(() => {
    mockSessionInstance = new MockSSHSessionManager()
    return mockSessionInstance
  })
}))

import { CrestronSSHModule } from '../../../src/main/modules/crestron-ssh/CrestronSSHModule'
import { loadDeviceCredentials } from '../../../src/main/platform/credentials'

const DEVICE_ID = 'crestron-test-001'

async function createConnectedModule(opts?: { host?: string; port?: number; deviceType?: string }) {
  const mod = new CrestronSSHModule()
  await mod.connect(DEVICE_ID, {
    host: opts?.host ?? '10.0.0.10',
    port: opts?.port ?? 22,
    options: opts?.deviceType ? { deviceType: opts.deviceType } : {}
  })
  return mod
}

describe('CrestronSSHModule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSessionOpen.mockResolvedValue(undefined)
    mockSessionClose.mockResolvedValue(undefined)
    mockSessionSend.mockResolvedValue(undefined)
    vi.mocked(loadDeviceCredentials).mockResolvedValue({ password: 'test-pass' })
  })

  // ── getStatusPoints ────────────────────────────────────────────────────────

  describe('getStatusPoints', () => {
    it('returns reachable and ssh_session status points', () => {
      const mod = new CrestronSSHModule()
      const points = mod.getStatusPoints()

      expect(points).toHaveLength(2)
      expect(points[0]).toEqual({ id: 'reachable', label: 'Device Reachable', defaultAlertable: true })
      expect(points[1]).toEqual({ id: 'ssh_session', label: 'SSH Session Active', defaultAlertable: false })
    })

    it('is synchronous and returns same result every time', () => {
      const mod = new CrestronSSHModule()
      expect(mod.getStatusPoints()).toEqual(mod.getStatusPoints())
    })
  })

  // ── type / label / supportedActions ──────────────────────────────────────

  describe('module identity', () => {
    it('has correct type', () => {
      const mod = new CrestronSSHModule()
      expect(mod.type).toBe('crestron-ssh')
    })

    it('has correct label', () => {
      const mod = new CrestronSSHModule()
      expect(mod.label).toBe('Crestron Series 3/4 (SSH)')
    })

    it('supports expected actions', () => {
      const mod = new CrestronSSHModule()
      expect(mod.supportedActions).toContain('openSSH')
      expect(mod.supportedActions).toContain('closeSSH')
      expect(mod.supportedActions).toContain('sendCommand')
      expect(mod.supportedActions).toContain('reboot')
      expect(mod.supportedActions).toContain('ping')
    })
  })

  // ── connect ───────────────────────────────────────────────────────────────

  describe('connect', () => {
    it('stores device config without opening SSH session', async () => {
      const mod = new CrestronSSHModule()
      await mod.connect(DEVICE_ID, { host: '10.0.0.10', port: 22 })

      // SSH session should NOT be opened
      expect(mockSessionOpen).not.toHaveBeenCalled()
    })

    it('resolves successfully', async () => {
      const mod = new CrestronSSHModule()
      await expect(mod.connect(DEVICE_ID, { host: '10.0.0.10' })).resolves.toBeUndefined()
    })
  })

  // ── disconnect ────────────────────────────────────────────────────────────

  describe('disconnect', () => {
    it('calls session.close() if session is open', async () => {
      const mod = await createConnectedModule()

      // Open a session first
      await mod.sendCommand(DEVICE_ID, 'openSSH')

      mockSessionClose.mockResolvedValue(undefined)
      await mod.disconnect(DEVICE_ID)

      expect(mockSessionClose).toHaveBeenCalled()
    })

    it('disconnects without error if no session is open', async () => {
      const mod = await createConnectedModule()
      await expect(mod.disconnect(DEVICE_ID)).resolves.toBeUndefined()
    })
  })

  // ── ping ──────────────────────────────────────────────────────────────────

  describe('ping', () => {
    it('returns GREEN when TCP connection succeeds', async () => {
      const mockSocket = {
        on: vi.fn((event: string, cb: () => void) => {
          if (event === 'connect') setTimeout(cb, 0)
          return mockSocket
        }),
        setTimeout: vi.fn(),
        destroy: vi.fn()
      }
      vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as net.Socket)

      const mod = await createConnectedModule()
      const status = await mod.ping(DEVICE_ID)

      expect(status.status).toBe('GREEN')
      expect(status.deviceId).toBe(DEVICE_ID)
      expect(status.lastSeen).toBeTruthy()
    })

    it('returns RED when TCP connection fails', async () => {
      const mockSocket = {
        on: vi.fn((event: string, cb: (err?: Error) => void) => {
          if (event === 'error') setTimeout(() => cb(new Error('ECONNREFUSED')), 0)
          return mockSocket
        }),
        setTimeout: vi.fn(),
        destroy: vi.fn()
      }
      vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as net.Socket)

      const mod = await createConnectedModule()
      const status = await mod.ping(DEVICE_ID)

      expect(status.status).toBe('RED')
      expect(status.lastSeen).toBeNull()
    })

    it('returns RED when TCP connection times out', async () => {
      const mockSocket = {
        on: vi.fn((event: string, cb: () => void) => {
          if (event === 'timeout') setTimeout(cb, 0)
          return mockSocket
        }),
        setTimeout: vi.fn(),
        destroy: vi.fn()
      }
      vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as net.Socket)

      const mod = await createConnectedModule()
      const status = await mod.ping(DEVICE_ID)

      expect(status.status).toBe('RED')
    })

    it('uses net.createConnection — not fetch', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('should not be called'))
      const mockSocket = {
        on: vi.fn((event: string, cb: () => void) => {
          if (event === 'connect') setTimeout(cb, 0)
          return mockSocket
        }),
        setTimeout: vi.fn(),
        destroy: vi.fn()
      }
      vi.mocked(net.createConnection).mockReturnValue(mockSocket as unknown as net.Socket)

      const mod = await createConnectedModule()
      await mod.ping(DEVICE_ID)

      expect(net.createConnection).toHaveBeenCalled()
    })
  })

  // ── sendCommand: openSSH ──────────────────────────────────────────────────

  describe('sendCommand openSSH', () => {
    it('creates SSHSessionManager and calls open()', async () => {
      const mod = await createConnectedModule()
      const result = await mod.sendCommand(DEVICE_ID, 'openSSH')

      expect(result.success).toBe(true)
      expect(result.output).toBe('CONNECTING')
      expect(mockSessionOpen).toHaveBeenCalled()
    })

    it('passes correct options to session.open()', async () => {
      const mod = await createConnectedModule({ host: '192.168.1.100', port: 22 })
      await mod.sendCommand(DEVICE_ID, 'openSSH')

      expect(mockSessionOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          host: '192.168.1.100',
          port: 22,
          username: 'admin',
          password: 'test-pass'
        })
      )
    })

    it('returns failure if no password in keychain', async () => {
      vi.mocked(loadDeviceCredentials).mockResolvedValue({})

      const mod = await createConnectedModule()
      const result = await mod.sendCommand(DEVICE_ID, 'openSSH')

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/password/i)
    })

    it('uses CP4 defaults for unknown deviceType', async () => {
      const mod = await createConnectedModule()
      await mod.sendCommand(DEVICE_ID, 'openSSH')

      expect(mockSessionOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceType: 'CP4',
          disconnectCmd: 'BYE'
        })
      )
    })

    it('uses VC4 defaults when deviceType is VC4', async () => {
      const mod = await createConnectedModule({ deviceType: 'VC4' })
      await mod.sendCommand(DEVICE_ID, 'openSSH')

      expect(mockSessionOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceType: 'VC4',
          disconnectCmd: 'exit'
        })
      )
    })
  })

  // ── sendCommand: closeSSH ─────────────────────────────────────────────────

  describe('sendCommand closeSSH', () => {
    it('calls session.close()', async () => {
      const mod = await createConnectedModule()
      await mod.sendCommand(DEVICE_ID, 'openSSH')
      const result = await mod.sendCommand(DEVICE_ID, 'closeSSH')

      expect(result.success).toBe(true)
      expect(mockSessionClose).toHaveBeenCalled()
    })

    it('succeeds even when no session is open', async () => {
      const mod = await createConnectedModule()
      const result = await mod.sendCommand(DEVICE_ID, 'closeSSH')
      expect(result.success).toBe(true)
    })
  })

  // ── sendCommand: sendCommand (raw command) ────────────────────────────────

  describe('sendCommand sendCommand', () => {
    it('calls session.send() with the command', async () => {
      const mod = await createConnectedModule()
      await mod.sendCommand(DEVICE_ID, 'openSSH')
      // Simulate session being READY
      mockSessionInstance.simulateState('READY')

      const result = await mod.sendCommand(DEVICE_ID, 'sendCommand', { command: 'INFO' })

      expect(result.success).toBe(true)
      expect(mockSessionSend).toHaveBeenCalledWith('INFO')
    })

    it('returns failure if session is not READY', async () => {
      const mod = await createConnectedModule()
      // No session open — session is null
      const result = await mod.sendCommand(DEVICE_ID, 'sendCommand', { command: 'INFO' })

      expect(result.success).toBe(false)
    })
  })

  // ── sendCommand: reboot ───────────────────────────────────────────────────

  describe('sendCommand reboot', () => {
    it('calls session.send("REBOOT")', async () => {
      const mod = await createConnectedModule()
      await mod.sendCommand(DEVICE_ID, 'openSSH')
      mockSessionInstance.simulateState('READY')

      const result = await mod.sendCommand(DEVICE_ID, 'reboot')

      expect(result.success).toBe(true)
      expect(mockSessionSend).toHaveBeenCalledWith('REBOOT')
    })

    it('returns failure if no session is open', async () => {
      const mod = await createConnectedModule()
      const result = await mod.sendCommand(DEVICE_ID, 'reboot')
      expect(result.success).toBe(false)
    })
  })

  // ── Session state ERROR doesn't crash module ───────────────────────────────

  describe('session ERROR state', () => {
    it('handles ERROR state without crashing module', async () => {
      const mod = await createConnectedModule()
      await mod.sendCommand(DEVICE_ID, 'openSSH')

      // Simulate ERROR state
      expect(() => {
        mockSessionInstance.simulateState('ERROR', 'Connection timed out waiting for prompt')
      }).not.toThrow()

      // Module should still be usable
      const result = await mod.sendCommand(DEVICE_ID, 'closeSSH')
      expect(result.success).toBe(true)
    })

    it('propagates state changes via registered callbacks', async () => {
      const mod = await createConnectedModule()
      const stateCallback = vi.fn()
      mod.registerCallbacks(DEVICE_ID, stateCallback, vi.fn())

      await mod.sendCommand(DEVICE_ID, 'openSSH')
      mockSessionInstance.simulateState('ERROR', 'Auth failed')

      expect(stateCallback).toHaveBeenCalledWith('ERROR', 'Auth failed')
    })
  })

  // ── registerCallbacks ──────────────────────────────────────────────────────

  describe('registerCallbacks', () => {
    it('wires output events to the provided callback', async () => {
      const mod = await createConnectedModule()
      const outputCallback = vi.fn()
      mod.registerCallbacks(DEVICE_ID, vi.fn(), outputCallback)

      await mod.sendCommand(DEVICE_ID, 'openSSH')
      mockSessionInstance.simulateOutput('CP4N> hello\n')

      expect(outputCallback).toHaveBeenCalledWith('CP4N> hello\n')
    })

    it('does not throw if device does not exist', () => {
      const mod = new CrestronSSHModule()
      expect(() => mod.registerCallbacks('nonexistent-id', vi.fn(), vi.fn())).not.toThrow()
    })
  })

  // ── downloadConfig / restoreConfig ────────────────────────────────────────

  describe('downloadConfig / restoreConfig', () => {
    it('downloadConfig returns empty object', async () => {
      const mod = await createConnectedModule()
      const config = await mod.downloadConfig(DEVICE_ID)
      expect(config).toEqual({})
    })

    it('restoreConfig resolves without error', async () => {
      const mod = await createConnectedModule()
      await expect(mod.restoreConfig(DEVICE_ID, {})).resolves.toBeUndefined()
    })
  })
})
