# Implementation Plan: Biamp Tesira DSP — TTP Monitor & Control

**Branch**: `006-biamp-tesira-dsp` | **Date**: 2026-03-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-biamp-tesira-dsp/spec.md`

## Summary

Add a `BiampTesiraModule` to the AV monitoring desktop app that connects to Biamp Tesira DSP devices (SERVER, FORTE, FLEX) via TTP (Tesira Text Protocol) over SSH (preferred, port 22) or Telnet (fallback, port 23). The module monitors system fault state, polls configured LevelControl block gain and mute states using TTP subscriptions, supports mute/gain control commands, allows preset recall by name, and optionally monitors VoIP dialer call state. Transport uses `ssh2` 1.x (already in the project stack) for SSH connections, with a Telnet fallback via `net.Socket` plus IAC option negotiation. TTP responses use a Biamp-specific quasi-JSON format (space-delimited, not comma-separated) requiring a custom response parser.

## Technical Context

**Language/Version**: TypeScript 5.x — Electron 30 (main process, Node.js 20 LTS) + React 18 (renderer)
**Primary Dependencies**: `electron` 30, `react` 18, `ssh2` 1.x (SSH transport — already in stack), Node.js `net` (Telnet fallback), `better-sqlite3` 9.x, `electron-store` 9.x, `keytar`, `vite` (renderer HMR)
**Storage**: SQLite (local, `better-sqlite3`) — device records, events audit log, block configs, preset configs
**Testing**: Vitest (unit + integration), Playwright (E2E cross-platform)
**Target Platform**: macOS 12+, Windows 10+ (cross-platform desktop, Electron)
**Project Type**: Desktop application (Electron)
**Performance Goals**: System fault state reflected within one polling interval (SC-001, default 15 s); gain/mute state polled within two polling intervals of connect (SC-002); preset recall confirmed within two polling intervals (SC-003); disconnection detected within 20 s with automatic reconnect (SC-004); mute/gain command confirmed within one polling interval (SC-005)
**Constraints**: Cross-platform (macOS + Windows); offline-capable (local SQLite only); credentials stored in OS keychain via `keytar`; no external npm package for TTP — SSH via `ssh2` (already in stack), Telnet via built-in `net.Socket`; block names (LevelControl, dialer) and preset names are operator-configured at device setup time — not auto-discovered via TTP
**Scale/Scope**: Up to ~50 monitored Tesira devices per deployment; per-device variable number of monitored LevelControl and dialer blocks

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Module-First Architecture | ✅ PASS | `BiampTesiraModule` is a dedicated self-contained module in `src/main/modules/biamp-tesira/`. No TTP logic outside this module. Primary reference: `/resources/biamp/tesira-ttp-protocol.md` per constitution §Resources. |
| II. Layered Hierarchy | ✅ N/A | Tesira devices are leaf-level items inside a room. No hierarchy level is added or bypassed. |
| III. Verify, Never Assume | ✅ PASS | All protocol details resolved from `/resources/biamp/tesira-ttp-protocol.md`. Two spec gaps identified and resolved (see §Spec Gaps below). No open items remain. |
| IV. Test-First | ✅ PASS | TDD mandatory. Unit tests for `BiampTesiraModule` and `TTPTransport` written first; integration tests cover IPC round-trips with a mock TTP server; E2E Playwright smoke test covers device detail → fault status → mute command flow. |
| V. Device Registry as SSoT | ✅ PASS | `biamp-tesira` entry present in `resources/device-registry.json` (added in previous session, per data-model.md). Module and registry entry created in the same step. |
| VI. Configuration Integrity | ✅ N/A | Tesira devices have no downloadable configuration in v1. `downloadConfig` / `restoreConfig` return empty objects. |
| VII. Observability Built-In | ✅ PASS | All TTP lifecycle events (connect, disconnect, fault changes, mute/gain commands, preset recalls, errors) written to `events` SQLite table with timestamp, severity, and device source. |
| VIII. Cross-Platform by Default | ✅ PASS | `ssh2` and Node.js `net.Socket` are both cross-platform. No OS-specific workarounds in app-layer code. |

### Spec Gaps Resolved by Research

**Gap 1 — Transport: Spec says port 23 (Telnet); protocol recommends SSH**

The spec (FR-001) specifies Telnet/TCP port 23 as the default. The Biamp protocol reference (`/resources/biamp/tesira-ttp-protocol.md`) explicitly states SSH (port 22) is the **recommended** production transport; Telnet is a fallback requiring IAC option negotiation and sending credentials in plaintext.

**Resolution**: SSH is the primary transport (port 22 via `ssh2`). Telnet (port 23 via `net.Socket` + IAC negotiation) is supported as a fallback. The device `port` field in the `devices` table determines which transport is used: `port = 22` → SSH, `port = 23` → Telnet. The default in `device-registry.json` is updated to port 22 (SSH). This is consistent with FR-002's credential requirement — SSH encrypts credentials, Telnet exposes them in plaintext. No constitution violation.

**Gap 2 — Preset listing: No TTP command to enumerate presets**

The spec (FR-010) states the module MUST list all named presets. Research of the TTP protocol reference reveals **no TTP command exists to enumerate saved presets** — there is no `listPresets`, `getPresets`, or equivalent. The spec's own Assumptions already state: "Preset names are read from the device at startup" — but this is not achievable via TTP.

**Resolution**: Preset names are **operator-configured** at device setup time, stored in a `biamp_preset_configs` SQLite table (see Data Model). The operator adds preset names during device configuration in the app; the module uses these to issue `recallPresetByName` commands. This is consistent with the LevelControl block path pattern already required by the spec. No auto-discovery is possible or attempted. The UI shows the operator-configured preset list, not a device-queried list. The in-app documentation (`biamp-tesira.md`) explains this explicitly.

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

specs/006-biamp-tesira-dsp/
├── plan.md              # This file (/speckit.plan command output)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)

resources/biamp/
└── tesira-ttp-protocol.md        # TTP command reference (primary protocol source)
```

