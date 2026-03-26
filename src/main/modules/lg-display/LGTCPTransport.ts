import net from 'net'
import { EventEmitter } from 'events'

const DEFAULT_PORT = 9761
const RESPONSE_TIMEOUT_MS = 5_000
const MAX_BACKOFF_MS = 30_000
const INITIAL_BACKOFF_MS = 1_000

interface PendingCommand {
  commandChar: string
  resolve: (result: CommandResponse) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface CommandResponse {
  ok: boolean
  value: string
  rawValue: string
}

// LGTCPTransport manages a persistent TCP connection to an LG Pro Display.
//
// Protocol framing:
//   Send:    `{command_code} {setId_2hex} {data_2hex}\r`
//   Receive: `{cmd_char} {setId_dec} OK{value_hex}x`
//         or `{cmd_char} {setId_dec} NG{value_hex}x`
//   The trailing 'x' is the end-of-message marker. No CR/LF is guaranteed;
//   some firmware appends \r or \r\n, others send nothing after 'x'.
//
// One command is sent at a time; the response is matched by cmd_char.
//
// Protocol tracing:
//   Set `onTrace` to receive every TX/RX line. Used by LGDisplayModule to write
//   trace events to the DB when pref:lgProtocolTrace is enabled.
export class LGTCPTransport extends EventEmitter {
  private _socket: net.Socket | null = null
  private _host = ''
  private _port = DEFAULT_PORT
  private _buffer = ''
  private _pending: PendingCommand | null = null
  private _queue: Array<() => void> = []
  private _connected = false
  private _destroyed = false
  private _backoffMs = INITIAL_BACKOFF_MS
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null
  verbose = false
  /** Called for every TX/RX line regardless of pending state. Used for protocol tracing. */
  onTrace: ((dir: 'TX' | 'RX', raw: string) => void) | null = null

  // connect() establishes the TCP connection and resolves once the 'connect'
  // event fires. Auto-reconnect is enabled for subsequent disconnects.
  connect(host: string, port: number = DEFAULT_PORT): Promise<void> {
    this._host = host
    this._port = port
    return new Promise<void>((resolve, reject) => {
      this._openSocket(resolve, reject)
    })
  }

  private _openSocket(
    onConnect?: (err?: Error) => void,
    onError?: (err: Error) => void
  ): void {
    if (this._destroyed) return

    this._socket = new net.Socket()
    const socket = this._socket

    socket.once('connect', () => {
      this._connected = true
      this._backoffMs = INITIAL_BACKOFF_MS
      if (this.verbose) console.log(`[LGTCPTransport] connected to ${this._host}:${this._port}`)
      this.emit('connected')
      onConnect?.()
    })

    socket.on('data', (chunk: Buffer) => {
      if (this.verbose) {
        // Log raw bytes as hex + printable so we can see the actual terminator
        const hex = chunk.toString('hex').replace(/../g, '$& ').trimEnd()
        const asc = chunk.toString('ascii').replace(/[\r\n]/g, c => c === '\r' ? '<CR>' : '<LF>')
        console.log(`[LGTCPTransport] RAW: ${asc}  [${hex}]`)
      }
      this._buffer += chunk.toString('ascii')
      this._drainBuffer()
    })

    socket.on('error', (err: Error) => {
      console.warn(`[LGTCPTransport] socket error: ${err.message}`)
      // Reject any in-flight command
      if (this._pending) {
        clearTimeout(this._pending.timer)
        this._pending.reject(err)
        this._pending = null
      }
      onError?.(err)
    })

    socket.on('close', () => {
      this._connected = false
      if (this.verbose) console.log(`[LGTCPTransport] disconnected`)
      this.emit('disconnected')
      // Reject any in-flight command
      if (this._pending) {
        clearTimeout(this._pending.timer)
        this._pending.reject(new Error('Socket closed'))
        this._pending = null
      }
      this._scheduleReconnect()
    })

    socket.connect(this._port, this._host)
  }

  private _scheduleReconnect(): void {
    if (this._destroyed) return
    const delay = this._backoffMs
    this._backoffMs = Math.min(this._backoffMs * 2, MAX_BACKOFF_MS)
    if (this.verbose) console.log(`[LGTCPTransport] reconnecting in ${delay}ms`)
    this._reconnectTimer = setTimeout(() => {
      if (!this._destroyed) this._openSocket()
    }, delay)
  }

