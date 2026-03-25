# Quickstart — Dante Network Audio Module (spec 003)

*Phase 1 design artifact. Supplement to `specs/001-av-room-monitor/quickstart.md`.*

---

## New dependency

```bash
npm install multicast-dns
npm install --save-dev @types/multicast-dns
```

`multicast-dns` is the only new runtime dependency. All other transport work uses Node.js built-ins (`dgram`, `os`, `Buffer`).

---

## Key source files (to be created)

```text
src/main/modules/dante/
├── DanteMdnsDiscovery.ts       # Browse _netaudio-*._udp.local services, emit device-found events
├── DantePacket.ts              # buildRequest() / parseResponse() — Buffer-based big-endian packet codec
├── DanteUdpTransport.ts        # dgram UDP socket, transaction-ID map, Promise-based request()
├── DanteHeartbeatListener.ts   # Multicast dgram on 224.0.0.233:8708, emit heartbeat/offline events
├── DanteNotificationListener.ts# Multicast dgram on 224.0.0.231:8702, emit routing-change events
├── DanteDeviceCommands.ts      # Opcode constants + packet builders for each operation
└── DanteModule.ts              # DeviceModule implementation — connects all layers

src/main/ipc/dante-handlers.ts  # Registers all dante:* IPC handlers
src/main/db/migrations/005_dante.sql

src/renderer/components/DantePanel/
├── DantePanel.tsx              # Top-level panel rendered in RoomView for dante-network-audio devices
├── DanteDeviceCard.tsx         # Device summary: name, IP, sample rate, LED, channel counts
├── DanteSubscriptionTable.tsx  # RX channel routing view with status badges
├── DanteSettingsForm.tsx       # Sample rate / encoding / latency form
└── useDanteState.ts            # Hook: subscribes to dante:update push events

tests/unit/dante/
├── DantePacket.test.ts         # Binary encode/decode round-trips for all opcodes
├── DanteUdpTransport.test.ts   # Request/response matching, timeout, pagination
└── DanteModule.test.ts         # Module lifecycle, LED logic, status points

tests/integration/dante/
└── dante-ipc.test.ts           # IPC handler integration tests (mocked transport)
```

---

## Agent start file

**Agent E** (Dante module) should begin with:
1. `specs/003-dante-network-audio/spec.md` — requirements
2. `specs/003-dante-network-audio/plan.md` — this plan
3. `specs/003-dante-network-audio/research.md` — protocol details
4. `specs/003-dante-network-audio/data-model.md` — DB schema + state shape
5. `specs/003-dante-network-audio/contracts/dante-ipc.md` — IPC contracts
6. `specs/001-av-room-monitor/data-model.md` — shared schema (devices table)
7. `specs/001-av-room-monitor/contracts/ipc-channels.md` — shared IPC patterns

---

## Cross-platform notes

- `multicast-dns` works on macOS and Windows without system daemons.
- On Windows, `dgram.addMembership()` requires specifying the local interface IP. Use `os.networkInterfaces()` to enumerate all non-internal IPv4 interfaces and join the multicast group on each.
- On macOS, no special configuration is needed for multicast.
- ARC port 4440 is outbound only; no firewall rules needed on the operator's machine.
- Multicast receive (8702, 8708) requires the OS to allow binding to `0.0.0.0` with `SO_REUSEPORT` / `SO_REUSEADDR`. Both are set via `dgram.createSocket({ type: 'udp4', reuseAddr: true })`.

---

## Protocol verification

Run this to confirm a Dante device is reachable on the ARC port before building:

```bash
# Send a minimal ARC probe packet to port 4440 on the device IP
# Protocol ID 0x27FF, length 0x0008, txnId 0x0001, opcode 0x1002 (get device name)
echo -ne '\x27\xff\x00\x08\x00\x01\x10\x02' | nc -u -w1 <DEVICE_IP> 4440 | xxd
```