### Source Code (repository root)

```text
src/
├── main/
│   ├── db/
│   │   └── migrations/
│   │       └── 002_biamp_configs.sql       # Adds biamp_block_configs and biamp_preset_configs tables
│   ├── modules/
│   │   ├── _base/
│   │   │   └── DeviceModule.ts             # Shared interface (Agent B prerequisite)
│   │   └── biamp-tesira/                   # ← THIS FEATURE
│   │       ├── BiampTesiraModule.ts        # Implements DeviceModule; owns connection lifecycle,
│   │       │                               #   fault polling, subscription management, LED aggregation
│   │       ├── TTPTransport.ts             # SSH (ssh2) / Telnet (net.Socket + IAC) transport;
│   │       │                               #   line parser, quasi-JSON decoder, reconnect backoff,
│   │       │                               #   subscription push demuxer
│   │       └── TesiraDeviceState.ts        # Typed in-memory state: faults, blocks, presets, identity
│   └── ipc/
│       └── device-handlers.ts              # Existing IPC handler — no new channels needed
├── renderer/
│   ├── components/
│   │   └── DeviceDetail/
│   │       └── BiampTesiraPanel/           # ← THIS FEATURE (renderer)
│   │           ├── BiampTesiraPanel.tsx    # Fault list + block grid + preset list
│   │           ├── FaultList.tsx           # Active system fault display
│   │           ├── LevelBlockRow.tsx       # Gain slider + mute toggle for one LevelControl block
│   │           ├── DialerStatus.tsx        # Call state + privacy mute indicator
│   │           └── PresetList.tsx          # Preset name list with recall button
│   └── menu/
│       └── docs/
│           └── biamp-tesira.md            # In-app documentation page
└── shared/
    └── ipc-types.ts                        # Extended with Biamp-specific meta shape

resources/
├── device-registry.json                    # Includes biamp-tesira entry (already added)
└── biamp/
    └── tesira-ttp-protocol.md

tests/
├── unit/
│   └── biamp-tesira/
│       ├── BiampTesiraModule.test.ts       # Unit: connect, disconnect, ping, fault→LED mapping,
│       │                                   #   gain clamp, transport-type branch (SSH vs Telnet)
│       └── TTPTransport.test.ts            # Unit: quasi-JSON parser, IAC negotiation (Telnet),
│                                           #   subscription demux, error prefix handling (-ERR /
│                                           #   -CANNOT_DELIVER / -GENERAL_FAILURE),
│                                           #   combined push+ack line splitting
├── integration/
│   └── biamp-tesira/
│       └── biamp-ipc.test.ts               # IPC round-trip with mock TTP server (SSH mode)
└── e2e/
    └── biamp-tesira.spec.ts                # Playwright: device panel → fault status → mute command
```

