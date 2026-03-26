-- Migration 007: Add options_json column to devices for module-specific config
ALTER TABLE devices ADD COLUMN options_json TEXT;
