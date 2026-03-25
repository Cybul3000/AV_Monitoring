// DantePacket.ts — Binary codec for Dante ARC and Settings UDP protocols
// Protocol source: netaudio-lib (reverse-engineered, MIT license)

// ── Protocol IDs ──────────────────────────────────────────────────────────────
export const ARC_PROTOCOL_ID = 0x27ff
export const CMC_PROTOCOL_ID = 0x1200
export const SETTINGS_PROTOCOL_ID = 0xffff

// ── ARC Opcodes ───────────────────────────────────────────────────────────────
export const OP = {
  GET_CHANNEL_COUNT:    0x1000,
  SET_DEVICE_NAME:      0x1001,
  GET_DEVICE_NAME:      0x1002,
  GET_DEVICE_INFO:      0x1003,
  GET_SETTINGS:         0x1100,
  SET_SETTINGS:         0x1101,
  LIST_TX_CHANNELS:     0x2000,
  LIST_TX_CHANNEL_NAMES:0x2010,
  LIST_RX_CHANNELS:     0x3000,
  ADD_SUBSCRIPTION:     0x3010,
  REMOVE_SUBSCRIPTION:  0x3014,
} as const

// ── Result codes ──────────────────────────────────────────────────────────────
export const RESULT_OK           = 0x0001
export const RESULT_MORE_PAGES   = 0x8112
export const RESULT_LOCK_REJECT  = 0x0600

// ── Audinate magic marker (8 bytes) ───────────────────────────────────────────
const AUDINATE_MAGIC = Buffer.from([0x41, 0x75, 0x64, 0x69, 0x6e, 0x61, 0x74, 0x65]) // "Audinate"

// ── ARC request builder ───────────────────────────────────────────────────────

/** Build an ARC request packet (8-byte header + payload) */
export function buildArcRequest(
  opcode: number,
  txnId: number,
  payload: Buffer = Buffer.alloc(0)
): Buffer {
  const totalLen = 8 + payload.length
  const buf = Buffer.alloc(totalLen)
  buf.writeUInt16BE(ARC_PROTOCOL_ID, 0)
  buf.writeUInt16BE(totalLen, 2)
  buf.writeUInt16BE(txnId & 0xffff, 4)
  buf.writeUInt16BE(opcode, 6)
  payload.copy(buf, 8)
  return buf
}

// ── ARC response parser ───────────────────────────────────────────────────────

export interface ArcResponse {
  protocolId: number
  length: number
  txnId: number
  opcode: number
  resultCode: number
  body: Buffer
}

/** Parse an ARC response packet (10-byte header) */
export function parseArcResponse(buf: Buffer): ArcResponse | null {
  if (buf.length < 10) return null
  return {
    protocolId: buf.readUInt16BE(0),
    length:     buf.readUInt16BE(2),
    txnId:      buf.readUInt16BE(4),
    opcode:     buf.readUInt16BE(6),
    resultCode: buf.readUInt16BE(8),
    body:       buf.slice(10),
  }
}

// ── Pagination helper ─────────────────────────────────────────────────────────

/** Build paginated channel list request payload */
export function buildChannelListPayload(startingChannel: number): Buffer {
  const buf = Buffer.alloc(2)
  buf.writeUInt16BE(startingChannel, 0)
  return buf
}

// ── Specific ARC packet builders ──────────────────────────────────────────────

export function buildGetChannelCount(txnId: number): Buffer {
  return buildArcRequest(OP.GET_CHANNEL_COUNT, txnId)
}

export function buildGetDeviceName(txnId: number): Buffer {
  return buildArcRequest(OP.GET_DEVICE_NAME, txnId)
}

export function buildGetDeviceInfo(txnId: number): Buffer {
  return buildArcRequest(OP.GET_DEVICE_INFO, txnId)
}

export function buildGetSettings(txnId: number): Buffer {
  return buildArcRequest(OP.GET_SETTINGS, txnId)
}

export function buildSetSettings(
  txnId: number,
  opts: { sampleRate?: number; encoding?: number; latencyNs?: number }
): Buffer {
  // Settings payload: 4-byte sample rate, 1-byte encoding, 4-byte latency (nanoseconds)
  const payload = Buffer.alloc(9, 0)
  payload.writeUInt32BE(opts.sampleRate ?? 0, 0)
  payload.writeUInt8(opts.encoding ?? 0, 4)
  payload.writeUInt32BE(opts.latencyNs ?? 0, 5)
  return buildArcRequest(OP.SET_SETTINGS, txnId, payload)
}

export function buildSetDeviceName(txnId: number, name: string): Buffer {
  const nameBuf = Buffer.from(name, 'utf8')
  const payload = Buffer.alloc(2 + nameBuf.length)
  payload.writeUInt16BE(nameBuf.length, 0)
  nameBuf.copy(payload, 2)
  return buildArcRequest(OP.SET_DEVICE_NAME, txnId, payload)
}