**Structure Decision**: Single-project Electron app (Option 1). All TTP communication encapsulated in `src/main/modules/biamp-tesira/`. Renderer panel consumes state via existing `device:status:all` IPC broadcast. Control actions (mute, gain, preset recall) go through existing `device:command` IPC channel. Two new migration tables (`biamp_block_configs`, `biamp_preset_configs`) store the operator-configured block instance tags and preset names.

## Phase 0: Research

All unknowns resolved. See [research.md](../001-av-room-monitor/research.md) for whole-app decisions. Biamp Tesira-specific research below.

### R-BT-001: TTP Transport — SSH vs. Telnet

**Decision**: SSH primary (port 22 via `ssh2` 1.x), Telnet fallback (port 23 via `net.Socket` + IAC negotiation). Transport selected by the `port` field on the device record.

**Rationale**: `ssh2` is already in the project's dependency stack (spec 004, Crestron SSH) — zero additional dependency cost. SSH encrypts credentials; Telnet sends username/password in plaintext, violating the constitution's credential security principle. Telnet is retained for devices where SSH is disabled.

**SSH connect sequence:**
```
new ssh2.Client()
  .connect({ host, port: 22, username, password })
  .on('ready', () => client.shell({}, callback))
  .on('error', handleError)
// After SSH auth: shell stream is ready immediately. Send SESSION set verbose true.
```

**Telnet connect sequence (port 23):**
```
const socket = net.createConnection(23, host)
// Respond to each IAC negotiation byte:
//   IAC WILL <X>  → reply: IAC DON'T <X>  (0xFF 0xFE <X>)
//   IAC DO <X>    → reply: IAC WON'T <X>  (0xFF 0xFC <X>)
// Wait for banner: "\r\n Welcome to the Tesira Text Protocol Server \r\n"
// If protected: respond to username/password prompts from plaintext lines.
// Session ready. Send SESSION set verbose true.
```

**Alternatives considered**: Telnet-only (spec default) — sends credentials in plaintext, rejected for production security. REST API (newer firmware) — out of scope for v1.

---

### R-BT-002: TTP Command Syntax

Commands are case-sensitive, space-delimited, LF-terminated. Instance tags with spaces must be double-quoted.

```
# Attribute commands (read/modify DSP block parameters):
InstanceTag get    Attribute [Index]
InstanceTag set    Attribute [Index] Value
InstanceTag toggle Attribute [Index]
InstanceTag subscribe   Attribute [Index] CustomLabel [IntervalMs]
InstanceTag unsubscribe Attribute [Index] CustomLabel

# Service commands (system-wide):
DEVICE get deviceInfo
DEVICE get activeFaultList
DEVICE recallPresetByName "Preset Name"
SESSION get aliases          ← enumerate all instance tags in the design
SESSION set verbose true     ← ensure full response payloads (send immediately after connect)
```

**Always issue `SESSION set verbose true` immediately after connect** before any other command.

---

