# Zoom Room Module

## Overview

The Zoom Room module monitors and controls Zoom Rooms hardware devices via the [Zoom REST API v2](https://marketplace.zoom.us/docs/api-reference/zoom-api/). It uses OAuth Server-to-Server authentication (no user login required).

## Prerequisites

- Zoom Rooms Pro or higher license
- Server-to-Server OAuth app in Zoom Marketplace with the following scopes:
  - `zoom_rooms:read:admin`
  - `zoom_rooms:write:admin`

## Configuration Fields

| Field | Description | Required |
|-------|-------------|----------|
| Account ID | Your Zoom account ID (found in Account Profile) | ✓ |
| Client ID | OAuth app Client ID | ✓ |
| Client Secret | OAuth app Client Secret (stored securely in OS keychain) | ✓ |
| Host / IP | Hostname or IP for display purposes (not used for API calls) | ✓ |
| Web UI URL | Optional URL to open in browser via "Open WebUI" action | — |

## LED Status Mapping

| Zoom Room Status | LED |
|-----------------|-----|
| All rooms Available | 🟢 GREEN |
| One or more rooms In Meeting | 🟡 AMBER |
| API unreachable / auth error | 🔴 RED |
| Module not yet connected | ⚫ GREY |

## Available Actions

- **Reboot** — Sends a reboot command to the Zoom Room hardware. Requires confirmation dialog. LED transitions to AMBER immediately; returns to GREEN on next successful ping.
- **Open WebUI** — Opens the device's web interface URL in your default browser (if `webUiUrl` is configured).
- **Download Config** — Exports current Zoom Room settings as a versioned JSON file.
- **Restore Config** — Restores a previously saved configuration. Requires confirmation to prevent accidental overwrite.

## Configuration Download Format

```json
{
  "deviceType": "zoom-room",
  "exportedAt": "2026-03-22T10:00:00Z",
  "version": 1,
  "rooms": [
    {
      "id": "abc123",
      "name": "Boardroom",
      "settings": { ... }
    }
  ]
}
```

## Polling

The module polls the Zoom API every 60 seconds by default (configurable in preferences). Each poll calls `GET /rooms` to check room availability status. On three consecutive failures, the LED transitions to RED.

## Troubleshooting

- **GREY LED after adding device**: Check that all three credentials (Account ID, Client ID, Client Secret) are entered correctly.
- **RED LED**: Verify network connectivity and that the Server-to-Server OAuth app has not expired. Check the event log for specific error messages.
- **Config download fails**: Confirm the `zoom_rooms:read:admin` scope is enabled on your OAuth app.
