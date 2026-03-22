# Tasks: AV Monitoring Application — Foundation (001)

**Input**: Design documents from `/specs/001-av-room-monitor/`
**Branch**: `001-av-room-monitor`
**Agents**: A (App Shell), B (Data Layer), C (Zoom Module), G (Hierarchy UI)

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Parallelisable — different files, no blocking dependencies
- **[Story]**: User story label (US1–US7); omitted for Setup/Foundational/Polish phases
- Exact file paths included in every description

---

## Phase 1: Setup

**Purpose**: Project skeleton, toolchain, and Electron/React scaffolding. All tasks can run before any story work.

- [ ] T001 Initialise Node.js project: `package.json` with all dependencies (`electron`, `react`, `typescript`, `vite`, `better-sqlite3`, `electron-store`, `keytar`, `react-markdown`, `vitest`, `playwright`, `@electron-forge/cli` or `electron-builder`) — root `package.json`
- [ ] T002 [P] TypeScript config: `tsconfig.json` (strict mode, path aliases `@main`, `@renderer`, `@shared`) and `tsconfig.node.json` for Vite — root
- [ ] T003 [P] Vite renderer config: React plugin, path aliases, HMR settings — `vite.config.ts`
- [ ] T004 [P] Electron build config: `electron.vite.config.ts` or `forge.config.ts` — cross-platform macOS + Windows targets
- [ ] T005 [P] ESLint + Prettier config: TypeScript rules, import order — `.eslintrc.cjs`, `.prettierrc`
- [ ] T006 [P] Vitest config: globals, coverage, alias resolution — `vitest.config.ts`
- [ ] T007 [P] npm scripts: `dev`, `build:mac`, `build:win`, `test`, `test:watch`, `test:coverage`, `test:e2e`, `lint`, `typecheck`, `format`, `rebuild:native`, `db:schema` — `package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: App shell, data layer, shared types, and base UI components. **No user story implementation may begin until this phase is complete.**

**⚠️ CRITICAL**: Agents A and B work in parallel on this phase. Agent B's `DeviceModule.ts` and `device-registry.json` must be done before Agents C and G can start.

### Agent B — Data Layer

- [ ] T008 SQLite migration runner: opens/creates DB file in OS app-data dir, applies numbered migrations in order, exposes `db` singleton — `src/main/db/database.ts`
- [ ] T009 [P] Initial SQL migration: `regions`, `offices`, `floors`, `rooms`, `devices`, `device_configs`, `events` tables with all indexes per `data-model.md` — `src/main/db/migrations/001_initial.sql`
- [ ] T010 [P] `DeviceModule` TypeScript interface: `LEDStatus`, `DeviceStatus`, `DeviceConfig`, `CommandResult`, `DeviceModule` — `src/main/modules/_base/DeviceModule.ts`
- [ ] T011 [P] Shared IPC payload types covering all channels in `ipc-channels.md`: `DeviceStatusBroadcast`, `DeviceCommandRequest/Response`, `SSHOpenResponse`, `SSHOutput`, `SSHStateChange`, `ConfigImportRequest`, `ConfigListResponse`, `NetworkStatus`, `LogQueryRequest/Response`, `HierarchyNode`, `HierarchyResponse`, `HierarchyUpdateRequest` — `src/shared/ipc-types.ts`
- [ ] T012 [P] Device registry JSON: all six device types (`zoom-room`, `lg-display`, `dante-audio`, `crestron-ssh`, `lightware-matrix`, `biamp-tesira`) with `configFields` per `data-model.md` — `resources/device-registry.json`
- [ ] T013 Module registry loader: reads `device-registry.json`, dynamically imports module class by `module` field, exposes `getModule(type)` — `src/main/modules/index.ts`

### Agent A — App Shell

- [ ] T014 Electron main entry: `BrowserWindow` setup (context isolation ON, preload wired, `800×600` min size), `app.on('ready')`, `app.on('window-all-closed')` — `src/main/index.ts`
- [ ] T015 [P] Preload script: `contextBridge.exposeInMainWorld('api', {...})` exposing typed wrappers for every IPC channel from `ipc-channels.md` — `src/main/preload.ts`
- [ ] T016 [P] App menu: File, Edit, View (toggle DevTools), Help (About) — `src/main/menu.ts`
- [ ] T017 [P] System tray: icon + context menu (Show/Hide, Quit) — `src/main/tray.ts`
- [ ] T018 [P] VPN/SSID detection: `os.networkInterfaces()` scan for 10.x.6.0/23 VPN range; platform shell for SSID (macOS: `airport`, Windows: `netsh`) — `src/main/platform/network-check.ts`
- [ ] T019 [P] Keytar credential helpers: `saveCredential(service, account, value)`, `getCredential(service, account)`, `deleteCredential` with namespace `av-monitoring` — `src/main/platform/credentials.ts`
- [ ] T020 [P] electron-store preferences init: schema with all `pref:` keys from `data-model.md`, default values — `src/main/preferences.ts`

### Shared IPC Infrastructure

- [ ] T021 Preference IPC handlers: `preferences:get`, `preferences:set`, `preferences:getAll` — `src/main/ipc/preference-handlers.ts`
- [ ] T022 [P] Network IPC: `network:get` request/reply + `network:status` push every 10 s on interface change — `src/main/ipc/network-handlers.ts`
- [ ] T023 [P] StatusAggregator service: `computeRoomStatus(devices)`, `computeFloorStatus(rooms)`, `computeOfficeStatus(floors)`, `computeRegionStatus(offices)` using LED rules from `data-model.md` — `src/main/services/StatusAggregator.ts`

### Base React Components (Agent G prerequisite)

- [ ] T024 [P] `LEDIndicator` component: GREEN/AMBER/RED/GREY CSS dot, optional `size` prop, tooltip on hover — `src/renderer/components/LEDIndicator.tsx`
- [ ] T025 [P] `Breadcrumb` component: clickable path segments → `onNavigate(level, id)` callback — `src/renderer/components/Breadcrumb.tsx`
- [ ] T026 [P] `NetworkBadge` component: shows VPN active / MeetingRoom WiFi / offline based on `NetworkStatus` — `src/renderer/components/NetworkBadge.tsx`
- [ ] T027 [P] `Tooltip` component: wrapper gated by `tooltipsEnabled` preference, CSS-positioned — `src/renderer/components/Tooltip.tsx`
- [ ] T028 [P] `ConfirmActionDialog` component: modal with action label + warning text + Confirm/Cancel — `src/renderer/components/ConfirmActionDialog.tsx`
- [ ] T029 [P] `usePreference` hook: reads/writes via `window.api.preferencesGet/Set`, re-renders on change — `src/renderer/hooks/usePreference.ts`
- [ ] T030 [P] React app entry + CSS custom properties (theme tokens: colours, spacing, radii) — `src/renderer/main.tsx`, `src/renderer/styles/theme.css`

**Checkpoint**: Foundation complete. Agents C and G may now begin. All unit + integration tests for Phase 2 must pass (`npm run test`).

---

## Phase 3: User Story 1 — Global Health Dashboard (P1) 🎯 MVP

**Goal**: App opens showing region LED grid; LED states aggregate from device → room → floor → office → region. Status changes propagate within two polling cycles.

**Independent Test**: Seed DB with two regions, inject one simulated RED device in region A. Launch app — region A LED is RED, region B is GREEN.

- [ ] T031 [US1] Unit tests: `StatusAggregator` — all LED roll-up rules, GREY/GREEN/AMBER/RED combinations, empty children — `tests/unit/StatusAggregator.test.ts`
- [ ] T032 [P] [US1] Unit tests: migration runner — applies `001_initial.sql` cleanly, idempotent re-run — `tests/unit/db/migrations.test.ts`
- [ ] T033 [US1] `hierarchy:get` IPC handler: queries all regions → offices → floors → rooms → devices, returns `HierarchyResponse` tree with current LED per node — `src/main/ipc/hierarchy-handlers.ts`
- [ ] T034 [US1] `hierarchy:update` IPC handler: `create`/`update`/`delete` for all five node types, UUID generation, cascade delete — `src/main/ipc/hierarchy-handlers.ts`
- [ ] T035 [US1] Device polling loop: per-device timer calling `module.ping(deviceId)`, writes result to `devices.status` + `events` table, triggers `StatusAggregator`, broadcasts `device:status:all` — `src/main/ipc/device-handlers.ts`
- [ ] T036 [US1] `device:ping` IPC handler: out-of-cycle immediate ping for one device — `src/main/ipc/device-handlers.ts`
- [ ] T037 [US1] `useHierarchy` hook: invokes `hierarchy:get` on mount, subscribes to `device:status:all` push to update LED states without full reload — `src/renderer/hooks/useHierarchy.ts`
- [ ] T038 [US1] `useDeviceStatus` hook: subscribes to `device:status:all`, exposes `getStatus(deviceId)` and `getHierarchyLED(type, id)` — `src/renderer/hooks/useDeviceStatus.ts`
- [ ] T039 [US1] `GlobalDashboard` view: grid of region cards each showing `LEDIndicator` + name; click → navigate to region — `src/renderer/views/GlobalDashboard.tsx`
- [ ] T040 [US1] `RegionView`: list of offices with `LEDIndicator`, click → navigate to office — `src/renderer/views/RegionView.tsx`
- [ ] T041 [US1] Integration test: LED aggregation — seed DB, call polling handler directly, verify `device:status:all` payload reflects correct roll-up — `tests/integration/led-aggregation.test.ts`

**Checkpoint**: Region LED grid visible and live. MVP deliverable.

---

## Phase 4: User Story 2 — Hierarchical Drill-Down (P2)

**Goal**: Click through Region → Office → Floor → Room → device detail. Breadcrumb navigation. Back button restores state.

**Independent Test**: Pre-seeded hierarchy; click Region → Office → Floor → Room; verify device list appears; press Breadcrumb → verify return to previous level.

- [ ] T042 [P] [US2] `OfficeView`: floor list with aggregated `LEDIndicator`, click → navigate to floor — `src/renderer/views/OfficeView.tsx`
- [ ] T043 [P] [US2] `FloorView`: room list (list mode, no floor map yet) with LED per room, click → navigate to room — `src/renderer/views/FloorView.tsx`
- [ ] T044 [P] [US2] `RoomView`: device detail panel — per-device name, type icon, `LEDIndicator`, `lastSeen` timestamp; empty-room message — `src/renderer/views/RoomView.tsx`
- [ ] T045 [US2] Navigation router: view-stack state machine, `navigate(view, id)` + `back()`, restores last path from `pref:lastHierarchyPath` on launch — `src/renderer/App.tsx`
- [ ] T046 [US2] Breadcrumb wiring: `Breadcrumb` receives current path segments and calls `navigate` on click — `src/renderer/App.tsx`
- [ ] T047 [US2] Integration test: `hierarchy:get` → `hierarchy:update(create region)` → `hierarchy:get` verifies new node present; `hierarchy:update(delete)` → verify cascade — `tests/integration/ipc/hierarchy-ipc.test.ts`

**Checkpoint**: Full drill-down navigation working end-to-end.

---

## Phase 5: User Story 3 — Floor Map & Room Placement (P3)

**Goal**: Upload PNG/JPEG floor plan; draw labelled room rectangles on SVG canvas; place device tiles (name + type + LED) inside rooms; live LED updates on canvas; layout persists.

**Independent Test**: Upload PNG, draw two rooms, add one device to each, confirm both LEDs appear on canvas and survive app restart.

- [ ] T048 [US3] `FloorMap` container: holds SVG canvas, image background, edit-mode toggle, upload button — `src/renderer/components/FloorMap/FloorMap.tsx`
- [ ] T049 [US3] Image upload handler: copies file to app-data dir, stores absolute path in `floors.floor_map_path` via `hierarchy:update`, missing-image placeholder when path invalid — `src/renderer/components/FloorMap/FloorMap.tsx` + `src/main/ipc/hierarchy-handlers.ts`
- [ ] T050 [US3] `RoomArea` SVG component: percentage-based `x/y/w/h` rect, label overlay, drag-to-reposition and resize in edit mode, LED overlay — `src/renderer/components/FloorMap/RoomArea.tsx`
- [ ] T051 [US3] `DeviceTile` SVG component: square tile inside `RoomArea`, device name + type label + `LEDIndicator`, drag-to-reposition in edit mode — `src/renderer/components/FloorMap/DeviceTile.tsx`
- [ ] T052 [US3] Map position persistence: `hierarchy:update` with `map_x/map_y/map_w/map_h` fields for rooms and `map_x/map_y` for devices; `FloorView` loads positions on mount — `src/main/ipc/hierarchy-handlers.ts`
- [ ] T053 [US3] `FloorView` floor-map mode: when `floor_map_path` set, render `FloorMap` canvas instead of list; keep list as fallback — `src/renderer/views/FloorView.tsx`

**Checkpoint**: Visual floor map with live device LEDs working and persisted.

---

## Phase 6: User Story 4 — Device Template & Module Registry (P4)

**Goal**: Config tab lists device types from registry; operator adds device instances to rooms with connection fields; credentials go to keychain; module starts polling; duplicate IP warning; pending-module guard.

**Independent Test**: Add a device using `zoom-room` template; verify module receives `connect()` call and device LED appears in room detail.

- [ ] T054 [US4] `ConfigView`: device template list from `device-registry.json` (via `hierarchy:get` or dedicated `registry:list` call); Add Device button per room — `src/renderer/views/ConfigView.tsx`
- [ ] T055 [US4] `AddDeviceForm`: template selector, dynamic field list from `configFields`, credential fields marked `secret` stored via keytar (not IPC), duplicate-IP warning on submit — `src/renderer/components/AddDeviceForm.tsx`
- [ ] T056 [US4] `device:command` IPC handler: validates payload, routes to `module.sendCommand(deviceId, command, params)`, logs outcome to `events` — `src/main/ipc/device-handlers.ts`
- [ ] T057 [US4] Module connect/disconnect lifecycle: on device `create` → `module.connect()`; on device `delete` → `module.disconnect()`, clear polling timer — `src/main/modules/index.ts`
- [ ] T058 [US4] Pending-module guard: `getModule(type)` returns `null` when no module class registered; UI shows "Pending module" badge, disables Add Device for that type — `src/main/modules/index.ts` + `src/renderer/components/AddDeviceForm.tsx`

**Checkpoint**: Full device lifecycle: add → connect → poll → status visible → delete → disconnect.

---

## Phase 7: User Story 5 — Configuration Download & Restore (P5)

**Goal**: Zoom Room config downloadable as versioned JSON; restorable with overwrite warning; human-readable output; consistent format across versions.

**Independent Test**: Download Zoom Room config → modify one field externally → restore original → confirm device returns to original state.

- [ ] T059 [US5] `ZoomModule` unit tests (write first, must FAIL): `connect` with mock HTTP, `ping` returns `DeviceStatus`, `downloadConfig` returns settings object, `restoreConfig` PUT call, `sendCommand('reboot')` — `tests/unit/zoom/ZoomModule.test.ts`
- [ ] T060 [US5] `ZoomModule` implementation: Zoom REST API calls from `resources/Zoom/zoom-api.md`; OAuth token via keytar; `connect`, `disconnect`, `ping`, `downloadConfig`, `restoreConfig`, `sendCommand` — `src/main/modules/zoom/ZoomModule.ts`
- [ ] T061 [P] [US5] `config:export` IPC handler: calls `module.downloadConfig()`, inserts into `device_configs` table (auto-increments `version`), saves JSON to user-chosen path — `src/main/ipc/config-handlers.ts`
- [ ] T062 [P] [US5] `config:import` IPC handler: loads JSON from payload, calls `module.restoreConfig()`, logs outcome; caller must pre-confirm overwrite — `src/main/ipc/config-handlers.ts`
- [ ] T063 [P] [US5] `config:list` IPC handler: queries `device_configs` for device, returns version/date/note list — `src/main/ipc/config-handlers.ts`
- [ ] T064 [US5] `ConfigPanel` component: download button, version history list, restore button + `ConfirmActionDialog` pre-confirm — `src/renderer/components/ConfigPanel.tsx`
- [ ] T065 [US5] Integration test: `config:export` → `config:list` shows one entry → `config:import` → module `restoreConfig` called with correct payload — `tests/integration/ipc/config-ipc.test.ts`

**Checkpoint**: Zoom config round-trip working end-to-end.

---

## Phase 8: User Story 6 — Self-Healing & Control Actions (P6)

**Goal**: Reboot action on RED/AMBER device; LED transitions AMBER (pending) → GREEN/RED on outcome; Open WebUI in system browser; confirmation dialog for all disruptive actions; all actions logged.

**Independent Test**: Trigger Reboot on a ZoomModule mock; verify device LED → AMBER; mock recovery → LED → GREEN; event log contains both state transitions.

- [ ] T066 [US6] Extend `device:command` handler: write `events` entry (device, command, outcome, OS username as operator) for every command call — `src/main/ipc/device-handlers.ts`
- [ ] T067 [US6] Action panel in `RoomView`: per-device action buttons dynamically built from `module.supportedActions()`; Reboot always present; Open WebUI if `webUiUrl` set; all disruptive actions route through `ConfirmActionDialog` — `src/renderer/views/RoomView.tsx`
- [ ] T068 [US6] LED AMBER-pending state: on Reboot command sent → set device status AMBER in DB + broadcast; on next successful ping → GREEN; on timeout (configurable) → RED — `src/main/ipc/device-handlers.ts`
- [ ] T069 [US6] Open WebUI action: `shell.openExternal(webUiUrl)` in main process, exposed via `device:command` with `command:'openWebUI'` — `src/main/ipc/device-handlers.ts`
- [ ] T070 [US6] `ZoomModule.sendCommand('reboot')`: POST reboot via Zoom API, returns `CommandResult` — `src/main/modules/zoom/ZoomModule.ts`

**Checkpoint**: Control actions working with confirmation, LED transitions, and event log.

---

## Phase 9: User Story 7 — Log Export & OTel Config Generation (P7)

**Goal**: Logs view shows reverse-chronological events; download as JSON/CSV; OTel YAML generated and validated for New Relic ingest.

**Independent Test**: Seed `events` table with 50 rows; `log:query` returns them newest-first; `log:download` CSV has correct columns; `otel:generateConfig` YAML parses without errors.

- [ ] T071 [P] [US7] `log:query` IPC handler: parameterised query with optional `deviceId`, `roomId`, `severity`, `since`, `limit` — `src/main/ipc/log-handlers.ts`
- [ ] T072 [P] [US7] `log:download` IPC handler: full events query, serialise to JSON or CSV, save via dialog or `savePath` — `src/main/ipc/log-handlers.ts`
- [ ] T073 [US7] `OtelConfigBuilder` service: iterates configured device types from registry, builds YAML with metric definitions per type, `otlp` exporter pointing at New Relic endpoint, `pref:otelNewRelicKey` placeholder — `src/main/services/OtelConfigBuilder.ts`
- [ ] T074 [US7] `otel:generateConfig` IPC handler: calls `OtelConfigBuilder`, saves YAML via dialog or `savePath` — `src/main/ipc/otel-handlers.ts`
- [ ] T075 [US7] `LogsView`: paginated event list, severity filter, timestamp + source + message columns, Download button — `src/renderer/views/LogsView.tsx`
- [ ] T076 [US7] `ObservabilityView`: New Relic key input (stored in preferences), Generate Config button, YAML preview pane, Download button — `src/renderer/views/ObservabilityView.tsx`

**Checkpoint**: All seven user stories functional.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T077 [P] Playwright E2E config: `mac` and `windows` projects, `baseURL`, screenshot on failure — `tests/e2e/playwright.config.ts`
- [ ] T078 [P] E2E smoke test — hierarchy drill-down: launch → Global → click RED region → click office → floor → room → verify device row visible — `tests/e2e/hierarchy-drill-down.spec.ts`
- [ ] T079 [P] E2E smoke test — floor map: upload PNG → draw room → add device → verify tile + LED visible on canvas — `tests/e2e/floor-map.spec.ts`
- [ ] T080 [P] E2E smoke test — Zoom config round-trip: connect mock Zoom → download config → restore config → verify success toast — `tests/e2e/zoom-config-round-trip.spec.ts`
- [ ] T081 [P] In-app markdown docs: one `.md` file per active module rendered by `react-markdown` — `src/renderer/menu/docs/zoom-room.md` (stub for others)
- [ ] T082 Cross-platform path handling audit: replace all hard-coded `/` separators with `path.join()`; test `network-check.ts` SSID detection on both platforms — `src/main/platform/network-check.ts` + all `db/` paths
- [ ] T083 [P] Window bounds persistence: save/restore `pref:windowBounds` on `BrowserWindow` `resize`/`move` events — `src/main/index.ts`
- [ ] T084 IPC payload validation: add `zod` or manual type-guard in every `ipcMain.handle` — reject malformed payloads with `{ success: false, error: 'Invalid payload' }` — all `src/main/ipc/*.ts`
- [ ] T085 [P] `db:schema` npm script: dumps current SQLite schema to stdout (`sqlite3 db .schema`) — `package.json` + `scripts/db-schema.ts`

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
| Polish | T077–T085 | Cross-cutting |
| **Total** | **85 tasks** | **7 user stories** |