### R-BT-003: Response Format — Quasi-JSON Parser Required

TTP responses are **not** standards-compliant JSON. Multi-field payloads use space-delimited key-value pairs (not comma-delimited). `JSON.parse()` will fail on multi-field responses.

| Prefix | Type | Example |
|--------|------|---------|
| `+OK` | Success (no value) | `+OK` |
| `+OK "value":X` | Success with scalar | `+OK "value":0.000000` |
| `+OK "value":{...}` | Success with object | `+OK "value":{"deviceModel":"TesiraFORTE_CI" "firmwareVersion":"3.14.0"}` |
| `+OK "list":[...]` | Success with array | `+OK "list":["Level1" "Mixer1" "DEVICE"]` |
| `-ERR ...` | Error | `-ERR address not found: {"address":"BadTag"}` |
| `-CANNOT_DELIVER` | Multi-server error | `-CANNOT_DELIVER` |
| `-GENERAL_FAILURE` | Catch-all error | `-GENERAL_FAILURE` |
| `! "publishToken":"..." "value":X` | Subscription push | `! "publishToken":"MyLevel" "value":-77.8` |
| `! ... +OK` | First push + ack (combined line) | `! "publishToken":"MyLevel" "value":-100 +OK` |

**Parser strategy for `TTPTransport.ts`:**
1. Split on `\r\n` (SSH) or `\r` + discard next byte (Telnet).
2. Classify each line by prefix (`+OK`, `-ERR`, `-CANNOT_DELIVER`, `-GENERAL_FAILURE`, `!`).
3. Combined push+ack lines: split at final ` +OK` suffix — dispatch push to subscription demuxer, resolve pending command with ack.
4. Value extraction: use regex to extract `"key":"value"` pairs individually — do not attempt `JSON.parse` on multi-field responses.

---

### R-BT-004: Device Identity

```
SESSION set verbose true
+OK

DEVICE get deviceInfo
+OK "value":{"deviceModel":"TesiraFORTE_CI" "deviceRevision":"B" "serialNumber":"12345678" "firmwareVersion":"3.14.0.2" "ipAddress":"192.168.1.50"}

DEVICE get networkStatus
+OK "value":{"schemaVersion":2 "hostname":"TesiraServer91" ...}
```

Issue both `deviceInfo` and `networkStatus` immediately after `SESSION set verbose true`. Hostname from `networkStatus`; model/firmware/serial from `deviceInfo`.

---

### R-BT-005: System Fault List

```
DEVICE get activeFaultList
+OK "value":[]                                              ← no faults → GREEN
+OK "value":[{"description":"Network module missing" "severity":"critical"}]  ← RED
```

The fault object schema (`description`, `severity`, optional `code`) is inferred from runtime behaviour — field names are not enumerated in the protocol reference. The module must tolerate unknown fields. An empty array = GREEN. Any fault = AMBER. Any fault with `severity` matching `"critical"` (case-insensitive) = RED.

Poll `activeFaultList` on every polling cycle (default 15 s). No subscription path is documented for faults — polling is required.

---

### R-BT-006: LevelControl Block — Level and Mute

Block instance tags are user-defined in the Tesira design file and must be supplied by the operator at configuration time. Use `SESSION get aliases` on connect to validate configured tags exist.

```
# Get gain (dB) and mute on channel 1:
Level1 get level 1
+OK "value":0.000000

Level1 get mute 1
+OK "value":false

# Set mute:
Level1 set mute 1 true
+OK

# Toggle mute:
Level1 toggle mute 1
+OK

# Set gain:
Level1 set level 1 -10.5
+OK

# Subscribe to level and mute changes:
Level1 subscribe level 1 L1_level_ch1 500
! "publishToken":"L1_level_ch1" "value":-100.000000 +OK

Level1 subscribe mute 1 L1_mute_ch1 100
! "publishToken":"L1_mute_ch1" "value":false +OK
```

