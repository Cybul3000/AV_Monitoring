import { EventEmitter } from 'events'
import * as net from 'net'

const DEFAULT_PORT = 6107
const CRLF = '\r\n'
const COMMAND_TIMEOUT_MS = 10_000
const COUNTER_MIN = 1
const COUNTER_MAX = 9999

// Reconnect backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
const BACKOFF_INITIAL_MS = 1_000
const BACKOFF_MAX_MS = 30_000

interface PendingCommand {
  resolve: (result: LW3Response) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface LW3Response {
  ok: boolean
  value: string
  rawLines: string[]
}

export class LightwareLW3Transport extends EventEmitter {
  private _socket: net.Socket | null = null
  private _buffer = ''
  private _counter = COUNTER_MIN
  private _pending = new Map<string, PendingCommand>()
  private _verbose: boolean
  private _host = ''
  private _port = DEFAULT_PORT
  private _reconnecting = false
  private _destroyed = false
  private _backoffMs = BACKOFF_INITIAL_MS
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options?: { verbose?: boolean }) {
    super()
    this._verbose = options?.verbose ?? false
  }

  async connect(host: string, port: number = DEFAULT_PORT): Promise<void> {
    this._host = host
    this._port = port
    this._destroyed = false
    this._backoffMs = BACKOFF_INITIAL_MS
    return this._doConnect()
  }

