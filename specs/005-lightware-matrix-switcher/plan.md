# Implementation Plan: Lightware Matrix Switcher — LW3 Monitor & Control

**Branch**: `005-lightware-matrix-switcher` | **Date**: 2026-03-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-lightware-matrix-switcher/spec.md`

## Summary

Add a `LightwareModule` to the AV monitoring desktop app that connects to Lightware MX2, MMX, and MODEX series matrix switchers via the LW3 (Lightware Protocol v3) raw TCP protocol on port 6107. The module monitors signal lock state per port, tracks input-to-output routing, supports routing switch commands and preset recall, and reports hardware health (temperature, fan). Real-time routing and signal changes are received via LW3 `OPEN`/`CHG` subscriptions; health properties are polled on the configured interval. The module detects device family from `ProductName` on connect to select the correct node paths for MX2 vs. MMX/MODEX variants.

## Technical Context

**Language/Version**: TypeScript 5.x — Electron 30 (main process, Node.js 20 LTS) + React 18 (renderer)
**Primary Dependencies**: `electron` 30, `react` 18, Node.js `net` (built-in — raw TCP socket), `better-sqlite3` 9.x, `electron-store` 9.x, `keytar`, `vite` (renderer HMR)
**Storage**: SQLite (local, `better-sqlite3`) — device records, events audit log
**Testing**: Vitest (unit + integration), Playwright (E2E cross-platform)
**Target Platform**: macOS 12+, Windows 10+ (cross-platform desktop, Electron)
**Project Type**: Desktop application (Electron)
**Performance Goals**: Signal lock state and routing reported within one polling interval (10 s default, SC-001/SC-002); routing switch confirmed within one polling interval (SC-002); TCP disconnect detected within 15 s and reconnect attempted automatically (SC-004)
**Constraints**: Cross-platform (macOS + Windows, no platform-specific workarounds in app-layer code); offline-capable (local SQLite only); credentials stored in OS keychain via `keytar`; no external npm package for LW3 — implemented using Node.js built-in `net.Socket`
**Scale/Scope**: Up to ~50 monitored Lightware devices per deployment; dynamic port enumeration (no hardcoded port counts)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Module-First Architecture | ✅ PASS | `LightwareModule` is a dedicated self-contained module in `src/main/modules/lightware/`. No LW3 logic outside this module. Primary reference: Bitfocus Companion ecosystem + `/resources/lightware/` protocol docs per constitution §Resources. |
| II. Layered Hierarchy | ✅ N/A | Lightware devices are leaf-level items inside a room. No hierarchy level is added or bypassed. |
| III. Verify, Never Assume | ✅ PASS | All protocol details resolved via `/resources/lightware/ucx-series-protocol.md`, `ucx-tpx-series-protocol.md`, and Bitfocus Companion module analysis. One spec/protocol gap noted (see §Authentication below) and addressed explicitly. No open items remain. |
| IV. Test-First | ✅ PASS | TDD mandatory. Unit tests for `LightwareModule` and `LightwareLW3Transport` written first; integration test covers IPC round-trips; E2E Playwright smoke test covers device detail open → signal lock state → routing switch flow. |
| V. Device Registry as SSoT | ✅ PASS | `lightware-matrix` entry present in `resources/device-registry.json` (added in previous session, per data-model.md). Module and registry entry created in the same step. |
| VI. Configuration Integrity | ✅ N/A | Lightware devices have no downloadable configuration in v1. `downloadConfig` / `restoreConfig` return empty objects. |
| VII. Observability Built-In | ✅ PASS | All LW3 lifecycle events (connect, disconnect, routing switch, preset recall, signal state changes, errors) written to `events` SQLite table with timestamp, severity, and device source. |
| VIII. Cross-Platform by Default | ✅ PASS | Node.js `net.Socket` is cross-platform — no native bindings, no OS-specific TCP behaviour in app-layer code. |

**Quality gates (pre-implementation):**
- ✅ Protocol confirmation on record: LW3 over TCP port 6107 (raw ASCII, line-based; confirmed from `/resources/lightware/` manuals and Bitfocus Companion module)
- ✅ Registry entry before module work: `lightware-matrix` present in `resources/device-registry.json`
- ✅ No `NEEDS CLARIFICATION` items remain

### Authentication Gap (Spec FR-002 vs. Protocol Reality)

The spec states the module MUST authenticate with username/password stored in the OS keychain. Research against the Lightware protocol documentation reveals that **LW3 raw TCP port 6107 does not perform a protocol-level authentication handshake**. Authentication (HTTP Basic) is only used on the WebSocket Secure (WSS, port 443) transport, which is out of scope for v1.

**Resolution**:
- Credentials (`username`, `password`) are stored in the OS keychain under `av-monitoring:lightware:<deviceId>` per constitution §Security, as specified. This preserves the keychain pattern and allows future WSS transport without a schema change.
- On raw TCP connections (port 6107), no credentials are sent over the wire — this is correct protocol behaviour, not a security omission.
- The in-app device configuration form still collects username and password for completeness (stored silently). An operator-visible note in the device form states: "Credentials are not used for LW3 TCP connections; stored for future authenticated transport."
- This is not a constitution violation: constitution §Security requires credentials to be stored in keychain, which is satisfied. It does not require them to be used on every transport.

**No violations to justify. Complexity Tracking table omitted.**

**Post-Phase-1 re-check**: All Phase 1 design artifacts confirmed consistent with the above. No new violations introduced.

## Project Structure

### Documentation (this feature)

```text
specs/001-av-room-monitor/        # ← Whole-app foundation artifacts live here
├── plan.md                       # Foundation plan (app shell + data layer + Zoom module)
├── research.md                   # Phase 0 — tech stack decisions R-001 to R-010 (whole app)
├── data-model.md                 # Phase 1 — SQLite schema, DeviceModule interface, device registry
├── quickstart.md                 # Phase 1 — dev setup, npm commands, project structure
└── contracts/
    └── ipc-channels.md           # Phase 1 — all Electron main↔renderer IPC contracts

