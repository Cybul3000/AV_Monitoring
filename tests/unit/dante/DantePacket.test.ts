/**
 * T009 — Failing unit tests for DantePacket.ts
 * Tests: encode/decode round-trips, header parsing, Settings packet format, pagination
 */
import { describe, it, expect } from 'vitest'
import {
  buildArcRequest,
  parseArcResponse,
  buildChannelListPayload,
  buildSettingsPacket,
  parseMacAddress,
  parseDeviceName,
  parseChannelCount,
  parseSettings,
  parseSubscriptionStatus,
  buildGetChannelCount,
  buildGetDeviceName,
  buildGetSettings,
  buildSetSettings,
  buildSetDeviceName,
  buildListRxChannels,
  ARC_PROTOCOL_ID,
  SETTINGS_PROTOCOL_ID,
  RESULT_OK,
  RESULT_MORE_PAGES,
  OP,
} from '../../../src/main/modules/dante/DantePacket'

describe('DantePacket', () => {
  // ── ARC request header ──────────────────────────────────────────────────────

  describe('buildArcRequest', () => {
    it('writes correct 8-byte header for request with no payload', () => {
      const txnId = 0x1234
      const opcode = OP.GET_DEVICE_NAME
      const buf = buildArcRequest(opcode, txnId)

      expect(buf.length).toBe(8)
      expect(buf.readUInt16BE(0)).toBe(ARC_PROTOCOL_ID)       // protocol id
      expect(buf.readUInt16BE(2)).toBe(8)                      // total length = header only
      expect(buf.readUInt16BE(4)).toBe(txnId)                  // txnId echoed
      expect(buf.readUInt16BE(6)).toBe(opcode)                 // opcode
    })

    it('includes payload after header and adjusts total length', () => {
      const payload = Buffer.from([0xaa, 0xbb, 0xcc])
      const buf = buildArcRequest(OP.LIST_RX_CHANNELS, 0x0001, payload)

      expect(buf.length).toBe(11)
      expect(buf.readUInt16BE(2)).toBe(11)                     // 8 header + 3 payload
      expect(buf[8]).toBe(0xaa)
      expect(buf[9]).toBe(0xbb)
      expect(buf[10]).toBe(0xcc)
    })

    it('masks txnId to 16 bits', () => {
      const buf = buildArcRequest(OP.GET_DEVICE_INFO, 0x1_FFFF)
      expect(buf.readUInt16BE(4)).toBe(0xFFFF)
    })
  })

  // ── ARC response header ─────────────────────────────────────────────────────

  describe('parseArcResponse', () => {
    it('returns null for buffers shorter than 10 bytes', () => {
      expect(parseArcResponse(Buffer.alloc(9))).toBeNull()
      expect(parseArcResponse(Buffer.alloc(0))).toBeNull()
    })

    it('extracts all fields from a 10-byte header', () => {
      const buf = Buffer.alloc(14)
      buf.writeUInt16BE(ARC_PROTOCOL_ID, 0)   // protocolId
      buf.writeUInt16BE(14, 2)                 // length
      buf.writeUInt16BE(0xABCD, 4)             // txnId
      buf.writeUInt16BE(OP.GET_DEVICE_NAME, 6) // opcode
      buf.writeUInt16BE(RESULT_OK, 8)          // resultCode
      buf.writeUInt16BE(0x0004, 10)            // body length prefix
      buf.write('TEST', 12, 'utf8')            // body

      const res = parseArcResponse(buf)
      expect(res).not.toBeNull()
      expect(res!.protocolId).toBe(ARC_PROTOCOL_ID)
      expect(res!.txnId).toBe(0xABCD)
      expect(res!.opcode).toBe(OP.GET_DEVICE_NAME)
      expect(res!.resultCode).toBe(RESULT_OK)
      expect(res!.body.length).toBe(4)         // 14 - 10 = 4 bytes of body
    })

    it('correctly identifies RESULT_MORE_PAGES', () => {
      const buf = Buffer.alloc(10)
      buf.writeUInt16BE(ARC_PROTOCOL_ID, 0)
      buf.writeUInt16BE(10, 2)
      buf.writeUInt16BE(0x0001, 4)
      buf.writeUInt16BE(OP.LIST_RX_CHANNELS, 6)
      buf.writeUInt16BE(RESULT_MORE_PAGES, 8)

      const res = parseArcResponse(buf)
      expect(res!.resultCode).toBe(RESULT_MORE_PAGES)
    })

    it('round-trips txnId correctly', () => {
      const txnId = 0xBEEF
      const req = buildGetDeviceName(txnId)
      // simulate building a response with same txnId
      const resp = Buffer.alloc(10)
      resp.writeUInt16BE(ARC_PROTOCOL_ID, 0)
      resp.writeUInt16BE(10, 2)
      resp.writeUInt16BE(txnId, 4)
      resp.writeUInt16BE(OP.GET_DEVICE_NAME, 6)
      resp.writeUInt16BE(RESULT_OK, 8)

      const parsed = parseArcResponse(resp)
      expect(parsed!.txnId).toBe(req.readUInt16BE(4)) // both have same txnId
    })
  })

  // ── Pagination helper ───────────────────────────────────────────────────────

  describe('buildChannelListPayload', () => {
    it('encodes starting_channel=0 as 2 zero bytes', () => {
      const buf = buildChannelListPayload(0)
      expect(buf.length).toBe(2)
      expect(buf.readUInt16BE(0)).toBe(0)
    })

    it('encodes starting_channel=16 as big-endian 0x0010', () => {
      const buf = buildChannelListPayload(16)
      expect(buf.readUInt16BE(0)).toBe(16)
    })

    it('encodes starting_channel=32 (second TX page boundary)', () => {
      const buf = buildChannelListPayload(32)
      expect(buf.readUInt16BE(0)).toBe(32)
    })

    it('is used in buildListRxChannels with correct payload', () => {
      const req = buildListRxChannels(0x0001, 16)
      // Check the starting_channel field in the payload (bytes 8-9)
      expect(req.readUInt16BE(8)).toBe(16)
      expect(req.readUInt16BE(6)).toBe(OP.LIST_RX_CHANNELS)
    })
  })

  // ── Settings packet format (port 8700) ─────────────────────────────────────

  describe('buildSettingsPacket', () => {
    const mac = parseMacAddress('aa:bb:cc:dd:ee:ff')
    const AUDINATE_MAGIC = Buffer.from([0x41, 0x75, 0x64, 0x69, 0x6e, 0x61, 0x74, 0x65]) // "Audinate"

    it('starts with 0xFFFF protocol ID', () => {
      const cmd = Buffer.from([0x01, 0x02])
      const pkt = buildSettingsPacket(mac, cmd)
      expect(pkt.readUInt16BE(0)).toBe(SETTINGS_PROTOCOL_ID) // 0xFFFF
    })

    it('has 0x00 at byte 2', () => {
      const pkt = buildSettingsPacket(mac, Buffer.from([0x01]))
      expect(pkt[2]).toBe(0x00)
    })

    it('encodes total length at byte 3', () => {
      const cmd = Buffer.from([0x01, 0x02, 0x03])
      const pkt = buildSettingsPacket(mac, cmd)
      // total = 4 (header) + 6 (MAC) + 8 (magic) + 3 (cmd) = 21
      expect(pkt[3]).toBe(21)
    })

    it('embeds 6-byte MAC address after the 4-byte header', () => {
      const cmd = Buffer.alloc(0)
      const pkt = buildSettingsPacket(mac, cmd)
      const embeddedMac = pkt.slice(4, 10)
      expect(embeddedMac).toEqual(mac)
    })

    it('embeds Audinate magic marker after MAC', () => {
      const cmd = Buffer.alloc(0)
      const pkt = buildSettingsPacket(mac, cmd)
      const magic = pkt.slice(10, 18)
      expect(magic).toEqual(AUDINATE_MAGIC)
    })

    it('appends command bytes after magic', () => {
      const cmd = Buffer.from([0xDE, 0xAD, 0xBE])
      const pkt = buildSettingsPacket(mac, cmd)
      expect(pkt[18]).toBe(0xDE)
      expect(pkt[19]).toBe(0xAD)
      expect(pkt[20]).toBe(0xBE)
    })
  })

  // ── parseMacAddress ─────────────────────────────────────────────────────────

  describe('parseMacAddress', () => {
    it('converts hex string to 6-byte Buffer', () => {
      const buf = parseMacAddress('aa:bb:cc:dd:ee:ff')
      expect(buf.length).toBe(6)
      expect(buf[0]).toBe(0xaa)
      expect(buf[5]).toBe(0xff)
    })
  })

  // ── parseDeviceName ─────────────────────────────────────────────────────────

  describe('parseDeviceName', () => {
    it('returns empty string for short buffer', () => {
      expect(parseDeviceName(Buffer.alloc(0))).toBe('')
      expect(parseDeviceName(Buffer.alloc(1))).toBe('')
    })

    it('reads 2-byte length prefix then string', () => {
      const name = 'TestDevice'
      const body = Buffer.alloc(2 + name.length)
      body.writeUInt16BE(name.length, 0)
      body.write(name, 2, 'utf8')
      expect(parseDeviceName(body)).toBe(name)
    })
  })

  // ── parseChannelCount ───────────────────────────────────────────────────────

  describe('parseChannelCount', () => {
    it('returns { tx: 0, rx: 0 } for short buffer', () => {
      expect(parseChannelCount(Buffer.alloc(2))).toEqual({ tx: 0, rx: 0 })
    })

    it('reads tx (bytes 0-1) and rx (bytes 2-3)', () => {
      const body = Buffer.alloc(4)
      body.writeUInt16BE(8, 0)  // tx = 8
      body.writeUInt16BE(4, 2)  // rx = 4
      expect(parseChannelCount(body)).toEqual({ tx: 8, rx: 4 })
    })
  })

  // ── parseSettings ───────────────────────────────────────────────────────────

  describe('parseSettings', () => {
    it('returns zeros for short buffer', () => {
      expect(parseSettings(Buffer.alloc(8))).toEqual({ sampleRate: 0, encoding: 0, latencyNs: 0 })
    })

    it('extracts sampleRate, encoding, latencyNs', () => {
      const body = Buffer.alloc(9)
      body.writeUInt32BE(48000, 0)  // sampleRate
      body.writeUInt8(24, 4)        // encoding (24-bit)
      body.writeUInt32BE(1000000, 5) // latencyNs (1ms)
      const result = parseSettings(body)
      expect(result.sampleRate).toBe(48000)
      expect(result.encoding).toBe(24)
      expect(result.latencyNs).toBe(1000000)
    })
  })

  // ── parseSubscriptionStatus ─────────────────────────────────────────────────

  describe('parseSubscriptionStatus', () => {
    it('maps 0x01 to connected', () => {
      expect(parseSubscriptionStatus(0x01)).toBe('connected')
    })

    it('maps 0x02 to unresolved', () => {
      expect(parseSubscriptionStatus(0x02)).toBe('unresolved')
    })

    it('maps 0x03 to self-loop', () => {
      expect(parseSubscriptionStatus(0x03)).toBe('self-loop')
    })

    it('maps unknown bytes to unsubscribed', () => {
      expect(parseSubscriptionStatus(0x00)).toBe('unsubscribed')
      expect(parseSubscriptionStatus(0xFF)).toBe('unsubscribed')
    })
  })

  // ── buildGetChannelCount ────────────────────────────────────────────────────

  describe('buildGetChannelCount', () => {
    it('produces 8-byte packet with correct opcode', () => {
      const buf = buildGetChannelCount(0x0001)
      expect(buf.length).toBe(8)
      expect(buf.readUInt16BE(6)).toBe(OP.GET_CHANNEL_COUNT)
    })
  })

  // ── T040: Settings port codec (port 8700) ────────────────────────────────────

  describe('T040: Settings port codec', () => {
    const mac = parseMacAddress('aa:bb:cc:dd:ee:ff')
    const AUDINATE_MAGIC = Buffer.from([0x41, 0x75, 0x64, 0x69, 0x6e, 0x61, 0x74, 0x65])

    it('buildGetSettings produces 8-byte packet with GET_SETTINGS opcode', () => {
      const buf = buildGetSettings(0x0001)
      expect(buf.length).toBe(8)
      expect(buf.readUInt16BE(6)).toBe(OP.GET_SETTINGS)
    })

    it('buildSetSettings encodes sampleRate=44100 correctly', () => {
      const buf = buildSetSettings(0x0001, { sampleRate: 44100 })
      // payload at bytes 8+: 4-byte sampleRate
      expect(buf.readUInt32BE(8)).toBe(44100)
    })

    it('buildSetSettings encodes sampleRate=192000 correctly', () => {
      const buf = buildSetSettings(0x0001, { sampleRate: 192000 })
      expect(buf.readUInt32BE(8)).toBe(192000)
    })

    it('buildSetSettings encodes encoding=16 correctly', () => {
      const buf = buildSetSettings(0x0001, { encoding: 16 })
      expect(buf.readUInt8(12)).toBe(16)
    })

    it('buildSetSettings encodes encoding=24 correctly', () => {
      const buf = buildSetSettings(0x0001, { encoding: 24 })
      expect(buf.readUInt8(12)).toBe(24)
    })

    it('buildSetSettings encodes encoding=32 correctly', () => {
      const buf = buildSetSettings(0x0001, { encoding: 32 })
      expect(buf.readUInt8(12)).toBe(32)
    })

    it('buildSetSettings encodes latencyNs correctly', () => {
      const buf = buildSetSettings(0x0001, { latencyNs: 5000000 })
      expect(buf.readUInt32BE(13)).toBe(5000000)
    })

    it('buildSetDeviceName encodes name with 2-byte length prefix', () => {
      const buf = buildSetDeviceName(0x0001, 'TestDevice')
      expect(buf.readUInt16BE(6)).toBe(OP.SET_DEVICE_NAME)
      // payload at 8+: 2-byte length, then UTF-8 name
      expect(buf.readUInt16BE(8)).toBe('TestDevice'.length)
      expect(buf.slice(10, 10 + 'TestDevice'.length).toString('utf8')).toBe('TestDevice')
    })

    it('Settings packet embeds MAC and Audinate magic', () => {
      const cmd = Buffer.from([0x01, 0x02])
      const pkt = buildSettingsPacket(mac, cmd)
      // MAC at bytes 4-9
      expect(pkt.slice(4, 10)).toEqual(mac)
      // Magic at bytes 10-17
      expect(pkt.slice(10, 18)).toEqual(AUDINATE_MAGIC)
      // Command at bytes 18+
      expect(pkt[18]).toBe(0x01)
      expect(pkt[19]).toBe(0x02)
    })
  })
})
