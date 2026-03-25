# Data Model — Dante Network Audio Module (spec 003)

*Phase 1 design artifact. Extends `specs/001-av-room-monitor/data-model.md` with Dante-specific entities.*

---

## SQLite Migration

**Migration file**: `src/main/db/migrations/005_dante.sql`
**Schema version**: 5

```sql
-- AV Monitoring: Dante network audio device, channel, and subscription tables
-- Applied when schema version < 5

-- Snapshot of discovered Dante devices (refreshed on each scan)
CREATE TABLE IF NOT EXISTS dante_devices (
  id              TEXT PRIMARY KEY,          -- UUID v4 (app-generated, stable per device)
  device_id       TEXT NOT NULL              -- FK to devices.id (app device record)
                    REFERENCES devices(id) ON DELETE CASCADE,
  dante_name      TEXT NOT NULL,             -- Dante device name (from ARC opcode 0x1002)
  display_name    TEXT,                      -- Friendly display name (opcode 0x1003)
  model           TEXT,                      -- Model identifier (from mDNS TXT)
  ip_address      TEXT NOT NULL,
  mac_address     TEXT,                      -- 6-byte hex, from mDNS CMC TXT 'id' field
  arc_port        INTEGER NOT NULL DEFAULT 4440,  -- from mDNS SRV (may differ per device)
  sample_rate     INTEGER,                   -- Hz: 44100, 48000, 88200, 96000, 176400, 192000
  encoding        INTEGER,                   -- bit depth: 16, 24, 32
  latency_ns      INTEGER,                   -- network latency in nanoseconds
  tx_channel_count INTEGER NOT NULL DEFAULT 0,
  rx_channel_count INTEGER NOT NULL DEFAULT 0,
  is_avio         INTEGER NOT NULL DEFAULT 0 CHECK (is_avio IN (0,1)),
  last_heartbeat  TEXT,                      -- ISO-8601 timestamp of last multicast heartbeat
  led_status      TEXT NOT NULL DEFAULT 'GREY'
                    CHECK (led_status IN ('GREEN','AMBER','RED','GREY')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- TX and RX channels per Dante device (refreshed on connect/scan)
CREATE TABLE IF NOT EXISTS dante_channels (
  id              TEXT PRIMARY KEY,
  dante_device_id TEXT NOT NULL
                    REFERENCES dante_devices(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction IN ('tx','rx')),
  channel_number  INTEGER NOT NULL,          -- 1-indexed channel number on device
  channel_name    TEXT NOT NULL,             -- factory or operator-assigned name
  factory_name    TEXT,                      -- original factory name (for reset)
  gain_level      TEXT,                      -- AVIO only: e.g. '+4 dBu', '0 dBV'
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (dante_device_id, direction, channel_number)
);

-- Current subscription routing state (RX channels that are subscribed)
CREATE TABLE IF NOT EXISTS dante_subscriptions (
  id              TEXT PRIMARY KEY,
  rx_device_id    TEXT NOT NULL
                    REFERENCES dante_devices(id) ON DELETE CASCADE,
  rx_channel_id   TEXT NOT NULL
                    REFERENCES dante_channels(id) ON DELETE CASCADE,
  tx_device_name  TEXT NOT NULL,             -- Dante name of transmit device
  tx_channel_name TEXT NOT NULL,             -- Dante name of transmit channel
  status          TEXT NOT NULL DEFAULT 'unresolved'
                    CHECK (status IN ('connected','unresolved','self-loop','unsubscribed')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (rx_channel_id)                     -- one subscription per RX channel
);

INSERT INTO schema_version (version) VALUES (5);
```

---

## In-Memory State (DanteModule)

The module maintains live state in memory between polls/push events. The structure mirrors the DB schema but is keyed by Dante device name for fast lookup during subscription operations.

```typescript
interface DanteDeviceState {
  id: string;                      // app UUID
  deviceId: string;                // FK to devices table
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

interface DanteChannel {
  channelNumber: number;
  channelName: string;
  factoryName: string | null;
  direction: 'tx' | 'rx';
  gainLevel: string | null;        // AVIO only
  subscription?: DanteSubscription; // RX only
}

interface DanteSubscription {
  txDeviceName: string;
  txChannelName: string;
  status: 'connected' | 'unresolved' | 'self-loop' | 'unsubscribed';
}
```

---

## Key Entities

> **Correction (spec 007)**: The description below originally stated "One physical Dante device maps to one app `devices` record". This is incorrect. The correct model is the singleton-gateway pattern: one `devices` row = the Dante Network gateway for the room; all discovered Dante endpoints are stored only in `dante_devices`. See `specs/007-dante-network-monitor/data-model.md` for the authoritative corrected model.

### DanteDevice
A networked audio endpoint discovered via mDNS. One physical Dante device maps to one app `devices` record (type `dante-network-audio`) and one `dante_devices` record.

**LED status rules**:
- `GREY` — never successfully queried (mDNS discovered but ARC not yet contacted)
- `GREEN` — reachable, last heartbeat within 15 s, at least one RX channel connected (or no subscriptions configured)
- `AMBER` — reachable but one or more subscriptions are `unresolved` or `self-loop`
- `RED` — no heartbeat for >15 s (device offline or unreachable)

### DanteChannel
A named transmit or receive channel on a device. Channel numbers are 1-indexed. Names are either factory defaults or operator-assigned (renamed via opcode 0x1001 analog for channels). AVIO devices have per-channel gain levels on their TX (output) and RX (input) channels.

### DanteSubscription
An audio routing link from a TX channel on any device to an RX channel on any (possibly different) device. One RX channel holds at most one subscription. Status is determined by the protocol response to opcode 0x3000.

---

## Device Registry Entry

Add to `resources/device-registry.json`:

```json
{
  "type": "dante-network-audio",
  "label": "Dante Network Audio",
  "configFields": [
    { "key": "host",     "label": "IP Address",   "type": "text",     "required": true  },
    { "key": "arcPort",  "label": "ARC Port",      "type": "number",   "required": false,
      "default": 4440, "hint": "Default 4440 — overridden by mDNS if discovered automatically" }
  ]
}
```

Note: No credentials are required. Dante ARC/Settings ports have no authentication layer.