specs/005-lightware-matrix-switcher/
├── plan.md              # This file (/speckit.plan command output)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)

resources/lightware/
├── ucx-series-protocol.md        # LW3 command reference (UCX series)
├── ucx-tpx-series-protocol.md    # LW3 command reference (UCX-TPX series)
├── UCX_series_UserManual.pdf     # Device user manual
└── UCX-TPX_series_UserManual.pdf # Device user manual
```

### Source Code (repository root)

```text
src/
├── main/
│   ├── modules/
│   │   ├── _base/
│   │   │   └── DeviceModule.ts             # Shared interface (Agent B prerequisite)
│   │   └── lightware/                      # ← THIS FEATURE
│   │       ├── LightwareModule.ts          # Implements DeviceModule; owns connection lifecycle,
│   │       │                               #   polling, status aggregation, sendCommand dispatch
│   │       ├── LightwareLW3Transport.ts    # Raw net.Socket wrapper: ID-tagged command queue,
│   │       │                               #   line parser, {/} block collector, CHG dispatcher,
│   │       │                               #   reconnect with exponential backoff
│   │       └── LightwareDeviceState.ts     # Typed state model: ports, routing, presets,
│   │                                       #   health, device identity
│   └── ipc/
│       └── device-handlers.ts              # Existing IPC handler — no new channels needed
│                                           #   (sendCommand covers routing switch & preset recall)
├── renderer/
│   ├── components/
│   │   └── DeviceDetail/
│   │       └── LightwarePanel/             # ← THIS FEATURE (renderer)
│   │           ├── LightwarePanel.tsx      # Port signal lock grid + routing map
│   │           ├── RoutingMatrix.tsx       # Visual input→output crosspoint display
│   │           ├── PortRow.tsx             # Single port row: label, lock status, LED
│   │           └── PresetList.tsx          # Preset name list with recall button
│   └── menu/
│       └── docs/
│           └── lightware.md               # In-app documentation page
└── shared/
    └── ipc-types.ts                        # Shared IPC payload types (extended for Lightware)

resources/
├── device-registry.json                    # Includes lightware-matrix entry (already added)
└── lightware/
    ├── ucx-series-protocol.md
    └── ucx-tpx-series-protocol.md

