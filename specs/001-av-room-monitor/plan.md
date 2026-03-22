# Implementation Plan: AV Monitoring Application — Foundation

**Branch**: `001-av-room-monitor` | **Date**: 2026-03-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-av-room-monitor/spec.md`

> **Note**: This spec covers the whole-app foundation. The design artifacts in this folder
> (`research.md`, `data-model.md`, `contracts/ipc-channels.md`, `quickstart.md`) are
> **whole-app documents** shared by all four feature specs (001–004). Device-module specs
> (002 LG, 003 Dante, 004 Crestron SSH) reference these artifacts and own only their
> module-specific implementation tasks.

## Summary

Build the cross-platform Electron desktop application that monitors AV meeting rooms via a five-level hierarchy (Global → Region → Office → Floor → Room), with LED health aggregation, floor-map canvas, device template/module registry, Zoom Room configuration download/restore, log export, and OTel/New Relic config generation. This plan covers the app foundation (Agents A and B) and the Zoom module (Agent C), which must ship before any device-module spec (002–004) can begin implementation.

## Technical Context

**Language/Version**: TypeScript 5.x — Electron 30 (main process, Node.js 20 LTS) + React 18 (renderer)
**Primary Dependencies**: `electron` 30, `react` 18, `typescript`, `vite`, `better-sqlite3` 9.x, `electron-store` 9.x, `keytar`, `react-markdown`, `playwright`
**Storage**: SQLite (local, `better-sqlite3`) — full schema in [data-model.md](./data-model.md)
**Testing**: Vitest (unit + integration), Playwright (E2E cross-platform)
**Target Platform**: macOS 12+, Windows 10+ (cross-platform desktop, Electron)
**Project Type**: Desktop application (Electron)
**Performance Goals**: Health status change propagates to all hierarchy levels within 2 polling cycles (SC-002); Zoom config download + restore under 5 min (SC-003); OTel config passes schema validation first attempt (SC-005)
**Constraints**: Cross-platform (macOS + Windows); offline-capable local SQLite; credentials in OS keychain only; no remote database; Slack integration deferred (event-bus abstraction required)
**Scale/Scope**: Single-user local tool; up to ~50 devices, ~20 rooms per deployment

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Module-First Architecture | ✅ PASS | Each device type has a dedicated module under `src/main/modules/`. Zoom module (Agent C) is the first implementation. Module interface defined by Agent B before any module work begins. |
| II. Layered Hierarchy | ✅ PASS | Five-level Global → Region → Office → Floor → Room hierarchy is the core navigation model. LED aggregation propagates upward at every level. |
| III. Verify, Never Assume | ✅ PASS | No open clarifications — spec 001 was the source input for all whole-app design decisions resolved in research.md. |
| IV. Test-First | ✅ PASS | TDD mandatory across all agents. Unit tests for every module; integration tests for IPC channels and LED aggregation; E2E Playwright smoke tests for the full hierarchy drill-down and Zoom config round-trip. |
| V. Device Registry as SSoT | ✅ PASS | `resources/device-registry.json` is the authoritative list of device types. Schema documented in data-model.md. Agent B creates it; no module work begins before it exists. |
| VI. Configuration Integrity | ✅ PASS | Zoom Room config exported as versioned JSON, restorable to device. Warning before overwrite. Backward-compatible format. |
| VII. Observability Built-In | ✅ PASS | All significant events written to `events` SQLite table. Log download as JSON/CSV. OTel config generation for New Relic as a first-class feature. |
| VIII. Cross-Platform by Default | ✅ PASS | All OS differences (file paths, SSID detection, system tray) abstracted behind platform-adapter layer. E2E tests run on both macOS and Windows. |

**Quality gates:**
- ✅ Protocol confirmation for Zoom module: REST/HTTPS (Zoom API, `/resources/Zoom/`)
- ✅ Registry entry before module: `zoom-room` in `resources/device-registry.json`
- ✅ No `NEEDS CLARIFICATION` items

**No violations to justify.**

## Project Structure

### Documentation (whole app — shared by all specs)

```text
specs/001-av-room-monitor/        ← You are here
├── plan.md                       # This file
├── research.md                   # Tech stack decisions R-001 to R-010
├── data-model.md                 # SQLite schema, DeviceModule interface, device registry
├── quickstart.md                 # Dev setup, npm commands, module onboarding guide
├── contracts/
│   └── ipc-channels.md           # All Electron main↔renderer IPC channel contracts
└── tasks.md                      # /speckit.tasks output (NOT created by /speckit.plan)

specs/002-lg-pro-display/
├── plan.md                       # LG module plan (Agent D)
└── tasks.md

specs/003-dante-network-audio/
├── plan.md                       # Dante module plan (Agent E)
└── tasks.md

