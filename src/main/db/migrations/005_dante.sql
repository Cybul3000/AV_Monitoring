-- AV Monitoring: Dante network audio device, channel, and subscription tables
-- Applied when schema version < 5

CREATE TABLE IF NOT EXISTS dante_devices (
  id              TEXT PRIMARY KEY,
  device_id       TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  dante_name      TEXT NOT NULL,
  display_name    TEXT,
  model           TEXT,
  ip_address      TEXT NOT NULL,
  mac_address     TEXT,
  arc_port        INTEGER NOT NULL DEFAULT 4440,
  sample_rate     INTEGER,
  encoding        INTEGER,
  latency_ns      INTEGER,
  tx_channel_count INTEGER NOT NULL DEFAULT 0,
  rx_channel_count INTEGER NOT NULL DEFAULT 0,
  is_avio         INTEGER NOT NULL DEFAULT 0 CHECK (is_avio IN (0,1)),
  last_heartbeat  TEXT,
  led_status      TEXT NOT NULL DEFAULT 'GREY'
                    CHECK (led_status IN ('GREEN','AMBER','RED','GREY')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dante_channels (
  id              TEXT PRIMARY KEY,
  dante_device_id TEXT NOT NULL REFERENCES dante_devices(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction IN ('tx','rx')),
  channel_number  INTEGER NOT NULL,
  channel_name    TEXT NOT NULL,
  factory_name    TEXT,
  gain_level      TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (dante_device_id, direction, channel_number)
);

CREATE TABLE IF NOT EXISTS dante_subscriptions (
  id              TEXT PRIMARY KEY,
  rx_device_id    TEXT NOT NULL REFERENCES dante_devices(id) ON DELETE CASCADE,
  rx_channel_id   TEXT NOT NULL REFERENCES dante_channels(id) ON DELETE CASCADE,
  tx_device_name  TEXT NOT NULL,
  tx_channel_name TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'unresolved'
                    CHECK (status IN ('connected','unresolved','self-loop','unsubscribed')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (rx_channel_id)
);

INSERT INTO schema_version (version) VALUES (5);