**Gain clamping (FR-009):** Clamp gain to `[-100, 12]` dB (Tesira typical range) before sending. If the device returns `-ERR INVALID_PARAMETER`, log WARN and report the clamped value to the operator.

---

### R-BT-007: Preset Recall (No TTP Listing Command)

**No TTP command exists to enumerate presets.** Preset names stored in `biamp_preset_configs` (SQLite) at device configuration time.

```
DEVICE recallPresetByName "Morning Conference"
+OK
```

Module uses `recallPresetByName` (name-based) for all preset recalls. The operator manages the preset list in the device configuration panel.

---

### R-BT-008: VoIP Dialer Block

Dialer attribute names (`callState`, `privacyMute`) follow the standard Tesira naming convention but are not enumerated in `/resources/biamp/tesira-ttp-protocol.md`. They are defined in Biamp's online TTP Attribute Tables for dialer/VoIP blocks.

```
DialerBlock get callState 1
+OK "value":"IDLE"         ← or "ACTIVE", "FAULT"

DialerBlock get privacyMute 1
+OK "value":false

DialerBlock subscribe callState 1 dialer_cs 100
! "publishToken":"dialer_cs" "value":"IDLE" +OK
```

If the device has no dialer block, querying a non-existent instance tag returns `-ERR address not found` — the module logs this and shows no dialer state. Dialer block instance tag is operator-configured at device setup time.

---

### R-BT-009: Subscription Strategy

**On connect:**
1. `SESSION set verbose true`
2. `DEVICE get deviceInfo` + `DEVICE get networkStatus` — device identity
3. `SESSION get aliases` — validate all configured block tags
4. `DEVICE get activeFaultList` — initial fault snapshot
5. For each LevelControl block: `get level` + `get mute` per channel, then `subscribe level` + `subscribe mute`
6. For each dialer block: `get callState` + `get privacyMute`, then `subscribe callState` + `subscribe privacyMute`

**Poll every 15 s:** `DEVICE get activeFaultList` (faults do not emit subscription events)

**On disconnect:** Mark all state unknown, set LED RED, begin reconnect with exponential backoff (1 s → 2 s → 4 s → … → 30 s max). On reconnect: re-issue all `subscribe` commands using the **same** `CustomLabel` values to avoid duplicate subscription accumulation.

**Session limits:** Telnet: 32 max; SSH: 64 soft cap / 80 refused. Each device uses one session.

---

### R-BT-010: Error Handling (FR-014)

| Response | Module behaviour |
|----------|-----------------|
| `-ERR address not found` | Block not in design; log WARN; mark block `unknown`; do not crash |
| `-ERR INVALID_PARAMETER` | Bad index or out-of-range value; log WARN; gain was already clamped |
| `-ERR WRONG_STATE` | VoIP action invalid for current state; log WARN; surface to UI |
| `-ERR Parse error` | Command case/format wrong; log ERROR (module bug) |
| `-CANNOT_DELIVER` | Multi-server comms issue; log ERROR; mark affected block `unknown` |
| `-GENERAL_FAILURE` | Tag in controller but not in active design; log WARN; mark block `unknown` |

Both `-ERR ...` and bare `-CANNOT_DELIVER` / `-GENERAL_FAILURE` must be detected by the parser — do not rely solely on the `-ERR` prefix.

---

**No NEEDS CLARIFICATION items. Phase 0 gate: PASS.**

## Phase 1: Design & Contracts

### Data Model

See [data-model.md](../001-av-room-monitor/data-model.md) for the core SQLite schema. Two new tables required for this feature.

#### `biamp_block_configs` (new migration table)

```sql
CREATE TABLE biamp_block_configs (
  id           TEXT PRIMARY KEY,
  device_id    TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  block_type   TEXT NOT NULL CHECK (block_type IN ('level', 'dialer')),
  instance_tag TEXT NOT NULL,          -- TTP instance tag (e.g. 'Level1', 'Dialer1')
  label        TEXT NOT NULL,          -- display name shown in UI
  channel_count INTEGER NOT NULL DEFAULT 1,
  is_critical   INTEGER NOT NULL DEFAULT 0,  -- 1 = muted state on this block causes AMBER LED
  sort_order   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (device_id, instance_tag)
);
```

