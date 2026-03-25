import { EventEmitter } from 'events'
import net from 'net'
import { Client as SSH2Client } from 'ssh2'
import type { ClientChannel } from 'ssh2'

// ── Public types ─────────────────────────────────────────────────────────────

export interface TTPResponse {
  ok: boolean
  value: string | null    // raw value string after "+OK " or null
  error: string | null    // error message if !ok
}

interface PendingCommand {
  resolve: (res: TTPResponse) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SEND_TIMEOUT_MS = 15_000
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000

// Telnet IAC byte values
const IAC  = 0xff
const WILL = 0xfb
const WONT = 0xfc
const DO   = 0xfd
const DONT = 0xfe

// ── Value parsing helper ──────────────────────────────────────────────────────

/**
 * Parse TTP quasi-JSON value into a plain string-string record.
 *
 * Examples:
 *   '+OK "value":{"deviceModel":"TesiraFORTE_CI" "firmwareVersion":"3.14"}'
 *   → { deviceModel: 'TesiraFORTE_CI', firmwareVersion: '3.14' }
 *
 *   '+OK "value":0.000000'
 *   → { value: '0.000000' }
 *
 *   '+OK "list":["Level1" "Mixer1"]'
 *   → { list: 'Level1,Mixer1' }
 */
export function parseTTPValue(response: TTPResponse): Record<string, string> {
  const result: Record<string, string> = {}
  if (!response.ok || !response.value) return result

  const raw = response.value.trim()

  // Match the outer key and value: "key":VALUE
  const outerMatch = raw.match(/^"([^"]+)":([\s\S]*)$/)
  if (!outerMatch) {
    // Plain scalar without wrapper key
    result['value'] = raw
    return result
  }

  const outerKey = outerMatch[1]
  const outerVal = outerMatch[2].trim()

  if (outerVal.startsWith('{')) {
    // Object: space-separated "key":"value" pairs inside {}
    const inner = outerVal.slice(1, outerVal.lastIndexOf('}')).trim()
    parseSpaceDelimitedPairs(inner, result)
  } else if (outerVal.startsWith('[')) {
    // Array: space-separated quoted items inside []
    const inner = outerVal.slice(1, outerVal.lastIndexOf(']')).trim()
    const items = extractQuotedStrings(inner)
    result[outerKey] = items.join(',')
  } else {
    // Scalar value (possibly quoted)
    result[outerKey] = stripOuterQuotes(outerVal)
  }

  return result
}

function parseSpaceDelimitedPairs(input: string, out: Record<string, string>): void {
  // Matches: "key":"value" or "key":scalar
  const pairRe = /"([^"]+)":((?:"[^"]*"|\{[^}]*\}|\[[^\]]*\]|[^\s"{}[\]]+))/g
  let match: RegExpExecArray | null
  while ((match = pairRe.exec(input)) !== null) {
    out[match[1]] = stripOuterQuotes(match[2])
  }
}

function extractQuotedStrings(input: string): string[] {
  const results: string[] = []
  const re = /"([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(input)) !== null) {
    results.push(match[1])
  }
  // Also handle unquoted tokens if no quotes found
  if (results.length === 0) {
    return input.split(/\s+/).filter(Boolean)
  }
  return results
}

function stripOuterQuotes(s: string): string {
  const t = s.trim()
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1)
  return t
}

// ── TTPTransport ──────────────────────────────────────────────────────────────

export class TTPTransport extends EventEmitter {
  private readonly _verbose: boolean

  // Connection state
  private _host = ''
  private _port = 0
  private _username = ''
  private _password = ''
  private _connected = false
  private _destroyed = false

  // SSH path
  private _sshClient: SSH2Client | null = null
  private _sshStream: ClientChannel | null = null

  // Telnet path
  private _telnetSocket: net.Socket | null = null

  // Line buffer
  private _lineBuffer = ''

  // FIFO queue for pending commands
  private _pendingQueue: PendingCommand[] = []

