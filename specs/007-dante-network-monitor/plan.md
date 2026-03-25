# Implementation Plan: Dante Network Monitor — Architectural Consistency Refactor

**Branch**: `007-dante-network-monitor` | **Date**: 2026-03-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-dante-network-monitor/spec.md`

## Summary

Fix the architectural inconsistency in the Dante module: it currently operates as a network-wide mDNS monitor but was configured in the device registry and implementation code as if it connects to a single device by IP. The fix establishes the **singleton-gateway pattern** — one `devices` row per room represents the Dante network; all discovered Dante endpoints live in `dante_devices` only; `DanteModule` stores the anchor `deviceId` from `connect()` and returns a meaningful aggregate LED from `ping()`. No database migration is needed. Three source files change: the device registry JSON, `DanteModule.ts`, and the Dante module unit tests.

## Technical Context

**Language/Version**: TypeScript 5.x (Electron 30 main process, Node.js 20 LTS)
**Primary Dependencies**: No new dependencies — `os` (built-in, already used), `multicast-dns` (already in stack)
**Storage**: SQLite (`better-sqlite3`) — migration `005_dante.sql` unchanged; no new migration
**Testing**: Vitest (unit + integration)
**Target Platform**: macOS 12+ and Windows 10+ (cross-platform, no change)
**Project Type**: Refactor of existing Electron desktop app module
**Performance Goals**: `ping()` aggregate computation is O(N devices) in-memory — negligible overhead
**Constraints**: Must not break existing dante:* IPC channels; existing `dante_devices` schema unchanged
**Scale/Scope**: Typically ≤50 Dante devices per network segment

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Check | Notes |
|-----------|-------|-------|
| I. Module-First | ✅ PASS | All Dante communication remains inside `src/main/modules/dante/`. Module isolation unchanged. |
| II. Layered Hierarchy | ✅ PASS | Dante Network gateway row in `devices` participates in the five-level hierarchy. `ping()` now returns meaningful aggregate LED so hierarchy roll-up works correctly. |
| III. Verify, Never Assume | ✅ PASS | All design decisions confirmed in research.md (R-001 through R-007). No open questions. |
| IV. Test-First | ✅ PASS | Existing unit tests must be updated to assert the new `ping()` aggregate behaviour before implementation. TDD sequence enforced. |
| V. Device Registry | ✅ PASS | Registry entry `dante-network-audio` is the single SSoT entry. Module and registry entry remain in sync. No orphaned `dante-audio` entry. |
| VI. Configuration Integrity | ✅ N/A | Dante has no downloadable device configuration (no config backup format in ARC protocol). |
| VII. Observability | ✅ PASS | Discovery events, ping() aggregate, and device-offline transitions continue to be logged. |
| VIII. Cross-Platform | ✅ PASS | `os.networkInterfaces()` and `multicast-dns` are cross-platform. Interface-name resolution already handles macOS/Windows naming differences. |
| Protocol Confirmation (II.2a) | ✅ PASS | Protocol confirmed in spec 003: proprietary UDP/mDNS (ARC port 4440, Settings 8700, multicast 8702/8708). No protocol change in this refactor. |

**Post-design re-check**: All gates remain PASS after Phase 1 design. No new violations.

## Project Structure

### Documentation (this feature)

```text
specs/007-dante-network-monitor/
├── plan.md              # This file
├── research.md          # Phase 0 — design decisions R-001 to R-007
├── data-model.md        # Phase 1 — corrected entity model and registry entry
├── quickstart.md        # Phase 1 — verification checklist and file map
├── contracts/
│   └── dante-ipc-delta.md   # IPC behavioural changes (no new channels)
└── tasks.md             # Phase 2 output (/speckit.tasks — not yet generated)
```

### Source Code Changed by This Refactor

```text
resources/
└── device-registry.json             # Remove required host/arcPort; optional interface field

src/main/modules/dante/
└── DanteModule.ts                   # _anchorDeviceId; fix _onDeviceFound(); fix ping()

specs/003-dante-network-audio/
├── data-model.md                    # Add correction note on Key Entities section
└── plan.md                          # Add correction note on Constitution Check

