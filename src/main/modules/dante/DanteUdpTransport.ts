import dgram from 'dgram'

export interface PendingRequest {
  resolve: (buf: Buffer) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class DanteUdpTransport {
  private _socket: dgram.Socket | null = null
  private _pending = new Map<number, PendingRequest>()

  private _getSocket(): dgram.Socket {
    if (!this._socket) {
      this._socket = dgram.createSocket({ type: 'udp4' })
      this._socket.on('message', (msg) => this._onMessage(msg))
      this._socket.on('error', () => {/* ignore socket errors */})
      this._socket.bind()
    }
    return this._socket
  }

  private _onMessage(msg: Buffer): void {
    if (msg.length < 6) return
    const txnId = msg.readUInt16BE(4)
    const pending = this._pending.get(txnId)
    if (!pending) return
    clearTimeout(pending.timer)
    this._pending.delete(txnId)
    pending.resolve(msg)
  }

  /** Send request and wait for matching txnId response */
  request(host: string, port: number, packet: Buffer, timeoutMs: number = 5000): Promise<Buffer> {
    if (packet.length < 6) return Promise.reject(new Error('Packet too short'))
    const txnId = packet.readUInt16BE(4)
    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(txnId)
        reject(new Error(`Dante UDP timeout (txnId=${txnId}, host=${host}:${port})`))
      }, timeoutMs)
      this._pending.set(txnId, { resolve, reject, timer })
      const sock = this._getSocket()
      sock.send(packet, port, host, (err) => {
        if (err) {
          clearTimeout(timer)
          this._pending.delete(txnId)
          reject(err)
        }
      })
    })
  }

  /** Fire-and-forget send */
  send(host: string, port: number, packet: Buffer): void {
    const sock = this._getSocket()
    sock.send(packet, port, host)
  }

  close(): void {
    for (const [, pending] of this._pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Transport closed'))
    }
    this._pending.clear()
    if (this._socket) {
      try { this._socket.close() } catch { /* ignore */ }
      this._socket = null
    }
  }
}
