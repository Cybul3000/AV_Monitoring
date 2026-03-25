-- AV Monitoring: Alert rules migration
-- Applied on first run if database version < 2

CREATE TABLE IF NOT EXISTS alert_rules (
  device_type   TEXT NOT NULL,
  status_point  TEXT NOT NULL,
  alert_enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (device_type, status_point)
);