export function buildListTxChannels(txnId: number, startingChannel: number): Buffer {
  return buildArcRequest(OP.LIST_TX_CHANNELS, txnId, buildChannelListPayload(startingChannel))
}

export function buildListTxChannelNames(txnId: number, startingChannel: number): Buffer {
  return buildArcRequest(OP.LIST_TX_CHANNEL_NAMES, txnId, buildChannelListPayload(startingChannel))
}

export function buildListRxChannels(txnId: number, startingChannel: number): Buffer {
  return buildArcRequest(OP.LIST_RX_CHANNELS, txnId, buildChannelListPayload(startingChannel))
}

export function buildAddSubscription(
  txnId: number,
  rxChannelNum: number,
  txChannelName: string,
  txDeviceName: string
): Buffer {
  const txChanBuf = Buffer.from(txChannelName, 'utf8')
  const txDevBuf  = Buffer.from(txDeviceName, 'utf8')
  // Record: 2-byte RX channel num, 2-byte txChan len, txChan bytes, 2-byte txDev len, txDev bytes
  const payload = Buffer.alloc(2 + 2 + txChanBuf.length + 2 + txDevBuf.length)
  let off = 0
  payload.writeUInt16BE(rxChannelNum, off); off += 2
  payload.writeUInt16BE(txChanBuf.length, off); off += 2
  txChanBuf.copy(payload, off); off += txChanBuf.length
  payload.writeUInt16BE(txDevBuf.length, off); off += 2
  txDevBuf.copy(payload, off)
  return buildArcRequest(OP.ADD_SUBSCRIPTION, txnId, payload)
}

export function buildRemoveSubscription(txnId: number, rxChannelNum: number): Buffer {
  const payload = Buffer.alloc(2)
  payload.writeUInt16BE(rxChannelNum, 0)
  return buildArcRequest(OP.REMOVE_SUBSCRIPTION, txnId, payload)
}

// ── Settings port codec (port 8700) ──────────────────────────────────────────

/** Build a Settings port packet: 0xFFFF header + MAC + Audinate magic + command bytes */
export function buildSettingsPacket(mac: Buffer, commandBytes: Buffer): Buffer {
  // Header: 2-byte protocol ID (0xFFFF) + 1-byte 0x00 + 1-byte total length
  const totalLen = 4 + mac.length + AUDINATE_MAGIC.length + commandBytes.length
  const buf = Buffer.alloc(totalLen)
  let off = 0
  buf.writeUInt16BE(SETTINGS_PROTOCOL_ID, off); off += 2
  buf.writeUInt8(0x00, off); off += 1
  buf.writeUInt8(totalLen & 0xff, off); off += 1
  mac.copy(buf, off); off += mac.length
  AUDINATE_MAGIC.copy(buf, off); off += AUDINATE_MAGIC.length
  commandBytes.copy(buf, off)
  return buf
}

/** Parse a MAC address string "aa:bb:cc:dd:ee:ff" into a 6-byte Buffer */
export function parseMacAddress(mac: string): Buffer {
  const bytes = mac.split(':').map(h => parseInt(h, 16))
  return Buffer.from(bytes)
}

/** Parse device name from GET_DEVICE_NAME response body */
export function parseDeviceName(body: Buffer): string {
  if (body.length < 2) return ''
  const len = body.readUInt16BE(0)
  return body.slice(2, 2 + len).toString('utf8')
}

/** Parse channel count from GET_CHANNEL_COUNT response body */
export function parseChannelCount(body: Buffer): { tx: number; rx: number } {
  if (body.length < 4) return { tx: 0, rx: 0 }
  return {
    tx: body.readUInt16BE(0),
    rx: body.readUInt16BE(2),
  }
}

/** Parse settings from GET_SETTINGS response body */
export function parseSettings(body: Buffer): { sampleRate: number; encoding: number; latencyNs: number } {
  if (body.length < 9) return { sampleRate: 0, encoding: 0, latencyNs: 0 }
  return {
    sampleRate: body.readUInt32BE(0),
    encoding:   body.readUInt8(4),
    latencyNs:  body.readUInt32BE(5),
  }
}

// ── Subscription status byte → app status ────────────────────────────────────

export type SubscriptionStatus = 'connected' | 'unresolved' | 'self-loop' | 'unsubscribed'

export function parseSubscriptionStatus(statusByte: number): SubscriptionStatus {
  switch (statusByte) {
    case 0x01: return 'connected'
    case 0x02: return 'unresolved'
    case 0x03: return 'self-loop'
    default:   return 'unsubscribed'
  }
}
