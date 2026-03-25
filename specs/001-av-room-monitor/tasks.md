# Tasks: AV Monitoring Application — Foundation (001)

**Input**: Design documents from `/specs/001-av-room-monitor/`
**Branch**: `001-av-room-monitor`
**Agents**: A (App Shell), B (Data Layer), C (Zoom Module), G (Hierarchy UI)

> **C1 note (constitution §IV)**: Phases 2–6 were implemented before corresponding test tasks existed (T023 before T031; T033–T036 before T041/T047; T048–T058 have no preceding test stubs). This was a historical TDD ordering deviation. Phases 11–12 below strictly enforce red→green order. Future phases must follow the same pattern: test task (must FAIL) → implementation task.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Parallelisable — different files, no blocking dependencies
- **[Story]**: User story label (US1–US14); omitted for Setup/Foundational/Polish phases
- Exact file paths included in every description

---

## Phase 1: Setup

**Purpose**: Project skeleton, toolchain, and Electron/React scaffolding. All tasks can run before any story work.

- [X] T001 Initialise Node.js project: `package.json` with all dependencies (`electron`, `react`, `typescript`, `vite`, `better-sqlite3`, `electron-store`, `keytar`, `react-markdown`, `vitest`, `playwright`, `@electron-forge/cli` or `electron-builder`) — root `package.json`
- [X] T002 [P] TypeScript config: `tsconfig.json` (strict mode, path aliases `@main`, `@renderer`, `@shared`) and `tsconfig.node.json` for Vite — root
- [X] T003 [P] Vite renderer config: React plugin, path aliases, HMR settings — `vite.config.ts`
- [X] T004 [P] Electron build config: `electron.vite.config.ts` or `forge.config.ts` — cross-platform macOS + Windows targets
- [X] T005 [P] ESLint + Prettier config: TypeScript rules, import order — `.eslintrc.cjs`, `.prettierrc`
- [X] T006 [P] Vitest config: globals, coverage, alias resolution — `vitest.config.ts`
- [X] T007 [P] npm scripts: `dev`, `build:mac`, `build:win`, `test`, `test:watch`, `test:coverage`, `test:e2e`, `lint`, `typecheck`, `format`, `rebuild:native`, `db:schema` — `package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: App shell, data layer, shared types, and base UI components. **No user story implementation may begin until this phase is complete.**

**⚠️ CRITICAL**: Agents A and B work in parallel on this phase. Agent B's `DeviceModule.ts` and `device-registry.json` must be done before Agents C and G can start.

### Agent B — Data Layer

- [X] T008 SQLite migration runner: opens/creates DB file in OS app-data dir, applies numbered migrations in order, exposes `db` singleton — `src/main/db/database.ts`
- [X] T009 [P] Initial SQL migration: `regions`, `offices`, `floors`, `rooms`, `devices`, `device_configs`, `events` tables with all indexes per `data-model.md` — `src/main/db/migrations/001_initial.sql`
- [X] T010 [P] `DeviceModule` TypeScript interface: `LEDStatus`, `DeviceStatus`, `DeviceConfig`, `CommandResult`, `DeviceModule` — `src/main/modules/_base/DeviceModule.ts`
- [X] T011 [P] Shared IPC payload types covering all channels in `ipc-channels.md`: `DeviceStatusBroadcast`, `DeviceCommandRequest/Response`, `SSHOpenResponse`, `SSHOutput`, `SSHStateChange`, `ConfigImportRequest`, `ConfigListResponse`, `NetworkStatus`, `LogQueryRequest/Response`, `HierarchyNode`, `HierarchyResponse`, `HierarchyUpdateRequest` — `src/shared/ipc-types.ts`
- [X] T012 [P] Device registry JSON: all six device types (`zoom-room`, `lg-display`, `dante-audio`, `crestron-ssh`, `lightware-matrix`, `biamp-tesira`) with `configFields` per `data-model.md` — `resources/device-registry.json`
- [X] T013 Module registry loader: reads `device-registry.json`, dynamically imports module class by `module` field, exposes `getModule(type)` — `src/main/modules/index.ts`

### Agent A — App Shell

- [X] T014 Electron main entry: `BrowserWindow` setup (context isolation ON, preload wired, `800×600` min size), `app.on('ready')`, `app.on('window-all-closed')` — `src/main/index.ts`
- [X] T015 [P] Preload script: `contextBridge.exposeInMainWorld('api', {...})` exposing typed wrappers for every IPC channel from `ipc-channels.md` — `src/main/preload.ts`
- [X] T016 [P] App menu: File, Edit, View (toggle DevTools), Help (About) — `src/main/menu.ts`
- [X] T017 [P] System tray: icon + context menu (Show/Hide, Quit) — `src/main/tray.ts`
- [X] T018 [P] VPN/SSID detection: `os.networkInterfaces()` scan for 10.x.6.0/23 VPN range; platform shell for SSID (macOS: `airport`, Windows: `netsh`) — `src/main/platform/network-check.ts`
- [X] T019 [P] Keytar credential helpers: `saveCredential(service, account, value)`, `getCredential(service, account)`, `deleteCredential` with namespace `av-monitoring`; `getCredential` returning `null` MUST be propagated to the module connect lifecycle — the device is set GREY with `credentialsMissing: true` in meta, monitoring suspended, no alert fired (FR-016) — `src/main/platform/credentials.ts`
- [X] T020 [P] electron-store preferences init: schema with all `pref:` keys from `data-model.md`, default values — `src/main/preferences.ts`

### Shared IPC Infrastructure

- [X] T021 Preference IPC handlers: `preferences:get`, `preferences:set`, `preferences:getAll` — `src/main/ipc/preference-handlers.ts`
- [X] T022 [P] Network IPC: `network:get` request/reply + `network:status` push every 10 s on interface change — `src/main/ipc/network-handlers.ts`
- [X] T023 [P] StatusAggregator service: `computeRoomStatus(devices)`, `computeFloorStatus(rooms)`, `computeOfficeStatus(floors)`, `computeRegionStatus(offices)` using LED rules from `data-model.md` — `src/main/services/StatusAggregator.ts`

### Base React Components (Agent G prerequisite)

- [X] T024 [P] `LEDIndicator` component: GREEN/AMBER/RED/GREY CSS dot, optional `size` prop, tooltip on hover — `src/renderer/components/LEDIndicator.tsx`
- [X] T025 [P] `Breadcrumb` component: clickable path segments → `onNavigate(level, id)` callback — `src/renderer/components/Breadcrumb.tsx`
- [X] T026 [P] `NetworkBadge` component: shows VPN active / MeetingRoom WiFi / offline based on `NetworkStatus` — `src/renderer/components/NetworkBadge.tsx`
- [X] T027 [P] `Tooltip` component: wrapper gated by `tooltipsEnabled` preference, CSS-positioned — `src/renderer/components/Tooltip.tsx`
- [X] T028 [P] `ConfirmActionDialog` component: modal with action label + warning text + Confirm/Cancel — `src/renderer/components/ConfirmActionDialog.tsx`
- [X] T029 [P] `usePreference` hook: reads/writes via `window.api.preferencesGet/Set`, re-renders on change — `src/renderer/hooks/usePreference.ts`
- [X] T030 [P] React app entry + CSS custom properties (theme tokens: colours, spacing, radii) — `src/renderer/main.tsx`, `src/renderer/styles/theme.css`

**Checkpoint**: Foundation complete. Agents C and G may now begin. All unit + integration tests for Phase 2 must pass (`npm run test`).

---

## Phase 3: User Story 1 — Global Health Dashboard (P1) 🎯 MVP

**Goal**: App opens showing region LED grid; LED states aggregate from device → room → floor → office → region. Status changes propagate within two polling cycles.

**Independent Test**: Seed DB with two regions, inject one simulated RED device in region A. Launch app — region A LED is RED, region B is GREEN.

- [X] T031 [US1] Unit tests: `StatusAggregator` — all LED roll-up rules, GREY/GREEN/AMBER/RED combinations, empty children — `tests/unit/StatusAggregator.test.ts`
- [X] T032 [P] [US1] Unit tests: migration runner — applies `001_initial.sql` cleanly, idempotent re-run — `tests/unit/db/migrations.test.ts`
- [X] T033 [US1] `hierarchy:get` IPC handler: queries all regions → offices → floors → rooms → devices, returns `HierarchyResponse` tree with current LED per node — `src/main/ipc/hierarchy-handlers.ts`
- [X] T034 [US1] `hierarchy:update` IPC handler: `create`/`update`/`delete` for all five node types, UUID generation, cascade delete — `src/main/ipc/hierarchy-handlers.ts`
- [X] T035 [US1] Device polling loop: per-device timer calling `module.ping(deviceId)`, writes result to `devices.status` + `events` table, triggers `StatusAggregator`, broadcasts `device:status:all` — `src/main/ipc/device-handlers.ts`
- [X] T036 [US1] `device:ping` IPC handler: out-of-cycle immediate ping for one device — `src/main/ipc/device-handlers.ts`
- [X] T037 [US1] `useHierarchy` hook: invokes `hierarchy:get` on mount, subscribes to `device:status:all` push to update LED states without full reload — `src/renderer/hooks/useHierarchy.ts`
- [X] T038 [US1] `useDeviceStatus` hook: subscribes to `device:status:all`, exposes `getStatus(deviceId)` and `getHierarchyLED(type, id)` — `src/renderer/hooks/useDeviceStatus.ts`
- [X] T039 [US1] `GlobalDashboard` view: grid of region cards each showing `LEDIndicator` + name; click → navigate to region — `src/renderer/views/GlobalDashboard.tsx`
- [X] T040 [US1] `RegionView`: list of offices with `LEDIndicator`, click → navigate to office — `src/renderer/views/RegionView.tsx`
- [X] T041 [US1] Integration test: LED aggregation — seed DB, call polling handler directly, verify `device:status:all` payload reflects correct roll-up — `tests/integration/led-aggregation.test.ts`

**Checkpoint**: Region LED grid visible and live. MVP deliverable.

---

## Phase 4: User Story 2 — Hierarchical Drill-Down (P2)

**Goal**: Click through Region → Office → Floor → Room → device detail. Breadcrumb navigation. Back button restores state.

**Independent Test**: Pre-seeded hierarchy; click Region → Office → Floor → Room; verify device list appears; press Breadcrumb → verify return to previous level.

- [X] T042 [P] [US2] `OfficeView`: floor list with aggregated `LEDIndicator`, click → navigate to floor — `src/renderer/views/OfficeView.tsx`
- [X] T043 [P] [US2] `FloorView`: room list (list mode, no floor map yet) with LED per room, click → navigate to room — `src/renderer/views/FloorView.tsx`
- [X] T044 [P] [US2] `RoomView`: device detail panel — per-device name, type icon, `LEDIndicator`, `lastSeen` timestamp; empty-room message — `src/renderer/views/RoomView.tsx`
- [X] T045 [US2] Navigation router: view-stack state machine, `navigate(view, id)` + `back()`, restores last path from `pref:lastHierarchyPath` on launch — `src/renderer/App.tsx`
- [X] T046 [US2] Breadcrumb wiring: `Breadcrumb` receives current path segments and calls `navigate` on click — `src/renderer/App.tsx`
- [X] T047 [US2] Integration test: `hierarchy:get` → `hierarchy:update(create region)` → `hierarchy:get` verifies new node present; `hierarchy:update(delete)` → verify cascade — `tests/integration/ipc/hierarchy-ipc.test.ts`

**Checkpoint**: Full drill-down navigation working end-to-end.

---

## Phase 5: User Story 3 — Floor Map & Room Placement (P3)

**Goal**: Upload PNG/JPEG floor plan; draw labelled room rectangles on SVG canvas; place device tiles (name + type + LED) inside rooms; live LED updates on canvas; layout persists.

**Independent Test**: Upload PNG, draw two rooms, add one device to each, confirm both LEDs appear on canvas and survive app restart.

- [X] T048 [US3] `FloorMap` container: holds SVG canvas, image background, edit-mode toggle, upload button — `src/renderer/components/FloorMap/FloorMap.tsx`
- [X] T049 [US3] Image upload handler: copies file to app-data dir, stores absolute path in `floors.floor_map_path` via `hierarchy:update`, missing-image placeholder when path invalid — `src/renderer/components/FloorMap/FloorMap.tsx` + `src/main/ipc/hierarchy-handlers.ts`
- [X] T050 [US3] `RoomArea` SVG component: percentage-based `x/y/w/h` rect, label overlay, drag-to-reposition and resize in edit mode, LED overlay — `src/renderer/components/FloorMap/RoomArea.tsx`
- [X] T051 [US3] `DeviceTile` SVG component: square tile inside `RoomArea`, device name + type label + `LEDIndicator`, drag-to-reposition in edit mode — `src/renderer/components/FloorMap/DeviceTile.tsx`
- [X] T052 [US3] Map position persistence: `hierarchy:update` with `map_x/map_y/map_w/map_h` fields for rooms and `map_x/map_y` for devices; `FloorView` loads positions on mount — `src/main/ipc/hierarchy-handlers.ts`
- [X] T053 [US3] `FloorView` floor-map mode: when `floor_map_path` set, render `FloorMap` canvas instead of list; keep list as fallback — `src/renderer/views/FloorView.tsx`

**Checkpoint**: Visual floor map with live device LEDs working and persisted.

---

## Phase 6: User Story 4 — Device Template & Module Registry (P4)

**Goal**: Config tab lists device types from registry; operator adds device instances to rooms with connection fields; credentials go to keychain; module starts polling; duplicate IP warning; pending-module guard.

**Independent Test**: Add a device using `zoom-room` template; verify module receives `connect()` call and device LED appears in room detail.

- [X] T054 [US4] `ConfigView`: device template list from `device-registry.json` (via `hierarchy:get` or dedicated `registry:list` call); Add Device button per room — `src/renderer/views/ConfigView.tsx`
- [X] T055 [US4] `AddDeviceForm`: template selector, dynamic field list from `configFields`, credential fields marked `secret` stored via keytar (not IPC), duplicate-IP warning on submit — `src/renderer/components/AddDeviceForm.tsx`
- [X] T056 [US4] `device:command` IPC handler: validates payload, routes to `module.sendCommand(deviceId, command, params)`, logs outcome to `events` — `src/main/ipc/device-handlers.ts`
- [X] T057 [US4] Module connect/disconnect lifecycle: on device `create` → `module.connect()`; on device `delete` → `module.disconnect()`, clear polling timer — `src/main/modules/index.ts`
- [X] T058 [US4] Pending-module guard: `getModule(type)` returns `null` when no module class registered; UI shows "Pending module" badge, disables Add Device for that type — `src/main/modules/index.ts` + `src/renderer/components/AddDeviceForm.tsx`

**Checkpoint**: Full device lifecycle: add → connect → poll → status visible → delete → disconnect.

---

## Phase 7: User Story 5 — Configuration Download & Restore (P5)

**Goal**: Zoom Room config downloadable as versioned JSON; restorable with overwrite warning; human-readable output; consistent format across versions.

**Independent Test**: Download Zoom Room config → modify one field externally → restore original → confirm device returns to original state.

- [X] T059 [US5] `ZoomModule` unit tests (write first, must FAIL): `connect` with mock TCP probe, `ping` returns `DeviceStatus` (reachability only — no Zoom API), `downloadConfig` returns settings object, `restoreConfig` PUT call, `sendCommand('reboot')` — `tests/unit/zoom/ZoomModule.test.ts`
- [X] T060 [US5] `ZoomModule` implementation: `ping()` = TCP probe to device host/port (no Zoom API); Zoom REST API (`resources/Zoom/zoom-api.md`) used only for `downloadConfig`, `restoreConfig`, `sendCommand`; OAuth token via keytar — `src/main/modules/zoom/ZoomModule.ts`
- [X] T061 [P] [US5] `config:export` IPC handler: calls `module.downloadConfig()`, inserts into `device_configs` table (auto-increments `version`), saves JSON to user-chosen path — `src/main/ipc/config-handlers.ts`
- [X] T062 [P] [US5] `config:import` IPC handler: loads JSON from payload, calls `module.restoreConfig()`, logs outcome; caller must pre-confirm overwrite — `src/main/ipc/config-handlers.ts`
- [X] T063 [P] [US5] `config:list` IPC handler: queries `device_configs` for device, returns version/date/note list — `src/main/ipc/config-handlers.ts`
- [X] T064 [US5] `ConfigPanel` component: download button, version history list, restore button + `ConfirmActionDialog` pre-confirm — `src/renderer/components/ConfigPanel.tsx`
- [X] T065 [US5] Integration test: `config:export` → `config:list` shows one entry → `config:import` → module `restoreConfig` called with correct payload — `tests/integration/ipc/config-ipc.test.ts`

**Checkpoint**: Zoom config round-trip working end-to-end.

---

## Phase 8: User Story 6 — Self-Healing & Control Actions (P6)

**Goal**: Reboot action on RED/AMBER device; LED transitions AMBER (pending) → GREEN/RED on outcome; Open WebUI in system browser; confirmation dialog for all disruptive actions; all actions logged.

**Independent Test**: Trigger Reboot on a ZoomModule mock; verify device LED → AMBER; mock recovery → LED → GREEN; event log contains both state transitions.

- [X] T066 [US6] Extend `device:command` handler: write `events` entry (device, command, outcome, OS username as operator) for every command call — `src/main/ipc/device-handlers.ts`
- [X] T067 [US6] Action panel in `RoomView`: per-device action buttons dynamically built from `module.supportedActions()`; Reboot always present; Open WebUI if `webUiUrl` set; all disruptive actions route through `ConfirmActionDialog` — `src/renderer/views/RoomView.tsx`
- [X] T068 [US6] LED AMBER-pending state: on Reboot command sent → set device status AMBER in DB + broadcast; on next successful ping → GREEN; on timeout (configurable) → RED — `src/main/ipc/device-handlers.ts`
- [X] T069 [US6] Open WebUI action: `shell.openExternal(webUiUrl)` in main process, exposed via `device:command` with `command:'openWebUI'` — `src/main/ipc/device-handlers.ts`
- [X] T070 [US6] `ZoomModule.sendCommand('reboot')`: POST reboot via Zoom API, returns `CommandResult` — `src/main/modules/zoom/ZoomModule.ts`

**Checkpoint**: Control actions working with confirmation, LED transitions, and event log.

---

## Phase 9: User Story 7 — Log Export & OTel Config Generation (P7)

**Goal**: Logs view shows reverse-chronological events; download as JSON/CSV; OTel YAML generated and validated for New Relic ingest.

**Independent Test**: Seed `events` table with 50 rows; `log:query` returns them newest-first; `log:download` CSV has correct columns; `otel:generateConfig` YAML parses without errors.

- [X] T071 [P] [US7] `log:query` IPC handler: parameterised query with optional `deviceId`, `roomId`, `severity`, `since`, `limit` — `src/main/ipc/log-handlers.ts`
- [X] T072 [P] [US7] `log:download` IPC handler: full events query, serialise to JSON or CSV, save via dialog or `savePath` — `src/main/ipc/log-handlers.ts`
- [X] T073 [US7] `OtelConfigBuilder` service: iterates configured device types from registry, builds YAML with metric definitions per type, `otlp` exporter pointing at New Relic endpoint, `pref:otelNewRelicKey` placeholder — `src/main/services/OtelConfigBuilder.ts`
- [X] T074 [US7] `otel:generateConfig` IPC handler: calls `OtelConfigBuilder`, saves YAML via dialog or `savePath` — `src/main/ipc/otel-handlers.ts`
- [X] T075 [US7] `LogsView`: paginated event list, severity filter, timestamp + source + message columns, Download button — `src/renderer/views/LogsView.tsx`
- [X] T076 [US7] `ObservabilityView`: New Relic key input (stored in preferences), Generate Config button, YAML preview pane, Download button — `src/renderer/views/ObservabilityView.tsx`

**Checkpoint**: All seven user stories functional.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T077 [P] Playwright E2E config: `mac` and `windows` projects, `baseURL`, screenshot on failure — `tests/e2e/playwright.config.ts`
- [X] T078 [P] E2E smoke test — hierarchy drill-down: launch → Global → click RED region → click office → floor → room → verify device row visible — `tests/e2e/hierarchy-drill-down.spec.ts`
- [X] T079 [P] E2E smoke test — floor map: upload PNG → draw room → add device → verify tile + LED visible on canvas — `tests/e2e/floor-map.spec.ts`
- [X] T080 [P] E2E smoke test — Zoom config round-trip: connect mock Zoom → download config → restore config → verify success toast — `tests/e2e/zoom-config-round-trip.spec.ts`
- [X] T081 [P] In-app markdown docs: one `.md` file per active module rendered by `react-markdown` — `src/renderer/menu/docs/zoom-room.md` (stub for others)
- [X] T082 Cross-platform path handling audit: replace all hard-coded `/` separators with `path.join()`; test `network-check.ts` SSID detection on both platforms — `src/main/platform/network-check.ts` + all `db/` paths
- [X] T083 [P] Window bounds persistence: save/restore `pref:windowBounds` on `BrowserWindow` `resize`/`move` events — `src/main/index.ts`
- [X] T084 IPC payload validation: add `zod` or manual type-guard in every `ipcMain.handle` — reject malformed payloads with `{ success: false, error: 'Invalid payload' }` — all `src/main/ipc/*.ts`
- [X] T085 [P] `db:schema` npm script: dumps current SQLite schema to stdout (`sqlite3 db .schema`) — `package.json` + `scripts/db-schema.ts`
- [X] T101 `SettingsView`: polling interval input (10–300 s, validated; rejects out-of-range), N-failures-before-RED input (1–10, validated), tooltips-enabled toggle; all fields read/written via `preferences:get/set` IPC; accessible from app menu (View → Settings) — `src/renderer/views/SettingsView.tsx`
- [X] T104 DB migration 003: add `zoom_location_id TEXT` column to `offices` table; add `zoom_room_id TEXT` column to `devices` table (unique identifier from Zoom API, used for deduplication on re-import) — `src/main/db/migrations/003_zoom_location.sql`
- [X] T105 [P] App-level Zoom OAuth credential storage: `saveZoomAppCredentials(clientId, clientSecret)`, `getZoomAppCredentials()` stored under keychain entry `av-monitoring/zoom-app`; `ZoomOAuthService` exchanges credentials for access token with auto-refresh — `src/main/services/ZoomOAuthService.ts`
- [X] T106 [P] `zoom:importRooms` IPC handler: accepts `{ officeId, zoomLocationId }`, calls Zoom API `GET /rooms?location_id=X`, creates device instances for rooms not already present (matched by `zoom_room_id`), skips duplicates, returns `{ created: number, skipped: number, errors: string[] }` — `src/main/ipc/zoom-handlers.ts`
- [X] T107 [P] "Import Zoom Rooms" UI: in `ConfigView` when an office is selected, show optional Zoom Location ID input (saved to office via `hierarchy:update`) and "Import Zoom Rooms" button; on success show created/skipped summary toast; app-level Zoom OAuth credentials configured via `SettingsView` (T101) — `src/renderer/views/ConfigView.tsx`
- [X] T102 [P] Settings export/import: `settings:export` IPC handler serialises alert rules (all `alert_rules` rows) + all `pref:` values to JSON/YAML; `settings:import` IPC handler applies file atomically (alert rules upsert + preferences set) after user confirmation warning; file format MUST be identical on macOS and Windows (FR-038, FR-039) — `src/main/ipc/settings-handlers.ts`
- [X] T103 [P] Settings export/import UI in `SettingsView`: "Export Settings" button (saves file via dialog), "Import Settings" button (opens file dialog, shows overwrite warning, applies via `settings:import`) — `src/renderer/views/SettingsView.tsx`

---

## Dependencies & Execution Order

### Phase Dependencies

| Phase | Depends On | Can Parallelise With |
|-------|-----------|---------------------|
| Phase 1: Setup | — | Nothing yet |
| Phase 2: Foundational | Phase 1 | Agent A ∥ Agent B within Phase 2 |
| Phase 3: US1 (P1) | Phase 2 complete | — |
| Phase 4: US2 (P2) | Phase 3 (shares hierarchy IPC) | Phases 5–9 if staffed |
| Phase 5: US3 (P3) | Phase 4 (needs `FloorView`) | Phases 6–9 |
| Phase 6: US4 (P4) | Phase 2 (module loader T013, T057) | Phases 5, 7–9 |
| Phase 7: US5 (P5) | Phase 6 (ZoomModule needs device lifecycle T057) | Phases 8–9 |
| Phase 8: US6 (P6) | Phase 7 (extends ZoomModule T060, T070) | Phase 9 |
| Phase 9: US7 (P7) | Phase 2 (events table T009) | All phases |
| Phase 10: Polish | All story phases desired | Internal tasks are [P] |

### Agent Start Conditions

- **Agent A** (T014–T020): starts at Phase 2, no pre-reqs
- **Agent B** (T008–T013): starts at Phase 2, no pre-reqs, runs parallel to A
- **Agent C** (T059–T065, T070): starts when T010 (`DeviceModule.ts`) and T012 (`device-registry.json`) are done
- **Agent G** (T024–T030, T033–T053): starts when T014 (BrowserWindow) and T011 (ipc-types.ts) are done

### Parallel Opportunities Within Stories

```
Phase 2 parallel cluster (all independent files):
  T009 (SQL schema)  ∥  T010 (DeviceModule.ts)  ∥  T011 (ipc-types.ts)
  T012 (registry)    ∥  T018 (network-check)     ∥  T019 (credentials)
  T024 (LEDIndicator) ∥ T025 (Breadcrumb) ∥ T026 (NetworkBadge) ∥ T027–T030

Phase 3 parallel cluster:
  T031 (StatusAggregator tests) ∥ T032 (migration tests)
  T033 (hierarchy:get) ∥ T036 (device:ping)

Phase 4 parallel cluster:
  T042 (OfficeView) ∥ T043 (FloorView) ∥ T044 (RoomView)

Phase 7 parallel cluster:
  T061 (config:export) ∥ T062 (config:import) ∥ T063 (config:list)
```

---

## Implementation Strategy

### MVP (User Story 1 + 2 only — ~32 tasks)

1. Phase 1: Setup (T001–T007)
2. Phase 2: Foundational (T008–T030)
3. Phase 3: US1 — Global Dashboard (T031–T041)
4. Phase 4: US2 — Drill-Down (T042–T047)
5. **STOP**: Validate drill-down navigation + live LED updates

### Full Delivery Order

US1 → US2 → US4 → US3 → US5 → US6 → US7 → Polish

(US4 before US3 because device lifecycle is needed for device tiles on the floor map)

---

## Summary

| Phase | Tasks | Stories Delivered |
|-------|-------|------------------|
| Setup | T001–T007 | — |
| Foundational | T008–T030 | — (A+B parallel) |
| US1 — Dashboard | T031–T041 | P1 🎯 MVP |
| US2 — Drill-Down | T042–T047 | P2 |
| US3 — Floor Map | T048–T053 | P3 |
| US4 — Templates | T054–T058 | P4 |
| US5 — Config | T059–T065 | P5 |
| US6 — Control | T066–T070 | P6 |
| US7 — Logs/OTel | T071–T076 | P7 |
| Polish | T077–T085, T101–T107 | Cross-cutting |
| US8 — Alert Rules | T086–T095 | P8 |
| US14 — Zoom Enhanced | T096–T100 | P14 |
| **Total** | **107 tasks** | **9 user stories** |

---

## Phase 11: User Story 8 — Configurable Alert Rules (P8)

**Goal**: Per-device-type, per-status-point alert toggles. Non-alertable conditions display as informational only — no LED change. Toggles persist across restarts. New device instances receive sensible defaults.

**Independent Test**: Disable alert toggle for one status point, trigger that condition, confirm LED does not change to AMBER/RED. Re-enable, trigger again, confirm alert fires.

> **TDD ORDER ENFORCED**: T088 (test, must FAIL) → T089 (implementation). T090/T091 (IPC tests, must FAIL) → handlers. T095 (integration test, must FAIL) → T092 wiring.

- [X] T086 [US8] DB migration 002: `alert_rules` table — `device_type TEXT`, `status_point TEXT`, `alert_enabled INTEGER DEFAULT 1`, `PRIMARY KEY (device_type, status_point)` — `src/main/db/migrations/002_alert_rules.sql`
- [X] T087 [P] [US8] IPC types for alert rules: `AlertRule`, `AlertRulesGetRequest`, `AlertRulesGetResponse`, `AlertRuleSetRequest` — `src/shared/ipc-types.ts`
- [X] T088 [US8] Unit tests (write first, must FAIL): `AlertRulesService` — `isAlertable('zoom-room', 'reachable')` returns `true` by default; `setRule` persists change; seeded defaults for known device types have alertable conditions ON, informational OFF — `tests/unit/AlertRulesService.test.ts`
- [X] T089 [US8] `AlertRulesService`: reads/writes `alert_rules` table, `isAlertable(deviceType, statusPoint): boolean`, `seedDefaults(deviceType)` inserts factory defaults if no rows exist for that type — `src/main/services/AlertRulesService.ts`
- [X] T090 [P] [US8] `alert:getRules` IPC handler: accepts optional `deviceType` filter, returns `AlertRulesGetResponse` — `src/main/ipc/alert-handlers.ts`
- [X] T091 [P] [US8] `alert:setRule` IPC handler: upserts one rule row, logs change to `events` table — `src/main/ipc/alert-handlers.ts`
- [X] T092 [US8] Polling integration: in device polling loop, before writing AMBER/RED to `devices.status`, call `AlertRulesService.isAlertable(deviceType, statusPoint)`; if false, write status-data only without changing LED — `src/main/ipc/device-handlers.ts`
- [X] T093 [P] [US8] `AlertSettingsView`: grouped by device type, each status point row shows label + on/off toggle, persists via `alert:setRule`; add tab/nav entry alongside Dashboard, Logs, Observability — `src/renderer/views/AlertSettingsView.tsx`
- [X] T094 [US8] New-device default seeding: on device `create` event call `AlertRulesService.seedDefaults(deviceType)` — `src/main/modules/index.ts`
- [X] T095 [US8] Integration test (write first, must FAIL): seed `alert_rules` with one point disabled → simulate polling event for that point → assert `device:status:all` broadcast LED unchanged; enable rule → repeat → assert LED changes — `tests/integration/alert-rules.test.ts`

**Checkpoint**: Alert rule toggles functional. New devices seeded with defaults. LED unaffected by silenced status points.

---

## Phase 12: User Story 14 — Zoom Room Speaker Test (P14)

**Goal**: "Run Speaker Test" on-demand command via Zoom API, guarded by confirmation dialog and active-meeting check. Reboot already covered by Phase 8 (T070). Zoom polling = network reachability only — no Zoom API calls during the poll cycle.

**Independent Test**: Trigger "Run Speaker Test" on a Zoom Room mock; verify confirmation prompt appears; verify outcome logged. Trigger with active-meeting flag set; verify error surfaced cleanly, nothing logged as a device fault.

> **TDD ORDER ENFORCED**: T096 (tests, must FAIL) → T097 (implementation) → T098 (types, may be parallel) → T099 (UI) → T100 (integration).

- [X] T096 [US14] Unit tests (write first, must FAIL): extend `ZoomModule.test.ts` — `ping()` uses ICMP/TCP probe only (no Zoom API call); `getStatusPoints()` returns exactly `[{ id: 'reachable', label: 'Device Reachable', defaultAlertable: true }]`; `runSpeakerTest()` returns `CommandResult` with `output: 'pass' | 'fail'`; `runSpeakerTest()` while room in active meeting returns `CommandResult{ success: false, error: 'Room in active meeting' }` — `tests/unit/zoom/ZoomModule.test.ts`
- [X] T097 [US14] `ZoomModule` updates: replace any Zoom API call in `ping()` with a raw TCP probe to the device host/port; implement `getStatusPoints()` returning single `reachable` entry; implement `runSpeakerTest()` via Zoom API with active-meeting guard — `src/main/modules/zoom/ZoomModule.ts`
- [X] T098 [P] [US14] Add `getStatusPoints(): StatusPointDefinition[]` to `DeviceModule.ts` interface; update `src/shared/ipc-types.ts` `DeviceStatusBroadcast` with a JSDoc note that `meta` is available for module-specific values (no new required fields) — `src/main/modules/_base/DeviceModule.ts` + `src/shared/ipc-types.ts`
- [X] T099 [US14] `RoomView` speaker test button: add "Run Speaker Test" button to Zoom device detail panel, routed through `ConfirmActionDialog`; on success display outcome inline; on active-meeting error display "Speaker test unavailable — room in active meeting"; all outcomes written to events log — `src/renderer/views/RoomView.tsx`
- [X] T100 [US14] Integration test (write first, must FAIL): verify `device:status:all` broadcast for Zoom device does NOT contain Zoom API data in `meta`; verify speaker-test command result (pass and active-meeting error) is correctly logged to `events` table — `tests/integration/ipc/device-ipc.test.ts`

**Checkpoint**: Zoom ping = TCP probe only. Speaker test command live with confirmation and active-meeting guard.
