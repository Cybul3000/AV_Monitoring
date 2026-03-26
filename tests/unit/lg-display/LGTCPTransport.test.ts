import { describe, it, expect, vi, beforeEach } from 'vitest'
import net from 'net'
import { LGTCPTransport } from '../../../src/main/modules/lg-display/LGTCPTransport'

// ── Minimal net.Socket mock ───────────────────────────────────────────────────

type EventHandler = (...args: unknown[]) => void

function makeSocketMock() {
  const handlers: Record<string, EventHandler[]> = {}
  const mock = {
    once: vi.fn((event: string, cb: EventHandler) => {
      handlers[event] = handlers[event] ?? []
      handlers[event].push(cb)
    }),
    on: vi.fn((event: string, cb: EventHandler) => {
      handlers[event] = handlers[event] ?? []
      handlers[event].push(cb)
    }),
    connect: vi.fn((port: number, host: string) => {
      // Fire 'connect' synchronously so send() can proceed
      handlers['connect']?.forEach(h => h())
      void port; void host
    }),
    write: vi.fn(),
    destroy: vi.fn(),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      handlers[event]?.forEach(h => h(...args))
    }),
    _fire: (event: string, ...args: unknown[]) => {
      handlers[event]?.forEach(h => h(...args))
    },
    _fireData: (data: string) => {
      handlers['data']?.forEach(h => h(Buffer.from(data, 'ascii')))
    }
  }
  return mock
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LGTCPTransport._handleLine', () => {
  let transport: LGTCPTransport
  let socket: ReturnType<typeof makeSocketMock>

  beforeEach(() => {
    socket = makeSocketMock()
    vi.spyOn(net, 'Socket').mockReturnValue(socket as unknown as net.Socket)
    transport = new LGTCPTransport()
  })

  async function connected(): Promise<void> {
    await transport.connect('10.0.0.1', 9761)
  }

  it('parses OK response with no line terminator (bare x end-of-message)', async () => {
    await connected()
    const promise = transport.send('ka', 'ff')
    socket._fireData('a 1 OK01x')
    const res = await promise
    expect(res.ok).toBe(true)
    expect(res.value).toBe('01')
  })

  it('parses OK response with CR terminator after x', async () => {
    await connected()
    const promise = transport.send('ka', 'ff')
    socket._fireData('a 1 OK01x\r')
    const res = await promise
    expect(res.ok).toBe(true)
    expect(res.value).toBe('01')
  })

  it('parses OK response with CRLF terminator after x', async () => {
    await connected()
    const promise = transport.send('ka', 'ff')
    socket._fireData('a 1 OK01x\r\n')
    const res = await promise
    expect(res.ok).toBe(true)
    expect(res.value).toBe('01')
  })

  it('handles two responses arriving in one TCP chunk', async () => {
    await connected()
    // First command
    const p1 = transport.send('ka', 'ff')
    socket._fireData('a 1 OK01x')
    const r1 = await p1
    expect(r1.ok).toBe(true)
    expect(r1.value).toBe('01')
    // Second command immediately after — simulate both arriving together
    const p2 = transport.send('xb', 'ff')
    socket._fireData('b 1 OK40x')
    const r2 = await p2
    expect(r2.ok).toBe(true)
    expect(r2.value).toBe('40')
  })

  it('parses OK response with zero-padded setId in response (e.g. "01")', async () => {
    await connected()
    const promise = transport.send('ka', 'ff')
    socket._fireData('a 01 OK01x\r')
    const res = await promise
    expect(res.ok).toBe(true)
    expect(res.value).toBe('01')
  })

  it('parses NG response with 2-hex data bytes', async () => {
    await connected()
    const promise = transport.send('ka', 'ff')
    socket._fireData('a 1 NG00x\r')
    const res = await promise
    expect(res.ok).toBe(false)
    expect(res.value).toBe('00')
  })

  it('parses NG response with no data bytes ("NGx" firmware variant)', async () => {
    await connected()
    const promise = transport.send('ka', 'ff')
    // This is the variant the user reported — no hex digits between NG and x
    socket._fireData('a 01 NGx\r')
    const res = await promise
    expect(res.ok).toBe(false)
    expect(res.value).toBe('')
    expect(res.rawValue).toBe('a 01 NGx')
  })

  it('parses input-source OK with hex value 40 (HDMI 1)', async () => {
    await connected()
    const promise = transport.send('xb', 'ff')
    socket._fireData('b 1 OK40x\r')
    const res = await promise
    expect(res.ok).toBe(true)
    expect(res.value).toBe('40')
  })

  it('ignores response for different command char', async () => {
    await connected()
    const promise = transport.send('ka', 'ff')
    // Response for 'b' (xb) should be ignored; 'a' (ka) response resolves it
    socket._fireData('b 1 OK40x\r')
    socket._fireData('a 1 OK01x\r')
    const res = await promise
    expect(res.ok).toBe(true)
    expect(res.value).toBe('01')
  })

  it('setSetId changes the set-ID used in the wire command', async () => {
    transport.setSetId(5)
    await connected()
    transport.send('ka', 'ff').catch(() => {/* ignore timeout in this test */})
    expect(socket.write).toHaveBeenCalledWith('ka 05 ff\r')
  })

  it('setSetId(1) formats as "01" in command', async () => {
    transport.setSetId(1)
    await connected()
    transport.send('ka', 'ff').catch(() => {/* ignore */})
    expect(socket.write).toHaveBeenCalledWith('ka 01 ff\r')
  })
})
