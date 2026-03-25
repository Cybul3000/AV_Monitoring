import { Client as SSH2Client } from 'ssh2'
import { EventEmitter } from 'events'
import type { ClientChannel } from 'ssh2'
import type { SSHSessionState } from '@shared/ipc-types'

export interface SessionOptions {
  host: string
  port: number          // default 22
  username: string      // always 'admin'
  password: string
  deviceType: 'CP4' | 'VC4'
  promptPattern: string // regex string, e.g. 'CP4N>' or '\[admin@[^\]]+[\s~]\]\$'
  disconnectCmd: string // 'BYE' or 'exit'
}

const PROMPT_TIMEOUT_MS = 10_000

export class SSHSessionManager extends EventEmitter {
  private _state: SSHSessionState = 'CLOSED'
  private _client: SSH2Client | null = null
  private _stream: ClientChannel | null = null
  private _buffer = ''
  private _promptRegex: RegExp | null = null
  private _disconnectCmd = ''
  private _promptTimeoutHandle: ReturnType<typeof setTimeout> | null = null

  constructor() {
    super()
  }

  get state(): SSHSessionState {
    return this._state
  }

  async open(options: SessionOptions): Promise<void> {
    if (this._state !== 'CLOSED' && this._state !== 'ERROR') {
      throw new Error(`Cannot open SSH session in state: ${this._state}`)
    }

    this._promptRegex = new RegExp(options.promptPattern)
    this._disconnectCmd = options.disconnectCmd
    this._buffer = ''

    this._setState('CONNECTING')

    return new Promise<void>((resolve, reject) => {
      const client = new SSH2Client()
      this._client = client

      // Set up timeout for initial prompt detection
      this._promptTimeoutHandle = setTimeout(() => {
        this._clearPromptTimeout()
        if (this._state === 'CONNECTING') {
          const reason = 'Connection timed out waiting for prompt'
          this._setState('ERROR', reason)
          client.destroy()
          reject(new Error(reason))
        }
      }, PROMPT_TIMEOUT_MS)

      client.on('ready', () => {
        client.shell({ term: 'dumb' }, (err, stream) => {
          if (err) {
            this._clearPromptTimeout()
            const reason = `Shell error: ${err.message}`
            this._setState('ERROR', reason)
            client.destroy()
            reject(new Error(reason))
            return
          }

          this._stream = stream

          stream.on('data', (chunk: Buffer) => {
            const data = chunk.toString()
            this._buffer += data
            this.emit('output', data)

            if (this._state === 'CONNECTING' && this._promptRegex!.test(this._buffer)) {
              this._clearPromptTimeout()
              this._buffer = ''
              this._setState('READY')
              resolve()
            } else if (this._state === 'BUSY' && this._promptRegex!.test(this._buffer)) {
              this._buffer = ''
              this._setState('READY')
            }
          })

          stream.stderr?.on('data', (chunk: Buffer) => {
            const data = chunk.toString()
            this._buffer += data
            this.emit('output', data)
          })

          stream.on('close', () => {
            this._clearPromptTimeout()
            if (this._state !== 'CLOSED') {
              const reason = 'Shell stream closed unexpectedly'
              this._setState('ERROR', reason)
            }
          })
        })
      })

      client.on('error', (err: Error) => {
        this._clearPromptTimeout()
        const reason = err.message ?? 'SSH connection error'
        this._setState('ERROR', reason)
        reject(new Error(reason))
      })

      client.on('close', () => {
        this._clearPromptTimeout()
        if (this._state !== 'CLOSED') {
          this._setState('ERROR', 'SSH connection closed unexpectedly')
        }
      })

      client.connect({
        host: options.host,
        port: options.port,
        username: options.username,
        password: options.password,
        readyTimeout: PROMPT_TIMEOUT_MS,
        algorithms: {
          kex: [
            'diffie-hellman-group-exchange-sha256',
            'diffie-hellman-group14-sha256',
            'diffie-hellman-group14-sha1',
            'diffie-hellman-group1-sha1',
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'ecdh-sha2-nistp521'
          ],
          serverHostKey: [
            'ssh-rsa',
            'ecdsa-sha2-nistp256',
            'ecdsa-sha2-nistp384',
            'ecdsa-sha2-nistp521',
            'ssh-ed25519'
          ]
        }
      })
    })
  }

  async send(command: string): Promise<void> {
    if (!this._stream || this._state !== 'READY') {
      throw new Error(`Cannot send command in state: ${this._state}`)
    }

    this._buffer = ''
    this._setState('BUSY')
    this._stream.write(command + '\n')
  }

  async close(): Promise<void> {
    if (this._state === 'CLOSED') return

    if (this._stream && (this._state === 'READY' || this._state === 'BUSY')) {
      try {
        this._stream.write(this._disconnectCmd + '\n')
        // Give the disconnect command a moment to be sent
        await new Promise(resolve => setTimeout(resolve, 200))
      } catch {
        // Ignore write errors during close
      }
    }

    this._doDestroy()
    this._setState('CLOSED')
  }

  destroy(): void {
    this._doDestroy()
    this._setState('CLOSED')
  }

  private _doDestroy(): void {
    this._clearPromptTimeout()
    if (this._stream) {
      try { this._stream.destroy() } catch { /* ignore */ }
      this._stream = null
    }
    if (this._client) {
      try { this._client.destroy() } catch { /* ignore */ }
      this._client = null
    }
    this._buffer = ''
  }

  private _setState(state: SSHSessionState, reason?: string): void {
    this._state = state
    this.emit('state', state, reason)
  }

  private _clearPromptTimeout(): void {
    if (this._promptTimeoutHandle !== null) {
      clearTimeout(this._promptTimeoutHandle)
      this._promptTimeoutHandle = null
    }
  }

  // Typed event overloads
  on(event: 'state', listener: (state: SSHSessionState, reason?: string) => void): this
  on(event: 'output', listener: (data: string) => void): this
  on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener)
  }
}