  private _doConnect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this._destroyed) {
        reject(new Error('Transport destroyed'))
        return
      }

      const socket = new net.Socket()
      this._socket = socket
      this._buffer = ''

      const onConnectError = (err: Error) => {
        socket.destroy()
        reject(err)
      }

      socket.once('connect', () => {
        socket.removeListener('error', onConnectError)
        this._backoffMs = BACKOFF_INITIAL_MS
        this._reconnecting = false
        if (this._verbose) console.log('[LW3Transport] connected to', this._host, this._port)
        this.emit('connected')
        resolve()
      })

      socket.once('error', onConnectError)

      socket.on('data', (chunk: Buffer) => {
        this._onData(chunk.toString('utf8'))
      })

      socket.on('close', () => {
        if (this._verbose) console.log('[LW3Transport] socket closed')
        this.emit('disconnected')
        this._rejectAllPending('Connection closed')
        if (!this._destroyed) {
          this._scheduleReconnect()
        }
      })

      socket.on('error', (err: Error) => {
        if (this._verbose) console.error('[LW3Transport] socket error', err.message)
        this.emit('error', err)
      })

      socket.connect({ host: this._host, port: this._port })
    })
  }

  destroy(): void {
    this._destroyed = true
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    this._rejectAllPending('Transport destroyed')
    if (this._socket) {
      this._socket.destroy()
      this._socket = null
    }
  }

  async send(command: string): Promise<LW3Response> {
    const socket = this._socket
    if (!socket || socket.destroyed) {
      return { ok: false, value: '', rawLines: ['Not connected'] }
    }

    const id = this._nextCounter()
    const tagged = `${id}#${command}${CRLF}`

    if (this._verbose) console.log('[LW3Transport] >>', tagged.trimEnd())

    return new Promise<LW3Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id)
        resolve({ ok: false, value: '', rawLines: [`Timeout waiting for response to: ${command}`] })
      }, COMMAND_TIMEOUT_MS)

      this._pending.set(id, { resolve, reject, timer })
      socket.write(tagged, 'utf8')
    })
  }

  // ── Internal data handling ─────────────────────────────────────────────────

  private _onData(chunk: string): void {
    this._buffer += chunk

    // Split buffer into lines, keeping partial last line
    const lines = this._buffer.split('\r\n')
    this._buffer = lines.pop() ?? ''

    for (const line of lines) {
      this._processLine(line)
    }
  }

  /**
   * We accumulate lines into `{ ... }` response blocks.
   * Push events (CHG) are dispatched immediately as they arrive outside blocks.
   */
  private _blockLines: string[] = []
  private _inBlock = false

  private _processLine(line: string): void {
    if (this._verbose) console.log('[LW3Transport] <<', line)

    // CHG push event — not inside a response block
    if (!this._inBlock && line.startsWith('CHG ')) {
      const rest = line.slice(4) // strip "CHG "
      const eqIdx = rest.indexOf('=')
      if (eqIdx !== -1) {
        const path = rest.slice(0, eqIdx)
        const value = rest.slice(eqIdx + 1)
        this.emit('change', path, value)
      }
      return
    }

    if (line === '{' || line.startsWith('{ ')) {
      this._inBlock = true
      this._blockLines = [line]
      return
    }

    if (this._inBlock) {
      this._blockLines.push(line)
      if (line === '}') {
        this._inBlock = false
        this._dispatchBlock(this._blockLines)
        this._blockLines = []
      }
    }
  }

  private _dispatchBlock(lines: string[]): void {
    // First line: "{ XXXX" where XXXX is the hex counter
    const firstLine = lines[0] ?? ''
    // Format: "{ 0001" — extract counter after "{ "
    const idMatch = /^\{[ \t]([0-9a-fA-F]{4})/.exec(firstLine)
    if (!idMatch) {
      if (this._verbose) console.warn('[LW3Transport] block with no ID:', lines)
      return
    }

    const id = idMatch[1].toUpperCase()
    const pending = this._pending.get(id)
    if (!pending) {
      if (this._verbose) console.warn('[LW3Transport] no pending command for id:', id)
      return
    }

    clearTimeout(pending.timer)
    this._pending.delete(id)

    // Content lines: everything between first and last (the '}')
    const contentLines = lines.slice(1, lines.length - 1)
    const rawLines = contentLines

    // Check for error lines
    const isError = contentLines.some(l => this._isErrorLine(l))
    if (isError) {
      const errLine = contentLines.find(l => this._isErrorLine(l)) ?? ''
      pending.resolve({ ok: false, value: errLine, rawLines })
      return
    }

    // Extract value from property response: "pw /PATH.Property=VALUE"
    // or method response: "pm /PATH:method=VALUE"
    // For GETALL, there may be multiple "pw" lines — return first as value, all as rawLines
    const pwLines = contentLines.filter(l => l.startsWith('pw ') || l.startsWith('pm '))
    let value = ''
    if (pwLines.length > 0) {
      const firstPw = pwLines[0]
      const eqIdx = firstPw.indexOf('=')
      if (eqIdx !== -1) {
        value = firstPw.slice(eqIdx + 1)
      }
    }

    pending.resolve({ ok: true, value, rawLines })
  }

  private _isErrorLine(line: string): boolean {
    return (
      line.startsWith('pE ') ||
      line.startsWith('mE ') ||
      line.startsWith('mF ') ||
      line.startsWith('nE ') ||
      line.startsWith('E ') ||
      /^[0-9a-fA-F]{4}E /.test(line)
    )
  }

  private _nextCounter(): string {
    const id = this._counter.toString(16).toUpperCase().padStart(4, '0')
    this._counter++
    if (this._counter > COUNTER_MAX) this._counter = COUNTER_MIN
    return id
  }

  private _rejectAllPending(reason: string): void {
    for (const [id, pending] of this._pending) {
      clearTimeout(pending.timer)
      pending.resolve({ ok: false, value: '', rawLines: [reason] })
      this._pending.delete(id)
    }
  }

  private _scheduleReconnect(): void {
    if (this._reconnecting || this._destroyed) return
    this._reconnecting = true

    const delay = this._backoffMs
    this._backoffMs = Math.min(this._backoffMs * 2, BACKOFF_MAX_MS)

    if (this._verbose) console.log(`[LW3Transport] reconnecting in ${delay}ms`)

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null
      if (this._destroyed) return
      this._doConnect().catch(() => {
        // _doConnect failure triggers 'error' emit and close event will reschedule
        this._reconnecting = false
        this._scheduleReconnect()
      })
    }, delay)
  }

  // ── Typed event overloads ──────────────────────────────────────────────────

  on(event: 'connected', listener: () => void): this
  on(event: 'disconnected', listener: () => void): this
  on(event: 'change', listener: (path: string, value: string) => void): this
  on(event: 'error', listener: (err: Error) => void): this
  on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener)
  }
}
