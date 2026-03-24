# Research — Dante Network Audio Module

*Phase 0 output for spec 003-dante-network-audio. All NEEDS CLARIFICATION items resolved.*

---

## Decision 1: Transport layer — TypeScript port vs Python subprocess vs DDM REST API

**Decision**: Port the `netaudio` / `netaudio-lib` Python library to TypeScript using Node.js built-ins.

**Rationale**:
- Dante's control protocol is entirely UDP (binary, big-endian). Node.js `dgram` and `Buffer` handle this natively — no friction, no native bindings.
- `struct.pack`/`unpack` maps mechanically to `Buffer.readUInt16BE()` / `buf.writeUInt16BE()`.
- The Python source is clean, small (~2,500 lines across ~40 files), and well-separated by concern.
- A Python subprocess sidecar introduces a Python runtime dependency, IPC serialisation, and process lifecycle management — unacceptable for a cross-platform Electron app.
- Dante Domain Manager REST API requires customers to run paid DDM server software; not viable for direct-device monitoring.
- `multicast-dns` (npm, pure-JS, 600k weekly downloads) provides Zeroconf/DNS-SD discovery without native bindings, satisfying the cross-platform (macOS + Windows) requirement.

**Alternatives considered**:
1. Python subprocess sidecar — rejected (Python runtime dependency, IPC complexity)
2. DDM REST API — rejected (requires paid DDM server)
3. Existing npm package — none found; no public Dante protocol implementation exists in JS/TS

**Sources**: `netaudio_lib-0.0.6-py3-none-any.whl` from PyPI (decompiled); `network-audio-controller` repository by chris-ritsen.

---

## Decision 2: mDNS discovery library

**Decision**: `multicast-dns` npm package (pure-JS implementation).

**Rationale**:
- Pure JavaScript — no native bindings, works on macOS and Windows without platform-specific configuration.
- Browsing four Dante service types simultaneously (`_netaudio-arc._udp.local`, `_netaudio-cmc._udp.local`, `_netaudio-dbc._udp.local`, `_netaudio-chan._udp.local`) is straightforward.
- ARC port is read from the mDNS SRV record — not always 4440, may differ per device.
- Device grouping: multiple service records per physical device share the same `.local.` hostname; group by DNS server name.

**Alternatives considered**:
1. `mdns` (npm) — requires native Avahi/Bonjour bindings, problematic on Windows
2. `bonjour-hap` — adequate but `multicast-dns` is more widely used and actively maintained

---

## Decision 3: Dante protocol — ports and packet structure

*All findings from decompiled `netaudio-lib` source code.*

### UDP ports

| Port | Name | Purpose |
|------|------|---------|
| **4440** | ARC (Audio Routing Control) | Primary control: device name, channel lists, subscriptions, latency, AES67 |
| **8800** | CMC (Control & Monitoring) | Controller registration, volume metering keepalive |
| **8700** | Settings | Sample rate, bit-depth, AVIO gain, identify flash |
| **8702** | Notifications multicast | Routing changes, sample rate changes, topology events |
| **8708** | Heartbeat multicast | Device liveness (~1 per second per device) |

### Multicast groups

| Address | Port | Purpose |
|---------|------|---------|
| `224.0.0.231` | 8702 | Control & monitoring notifications |
| `224.0.0.233` | 8708 | Device heartbeats |

### Packet header (ARC / CMC — port 4440 and 8800)

```
Request (8-byte header, big-endian):
  bytes 0-1:  Protocol ID (0x27FF = ARC, 0x1200 = CMC)
  bytes 2-3:  Total packet length (including header)
  bytes 4-5:  Transaction ID (16-bit random, echoed in response)
  bytes 6-7:  Opcode
  bytes 8+:   Payload

Response (10-byte header):
  bytes 0-1:  Protocol ID
  bytes 2-3:  Length
  bytes 4-5:  Transaction ID (echo)
  bytes 6-7:  Opcode (echo)
  bytes 8-9:  Result code (0x0001 = OK, 0x8112 = OK + more pages, 0x0600 = lock reject)
  bytes 10+:  Response body
```

