-- AV Monitoring: Initial schema migration
-- Applied on first run if database version < 1

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ── Hierarchy ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS regions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  led_status  TEXT NOT NULL DEFAULT 'GREY'
                CHECK (led_status IN ('GREEN','AMBER','RED','GREY')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS offices (
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

CREATE TABLE IF NOT EXISTS floors (
  id              TEXT PRIMARY KEY,
  office_id       TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  level           INTEGER NOT NULL,
  name            TEXT NOT NULL,
  floor_map_path  TEXT,
  led_status      TEXT NOT NULL DEFAULT 'GREY'
                    CHECK (led_status IN ('GREEN','AMBER','RED','GREY')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (office_id, level)
);

CREATE TABLE IF NOT EXISTS rooms (
  id          TEXT PRIMARY KEY,
  floor_id    TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
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

-- ── Devices ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS devices (
  id            TEXT PRIMARY KEY,
  room_id       TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  device_type   TEXT NOT NULL,
  name          TEXT NOT NULL,
  host          TEXT NOT NULL,
  port          INTEGER,
  web_ui_url    TEXT,
  status        TEXT NOT NULL DEFAULT 'GREY'
                  CHECK (status IN ('GREEN','AMBER','RED','GREY')),
  last_seen     TEXT,
  poll_interval INTEGER NOT NULL DEFAULT 30000,
  map_x         REAL,
  map_y         REAL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_devices_room ON devices(room_id);
CREATE INDEX IF NOT EXISTS idx_devices_type ON devices(device_type);

-- ── Device configs (versioned snapshots) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS device_configs (
  id           TEXT PRIMARY KEY,
  device_id    TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  version      INTEGER NOT NULL,
  config_json  TEXT NOT NULL,
  exported_at  TEXT NOT NULL DEFAULT (datetime('now')),
  note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_device_configs_device ON device_configs(device_id);

-- ── SSH device profiles (Crestron) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ssh_device_profiles (
  id                   TEXT PRIMARY KEY,
  device_id            TEXT NOT NULL UNIQUE REFERENCES devices(id) ON DELETE CASCADE,
  device_type          TEXT NOT NULL CHECK (device_type IN ('CP4','VC4')),
  prompt_pattern       TEXT NOT NULL,
  disconnect_cmd       TEXT NOT NULL,
  default_program_slot INTEGER
);

-- ── Events (append-only audit log) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  device_id   TEXT REFERENCES devices(id) ON DELETE SET NULL,
  room_id     TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('INFO','WARN','ERROR','CRITICAL')),
  message     TEXT NOT NULL,
  operator    TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_occurred ON events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_device   ON events(device_id);

-- ── Schema version ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);

INSERT INTO schema_version (version) VALUES (1);
