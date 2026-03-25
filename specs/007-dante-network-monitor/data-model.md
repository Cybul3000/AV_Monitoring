# Data Model — Dante Network Monitor Refactor (spec 007)

*Phase 1 design artifact. Corrects and supersedes the entity descriptions in `specs/003-dante-network-audio/data-model.md`. The SQLite schema (migration 005) is unchanged.*

---

## No New Migration

Migration `005_dante.sql` remains correct. No `ALTER TABLE` is required. The fix is in application code and the device registry — not in the schema.

---

## Corrected Entity Model

### Dante Network (gateway — one per room)

Stored as one row in the `devices` table (type `dante-network-audio`). This is the only row the Config UI creates. It is the anchor for all Dante activity in a room.

| Field | Storage | Notes |
|-------|---------|-------|
| `id` | `devices.id` | UUID v4, app-generated |
| `device_type` | `devices.device_type` | `"dante-network-audio"` |
| `host` | `devices.host` | Network interface name (e.g. `"en0"`) or `""` for all interfaces |
| `port` | `devices.port` | `NULL` — no port is dialled |
| `status` | `devices.status` | Aggregate LED: GREEN/AMBER/RED/GREY — computed by `DanteModule.ping()` |

**LED aggregation rules (computed by `ping()`):**

| Condition | LED |
|-----------|-----|
| `_devices` map is empty (discovery not started or no devices seen yet) | `GREY` |
| Discovery has run; all discovered devices GREEN | `GREEN` |
| Any discovered device has unresolved/self-loop subscriptions | `AMBER` |
| Any discovered device has missed heartbeats (>15 s) | `RED` |
| Discovery has run; no devices found | `AMBER` |

---

### Dante Device (discovered automatically — NOT in `devices` table)

Stored in `dante_devices` only. Never created via the Config UI. All rows for a given room share the same `device_id` FK pointing to the Dante Network gateway row.

| Field | Storage | Notes |
|-------|---------|-------|
| `id` | `dante_devices.id` | UUID v4, stable per MAC address |
| `device_id` | `dante_devices.device_id` | FK → `devices.id` of the Dante Network gateway (same value for all rows in a room) |
| `dante_name` | `dante_devices.dante_name` | Mutable Dante protocol name (from ARC opcode 0x1002) |
| `display_name` | `dante_devices.display_name` | Read-only friendly label (opcode 0x1003) |
| `mac_address` | `dante_devices.mac_address` | Stable unique identifier — survives renames and DHCP changes |
| `ip_address` | `dante_devices.ip_address` | Current IPv4, may change on DHCP renewal |
| `arc_port` | `dante_devices.arc_port` | Discovered from mDNS SRV record, defaults to 4440 |
| `sample_rate` | `dante_devices.sample_rate` | Hz |
| `encoding` | `dante_devices.encoding` | Bit depth: 16, 24, or 32 |
| `latency_ns` | `dante_devices.latency_ns` | Network latency in nanoseconds |

---

## In-Memory State — Corrected `DanteDeviceState`

The `deviceId` field in `DanteDeviceState` now holds the anchor `devices.id` (the gateway row), **not** a fresh `randomUUID()` per discovered endpoint.

```typescript
interface DanteDeviceState {
  id: string;           // UUID for this dante_devices row (stable per MAC)
  deviceId: string;     // FK → devices.id of the Dante Network gateway (SAME for all states)
  danteName: string;
  displayName: string | null;
  model: string | null;
  ipAddress: string;
  macAddress: string | null;
  arcPort: number;
  sampleRate: number | null;
  encoding: number | null;
  latencyNs: number | null;
  txChannelCount: number;
  rxChannelCount: number;
  isAvio: boolean;
  lastHeartbeat: Date | null;
  ledStatus: 'GREEN' | 'AMBER' | 'RED' | 'GREY';
  txChannels: DanteChannel[];
  rxChannels: DanteChannel[];
}
```

**Critical change**: `DanteModule` stores `this._anchorDeviceId` from `connect(deviceId, config)`. All `DanteDeviceState` objects created in `_onDeviceFound()` set `deviceId: this._anchorDeviceId`.

---

## Device Registry Entry (corrected)

The canonical entry in `resources/device-registry.json`:

```json
{
  "type": "dante-network-audio",
  "label": "Dante Network Audio",
  "module": "DanteModule",
  "protocol": "mDNS/UDP",
  "port": null,
  "configFields": [
    {
      "key": "host",
      "label": "Network Interface",
      "secret": false,
      "hint": "Interface name for Dante mDNS discovery (e.g. en0, eth0, Ethernet). Leave blank to discover on all interfaces."
    }
  ]
}
```

**Removed**: `required: true` on `host`, the `arcPort` field, any `dante-audio` per-device entry.

---

## What Changed vs. spec 003

| Location | Old (incorrect) | New (correct) |
|----------|-----------------|---------------|
| `data-model.md` Key Entities | "One physical Dante device maps to one app `devices` record" | One Dante Network gateway row in `devices`; all discovered devices in `dante_devices` only |
| `DanteDeviceState.deviceId` | `randomUUID()` — broken placeholder | `this._anchorDeviceId` from `connect()` |
| `DanteModule.ping()` | Searched by `state.deviceId` (never matched) | Returns aggregate LED across all `_devices` |
| `DanteModule.connect()` | `_deviceId` and `_config` both ignored | `deviceId` stored as `_anchorDeviceId`; `config.host` used for interface |
| `device-registry.json` | `host` (required IP) + `arcPort` | `host` (optional network interface name) only |
| `device-registry.json` | Possibly also had `dante-audio` per-device entry | Removed entirely |