  // Reconnect state
  private _reconnectDelay = RECONNECT_BASE_MS
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options?: { verbose?: boolean }) {
    super()
    this._verbose = options?.verbose ?? false
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async connect(host: string, port: number, username: string, password: string): Promise<void> {
    this._host = host
    this._port = port
    this._username = username
    this._password = password
    this._destroyed = false

    return this._doConnect()
  }

  destroy(): void {
    this._destroyed = true
    this._clearReconnectTimer()
    this._teardown()
  }

  /**
   * Send a TTP command and wait for +OK / -ERR response.
   * TTP has no command tagging — responses are FIFO.
   */
  async send(command: string): Promise<TTPResponse> {
    if (!this._connected) {
      return { ok: false, value: null, error: 'Not connected' }
    }

    return new Promise<TTPResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this._pendingQueue.findIndex(p => p.resolve === resolve)
        if (idx !== -1) this._pendingQueue.splice(idx, 1)
        reject(new Error(`TTP command timed out: ${command}`))
      }, SEND_TIMEOUT_MS)

      this._pendingQueue.push({ resolve, reject, timer })

      const line = `${command}\r\n`
      if (this._verbose) console.log(`[TTPTransport] TX: ${command}`)

      if (this._port === 22 && this._sshStream) {
        this._sshStream.write(line)
      } else if (this._telnetSocket) {
        this._telnetSocket.write(line)
      } else {
        clearTimeout(timer)
        this._pendingQueue.pop()
        reject(new Error('No active transport stream'))
      }
    })
  }

  // ── Private: connection setup ───────────────────────────────────────────────

  private async _doConnect(): Promise<void> {
    if (this._port === 22) {
      return this._connectSSH()
    } else {
      return this._connectTelnet()
    }
  }

  private _connectSSH(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const client = new SSH2Client()
      this._sshClient = client

      client.on('ready', () => {
        client.shell({ term: 'vt100' }, (err, stream) => {
          if (err) {
            client.end()
            reject(err)
            return
          }

          this._sshStream = stream
          this._connected = true
          this._reconnectDelay = RECONNECT_BASE_MS

          stream.on('data', (chunk: Buffer) => {
            this._handleRawData(chunk.toString('utf8'))
          })

          stream.stderr?.on('data', (chunk: Buffer) => {
            this._handleRawData(chunk.toString('utf8'))
          })

          stream.on('close', () => {
            this._handleDisconnect()
          })

          stream.on('error', (err: Error) => {
            this.emit('error', err)
            this._handleDisconnect()
          })

          this.emit('connected')
          resolve()
        })
      })

      client.on('error', (err: Error) => {
        this.emit('error', err)
        reject(err)
        this._scheduleReconnect()
      })

      client.on('close', () => {
        this._handleDisconnect()
      })

      client.connect({
        host: this._host,
        port: this._port,
        username: this._username,
        password: this._password
      })
    })
  }

  private _connectTelnet(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(this._port, this._host)
      this._telnetSocket = socket

      let resolved = false
      const iacBuffer: Buffer[] = []
      let iacMode = false
      let iacCmd = 0
      let expectingIacOption = false

      const handleReady = () => {
        if (!resolved) {
          resolved = true
          this._connected = true
          this._reconnectDelay = RECONNECT_BASE_MS
          this.emit('connected')
          resolve()
        }
      }

      socket.on('connect', () => {
        // Wait for banner/prompt before declaring connected
        // handleReady will be called when we receive non-IAC text
      })

      socket.on('data', (chunk: Buffer) => {
        // Process bytes for IAC negotiation; strip IAC sequences from text
        const clean: number[] = []

        for (let i = 0; i < chunk.length; i++) {
          const byte = chunk[i]

          if (expectingIacOption) {
            // We have IAC + CMD, now get the option byte
            const option = byte
            expectingIacOption = false
            const reply = this._buildIacReply(iacCmd, option)
            if (reply) socket.write(reply)
            continue
          }

          if (iacMode) {
            iacMode = false
            if (byte === IAC) {
              // Escaped IAC (literal 0xFF in data)
              clean.push(0xff)
            } else if (byte === WILL || byte === WONT || byte === DO || byte === DONT) {
              iacCmd = byte
              expectingIacOption = true
            }
            // Other IAC commands (SB, SE, etc.) are ignored
            continue
          }

          if (byte === IAC) {
            iacMode = true
            continue
          }

          clean.push(byte)
        }

        if (clean.length > 0) {
          const text = Buffer.from(clean).toString('utf8')
          if (!resolved) {
            // Check for banner/prompt or non-IAC meaningful text
            if (/\S/.test(text)) handleReady()
          }
          this._handleRawData(text)
        }

        // Suppress unused variable warning
        void iacBuffer
      })

      socket.on('error', (err: Error) => {
        this.emit('error', err)
        if (!resolved) reject(err)
        this._handleDisconnect()
      })

      socket.on('close', () => {
        this._handleDisconnect()
      })

      socket.on('timeout', () => {
        socket.destroy()
        const err = new Error('Telnet connection timed out')
        if (!resolved) reject(err)
        this._handleDisconnect()
      })
    })
  }

  /**
   * Build the IAC reply buffer for a received negotiation command.
   *
   * RFC 854 negotiation:
   *   Received IAC WILL X  → reply IAC DON'T X
   *   Received IAC DO X    → reply IAC WON'T X
   *   Received IAC WONT X  → reply IAC DON'T X
   *   Received IAC DONT X  → reply IAC WON'T X
   */
  private _buildIacReply(cmd: number, option: number): Buffer | null {
    switch (cmd) {
      case WILL: return Buffer.from([IAC, DONT, option])
      case DO:   return Buffer.from([IAC, WONT, option])
      case WONT: return Buffer.from([IAC, DONT, option])
      case DONT: return Buffer.from([IAC, WONT, option])
      default:   return null
    }
  }

  // ── Private: line processing ────────────────────────────────────────────────

  private _handleRawData(text: string): void {
    this._lineBuffer += text

    // Split on CR+LF or bare LF
    const lines = this._lineBuffer.split(/\r?\n/)
    // Last element is incomplete fragment
    this._lineBuffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (this._verbose) console.log(`[TTPTransport] RX: ${trimmed}`)
      this._processLine(trimmed)
    }
  }

  private _processLine(line: string): void {
    // Combined push+ack: starts with "!" and ends with " +OK"
    if (line.startsWith('!') && line.endsWith(' +OK')) {
      const pushPart = line.slice(0, line.length - 4).trim()
      this._emitPush(pushPart)
      this._resolveHead({ ok: true, value: null, error: null })
      return
    }

    // Subscription push
    if (line.startsWith('!')) {
      this._emitPush(line)
      return
    }

    // Success response
    if (line.startsWith('+OK')) {
      const value = line.length > 4 ? line.slice(4).trim() : null
      this._resolveHead({ ok: true, value, error: null })
      return
    }

    // Error responses
    if (
      line.startsWith('-ERR') ||
      line.startsWith('-CANNOT_DELIVER') ||
      line.startsWith('-GENERAL_FAILURE')
    ) {
      this._resolveHead({ ok: false, value: null, error: line })
      return
    }

    // Informational / banner lines — ignore
  }

  private _emitPush(line: string): void {
    // Parse: ! "publishToken":"<token>" "value":X
    const tokenMatch = line.match(/"publishToken"\s*:\s*"([^"]+)"/)
    const valueMatch = line.match(/"publishToken"\s*:\s*"[^"]+"\s*(.*)$/)

    if (tokenMatch) {
      const publishToken = tokenMatch[1]
      const valueStr = valueMatch ? valueMatch[1].trim() : ''
      this.emit('push', publishToken, valueStr)
    }
  }

  private _resolveHead(response: TTPResponse): void {
    const pending = this._pendingQueue.shift()
    if (!pending) return
    clearTimeout(pending.timer)
    pending.resolve(response)
  }

  // ── Private: disconnect & reconnect ────────────────────────────────────────

  private _handleDisconnect(): void {
    if (!this._connected) return
    this._connected = false

    // Drain pending queue with error
    const error = new Error('TTP connection lost')
    for (const pending of this._pendingQueue) {
      clearTimeout(pending.timer)
      pending.resolve({ ok: false, value: null, error: error.message })
    }
    this._pendingQueue = []

    this._teardown()
    this.emit('disconnected')

    if (!this._destroyed) {
      this._scheduleReconnect()
    }
  }

  private _teardown(): void {
    if (this._sshStream) {
      try { this._sshStream.close() } catch { /* ignore */ }
      this._sshStream = null
    }
    if (this._sshClient) {
      try { this._sshClient.end() } catch { /* ignore */ }
      this._sshClient = null
    }
    if (this._telnetSocket) {
      try { this._telnetSocket.destroy() } catch { /* ignore */ }
      this._telnetSocket = null
    }
  }

  private _scheduleReconnect(): void {
    if (this._destroyed) return
    this._clearReconnectTimer()

    const delay = this._reconnectDelay
    if (this._verbose) console.log(`[TTPTransport] Reconnecting in ${delay}ms`)

    this._reconnectTimer = setTimeout(() => {
      if (!this._destroyed) {
        this._doConnect().catch(err => {
          this.emit('error', err instanceof Error ? err : new Error(String(err)))
        })
      }
    }, delay)

    // Exponential backoff: 1s → 2s → 4s → … → 30s
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, RECONNECT_MAX_MS)
  }

  private _clearReconnectTimer(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
  }
}
