# Implementation Plan: Crestron Series 3/4 SSH Connection and Control

**Branch**: `004-crestron-ssh-control` | **Date**: 2026-03-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-crestron-ssh-control/spec.md`

## Summary

Add an interactive SSH workspace to the AV monitoring desktop app that allows any authenticated operator to connect to a Crestron Series 3 or 4 control processor, invoke nine named commands via dedicated buttons, send free-text commands, and terminate the session cleanly. Implemented as a dedicated `CrestronSSHModule` (Agent F) using the `ssh2` npm library for prompt-aware interactive shell sessions, wired into the existing Electron IPC layer.

## Technical Context

**Language/Version**: TypeScript 5.x — Electron 30 (main process, Node.js 20 LTS) + React 18 (renderer)
**Primary Dependencies**: `electron` 30, `react` 18, `ssh2` 1.x, `better-sqlite3` 9.x, `electron-store` 9.x, `keytar`, `vite` (renderer HMR)
**Storage**: SQLite (local, `better-sqlite3`) — device registry, device configs, events audit log
**Testing**: Vitest (unit + integration), Playwright (E2E cross-platform)
**Target Platform**: macOS 12+, Windows 10+ (cross-platform desktop, Electron)
**Project Type**: Desktop application (Electron)
**Performance Goals**: SSH session ready within 5 s (SC-001); command response or error reported within 10 s (SC-004); `PROGRESet` completes within 10 s (SC-003)
**Constraints**: Cross-platform (macOS + Windows, no platform-specific workarounds in app-layer code); offline-capable (local SQLite only); credentials stored in OS keychain via `keytar`, never in files or IPC payloads; 1 SSH workspace per device at a time
**Scale/Scope**: Single operator per SSH workspace; up to ~50 monitored devices per deployment

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Module-First Architecture | ✅ PASS | `CrestronSSHModule` is a dedicated self-contained module in `src/main/modules/crestron-ssh/`. No SSH logic outside this module. Primary reference: Bitfocus Companion module ecosystem (per constitution §Resources). |
| II. Layered Hierarchy | ✅ N/A | SSH Workspace is a leaf-level panel opened from a device entry inside a room. No hierarchy level is added, removed, or bypassed. |
| III. Verify, Never Assume | ✅ PASS | All 5 clarification questions (session lifecycle, command invocation, confirmation prompts, slot entry, access control) resolved before planning. Zero open items remain. |
| IV. Test-First | ✅ PASS | TDD mandatory. Unit tests for `CrestronSSHModule` and `SSHSessionManager` written first; integration test covers IPC channel round-trips; E2E Playwright smoke test covers workspace open → command → close flow. |
| V. Device Registry as SSoT | ✅ PASS | `crestron-ssh` entry documented in `resources/device-registry.json` (see data-model.md). Module and registry entry created in the same step. |
| VI. Configuration Integrity | ✅ N/A | Crestron SSH devices have no downloadable configuration in this iteration. `downloadConfig` / `restoreConfig` return empty objects. |
| VII. Observability Built-In | ✅ PASS | All SSH lifecycle events (session open/close, each command sent, errors, state transitions) written to `events` SQLite table with timestamp, severity, and device source. |
| VIII. Cross-Platform by Default | ✅ PASS | `ssh2` is pure-JavaScript — no native bindings, no platform-specific SSH subprocess or OpenSSH binary dependency. React/CSS UI uses no OS-specific workarounds. |

**Quality gates (pre-implementation):**
- ✅ Protocol confirmation on record: SSH (confirmed in spec clarifications, constitution §2a)
- ✅ Registry entry before module work: `crestron-ssh` present in `resources/device-registry.json`
- ✅ No `NEEDS CLARIFICATION` items remain in spec

**No violations to justify. Complexity Tracking table omitted.**

**Post-Phase-1 re-check**: All Phase 1 design artifacts (data-model, contracts, quickstart) confirmed consistent with the above. No new violations introduced.

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

specs/004-crestron-ssh-control/
├── plan.md              # This file (/speckit.plan command output)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── main/                           # Electron main process (Node.js / TypeScript)
│   ├── index.ts                    # App entry point, BrowserWindow setup
│   ├── db/
│   │   └── migrations/
│   │       └── 001_initial.sql     # SQLite schema (regions, offices, floors, rooms, devices,
│   │                               #   device_configs, ssh_device_profiles, events)
│   ├── modules/
│   │   ├── _base/
│   │   │   └── DeviceModule.ts     # Shared TypeScript interface (Agent B prerequisite)
│   │   └── crestron-ssh/           # ← THIS FEATURE (Agent F)
│   │       ├── CrestronSSHModule.ts      # Implements DeviceModule; owns session lifecycle
│   │       └── SSHSessionManager.ts      # ssh2 shell channel, prompt detection, output stream
│   ├── ipc/
│   │   └── ssh-handlers.ts         # ipcMain.handle for ssh:open, ssh:close, ssh:send;
│   │                               #   webContents.send for ssh:output, ssh:state
│   └── platform/
│       └── network-check.ts        # VPN/SSID detection (shared, Agent A)
├── renderer/                       # React renderer (TypeScript + CSS)
│   ├── components/
│   │   └── SSHWorkspace/           # ← THIS FEATURE (Agent F)
│   │       ├── SSHWorkspace.tsx          # Outer panel: session state, layout
│   │       ├── SSHCommandButtons.tsx     # Grid of 9 named command buttons
│   │       ├── SSHCommandButton.tsx      # Single command button (read-only vs destructive)
│   │       ├── SSHOutput.tsx             # Scrolling terminal output display
│   │       └── ConfirmationDialog.tsx    # Modal for REBOOT, FORCEDREBOOT, PROGRESet
│   ├── hooks/
│   │   └── useSSHSession.ts        # React hook: wraps IPC calls, manages local session state
│   └── menu/
│       └── docs/
│           └── crestron-ssh.md     # In-app documentation page (react-markdown rendered)
└── shared/
    └── ipc-types.ts                # Shared TypeScript types for all IPC payloads

resources/
└── device-registry.json            # Single source of truth for device types (includes crestron-ssh)

tests/
├── unit/
│   └── crestron-ssh/
│       ├── CrestronSSHModule.test.ts     # Unit tests: connect, disconnect, sendCommand,
│       │                                 #   session state machine, error handling
│       └── SSHSessionManager.test.ts     # Unit tests: prompt detection (CP4N>, VC4 pattern),
│                                         #   output buffering, BUSY→READY transition
├── integration/
│   └── crestron-ssh/
│       └── ssh-ipc.test.ts               # IPC round-trip: ssh:open → ssh:send → ssh:output → ssh:close
└── e2e/
    └── crestron-ssh.spec.ts              # Playwright: workspace open → INFO button → output appears → close
```