tests/
├── unit/
│   └── lightware/
│       ├── LightwareModule.test.ts         # Unit: connect, disconnect, ping, LED aggregation,
│       │                                   #   device-family branch (MX2 vs. MMX/MODEX)
│       └── LightwareLW3Transport.test.ts   # Unit: line parser, block collector, CHG events,
│                                           #   ID tagging, NACK handling, reconnect logic
├── integration/
│   └── lightware/
│       └── lightware-ipc.test.ts           # IPC round-trip: device:status:all with mock LW3 server
└── e2e/
    └── lightware.spec.ts                   # Playwright: device panel open → port signal status
                                            #   displayed → routing switch confirmed
```

**Structure Decision**: Single-project Electron app (Option 1). All LW3 communication is encapsulated in `src/main/modules/lightware/`. The renderer panel in `src/renderer/components/DeviceDetail/LightwarePanel/` consumes device state via the existing `device:status:all` IPC broadcast — no new IPC channels needed for polling. Routing switch and preset recall go through the existing `device:command` IPC channel (already defined in `contracts/ipc-channels.md`).

## Phase 0: Research

All unknowns resolved. See [research.md](../001-av-room-monitor/research.md) for whole-app decisions. Lightware-specific research below.

### R-LW-001: LW3 TCP Transport — Node.js Implementation

**Decision**: Node.js built-in `net.Socket` wrapped in a `LightwareLW3Transport` class (~150 lines TypeScript). No external npm package.

**Rationale**:
- LW3 is a simple ASCII line-based protocol (CR+LF delimited). A `net.Socket` with a line-splitter buffer covers everything needed.
- The only candidate npm package (`lwnoodle`) is unofficial, has zero dependents, and is undocumented for production use.
- A purpose-built transport class gives full control over: ID-tagged command correlation, multi-line `{/}` block collection, `CHG` event emission, and reconnect backoff — none of which are handled cleanly by a generic package.

**Protocol connection:**
```
Host: <device-ip>
Port: 6107
Transport: raw TCP (net.createConnection)
Line terminator: \r\n
No TLS, no handshake banner — send commands immediately after connect
```

**Alternatives considered**:
- `lwnoodle` npm: unofficial, zero dependents, no production usage evidence.
- UCX Series REST API: Out of scope for v1 per spec Assumptions; REST is only available on newer UCX firmware.

---

### R-LW-002: Device Family Detection (MX2 vs. MMX/MODEX)

**Decision**: Issue `GET /.ProductName\r\n` as the very first command after every TCP connection (including reconnects). Parse the result to determine the device family and select the correct LW3 node paths for all subsequent operations.

| Device family | Crosspoint path | Preset path |
|--------------|----------------|-------------|
| MX2 series | `/MEDIA/XP/VIDEO` | `/MEDIA/PRESET/<name>:load()` |
| MMX / MODEX / general | `/MEDIA/VIDEO/XP` | `/PRESETS/AVC:load(<index>)` |

**Rationale**: The MX2 and MMX/MODEX families use different node tree layouts for the crosspoint and preset nodes. This difference is confirmed in `/resources/lightware/ucx-tpx-series-protocol.md` and the Bitfocus Companion module source, which explicitly branches on `ProductName`. Failure to detect device family results in `nE` errors on every routing command.

---

### R-LW-003: Real-Time Events vs. Polling Strategy

**Decision**: Hybrid approach — OPEN/CHG subscriptions for routing and signal changes; periodic polling for health properties.

**On connect (after device-family detection):**
1. `GETALL /MEDIA/VIDEO` — initial snapshot of all port signal states and labels.
2. `GET /MEDIA/VIDEO/XP.DestinationConnectionList` (or `/MEDIA/XP/VIDEO` for MX2) — full routing state in one round-trip.
3. `GET /.FirmwareVersion`, `GET /.SerialNumber`, `GET /.DeviceLabel` — device identity.
4. `GET /PRESETS/AVC/*.Name` (or `GETALL /MEDIA/PRESET` for MX2) — preset list.
5. `OPEN /MEDIA/VIDEO` + `OPEN /MEDIA/VIDEO/XP` (or MX2 equivalents) — subscribe to signal and routing changes.

**Polling interval (default 10 s, FR-003):**
- `GET /SYS.Temperature` — hardware temperature (treat `pE` as `unknown`).
- `GET /SYS.FanStatus` — fan status (treat `pE` as `unknown`).

**On disconnect:** Mark all ports unknown, cancel subscriptions (implicit on TCP close), begin reconnect with exponential backoff (1 s → 2 s → 4 s → … → 30 s max), re-send `OPEN` commands after successful reconnect.

**Rationale**: `CHG` events provide sub-second routing and signal updates without polling load. Health properties are not emitted as change events, so require periodic polling. `DestinationConnectionList` returns the full crosspoint map in one response line — significantly more efficient than N per-output `GET` queries.

---

### R-LW-004: Authentication Reality vs. Spec FR-002

**Decision**: Store credentials in keychain but do not send them over LW3 TCP. See §Authentication Gap in Constitution Check above.

**Credentials keychain key**: `av-monitoring:lightware:<deviceId>`

---

### R-LW-005: NACK / Error Handling — FR-012

LW3 error response prefixes:

| Prefix | Meaning | Module behaviour |
|--------|---------|-----------------|
| `pE` | Property error (path/value invalid) | Log WARN; maintain last known state; for health: mark `unknown` |
| `mE` | Method error (method not found) | Log ERROR; surface to operator |
| `mF` | Method failed (runtime failure) | Log ERROR; do not update routing state; surface to operator |
| `nE` | Node error (path not found) | Log ERROR; may indicate wrong device family branch |

The Companion module also checks for lines starting with `'E'` as a catch-all error prefix (older firmware). Both patterns are handled.

---

### R-LW-006: LW3 Command ID Tagging

**Decision**: Prefix every outgoing command with a 4-digit hex counter `XXXX#` to correlate responses to requests when multiple commands are in flight.

```typescript
// Example: "0017#GET /MEDIA/VIDEO/XP.DestinationConnectionList\r\n"
// Response: "{ 0017\npw /MEDIA/VIDEO/XP.DestinationConnectionList=I3:O1;I1:O2\n}"
```

Counter wraps from `0001` to `9999`. Pending commands stored in a `Map<string, PendingCommand>` keyed by ID. Untagged lines (e.g. `CHG`) are dispatched as events, not matched to pending commands.

**Rationale**: Required for correct parsing when the module has multiple outstanding commands (e.g., health poll fires while a routing switch is in progress). The Companion module uses the same approach.

---

**No NEEDS CLARIFICATION items. Phase 0 gate: PASS.**

## Phase 1: Design & Contracts

### Data Model

See [data-model.md](../001-av-room-monitor/data-model.md) for the full SQLite schema. Key tables for this feature:

**`devices`** — master device record with `device_type = 'lightware-matrix'`, `host` (IP), `port = 6107`, `status` (LED).

**`events`** — append-only audit log; LW3 lifecycle events written with severity `INFO`/`WARN`/`ERROR`/`CRITICAL`.

No Lightware-specific profile table is needed (equivalent of `ssh_device_profiles`). All configuration required (host, port, credentials) is captured in the `devices` row and keychain.

**Device LED Status Logic:**

| Condition | LED |
|-----------|-----|
| All polled ports have signal locked | GREEN |
| One or more input ports have no signal (unlocked) | AMBER |
| Hardware fault reported (temperature warning, fan fault) | AMBER |
| Critical hardware failure | RED |
| TCP disconnection / all ports unknown | RED |
| Device not yet polled | GREY |

**Port State Model (in-memory, `LightwareDeviceState.ts`):**

```typescript
interface PortState {
  portId: string;          // 'I1', 'I2', 'O1', 'O2', etc.
  direction: 'input' | 'output';
  label: string;           // user-assigned label from device
  signalLocked: boolean | null;  // null = unknown
  connectedSource: string | null; // 'I3', '0' (disconnected), or null
}

interface LightwareState {
  deviceId: string;
  productName: string | null;
  firmwareVersion: string | null;
  serialNumber: string | null;
  deviceFamily: 'MX2' | 'MMX' | 'unknown';
  ports: Map<string, PortState>;
  presets: Array<{ index: number; name: string }>;
  temperature: number | null;    // °C, null if unsupported
  fanStatus: string | null;      // 'OK', 'FAULT', or null if unsupported
  connected: boolean;
}
```

**Device Status State Machine:**
```
GREY ──► AMBER (TCP connecting)
AMBER ──► GREEN (connect + GETALL success, all signal ports locked)
AMBER ──► RED   (TCP refused or timeout after 15 s)
GREEN ──► AMBER (one or more input ports lose signal lock)
GREEN ──► RED   (TCP disconnection detected)
RED   ──► AMBER (TCP reconnected, initial GETALL in progress)
AMBER ──► GREEN (GETALL complete, all signal ports locked)
```

### IPC Contracts

See [contracts/ipc-channels.md](../001-av-room-monitor/contracts/ipc-channels.md). No new IPC channels are required for this feature. All state is delivered via the existing `device:status:all` broadcast. Control actions use the existing `device:command` request/reply channel.

**`device:command` payloads for Lightware:**

| `command` | `params` | Effect |
|-----------|----------|--------|
| `switch` | `{ input: 'I2', output: 'O1' }` | Route input I2 to output O1 |
| `switchAll` | `{ input: 'I2' }` | Route input I2 to all outputs |
| `disconnect` | `{ output: 'O1' }` | Disconnect output O1 |
| `recallPreset` | `{ name: 'Presentation Mode' }` or `{ index: 1 }` | Recall named or indexed preset |
| `ping` | — | Immediate status re-poll |

**`DeviceStatus.meta` shape for Lightware (returned in `device:status:all`):**

```typescript
meta: {
  productName: string;
  firmwareVersion: string;
  serialNumber: string;
  ports: Array<{
    portId: string;
    direction: 'input' | 'output';
    label: string;
    signalLocked: boolean | null;
    connectedSource: string | null;
  }>;
  presets: Array<{ index: number; name: string }>;
  temperature: number | null;
  fanStatus: string | null;
}
```

### LW3 Command Reference

| Action | MX2 command | MMX/MODEX command |
|--------|-------------|-------------------|
| Device identity | `GET /.ProductName` | `GET /.ProductName` |
| Firmware version | `GET /.FirmwareVersion` | `GET /.FirmwareVersion` |
| Serial number | `GET /.SerialNumber` | `GET /.SerialNumber` |
| Enumerate all ports | `GETALL /MEDIA/VIDEO` | `GETALL /MEDIA/VIDEO` |
| Full routing snapshot | `GET /MEDIA/XP/VIDEO.DestinationConnectionList` | `GET /MEDIA/VIDEO/XP.DestinationConnectionList` |
| Subscribe to routing+signal changes | `OPEN /MEDIA/XP/VIDEO` + `OPEN /MEDIA/VIDEO` | `OPEN /MEDIA/VIDEO/XP` + `OPEN /MEDIA/VIDEO` |
| Route switch | `CALL /MEDIA/XP/VIDEO:switch(I2:O1)` | `CALL /MEDIA/VIDEO/XP:switch(I2:O1)` |
| Route disconnect | `CALL /MEDIA/XP/VIDEO:switch(0:O1)` | `CALL /MEDIA/VIDEO/XP:switch(0:O1)` |
| List presets | `GETALL /MEDIA/PRESET` | `GET /PRESETS/AVC/*.Name` |
| Recall preset | `CALL /MEDIA/PRESET/<name>:load()` | `CALL /PRESETS/AVC:load(<index>)` |
| Temperature | `GET /SYS.Temperature` | `GET /SYS.Temperature` |
| Fan status | `GET /SYS.FanStatus` | `GET /SYS.FanStatus` |

### Agent Context

`CLAUDE.md` updated by `update-agent-context.sh` after plan completion.

### Quickstart

See [quickstart.md](../001-av-room-monitor/quickstart.md) for full developer onboarding. Lightware-specific notes:

- **Unit tests** use a mock `net.Socket` that emits pre-scripted LW3 response lines; no real device needed.
- **Integration tests** use a lightweight Node.js TCP mock server (`LW3MockServer`) that listens on a random port and responds to `GET`/`GETALL`/`CALL`/`OPEN` with canned LW3 responses.
- **Manual testing** requires a real Lightware MX2, MMX, or MODEX device on the LAN (or VPN). The device must have TCP port 6107 accessible and LW3 enabled.
- **Resources**: Protocol command reference in `/resources/lightware/ucx-series-protocol.md` and `/resources/lightware/ucx-tpx-series-protocol.md`.
- **Bitfocus Companion reference**: `https://github.com/bitfocus/companion-module-lightware-lw3` — command patterns, error handling, and device-family branching logic.
