-- AV Monitoring: Biamp Tesira DSP block and preset configuration tables
-- Applied when schema version < 4

CREATE TABLE IF NOT EXISTS biamp_block_configs (
  id           TEXT PRIMARY KEY,
  device_id    TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  block_type   TEXT NOT NULL CHECK (block_type IN ('level', 'dialer')),
  instance_tag TEXT NOT NULL,
  label        TEXT NOT NULL,
  channel_count INTEGER NOT NULL DEFAULT 1,
  is_critical   INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (device_id, instance_tag)
);

CREATE TABLE IF NOT EXISTS biamp_preset_configs (
  id         TEXT PRIMARY KEY,
  device_id  TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (device_id, name)
);

INSERT INTO schema_version (version) VALUES (4);
