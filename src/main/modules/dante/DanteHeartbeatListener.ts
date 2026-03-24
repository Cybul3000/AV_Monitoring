// DanteHeartbeatListener.ts — Multicast heartbeat listener for Dante device liveness
// Listens on 224.0.0.233:8708 for device heartbeat packets.
// Emits 'heartbeat' per packet and 'device-offline' after 15s silence.

import { EventEmitter } from 'events'
import dgram from 'dgram'
import os from 'os'

const MULTICAST_GROUP = '224.0.0.233'
const HEARTBEAT_PORT = 8708
const OFFLINE_TIMEOUT_MS = 15_000

// Heartbeat sub-block type for lock state
const SUBBLOCK_LOCK_STATE = 0x8002

export interface HeartbeatEvent {
  macAddress: string   // "aa:bb:cc:dd:ee:ff"
}

export interface DeviceOfflineEvent {
  macAddress: string
}

export class DanteHeartbeatListener extends EventEmitter {
  private _socket: dgram.Socket | null = null
  // macAddress → setTimeout handle
  private _timers = new Map<string, ReturnType<typeof setTimeout>>()
  private _active = false

  start(): void {
    if (this._active) return
    this._active = true

    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    this._socket = socket

    socket.on('error', () => { /* ignore socket errors */ })

    socket.on('message', (msg: Buffer) => {
      const mac = this._parseMacFromHeartbeat(msg)
      if (mac) {
        this._handleHeartbeat(mac)
      }
    })

    socket.bind(HEARTBEAT_PORT, '0.0.0.0', () => {
      this._joinMulticastGroups(socket)
    })
  }

  stop(): void {
    if (!this._active) return
    this._active = false

    // Clear all offline timers
    for (const timer of this._timers.values()) {
      clearTimeout(timer)
    }
    this._timers.clear()

    if (this._socket) {
      try { this._socket.close() } catch { /* ignore */ }
      this._socket = null
    }
  }

  private _joinMulticastGroups(socket: dgram.Socket): void {
    if (process.platform === 'darwin') {
      // Single addMembership on macOS
      try {
        socket.addMembership(MULTICAST_GROUP)
      } catch { /* ignore if already joined */ }
      return
    }

    // Windows (and other platforms): join on every non-internal IPv4 interface
    const ifaces = os.networkInterfaces()
    let joined = false
    for (const ifaceList of Object.values(ifaces)) {
      if (!ifaceList) continue
      for (const iface of ifaceList) {
        if (iface.family === 'IPv4' && !iface.internal) {
          try {
            socket.addMembership(MULTICAST_GROUP, iface.address)
            joined = true
          } catch { /* skip iface */ }
        }
      }
    }
    // Fallback to default membership if no interface was available
    if (!joined) {
      try { socket.addMembership(MULTICAST_GROUP) } catch { /* ignore */ }
    }
  }

  private _handleHeartbeat(macAddress: string): void {
    this.emit('heartbeat', { macAddress } as HeartbeatEvent)
    this._resetTimer(macAddress)
  }

  private _resetTimer(macAddress: string): void {
    const existing = this._timers.get(macAddress)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      this._timers.delete(macAddress)
      if (this._active) {
        this.emit('device-offline', { macAddress } as DeviceOfflineEvent)
      }
    }, OFFLINE_TIMEOUT_MS)

    this._timers.set(macAddress, timer)
  }

  /**
   * Parse the MAC address out of a Dante heartbeat packet.
   * The packet contains sub-blocks; we look for sub-block 0x8002.
   * The MAC is embedded in the packet at a known offset based on protocol analysis.
   *
   * Heartbeat packet layout (simplified, from netaudio-lib research):
   *   bytes 0-1: packet type / protocol marker
   *   bytes 2-3: packet length
   *   bytes 4-9: source MAC address (6 bytes)
   *   bytes 10+: sub-blocks
   *
   * If we cannot parse the MAC cleanly, fall back to bytes 4-9.
   */
  private _parseMacFromHeartbeat(msg: Buffer): string | null {
    // Minimum viable heartbeat packet has at least 10 bytes (header + MAC)
    if (msg.length < 10) return null

    // The MAC is at offset 4-9 in the heartbeat packet per netaudio-lib analysis
    const macBytes = msg.slice(4, 10)
    const mac = Array.from(macBytes).map(b => b.toString(16).padStart(2, '0')).join(':')

    // Validate it's not all-zeros (invalid)
    if (mac === '00:00:00:00:00:00') return null
    // Validate it's not broadcast
    if (mac === 'ff:ff:ff:ff:ff:ff') return null

    return mac
  }
}