**Structure Decision**: Single-project Electron app (Option 1). All code lives under `src/main/` (main process) and `src/renderer/` (React renderer), connected via typed IPC. The Crestron SSH feature is entirely self-contained under `src/main/modules/crestron-ssh/` and `src/renderer/components/SSHWorkspace/`, with no cross-module dependencies other than the shared `DeviceModule` interface and `ipc-types.ts`.

## Phase 0: Research

All unknowns resolved. See [research.md](../001-av-room-monitor/research.md) for full decisions.

**Key decisions relevant to this feature:**

| ID | Decision | Rationale |
|----|----------|-----------|
| R-002 | `ssh2` npm for interactive shell sessions | `Client.shell()` supports prompt-string detection; pure-JS, no electron-rebuild |
| R-001 | Electron 30 + Node.js 20 LTS | Compatible with `ssh2` 1.x and `better-sqlite3` 9.x without native rebuild issues |
| R-009 | `keytar` for credential storage | SSH passwords stored in OS keychain under `av-monitoring:crestron-ssh:<deviceId>` |
| R-008 | Agent F owns CrestronSSHModule | Waits for Agent B to deliver `DeviceModule.ts` and `device-registry.json` |
| R-005 | Network badge warns when LAN unreachable | Crestron SSH requires VPN or MeetingRoom WiFi; UI shows network status |

**No NEEDS CLARIFICATION items. Phase 0 gate: PASS.**

## Phase 1: Design & Contracts

All design artifacts complete. See linked files.

### Data Model

See [data-model.md](../001-av-room-monitor/data-model.md) for the full SQLite schema. Key tables for this feature:

**`devices`** — master device record with `device_type = 'crestron-ssh'`, `host` (IP address), `port = 22`, `status` (LED).

**`ssh_device_profiles`** — Crestron-specific metadata:
- `device_type`: `'CP4'` or `'VC4'`
- `prompt_pattern`: regex to detect ready state (`CP4N>` for CP4; `\[admin@[^\]]+\s~\]\$` for VC4)
- `disconnect_cmd`: `'BYE'` (CP4) or `'exit'` (VC4)

**`events`** — append-only audit log; SSH lifecycle events written with severity `INFO`/`WARN`/`ERROR`.

**SSH Session State Machine:**
```
CLOSED ──► CONNECTING  (workspace panel opened)
CONNECTING ──► READY   (prompt detected within 10 s)
CONNECTING ──► ERROR   (auth failure or timeout)
READY ──► BUSY         (command sent)
BUSY ──► READY         (prompt detected in output stream)
READY ──► CLOSED       (disconnect command sent or workspace closed)
ERROR ──► CLOSED       (user dismisses error state)
```

### IPC Contracts

See [contracts/ipc-channels.md](../001-av-room-monitor/contracts/ipc-channels.md). SSH-specific channels:

| Channel | Direction | Type | Purpose |
|---------|-----------|------|---------|
| `ssh:open` | renderer → main | request/reply | Open SSH session for a device |
| `ssh:close` | renderer → main | request/reply | Graceful session close (sends disconnect cmd) |
| `ssh:send` | renderer → main | request/reply | Send a raw command string |
| `ssh:output` | main → renderer | push broadcast | Stream raw output chunks from SSH shell |
| `ssh:state` | main → renderer | push broadcast | Session state changes (CONNECTING/READY/BUSY/CLOSED/ERROR) |

### Commands Reference

| Button | Command Sent | Confirmation | Access Level |
|--------|-------------|--------------|-------------|
| INFO | `INFO` | No | Operator |
| IPCONFIG | `IPCONFIG` | No | Operator |
| IPTable | `IPTable` | No | Operator |
| ERRlog | `ERRlog` | No | Operator |
| SYSTEMREADY | `SYSTEMREADY` | No | Programmer (accessible via admin) |
| PROGRESet | `PROGRESet -P:<n>` | Yes — slot number input required | Programmer |
| REBOOT | `REBOOT` | Yes | Operator |
| FORCEDREBOOT | `FORCEDREBOOT` | Yes | Operator |
| BYE / exit | device-type-dependent | No | Operator |

Free-text field: operator types any command; sent as raw string via `ssh:send`.

### Agent Context

`CLAUDE.md` updated by `update-agent-context.sh` after plan completion.

### Quickstart

See [quickstart.md](../001-av-room-monitor/quickstart.md) for full developer onboarding. SSH workspace testing notes:

- Use a Docker mock SSH server for basic connectivity tests (`linuxserver/openssh-server` on port 2222).
- Full prompt-detection testing requires a real CP4 or VC4 device.
- Unit tests inject mock SSH channel streams with synthetic prompt strings.
