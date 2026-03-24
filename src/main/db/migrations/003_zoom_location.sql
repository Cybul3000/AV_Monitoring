-- AV Monitoring: Zoom location/room ID migration
-- Applied on first run if database version < 3

ALTER TABLE offices ADD COLUMN zoom_location_id TEXT;
ALTER TABLE devices ADD COLUMN zoom_room_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_zoom_room_id ON devices(zoom_room_id) WHERE zoom_room_id IS NOT NULL;
