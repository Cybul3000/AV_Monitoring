# IPC Contract Delta — Dante Network Monitor Refactor (spec 007)

*This document records only the changes to existing IPC contracts. Full dante:* IPC contracts are in `specs/003-dante-network-audio/contracts/dante-ipc.md`.*

---

## No New IPC Channels

No new IPC channels are introduced by this refactor. All existing `dante:*` channels remain as specified in spec 003.

---

## Behavioural Changes to Existing Channels

### `device:status:all` broadcast (changed behaviour)

**Channel**: Push from main → renderer (existing, spec 001)

**Previous behaviour**: `DanteModule.ping()` would search for a `DanteDeviceState` whose `deviceId` matched the `deviceId` passed to `ping()`. Because `state.deviceId` was always a dangling `randomUUID()` (never linked to the DB record), the match never succeeded. `ping()` returned `status: 'GREY'` unconditionally.

**New behaviour**: `DanteModule.ping()` returns an aggregated LED status across all discovered Dante devices. The `deviceId` in the return value is always the anchor device ID (from `this._anchorDeviceId`). The LED rolls up as: no devices → GREY; any RED device → RED; any AMBER device → AMBER; all GREEN → GREEN.

**Impact on broadcast**: The Dante Network gateway row now correctly contributes a meaningful LED to the `device:status:all` broadcast, enabling the room, floor, and hierarchy LEDs to reflect Dante network health.

---

### `device:command` — `scan` command (unchanged)

The `scan` command (`device:command` with `command: 'scan'`) calls `DanteModule.sendCommand(deviceId, 'scan')`. Behaviour is unchanged — triggers a fresh mDNS query and re-queries all known devices.

---

## `dante:scan` IPC channel (unchanged)

The `dante:scan` IPC channel (if present in spec 003 handler) is unchanged.

---

## Config UI Behaviour (changed)

**Config form for dante-network-audio**: Previously showed "IP Address" (required) and "ARC Port". Now shows only "Network Interface" (optional, with hint text). The `host` DB column stores the interface name or empty string. No migration needed.

**User-visible change**: When adding a Dante Network device to a room, the operator sees only one optional field. They can leave it blank to discover on all interfaces.