tests/unit/dante/
└── DanteModule.test.ts              # Update ping() tests for aggregate LED behaviour
```

**No files added**. No migration file. No IPC handler changes. No renderer changes.

**Structure Decision**: Single-module refactor extending the existing Electron app. Follows the same pattern as all other device modules.

## Phase 0: Research Summary

All research decisions are documented in `research.md`. No external research agents were required — all decisions derive from the existing codebase analysis performed in the spec-007 `/speckit.analyze` session. Key decisions:

- **R-001**: Singleton-gateway pattern confirmed (one `devices` row = Dante network gateway)
- **R-002**: `devices.host` stores interface name or `""` — no migration needed
- **R-003**: `_anchorDeviceId` pattern fixes the broken `deviceId` linking
- **R-004**: `ping()` aggregate LED: no devices → GREY; any RED → RED; any AMBER → AMBER; all GREEN → GREEN; discovery ran + zero devices → AMBER
- **R-005**: No new migration — `005_dante.sql` schema is correct
- **R-006**: Device registry cleanup — single optional `host` field, no `arcPort`, no `dante-audio` entry
- **R-007**: Spec 003 artifacts need correction notes

## Phase 1: Design Summary

All design artifacts are complete:
- `data-model.md` — corrected entity model, LED aggregation table, `DanteDeviceState` correction
- `contracts/dante-ipc-delta.md` — no new channels; `device:status:all` now carries meaningful Dante LED
- `quickstart.md` — verification checklist

## Implementation Guidance

### `DanteModule.ts` — Three changes

**1. Add `_anchorDeviceId` field and store it in `connect()`**:

```typescript
private _anchorDeviceId: string | null = null

async connect(deviceId: string, config: DeviceConfig): Promise<void> {
  if (this._transport) return
  this._anchorDeviceId = deviceId
  const interfaceIp = resolveInterfaceIp(config.host)
  // ... rest unchanged
  this._discovery.start(interfaceIp)
  this._heartbeat.start(interfaceIp)
  this._notification.start(interfaceIp)
}
```

**2. Use `_anchorDeviceId` in `_onDeviceFound()`**:

```typescript
// Replace:
deviceId: randomUUID(),   // Will be overridden when linked to DB device record
// With:
deviceId: this._anchorDeviceId ?? randomUUID(),
```

**3. Rewrite `ping()` to return aggregate LED**:

```typescript
async ping(_deviceId: string): Promise<DeviceStatus> {
  const anchorId = this._anchorDeviceId ?? _deviceId

  if (this._devices.size === 0) {
    return { deviceId: anchorId, status: 'GREY', lastSeen: null }
  }

  let worstStatus: LEDStatus = 'GREEN'
  let latestSeen: string | null = null

  for (const state of this._devices.values()) {
    if (state.ledStatus === 'RED') { worstStatus = 'RED'; break }
    if (state.ledStatus === 'AMBER' && worstStatus !== 'RED') worstStatus = 'AMBER'
    if (state.ledStatus === 'GREY' && worstStatus === 'GREEN') worstStatus = 'GREY'
    if (state.lastHeartbeat) {
      const ts = state.lastHeartbeat.toISOString()
      if (!latestSeen || ts > latestSeen) latestSeen = ts
    }
  }

  // If discovery ran and found zero devices (size > 0 is false above), already handled.
  // Here all devices are known. Degrade to AMBER if all are GREY (discovered but not queried).
  if (worstStatus === 'GREY' && this._devices.size > 0) worstStatus = 'AMBER'

  return { deviceId: anchorId, status: worstStatus, lastSeen: latestSeen }
}
```

### `device-registry.json` — Final entry

```json
{
  "type": "dante-network-audio",
  "label": "Dante Network Audio",
  "module": "DanteModule",
  "protocol": "mDNS/UDP",
  "port": null,
  "configFields": [
    {
      "key": "host",
      "label": "Network Interface",
      "secret": false,
      "hint": "Interface name for Dante mDNS discovery (e.g. en0, eth0, Ethernet). Leave blank to discover on all interfaces."
    }
  ]
}
```

### `DanteModule.test.ts` — Ping aggregate tests

Existing test `'returns GREY status when no devices connected'` remains valid (empty map → GREY).

Add tests:
- When `connect('anchor-id', {})` called, `ping('anchor-id')` returns `deviceId: 'anchor-id'` (not a random UUID)
- When two discovered devices both GREEN → aggregate GREEN
- When one device AMBER → aggregate AMBER
- When one device RED → aggregate RED

### `specs/003-dante-network-audio/data-model.md` — Correction note

Add at the top of the Key Entities section:

```
> **Correction (spec 007)**: The description below originally stated "One physical Dante device
> maps to one app `devices` record". This is incorrect. The correct model is the
> singleton-gateway pattern: one `devices` row = the Dante Network gateway for the room;
> all discovered Dante endpoints are stored only in `dante_devices`.
> See `specs/007-dante-network-monitor/data-model.md` for the authoritative corrected model.
```

## Complexity Tracking

No constitution violations.