### Key opcodes

| Opcode | Operation |
|--------|-----------|
| 0x1000 | Query TX/RX channel count |
| 0x1002 | Get device name |
| 0x1001 | Set device name |
| 0x1003 | Get device info (model, display name) |
| 0x1100 | Get device settings (sample rate, latency) |
| 0x1101 | Set device settings |
| 0x2000 | List TX channels |
| 0x2010 | List TX channel friendly names |
| 0x3000 | List RX channels (with subscription status) |
| 0x3010 | Add subscription(s) |
| 0x3014 | Remove subscription(s) |

### Pagination
Channel list responses are paginated: 16 RX channels or 32 TX channels per page. Client issues sequential requests with `starting_channel` offset until no more pages.

### Settings packet (port 8700)

```
bytes 0-1:  Protocol ID (0xFFFF)
byte  2:    0x00
byte  3:    Total length
bytes 4+:   6-byte MAC + 8-byte Audinate magic marker + command bytes
```

---

## Decision 4: Subscription status mapping

**Decision**: Map raw protocol status codes to three app-level states: `connected`, `unresolved`, `self-loop`.

| Protocol state | App status |
|----------------|------------|
| Unicast connection active | `connected` |
| Subscription configured but source unreachable | `unresolved` |
| RX subscribed to own TX | `self-loop` |
| No subscription configured | `unsubscribed` |

---

## Decision 5: Device offline detection

**Decision**: Mark device offline after 15 seconds with no heartbeat multicast on 224.0.0.233:8708.

**Rationale**: Heartbeats arrive ~1 per second. The `netaudio-lib` implementation uses a 15-second window. This maps cleanly to the app's GREY (never connected) / RED (was connected, now unreachable) LED logic.

---

## Decision 6: Scope for monitoring vs control operations

For spec 003 the module implements both read (monitoring) and write (subscriptions, device settings) operations as specified in FR-006 to FR-014. The full scope is:

- **Discovery** (P1): mDNS + ARC opcode 0x1000/0x1002/0x1003
- **Channel listing** (P1/P2): ARC opcodes 0x2000/0x2010/0x3000 with pagination
- **Subscription management** (P3): ARC opcodes 0x3010 (add), 0x3014 (remove)
- **Device settings read/write** (P4): Settings port 8700 — sample rate, encoding, latency
- **AVIO gain** (P5): Settings port 8700 — per-channel gain levels
- **Device/channel rename** (FR-011/FR-012): ARC opcodes 0x1001 (device name set)
- **Heartbeat monitoring**: Multicast listener on 224.0.0.233:8708

---

## Decision 7: In-memory vs SQLite caching

**Decision**: Dante device state is maintained in-memory in the module (like other modules). A snapshot is written to three SQLite tables (`dante_devices`, `dante_channels`, `dante_subscriptions`) on each poll/refresh for persistence across restarts and for the audit log pattern.

**Rationale**: All other modules store discovered state in-memory and expose it via `getStatusPoints()`. Dante adds channel and subscription data that is too large to fit in `meta` alone — dedicated tables provide queryable storage without coupling module state to DB transactions.

---

## Python dependency → Node.js replacement map

| Python | Purpose | Node.js |
|--------|---------|---------|
| `zeroconf` | mDNS browsing | `multicast-dns` (npm, pure-JS) |
| `asyncio.DatagramProtocol` | UDP async I/O | `dgram` (built-in) |
| `socket.setsockopt(IPPROTO_IP, IP_ADD_MEMBERSHIP)` | Multicast join | `dgram.socket.addMembership(group, iface)` |
| `struct.pack` / `struct.unpack` | Binary serialisation | `Buffer.readUInt16BE()`, `buf.writeUInt16BE()`, etc. |
| `asyncio` | Async concurrency | Node.js async/await + EventEmitter |
| `ifaddr` | Interface enumeration | `os.networkInterfaces()` |

---

## Effort estimate

- Read-only monitoring (P1 + P2): ~3 days
- Full read/write (P1–P5 + FR-006–FR-014): ~7–10 days
- With tests per constitution (IV): add ~3 days
