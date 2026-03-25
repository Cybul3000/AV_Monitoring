import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

// ── Mock ssh2 ─────────────────────────────────────────────────────────────────

interface MockShellStream extends EventEmitter {
  write: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  stderr: EventEmitter
}

interface MockSSH2Client extends EventEmitter {
  connect: ReturnType<typeof vi.fn>
  shell: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
}

let mockClient: MockSSH2Client
let mockStream: MockShellStream

const createMockStream = (): MockShellStream => {
  const stream = new EventEmitter() as MockShellStream
  stream.write = vi.fn()
  stream.destroy = vi.fn()
  stream.stderr = new EventEmitter()
  return stream
}

const createMockClient = (): MockSSH2Client => {
  const client = new EventEmitter() as MockSSH2Client
  client.connect = vi.fn()
  client.destroy = vi.fn()
  client.shell = vi.fn()
  return client
}

vi.mock('ssh2', () => ({
  Client: vi.fn().mockImplementation(() => {
    mockClient = createMockClient()
    mockStream = createMockStream()

    // Default shell implementation: calls callback with mock stream
    mockClient.shell = vi.fn((_opts: unknown, cb: (err: null, stream: MockShellStream) => void) => {
      cb(null, mockStream)
    })

    return mockClient
  })
}))

import { SSHSessionManager } from '../../../src/main/modules/crestron-ssh/SSHSessionManager'
import type { SessionOptions } from '../../../src/main/modules/crestron-ssh/SSHSessionManager'

const BASE_OPTIONS: SessionOptions = {
  host: '10.0.0.5',
  port: 22,
  username: 'admin',
  password: 'secret',
  deviceType: 'CP4',
  promptPattern: 'CP4N>',
  disconnectCmd: 'BYE'
}

function triggerReady(pattern = 'CP4N>') {
  // Simulate server sending prompt
  mockStream.emit('data', Buffer.from(pattern))
}