  // send() enqueues a command and returns when a matching response is received.
  // commandCode: e.g. 'ka', 'xb'
  // data: 2-char hex string e.g. 'ff', '01'
  send(commandCode: string, data: string): Promise<CommandResponse> {
    return new Promise<CommandResponse>((resolve, reject) => {
      const enqueue = () => {
        if (this._pending) {
          // Another command is in-flight — push back onto queue
          this._queue.push(enqueue)
          return
        }

        if (!this._connected || !this._socket) {
          reject(new Error('Transport not connected'))
          return
        }

        // cmd_char is the second character of the command_code (e.g. 'ka' → 'a')
        const cmdChar = commandCode[1]
        if (!cmdChar) {
          reject(new Error(`Invalid commandCode: ${commandCode}`))
          return
        }

        const line = `${commandCode} ${this._formatSetId()} ${data}\r`
        if (this.verbose) console.log(`[LGTCPTransport] SEND: ${JSON.stringify(line)}`)
        this.onTrace?.('TX', line.trimEnd())

        const timer = setTimeout(() => {
          if (this._pending?.commandChar === cmdChar) {
            this._pending = null
            this._drainQueue()
          }
          reject(new Error(`Timeout waiting for response to ${commandCode}`))
        }, RESPONSE_TIMEOUT_MS)

        this._pending = { commandChar: cmdChar, resolve, reject, timer }
        this._socket!.write(line)
      }

      if (this._pending) {
        this._queue.push(enqueue)
      } else {
        enqueue()
      }
    })
  }

  // _formatSetId returns the fixed set-ID used in commands.
  // Stored separately from send() so LGDisplayModule can override it.
  private _setId = 0

  setSetId(id: number): void {
    this._setId = id
  }

  private _formatSetId(): string {
    return this._setId.toString(16).padStart(2, '0').toUpperCase()
  }

  private _drainBuffer(): void {
    // LG responses end with 'x' as the last byte — no line terminator is guaranteed.
    // Some firmware appends \r or \r\n, others send nothing after 'x'.
    // Scan for the complete response pattern directly in the accumulated buffer.
    const MSG_RE = /[a-z]\s+\d+\s+(?:OK|NG)[0-9a-fA-F]*x/g
    let match: RegExpExecArray | null
    let lastEnd = 0
    while ((match = MSG_RE.exec(this._buffer)) !== null) {
      this._handleLine(match[0])
      lastEnd = match.index + match[0].length
    }
    if (lastEnd > 0) {
      // Discard processed bytes; keep any trailing partial data for the next chunk
      this._buffer = this._buffer.slice(lastEnd)
    }
    // Safety: discard oversized stale buffer (e.g. garbage from connection noise)
    if (this._buffer.length > 512) this._buffer = ''
  }

  // _handleLine parses one complete response line.
  // Format: `{cmd_char} {setId_dec} OK{value_hex}x` or `{cmd_char} {setId_dec} NG{value_hex}x`
  // Note: some firmware omits the data bytes on NG, e.g. "a 01 NGx" — value is empty string in that case.
  private _handleLine(line: string): void {
    if (this.verbose) console.log(`[LGTCPTransport] RECV: ${JSON.stringify(line)}`)

    const trimmed = line.trim()
    this.onTrace?.('RX', trimmed)

    if (!this._pending) return
    // Matches e.g. "a 0 OKffx", "a 0 NG00x", or "a 01 NGx" (no data bytes on NG)
    const match = /^([a-z])\s+\d+\s+(OK|NG)([0-9a-fA-F]*)x/.exec(trimmed)
    if (!match) return

    const [, responseCmdChar, status, value] = match

    if (responseCmdChar !== this._pending.commandChar) return

    clearTimeout(this._pending.timer)
    const { resolve } = this._pending
    this._pending = null

    resolve({
      ok: status === 'OK',
      value,
      rawValue: trimmed
    })

    this._drainQueue()
  }

  private _drainQueue(): void {
    if (this._queue.length > 0 && !this._pending) {
      const next = this._queue.shift()!
      next()
    }
  }

  destroy(): void {
    this._destroyed = true
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    if (this._pending) {
      clearTimeout(this._pending.timer)
      this._pending.reject(new Error('Transport destroyed'))
      this._pending = null
    }
    this._queue = []
    if (this._socket) {
      try { this._socket.destroy() } catch { /* ignore */ }
      this._socket = null
    }
    this._connected = false
    this.removeAllListeners()
  }

  get isConnected(): boolean {
    return this._connected
  }
}
