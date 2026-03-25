/**
 * T010 — Failing unit tests for DanteUdpTransport.ts
 * Tests: txnId matching, 5s read timeout, 10s write timeout, concurrent requests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

// ── Mock dgram ────────────────────────────────────────────────────────────────

let mockMessageHandler: ((msg: Buffer) => void) | null = null
let mockSendCallback: ((err: Error | null) => void) | null = null
let capturedSendArgs: { port: number; host: string; packet: Buffer } | null = null

const mockSocket = {
  on: vi.fn((event: string, cb: (msg: Buffer) => void) => {
    if (event === 'message') mockMessageHandler = cb
    return mockSocket
  }),
  bind: vi.fn(),
  send: vi.fn((packet: Buffer, port: number, host: string, cb: (err: Error | null) => void) => {
    capturedSendArgs = { port, host, packet: Buffer.from(packet) }
    mockSendCallback = cb
    // Simulate async send success by default
    setImmediate(() => cb(null))
  }),
  close: vi.fn()
}

vi.mock('dgram', () => ({
  default: {
    createSocket: vi.fn(() => mockSocket)
  }
}))

import { DanteUdpTransport } from '../../../src/main/modules/dante/DanteUdpTransport'
import { buildArcRequest, ARC_PROTOCOL_ID, OP } from '../../../src/main/modules/dante/DantePacket'

// ── Helper to build a response Buffer with given txnId ────────────────────────

function makeResponse(txnId: number): Buffer {
  const buf = Buffer.alloc(10)
  buf.writeUInt16BE(ARC_PROTOCOL_ID, 0)
  buf.writeUInt16BE(10, 2)
  buf.writeUInt16BE(txnId, 4)
  buf.writeUInt16BE(OP.GET_DEVICE_NAME, 6)
  buf.writeUInt16BE(0x0001, 8) // RESULT_OK
  return buf
}

describe('DanteUdpTransport', () => {
  let transport: DanteUdpTransport

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockMessageHandler = null
    mockSendCallback = null
    capturedSendArgs = null
    mockSocket.on.mockImplementation((event: string, cb: (msg: Buffer) => void) => {
      if (event === 'message') mockMessageHandler = cb
      return mockSocket
    })
    mockSocket.send.mockImplementation((packet: Buffer, port: number, host: string, cb: (err: Error | null) => void) => {
      capturedSendArgs = { port, host, packet: Buffer.from(packet) }
      mockSendCallback = cb
    })
    transport = new DanteUdpTransport()
  })

  afterEach(() => {
    vi.useRealTimers()
    transport.close()
  })

  // ── txnId matching ──────────────────────────────────────────────────────────

  describe('txnId matching', () => {
    it('resolves request when response has matching txnId', async () => {
      const packet = buildArcRequest(OP.GET_DEVICE_NAME, 0x1234)

      // Kick off request
      const promise = transport.request('192.168.1.1', 4440, packet, 5000)

      // Simulate send completing
      mockSendCallback?.(null)

      // Inject matching response
      const response = makeResponse(0x1234)
      mockMessageHandler?.(response)

      const result = await promise
      expect(result).toBeInstanceOf(Buffer)
      expect(result.readUInt16BE(4)).toBe(0x1234)
    })

    it('ignores response with mismatched txnId and keeps pending', async () => {
      const packet = buildArcRequest(OP.GET_DEVICE_NAME, 0xAAAA)
      let resolved = false

      const promise = transport.request('192.168.1.1', 4440, packet, 5000)
        .then(buf => { resolved = true; return buf })
        .catch(() => null)

      mockSendCallback?.(null)

      // Inject a response with WRONG txnId — should be ignored
      const wrongResponse = makeResponse(0xBBBB)
      mockMessageHandler?.(wrongResponse)

      // After a tick, promise should not have resolved
      await Promise.resolve()
      expect(resolved).toBe(false)

      // Clean up by timing out
      vi.advanceTimersByTime(6000)
      await promise
    })

    it('rejects immediately if packet is too short (< 6 bytes)', async () => {
      const shortPacket = Buffer.alloc(4)
      await expect(transport.request('192.168.1.1', 4440, shortPacket)).rejects.toThrow()
    })
  })

  // ── Read timeout (5s default) ───────────────────────────────────────────────

  describe('read timeout', () => {
    it('rejects with timeout error after 5000ms when no response arrives', async () => {
      const packet = buildArcRequest(OP.GET_DEVICE_NAME, 0x0001)

      const promise = transport.request('192.168.1.1', 4440, packet, 5000)
      mockSendCallback?.(null)

      // Advance past 5s timeout
      vi.advanceTimersByTime(5001)

      await expect(promise).rejects.toThrow(/timeout/i)
    })

    it('does not reject before 5000ms', async () => {
      const packet = buildArcRequest(OP.GET_DEVICE_NAME, 0x0002)
      let rejected = false

      transport.request('192.168.1.1', 4440, packet, 5000).catch(() => { rejected = true })
      mockSendCallback?.(null)

      vi.advanceTimersByTime(4999)
      await Promise.resolve()
      expect(rejected).toBe(false)

      // Clean up
      vi.advanceTimersByTime(2000)
    })
  })

  // ── Write timeout (10s) ─────────────────────────────────────────────────────

  describe('write timeout', () => {
    it('caller can pass 10000ms as write timeout', async () => {
      const packet = buildArcRequest(OP.GET_DEVICE_NAME, 0x0003)

      const promise = transport.request('192.168.1.1', 4440, packet, 10000)
      mockSendCallback?.(null)

      // Should not reject at 9999ms
      vi.advanceTimersByTime(9999)
      let rejected = false
      promise.catch(() => { rejected = true })
      await Promise.resolve()
      expect(rejected).toBe(false)

      // Should reject at 10001ms
      vi.advanceTimersByTime(2)
      await expect(promise).rejects.toThrow(/timeout/i)
    })

    it('rejects if send callback returns error', async () => {
      mockSocket.send.mockImplementation((_pkt: Buffer, _port: number, _host: string, cb: (err: Error | null) => void) => {
        cb(new Error('Network error'))
      })

      const packet = buildArcRequest(OP.GET_DEVICE_NAME, 0x0004)
      await expect(transport.request('192.168.1.1', 4440, packet, 5000)).rejects.toThrow('Network error')
    })
  })

  // ── Concurrent requests ─────────────────────────────────────────────────────

  describe('concurrent requests', () => {
    it('resolves concurrent requests independently by txnId', async () => {
      const txnId1 = 0x0011
      const txnId2 = 0x0022
      const packet1 = buildArcRequest(OP.GET_DEVICE_NAME, txnId1)
      const packet2 = buildArcRequest(OP.GET_DEVICE_INFO, txnId2)

      // Issue both requests
      const promise1 = transport.request('192.168.1.1', 4440, packet1, 5000)
      const promise2 = transport.request('192.168.1.1', 4440, packet2, 5000)

      // Both sends complete
      mockSendCallback?.(null)

      // Resolve txnId2 first
      mockMessageHandler?.(makeResponse(txnId2))
      const result2 = await promise2
      expect(result2.readUInt16BE(4)).toBe(txnId2)

      // Now resolve txnId1
      mockMessageHandler?.(makeResponse(txnId1))
      const result1 = await promise1
      expect(result1.readUInt16BE(4)).toBe(txnId1)
    })

    it('close() rejects all pending requests', async () => {
      const packet1 = buildArcRequest(OP.GET_DEVICE_NAME, 0x0031)
      const packet2 = buildArcRequest(OP.GET_DEVICE_INFO, 0x0032)

      const p1 = transport.request('192.168.1.1', 4440, packet1, 5000)
      const p2 = transport.request('192.168.1.1', 4440, packet2, 5000)

      mockSendCallback?.(null)

      transport.close()

      await expect(p1).rejects.toThrow()
      await expect(p2).rejects.toThrow()
    })
  })

  // ── fire-and-forget send ────────────────────────────────────────────────────

  describe('send (fire-and-forget)', () => {
    it('calls socket.send without waiting for response', () => {
      const packet = buildArcRequest(OP.GET_DEVICE_NAME, 0x9999)
      transport.send('192.168.1.1', 4440, packet)
      expect(mockSocket.send).toHaveBeenCalledTimes(1)
    })
  })
})
