// DanteMdnsDiscovery.ts — mDNS/DNS-SD discovery for Dante network audio devices
// Uses `multicast-dns` (pure-JS) to browse four Dante service types

import { EventEmitter } from 'events'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const multicastDns = require('multicast-dns')

// Dante service types to browse
const DANTE_SERVICE_TYPES = [
  '_netaudio-ara._udp.local',
  '_netaudio-cmc._udp.local',
  '_netaudio-chan._udp.local',
  '_netaudio-arc._udp.local',
] as const

export interface DanteDiscoveredDevice {
  name: string        // Dante device name (from PTR record label)
  ip: string
  arcPort: number
  macAddress: string | null
}

export interface DanteLostDevice {
  name: string
}

interface ServiceRecord {
  ip: string | null
  arcPort: number | null
  macAddress: string | null
}

// ── DanteMdnsDiscovery ─────────────────────────────────────────────────────────

export class DanteMdnsDiscovery extends EventEmitter {
  private _mdns: ReturnType<typeof multicastDns> | null = null
  // keyed by Dante device name
  private _records = new Map<string, ServiceRecord>()
  private _active = false

  start(networkInterfaceIp?: string): void {
    if (this._active) return
    this._active = true

    this._mdns = multicastDns(networkInterfaceIp ? { interface: networkInterfaceIp } : undefined)

    this._mdns.on('response', (response: MDNSPacket) => {
      this._handleResponse(response)
    })

    // Query all four service types
    for (const serviceType of DANTE_SERVICE_TYPES) {
      this._mdns.query({
        questions: [{ name: serviceType, type: 'PTR' }]
      })
    }
  }

  stop(): void {
    if (!this._active) return
    this._active = false
    if (this._mdns) {
      try { this._mdns.destroy() } catch { /* ignore */ }
      this._mdns = null
    }
    this._records.clear()
  }

  query(): void {
    if (!this._mdns || !this._active) return
    for (const serviceType of DANTE_SERVICE_TYPES) {
      this._mdns.query({
        questions: [{ name: serviceType, type: 'PTR' }]
      })
    }
  }

  private _handleResponse(packet: MDNSPacket): void {
    const allRecords = [
      ...(packet.answers ?? []),
      ...(packet.additionals ?? []),
    ]

    // Collect PTR records to determine which devices are being announced
    const ptrRecords: MDNSRecord[] = allRecords.filter(r => r.type === 'PTR')

    for (const ptr of ptrRecords) {
      // PTR data is the full service instance name, e.g. "MyDanteDevice._netaudio-arc._udp.local"
      const ptrData = typeof ptr.data === 'string' ? ptr.data : null
      if (!ptrData) continue

      // Extract device name as first label before service type
      // e.g. "MyDanteDevice" from "MyDanteDevice._netaudio-arc._udp.local"
      const deviceName = this._extractDeviceName(ptrData)
      if (!deviceName) continue

      // Check for goodbye (TTL=0) — device is leaving
      if (ptr.ttl === 0) {
        if (this._records.has(deviceName)) {
          this._records.delete(deviceName)
          this.emit('device-lost', { name: deviceName } as DanteLostDevice)
        }
        continue
      }

      // Collect SRV records (port), A records (IP), TXT records (MAC)
      const srvRecord = allRecords.find(r => r.type === 'SRV' && typeof r.name === 'string' && r.name.startsWith(deviceName))
      const aRecord = allRecords.find(r => r.type === 'A' && typeof r.name === 'string' && r.name.startsWith(deviceName))
      const txtRecord = allRecords.find(r => r.type === 'TXT' && typeof r.name === 'string' && r.name.startsWith(deviceName))

      const existing = this._records.get(deviceName) ?? { ip: null, arcPort: null, macAddress: null }
      let updated = false

      if (aRecord?.data && typeof aRecord.data === 'string') {
        if (existing.ip !== aRecord.data) {
          existing.ip = aRecord.data
          updated = true
        }
      }

      if (srvRecord?.data && typeof srvRecord.data === 'object') {
        const srvData = srvRecord.data as { port?: number }
        if (srvData.port && existing.arcPort !== srvData.port) {
          existing.arcPort = srvData.port
          updated = true
        }
      }

      if (txtRecord?.data) {
        const mac = this._extractMacFromTxt(txtRecord.data)
        if (mac && existing.macAddress !== mac) {
          existing.macAddress = mac
          updated = true
        }
      }

      if (updated || !this._records.has(deviceName)) {
        this._records.set(deviceName, existing)

        // Only emit if we have at least an IP address
        if (existing.ip) {
          const event: DanteDiscoveredDevice = {
            name: deviceName,
            ip: existing.ip,
            arcPort: existing.arcPort ?? 4440,
            macAddress: existing.macAddress,
          }
          this.emit('device-found', event)
        }
      }
    }
  }

  private _extractDeviceName(instanceName: string): string | null {
    // "DeviceName._netaudio-arc._udp.local" → "DeviceName"
    // Device names can contain dots, so we find the first service type label
    for (const serviceType of DANTE_SERVICE_TYPES) {
      const suffix = '.' + serviceType.replace(/\.$/, '')
      if (instanceName.endsWith(suffix)) {
        return instanceName.slice(0, instanceName.length - suffix.length)
      }
      // Also handle without trailing dot
      if (instanceName.includes('._netaudio-')) {
        const idx = instanceName.indexOf('._netaudio-')
        if (idx > 0) return instanceName.slice(0, idx)
      }
    }
    return null
  }

  private _extractMacFromTxt(data: unknown): string | null {
    if (!data) return null

    // TXT record data may be Buffer[], string[], or similar
    const entries: string[] = []

    if (Array.isArray(data)) {
      for (const entry of data) {
        if (Buffer.isBuffer(entry)) {
          entries.push(entry.toString('utf8'))
        } else if (typeof entry === 'string') {
          entries.push(entry)
        }
      }
    } else if (typeof data === 'string') {
      entries.push(data)
    }

    for (const entry of entries) {
      // Look for "id=aabbccddeeff" or "id=aa:bb:cc:dd:ee:ff"
      const match = entry.match(/^id=([0-9a-fA-F:]{12,17})/)
      if (match) {
        // Normalise to colon-separated
        const raw = match[1].replace(/:/g, '')
        if (raw.length === 12) {
          return raw.match(/.{2}/g)!.join(':').toLowerCase()
        }
        return match[1].toLowerCase()
      }
    }
    return null
  }
}

// ── mDNS type stubs ────────────────────────────────────────────────────────────

interface MDNSRecord {
  name: string
  type: string
  ttl: number
  data: unknown
}

interface MDNSPacket {
  answers?: MDNSRecord[]
  additionals?: MDNSRecord[]
}