describe('SSHSessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Initial state ──────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts in CLOSED state', () => {
      const mgr = new SSHSessionManager()
      expect(mgr.state).toBe('CLOSED')
    })
  })

  // ── open() ─────────────────────────────────────────────────────────────────

  describe('open()', () => {
    it('transitions to CONNECTING then READY when prompt detected', async () => {
      const mgr = new SSHSessionManager()
      const states: string[] = []
      mgr.on('state', (state) => states.push(state))

      const openPromise = mgr.open(BASE_OPTIONS)

      // After connect + shell, simulate client ready
      mockClient.emit('ready')
      // Simulate prompt arrival
      triggerReady()

      await openPromise

      expect(states).toContain('CONNECTING')
      expect(states).toContain('READY')
      expect(mgr.state).toBe('READY')
    })

    it('calls client.connect() with provided options', async () => {
      const mgr = new SSHSessionManager()
      const openPromise = mgr.open(BASE_OPTIONS)
      mockClient.emit('ready')
      triggerReady()
      await openPromise

      expect(mockClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          host: '10.0.0.5',
          port: 22,
          username: 'admin',
          password: 'secret'
        })
      )
    })

    it('transitions to ERROR when prompt not detected within timeout', async () => {
      const mgr = new SSHSessionManager()
      const states: string[] = []
      const reasons: (string | undefined)[] = []
      mgr.on('state', (state, reason) => {
        states.push(state)
        reasons.push(reason)
      })

      const openPromise = mgr.open(BASE_OPTIONS)
      mockClient.emit('ready')
      // Do NOT emit prompt — advance timer past 10s
      vi.advanceTimersByTime(10_001)

      await expect(openPromise).rejects.toThrow(/timed out/i)

      expect(states).toContain('ERROR')
      expect(reasons.some(r => r?.includes('timed out'))).toBe(true)
    })

    it('transitions to ERROR on auth failure (SSH error event)', async () => {
      const mgr = new SSHSessionManager()
      const states: string[] = []
      mgr.on('state', (state) => states.push(state))

      const openPromise = mgr.open(BASE_OPTIONS)
      mockClient.emit('error', new Error('Authentication failure'))

      await expect(openPromise).rejects.toThrow()
      expect(states).toContain('ERROR')
    })

    it('transitions to ERROR if shell() returns an error', async () => {
      const shellErr = new Error('Shell unavailable')

      const mgr = new SSHSessionManager()
      const states: string[] = []
      mgr.on('state', (state) => states.push(state))

      const openPromise = mgr.open(BASE_OPTIONS)

      // mockClient is now the one just created inside open() — override shell before ready
      mockClient.shell = vi.fn((_opts: unknown, cb: (err: Error, stream: MockShellStream) => void) => {
        cb(shellErr, mockStream)
      })
      mockClient.emit('ready')

      await expect(openPromise).rejects.toThrow()
      expect(states).toContain('ERROR')
    })
  })

  // ── send() ─────────────────────────────────────────────────────────────────

  describe('send()', () => {
    async function openSession(options = BASE_OPTIONS) {
      const mgr = new SSHSessionManager()
      const openPromise = mgr.open(options)
      mockClient.emit('ready')
      triggerReady()
      await openPromise
      return mgr
    }

    it('writes command + newline to shell stream', async () => {
      const mgr = await openSession()
      await mgr.send('INFO')

      expect(mockStream.write).toHaveBeenCalledWith('INFO\n')
    })

    it('sets state to BUSY after send()', async () => {
      const mgr = await openSession()
      const sendPromise = mgr.send('INFO')
      expect(mgr.state).toBe('BUSY')
      await sendPromise
    })

    it('returns to READY when prompt is detected after send()', async () => {
      const mgr = await openSession()
      await mgr.send('INFO')
      expect(mgr.state).toBe('BUSY')

      // Simulate response + prompt
      mockStream.emit('data', Buffer.from('some output\r\nCP4N>'))
      expect(mgr.state).toBe('READY')
    })

    it('throws when session is not READY', async () => {
      const mgr = new SSHSessionManager()
      // State is CLOSED
      await expect(mgr.send('INFO')).rejects.toThrow()
    })
  })

  // ── close() ───────────────────────────────────────────────────────────────

  describe('close()', () => {
    it('sends disconnect command and transitions to CLOSED', async () => {
      const mgr = new SSHSessionManager()
      const openPromise = mgr.open(BASE_OPTIONS)
      mockClient.emit('ready')
      triggerReady()
      await openPromise

      const states: string[] = []
      mgr.on('state', (state) => states.push(state))

      // close() sends 'BYE\n' then destroys
      const closePromise = mgr.close()
      // Fast-forward the 200ms delay in close()
      await vi.runAllTimersAsync()
      await closePromise

      expect(mockStream.write).toHaveBeenCalledWith('BYE\n')
      expect(states).toContain('CLOSED')
      expect(mgr.state).toBe('CLOSED')
    })

    it('is a no-op when already CLOSED', async () => {
      const mgr = new SSHSessionManager()
      await expect(mgr.close()).resolves.toBeUndefined()
      expect(mgr.state).toBe('CLOSED')
    })
  })

  // ── destroy() ─────────────────────────────────────────────────────────────

  describe('destroy()', () => {
    it('force-closes without sending disconnect command', async () => {
      const mgr = new SSHSessionManager()
      const openPromise = mgr.open(BASE_OPTIONS)
      mockClient.emit('ready')
      triggerReady()
      await openPromise

      mgr.destroy()

      // Disconnect command should NOT have been written
      expect(mockStream.write).not.toHaveBeenCalledWith('BYE\n')
      expect(mgr.state).toBe('CLOSED')
    })
  })

  // ── output events ──────────────────────────────────────────────────────────

  describe('output events', () => {
    it('emits output events for each data chunk from shell stream', async () => {
      const mgr = new SSHSessionManager()
      const openPromise = mgr.open(BASE_OPTIONS)
      mockClient.emit('ready')

      const outputs: string[] = []
      mgr.on('output', (data) => outputs.push(data))

      // Emit data in multiple chunks
      mockStream.emit('data', Buffer.from('Welcome to Crestron\r\n'))
      mockStream.emit('data', Buffer.from('CP4N>'))

      await openPromise

      expect(outputs.length).toBeGreaterThanOrEqual(2)
      expect(outputs.some(o => o.includes('Welcome'))).toBe(true)
    })

    it('emits output events while BUSY (receiving command response)', async () => {
      const mgr = new SSHSessionManager()
      const openPromise = mgr.open(BASE_OPTIONS)
      mockClient.emit('ready')
      triggerReady()
      await openPromise

      const outputs: string[] = []
      mgr.on('output', (data) => outputs.push(data))

      await mgr.send('INFO')

      // Simulate multi-line response
      mockStream.emit('data', Buffer.from('MODEL: CP4\r\n'))
      mockStream.emit('data', Buffer.from('VERSION: 1.6\r\n'))
      mockStream.emit('data', Buffer.from('CP4N>'))

      expect(outputs.some(o => o.includes('MODEL'))).toBe(true)
      expect(outputs.some(o => o.includes('VERSION'))).toBe(true)
    })
  })

  // ── VC4 prompt detection ──────────────────────────────────────────────────

  describe('VC4 prompt detection', () => {
    const VC4_OPTIONS: SessionOptions = {
      ...BASE_OPTIONS,
      deviceType: 'VC4',
      promptPattern: '\\[admin@[^\\]]+[\\s~]\\]\\$',
      disconnectCmd: 'exit'
    }

    it('detects VC4 prompt and transitions to READY', async () => {
      const mgr = new SSHSessionManager()
      const openPromise = mgr.open(VC4_OPTIONS)
      mockClient.emit('ready')

      // VC4 prompt looks like: [admin@hostname ~]$
      mockStream.emit('data', Buffer.from('[admin@vc4-unit ~]$'))

      await openPromise

      expect(mgr.state).toBe('READY')
    })

    it('sends "exit" as disconnect command for VC4', async () => {
      const mgr = new SSHSessionManager()
      const openPromise = mgr.open(VC4_OPTIONS)
      mockClient.emit('ready')
      mockStream.emit('data', Buffer.from('[admin@vc4-unit ~]$'))
      await openPromise

      const closePromise = mgr.close()
      await vi.runAllTimersAsync()
      await closePromise

      expect(mockStream.write).toHaveBeenCalledWith('exit\n')
    })
  })

  // ── Shell stream close while READY ────────────────────────────────────────

  describe('unexpected stream close', () => {
    it('emits ERROR state when stream closes unexpectedly while READY', async () => {
      const mgr = new SSHSessionManager()
      const openPromise = mgr.open(BASE_OPTIONS)
      mockClient.emit('ready')
      triggerReady()
      await openPromise

      const states: string[] = []
      mgr.on('state', (state) => states.push(state))

      mockStream.emit('close')

      expect(states).toContain('ERROR')
    })
  })
})
