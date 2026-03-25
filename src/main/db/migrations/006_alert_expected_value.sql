-- Add expected_value column to alert_rules for value-based alerts
-- (e.g. "alert if LG input source is not HDMI 1")
ALTER TABLE alert_rules ADD COLUMN expected_value TEXT;
