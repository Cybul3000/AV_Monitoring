// DanteNotificationListener.ts — Multicast listener for Dante routing-change notifications
// Listens on 224.0.0.231:8702 for topology-change events and emits routing-change per device MAC.

import { EventEmitter } from 'events'
import dgram from 'dgram'
import os from 'os'

const NOTIFICATION_MULTICAST_GROUP = '224.0.0.231'
const NOTIFICATION_PORT = 8702

export class DanteNotificationListener extends EventEmitter {
  private _socket: ReturnType<typeof dgram.createSocket> | null = null

  start(): void {
    if (this._socket) return

    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    this._socket = socket

    socket.on('error', (err: Error) => {
      this.emit('error', err)
    })

    socket.on('message', (msg: Buffer) => {
      this._handleMessage(msg)
    })

    socket.bind(NOTIFICATION_PORT, '0.0.0.0', () => {
      // Join multicast group on every non-internal IPv4 interface (cross-platform: Windows + macOS)
      const ifaces = os.networkInterfaces()
      let joined = false
      for (const addrs of Object.values(ifaces)) {
        if (!addrs) continue
        for (const addr of addrs) {
          if (addr.family === 'IPv4' && !addr.internal) {
            try {
              socket.addMembership(NOTIFICATION_MULTICAST_GROUP, addr.address)
              joined = true
            } catch {
              // Interface may not support multicast — skip
            }
          }
        }
      }
      // Fallback: join on default interface
      if (!joined) {
        try {
          socket.addMembership(NOTIFICATION_MULTICAST_GROUP)
        } catch {
          // Ignore — multicast not available
        }
      }
    })
  }

  stop(): void {
    if (!this._socket) return
    try {
      this._socket.close()
    } catch {
      // Ignore close errors
    }
    this._socket = null
  }

  private _handleMessage(msg: Buffer): void {
    // Parse notification packet for MAC address of affected device
    // Notification packets contain a MAC in bytes 4-9 of the payload (sub-block format)
    // We emit routing-change with the MAC so DanteModule can re-query that device.
    if (msg.length < 10) return

    try {
      const mac = this._parseMacFromNotification(msg)
      if (mac) {
        this.emit('routing-change', { macAddress: mac })
      }
    } catch {
      // Malformed packet — ignore
    }
  }

  private _parseMacFromNotification(msg: Buffer): string | null {
    // Notification packet structure (from netaudio-lib):
    // bytes 0-1: protocol ID
    // bytes 2-3: length
    // bytes 4-9: source MAC address
    if (msg.length < 10) return null

    const macBytes = msg.slice(4, 10)
    return Array.from(macBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(':')
  }
}
