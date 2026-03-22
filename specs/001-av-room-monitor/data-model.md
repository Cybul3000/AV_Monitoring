# Data Model — AV Monitoring Desktop Application

*Phase 1 design artifact. Covers all entities across specs 001–004.*

---

## SQLite Schema

All tables are created by the migration system at `src/main/db/migrations/`. Migrations are numbered sequentially and applied on app startup if the database version is below the expected version.

### `regions`

```sql
CREATE TABLE regions (
  id          TEXT PRIMARY KEY,          -- UUID v4
  name        TEXT NOT NULL UNIQUE,
  led_status  TEXT NOT NULL DEFAULT 'GREY'
                CHECK (led_status IN ('GREEN','AMBER','RED','GREY')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `offices`

```sql
CREATE TABLE offices (
  id          TEXT PRIMARY KEY,
  region_id   TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  city        TEXT NOT NULL,
  led_status  TEXT NOT NULL DEFAULT 'GREY'
                CHECK (led_status IN ('GREEN','AMBER','RED','GREY')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (region_id, name)
);
```

### `floors`

```sql
CREATE TABLE floors (
  id              TEXT PRIMARY KEY,
  office_id       TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  level           INTEGER NOT NULL,       -- floor level number (B1=−1, G=0, 1..n)
  name            TEXT NOT NULL,
  floor_map_path  TEXT,                   -- absolute path to uploaded image; null if not set
  led_status      TEXT NOT NULL DEFAULT 'GREY'
                    CHECK (led_status IN ('GREEN','AMBER','RED','GREY')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (office_id, level)
);
```

### `rooms`

```sql
CREATE TABLE rooms (
  id          TEXT PRIMARY KEY,
  floor_id    TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  -- Floor map position as percentage of the canvas (0.00–100.00)
  map_x       REAL,
  map_y       REAL,
  map_w       REAL,
  map_h       REAL,
  led_status  TEXT NOT NULL DEFAULT 'GREY'
                CHECK (led_status IN ('GREEN','AMBER','RED','GREY')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (floor_id, name)
);
```

### `devices`

```sql
CREATE TABLE devices (
  id            TEXT PRIMARY KEY,
  room_id       TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  device_type   TEXT NOT NULL,            -- matches registry key: zoom-room | lg-display | dante-audio | crestron-ssh | lightware-matrix | biamp-tesira
  name          TEXT NOT NULL,
  host          TEXT NOT NULL,            -- IP address or hostname
  port          INTEGER,                  -- null for types that do not use fixed ports (Zoom, Dante)
  status        TEXT NOT NULL DEFAULT 'GREY'
                  CHECK (status IN ('GREEN','AMBER','RED','GREY')),
  last_seen     TEXT,                     -- ISO-8601 timestamp of last successful poll
  poll_interval INTEGER NOT NULL DEFAULT 30000,  -- milliseconds
  map_x         REAL,                     -- position within room's floor-map area
  map_y         REAL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_devices_room ON devices(room_id);
CREATE INDEX idx_devices_type ON devices(device_type);
```

### `device_configs`

Versioned snapshots of device configuration (JSON payload from config download).

```sql
CREATE TABLE device_configs (
  id           TEXT PRIMARY KEY,
  device_id    TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  version      INTEGER NOT NULL,          -- auto-incremented per device
  config_json  TEXT NOT NULL,             -- JSON serialised config
  exported_at  TEXT NOT NULL DEFAULT (datetime('now')),
  note         TEXT                       -- optional user label
);

CREATE INDEX idx_device_configs_device ON device_configs(device_id);
```

### `ssh_device_profiles`

Extra metadata required by the Crestron SSH module (per spec 004).

```sql
CREATE TABLE ssh_device_profiles (
  id                   TEXT PRIMARY KEY,
  device_id            TEXT NOT NULL UNIQUE REFERENCES devices(id) ON DELETE CASCADE,
  device_type          TEXT NOT NULL CHECK (device_type IN ('CP4','VC4')),
  prompt_pattern       TEXT NOT NULL,         -- regex to detect ready state
  disconnect_cmd       TEXT NOT NULL,         -- 'BYE' for CP4, 'exit' for VC4
  default_program_slot INTEGER                -- used in PROGRESet confirmation
);
```

### `events`

Append-only audit log.

```sql
CREATE TABLE events (
  id          TEXT PRIMARY KEY,
  device_id   TEXT REFERENCES devices(id) ON DELETE SET NULL,
  room_id     TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('INFO','WARN','ERROR','CRITICAL')),
  message     TEXT NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_events_occurred ON events(occurred_at DESC);
CREATE INDEX idx_events_device   ON events(device_id);
```

---

## LED Aggregation Rules

LED status rolls upward through the hierarchy. The rule applied at each level is:

| Child statuses present | Parent LED |
|------------------------|-----------|
| Any RED | RED |
| Any AMBER (no RED) | AMBER |
| All GREEN | GREEN |
| All GREY (no devices / all offline) | GREY |

These rules are computed by the `StatusAggregator` service in the main process and emitted via the `device:status:all` IPC broadcast on every polling tick.

---

## Device Registry (JSON)

`resources/device-registry.json` is the §V single source of truth. This file is loaded at startup and is never modified at runtime.

```json
{
  "version": "1.0.0",
  "devices": [
    {
      "type": "zoom-room",
      "label": "Zoom Rooms Controller",
      "module": "ZoomModule",
      "protocol": "REST/HTTPS",
      "port": null,
      "configFields": [
        { "key": "accountId",    "label": "Zoom Account ID",    "secret": false },
        { "key": "clientId",     "label": "OAuth Client ID",    "secret": false },
        { "key": "clientSecret", "label": "OAuth Client Secret","secret": true  }
      ]
    },
    {
      "type": "lg-display",
      "label": "LG Pro Display",
      "module": "LGDisplayModule",
      "protocol": "TCP",
      "port": 9761,
      "configFields": [
        { "key": "host", "label": "IP Address", "secret": false }
      ]
    },
    {
      "type": "dante-audio",
      "label": "Dante Network Audio Device",
      "module": "DanteModule",
      "protocol": "mDNS/UDP",
      "port": null,
      "configFields": [
        { "key": "deviceName", "label": "Dante Device Name (mDNS)", "secret": false }
      ]
    },
    {
      "type": "crestron-ssh",
      "label": "Crestron Series 3/4 (SSH)",
      "module": "CrestronSSHModule",
      "protocol": "SSH",
      "port": 22,
      "configFields": [
        { "key": "host",       "label": "IP Address",       "secret": false },
        { "key": "username",   "label": "SSH Username",     "secret": false },
        { "key": "password",   "label": "SSH Password",     "secret": true  },
        { "key": "deviceType", "label": "Device Type",      "secret": false,
          "enum": ["CP4","VC4"] }
      ]
    },
    {
      "type": "lightware-matrix",
      "label": "Lightware Matrix Switcher",
      "module": "LightwareModule",
      "protocol": "TCP/LW3",
      "port": 6107,
      "configFields": [
        { "key": "host",     "label": "IP Address",  "secret": false },
        { "key": "username", "label": "LW3 Username","secret": false },
        { "key": "password", "label": "LW3 Password","secret": true  }
      ]
    },
    {
      "type": "biamp-tesira",
      "label": "Biamp Tesira DSP",
      "module": "BiampTesiraModule",
      "protocol": "TCP/TTP",
      "port": 23,
      "configFields": [
        { "key": "host",       "label": "IP Address",       "secret": false },
        { "key": "username",   "label": "TTP Username",     "secret": false },
        { "key": "password",   "label": "TTP Password",     "secret": true  },
        { "key": "levelBlocks","label": "LevelControl Block Paths (comma-separated)", "secret": false }
      ]
    }
  ]
}
```

---

## DeviceModule Interface

`src/main/modules/_base/DeviceModule.ts` — the TypeScript interface every device module must implement.

```typescript
export type LEDStatus = 'GREEN' | 'AMBER' | 'RED' | 'GREY';

export interface DeviceStatus {
  deviceId: string;
  status: LEDStatus;
  lastSeen: string | null;       // ISO-8601
  meta?: Record<string, unknown>; // module-specific additional state
}

export interface DeviceModule {
  /** Unique device type identifier — must match device-registry.json */
  readonly type: string;

  /** Start polling / monitoring the device */
  connect(deviceId: string, config: DeviceConfig): Promise<void>;

  /** Stop polling and close connections cleanly */
  disconnect(deviceId: string): Promise<void>;

  /** Request an immediate status check (outside poll interval) */
  ping(deviceId: string): Promise<DeviceStatus>;

  /** Download current device configuration as a serialisable object */
  downloadConfig(deviceId: string): Promise<Record<string, unknown>>;

  /** Push a previously downloaded config back to the device */
  restoreConfig(deviceId: string, config: Record<string, unknown>): Promise<void>;

  /** Execute a named command with optional parameters */
  sendCommand(deviceId: string, command: string, params?: Record<string, unknown>): Promise<CommandResult>;
}

export interface DeviceConfig {
  host?: string;
  port?: number;
  credentials?: Record<string, string>; // values loaded from keychain — NEVER stored
  options?: Record<string, unknown>;
}

export interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
}
```

---

## Preferences Schema

Stored via `electron-store`. All keys prefixed with `pref:`.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `pref:tooltipsEnabled` | boolean | `true` | Show hover tooltips |
| `pref:pollIntervalDefault` | number (ms) | `30000` | Default poll interval for new devices |
| `pref:pythonPath` | string | `'python3'` | Path to Python executable for Dante module |
| `pref:logRetentionDays` | number | `30` | Days to retain events in SQLite |
| `pref:otelNewRelicKey` | string | `''` | New Relic ingest key for OTel config generation |
| `pref:zoomFactor` | number | `1.0` | Renderer zoom override |
| `pref:lastHierarchyPath` | string | `'/'` | Last selected breadcrumb path (restored on launch) |
| `pref:windowBounds` | object | `null` | Last window position/size |

---

## State Transitions

### Device LED Status Machine

```
GREY ──► AMBER (attempting connection)
AMBER ──► GREEN (connection + poll success)
AMBER ──► RED   (connection refused / timeout)
GREEN ──► AMBER (consecutive poll failures ≥ 2)
GREEN ──► RED   (consecutive poll failures ≥ 5 OR explicit error state from module)
RED   ──► AMBER (device responds again)
AMBER ──► GREEN (response confirmed for 2 consecutive polls)
```

### SSH Session State Machine (Crestron Module)

```
CLOSED ──► CONNECTING (workspace panel opened)
CONNECTING ──► READY    (prompt detected: CP4N> or [admin@<hostname> ~]$)
CONNECTING ──► ERROR    (auth failure or timeout after 10 s)
READY ──► BUSY          (command sent, awaiting prompt return)
BUSY ──► READY          (prompt detected in output stream)
READY ──► CLOSED        (disconnect command sent or workspace panel closed)
ERROR ──► CLOSED        (user dismisses error state)
```