specs/004-crestron-ssh-control/
├── plan.md                       # Crestron SSH module plan (Agent F)
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── main/                           # Electron main process (Node.js / TypeScript)
│   ├── index.ts                    # App entry, BrowserWindow, menu, tray
│   ├── db/
│   │   ├── database.ts             # better-sqlite3 init, migration runner
│   │   └── migrations/
│   │       └── 001_initial.sql     # Full schema — all hierarchy + device tables
│   ├── modules/
│   │   ├── _base/
│   │   │   └── DeviceModule.ts     # Shared TypeScript interface (Agent B — prerequisite)
│   │   ├── index.ts                # Module registry loader
│   │   └── zoom/                   # Agent C
│   │       ├── ZoomModule.ts
│   │       └── ZoomModule.test.ts
│   ├── ipc/
│   │   ├── device-handlers.ts      # device:status:all, device:command, device:ping
│   │   ├── config-handlers.ts      # config:export, config:import, config:list
│   │   ├── hierarchy-handlers.ts   # hierarchy:get, hierarchy:update
│   │   ├── log-handlers.ts         # log:download, log:query
│   │   ├── otel-handlers.ts        # otel:generateConfig
│   │   └── preference-handlers.ts  # preferences:get/set/getAll
│   ├── services/
│   │   └── StatusAggregator.ts     # LED roll-up across hierarchy levels
│   └── platform/
│       └── network-check.ts        # VPN/SSID detection (R-005)
├── renderer/                       # React renderer (TypeScript + CSS)
│   ├── views/
│   │   ├── GlobalDashboard.tsx     # Agent G — top-level region list
│   │   ├── RegionView.tsx
│   │   ├── OfficeView.tsx
│   │   ├── FloorView.tsx           # Floor map canvas (SVG, R-007)
│   │   └── RoomView.tsx            # Device list + action panel
│   ├── components/
│   │   ├── LEDIndicator.tsx
│   │   ├── Breadcrumb.tsx
│   │   ├── NetworkBadge.tsx        # VPN / MeetingRoom WiFi status (R-005)
│   │   ├── Tooltip.tsx             # Conditional tooltip (R-006)
│   │   ├── FloorMap/               # SVG canvas, draggable rooms, device elements
│   │   └── ConfirmActionDialog.tsx
│   ├── hooks/
│   │   ├── useHierarchy.ts
│   │   ├── useDeviceStatus.ts
│   │   └── usePreference.ts
│   └── menu/
│       └── docs/                   # react-markdown rendered in-app help (R-010)
└── shared/
    └── ipc-types.ts                # All IPC payload types (shared main + renderer)

resources/
└── device-registry.json            # SSoT for device types (Agent B prerequisite)

tests/
├── unit/
│   ├── zoom/
│   │   └── ZoomModule.test.ts
│   ├── StatusAggregator.test.ts
│   └── db/
│       └── migrations.test.ts
├── integration/
│   ├── ipc/
│   │   ├── device-ipc.test.ts
│   │   ├── config-ipc.test.ts
│   │   └── hierarchy-ipc.test.ts
│   └── led-aggregation.test.ts
└── e2e/
    ├── playwright.config.ts        # Agent H — macOS + Windows projects
    ├── hierarchy-drill-down.spec.ts
    ├── floor-map.spec.ts
    └── zoom-config-round-trip.spec.ts
```

**Structure Decision**: Single-project Electron app. Foundation work (Agents A and B) is the prerequisite for all device module specs. No device module implementation begins until `DeviceModule.ts` and `device-registry.json` are merged.

## Build & Agent Sequencing

```
Week 0–1:  Agent A (App Shell: Electron bootstrap, window, menu, tray)
           Agent B (Data Layer: SQLite schema, DeviceModule.ts, device-registry.json)
           [A and B run in parallel — no dependencies between them]

Week 1–2:  Agent C (Zoom Module) — starts after B merges DeviceModule.ts
           Agent D (LG Display Module) — starts after B merges DeviceModule.ts
           Agent E (Dante Module) — starts after B merges DeviceModule.ts
           Agent F (Crestron SSH Module) — starts after B merges DeviceModule.ts
           Agent G (Hierarchy UI) — starts after A merges window + B merges IPC types

Week 3–4:  Agent H (E2E Tests) — starts once at least one module + UI is integrated
```

## Phase 0: Research

All unknowns resolved. See [research.md](./research.md) for full decisions (R-001 to R-010).

Key decisions for the foundation:

| ID | Decision |
|----|----------|
| R-001 | Electron 30 + Node.js 20 LTS — compatible with all dependencies |
| R-004 | CSS custom properties + Flexbox/Grid — responsive at 1080p/2K/4K |
| R-005 | `os.networkInterfaces()` + platform shell for SSID — VPN/WiFi badge |
| R-006 | Custom `<Tooltip>` component gated by `tooltipsEnabled` preference |
| R-007 | SVG-based floor map canvas with percentage-based room positions |
| R-008 | Eight parallel agent streams; A+B first, then C–G, then H |
| R-009 | `keytar` for OS keychain credential storage |
| R-010 | `react-markdown` for in-app documentation |

## Phase 1: Design & Contracts

See shared artifacts:

- **[data-model.md](./data-model.md)** — full SQLite schema, DeviceModule interface, device registry JSON, LED aggregation rules, SSH session state machine, preferences schema
- **[contracts/ipc-channels.md](./contracts/ipc-channels.md)** — all IPC channels: device, SSH, config, network, log, preferences, hierarchy, OTel
- **[quickstart.md](./quickstart.md)** — dev setup, npm commands, module onboarding checklist, Agent start-file map