#### `biamp_preset_configs` (new migration table)

```sql
CREATE TABLE biamp_preset_configs (
  id         TEXT PRIMARY KEY,
  device_id  TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,           -- exact preset name sent to recallPresetByName
  label      TEXT NOT NULL,           -- display name shown in UI
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (device_id, name)
);
```

**Device LED Status Logic:**

| Condition | LED |
|-----------|-----|
| No active faults; all block states normal | GREEN |
| One or more non-critical active faults | AMBER |
| Any `is_critical` LevelControl block channel is muted | AMBER |
| Any dialer block in `FAULT` call state | AMBER |
| Any fault with `severity = "critical"` | RED |
| SSH/TCP disconnection / all state unknown | RED |
| Not yet polled | GREY |

### IPC Contracts

See [contracts/ipc-channels.md](../001-av-room-monitor/contracts/ipc-channels.md). No new IPC channels required. State via `device:status:all`; commands via `device:command`.

**`device:command` payloads for Biamp Tesira:**

| `command` | `params` | Effect |
|-----------|----------|--------|
| `setMute` | `{ instanceTag: 'Level1', channel: 1, mute: true }` | Mute/unmute a level block channel |
| `toggleMute` | `{ instanceTag: 'Level1', channel: 1 }` | Toggle mute |
| `setLevel` | `{ instanceTag: 'Level1', channel: 1, levelDb: -10.5 }` | Set gain (auto-clamped) |
| `recallPreset` | `{ name: 'Morning Conference' }` | Recall preset by name |
| `ping` | — | Immediate re-poll (faults + all block states) |

**`DeviceStatus.meta` shape for Biamp Tesira:**

```typescript
meta: {
  deviceModel: string;
  firmwareVersion: string;
  serialNumber: string;
  hostname: string;
  activeFaults: Array<{ code?: number; description: string; severity?: string }>;
  blocks: Array<{
    instanceTag: string;
    label: string;
    blockType: 'level' | 'dialer';
    channels?: Array<{ index: number; level: number | null; mute: boolean | null }>;
    callState?: 'IDLE' | 'ACTIVE' | 'FAULT' | null;
    privacyMute?: boolean | null;
  }>;
  presets: Array<{ name: string; label: string }>;
  transportType: 'ssh' | 'telnet';
}
```

### Agent Context

`CLAUDE.md` updated by `update-agent-context.sh` after plan completion.

### Quickstart

See [quickstart.md](../001-av-room-monitor/quickstart.md) for full developer onboarding. Biamp Tesira-specific notes:

- **Unit tests** use a mock SSH shell stream (fake `ssh2` Client) and a mock `net.Socket` emitting pre-scripted TTP response lines. No real device needed.
- **Integration tests** use a lightweight Node.js mock TTP server over SSH (`ssh2` server mode) responding to `DEVICE get deviceInfo`, `activeFaultList`, block `get`/`subscribe`, and `recallPresetByName` with canned responses.
- **Manual testing** requires a real Biamp Tesira device accessible via SSH (or Telnet) with at least one LevelControl block in the design file.
- **Protocol reference**: `/resources/biamp/tesira-ttp-protocol.md`
- **VoIP dialer attribute names** (`callState`, `privacyMute`): sourced from Biamp's online TTP Attribute Tables. See `https://tesira-help.biamp.com/` for the authoritative list.
- **Bitfocus Companion reference**: `https://github.com/bitfocus/companion-module-biamp-tesira` — command patterns and block attribute conventions.
- **Preset names must be operator-configured** — no TTP command exists to enumerate presets. This is documented in `biamp-tesira.md` (in-app help).
