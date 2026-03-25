# Data Model: LG Pro Display Module (spec 002)

**Branch**: `002-lg-pro-display` | **Date**: 2026-03-25 | **Phase**: 1 output

---

## SQLite Schema

No dedicated migration for LG displays — state is held entirely in-memory within `LGDisplayModule`. Device records live in the shared `devices` table (migration `001_initial.sql`).

```sql
-- Shared table (already exists — migration 001)
-- devices(id, room_id, device_type, label, host, port, options_json, created_at)
-- device_type = 'lg-display'
-- options_json fields for lg-display:
--   { "setId": 0, "pollInterval": 5000 }
```

---

## In-Memory State

```typescript
interface LGDeviceState {
  power:       'on' | 'off' | null   // null = not yet polled
  input:       string | null          // e.g. 'HDMI 1', 'HDMI 2', 'DisplayPort'
  screenMute:  boolean | null
  volumeMute:  boolean | null
  volume:      number | null          // 0–100
  connected:   boolean
}

interface ConnectedDevice {
  deviceId:     string
  config:       DeviceConfig
  transport:    LGTCPTransport
  state:        LGDeviceState
  pollTimer:    ReturnType<typeof setInterval> | null
  polled:       boolean               // true after first full poll cycle
}
```

---

## Device Registry Entry

```json
{
  "type": "lg-display",
  "label": "LG Pro Display",
  "protocol": "TCP",
  "defaultPort": 9761,
  "configFields": [
    { "key": "host",         "label": "IP Address",       "type": "string",  "required": true },
    { "key": "port",         "label": "TCP Port",         "type": "number",  "default": 9761 },
    { "key": "setId",        "label": "Set ID (0–99)",    "type": "number",  "default": 0 },
    { "key": "pollInterval", "label": "Poll Interval (ms)","type": "number", "default": 5000 }
  ]
}
```

---

## Input Source Map

| Hex Code | Label |
|----------|-------|
| `0x00` | DTV |
| `0x10` | AV |
| `0x20` | Component |
| `0x40` | HDMI 1 |
| `0x41` | HDMI 2 |
| `0x42` | HDMI 3 |
| `0x60` | DisplayPort |
| `0x90` | HDMI 4 |

---

## Status Points

| ID | Label | Alertable by default |
|----|-------|---------------------|
| `reachable` | Device Reachable | true |
| `power_on` | Power State | true |
| `screen_mute` | Screen Mute | false |
| `volume_mute` | Volume Mute | false |
