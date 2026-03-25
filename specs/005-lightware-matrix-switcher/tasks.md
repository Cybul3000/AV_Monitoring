# Tasks: Lightware Matrix Switcher — AV Monitoring Module

**Input**: Design documents from `/specs/005-lightware-matrix-switcher/`

---

## Phase 1: Setup

- [X] T001 Add `lightware-matrix` entry to `resources/device-registry.json` as device registry SSoT
- [X] T002 Extend `src/shared/ipc-types.ts` with Lightware-specific `DeviceStatus.meta` shape (ports array, presets array, temperature, fanStatus, productName, firmwareVersion, serialNumber)
- [X] T003 Confirm no new IPC channels are needed — Lightware state delivered via existing `device:status:all` broadcast; routing switch and preset recall via existing `device:command` channel (documented in `contracts/ipc-channels.md`)

## Phase 2: Foundational

- [X] T004 [P] Create `src/main/modules/lightware/LightwareDeviceState.ts` — `PortState` interface (`portId`, `direction`, `label`, `signalLocked`, `connectedSource`), `LightwareState` interface (`ports: Map<string, PortState>`, `presets`, `temperature`, `fanStatus`, `deviceFamily`, `connected`, `hasEverConnected`), `createEmptyState()`, `aggregateStatus()` LED logic (GREY/RED/AMBER/GREEN)
- [X] T005 [P] Create `src/main/modules/lightware/LightwareLW3Transport.ts` — `net.Socket` wrapper; 4-digit hex counter ID-tagged commands (`XXXX#command\r\n`); `Map<string, PendingCommand>` correlation; line-splitter buffer; `{ … }` block collector; CHG push event demux (`emit('change', path, value)`); NACK/error line detection (`pE`, `mE`, `mF`, `nE`, `E`); exponential reconnect backoff (1 s → 2 s → … → 30 s); `send()`, `connect()`, `destroy()` public API; typed `EventEmitter` events: `connected`, `disconnected`, `change`, `error`
- [X] T006 [P] Write unit tests `tests/unit/lightware/LightwareModule.test.ts` — `getStatusPoints()` returns reachable/signal_locked/hardware_fault; `connect()` calls transport with correct host/port; `disconnect()` calls `transport.destroy()`; LED aggregation (GREY never-connected, RED disconnected, GREEN all-locked, AMBER unlocked input); `sendCommand('switch')` MMX and MX2 path variants; `sendCommand('recallPreset')` MX2 and MMX variants; NACK error does not crash module
- [X] T007 Create `src/main/modules/lightware/LightwareModule.ts` — implements `DeviceModule`; `connect()` creates transport, wires `connected`/`disconnected`/`change` events, calls `transport.connect()`; `_runConnectSequence()`: `GET /.ProductName` (device family detection MX2 vs MMX), firmware/serial, `GETALL /MEDIA/VIDEO` (port enumeration), `DestinationConnectionList` (routing snapshot), presets (MX2: `GET /MEDIA/PRESET`; MMX: `GET /PRESETS/AVC/*.Name`), `OPEN` subscriptions; `_pollHealth()` every 10 s: `GET /SYS.Temperature`, `GET /SYS.FanStatus`; `_handleChange()` updates signal lock and routing on CHG push; `sendCommand()`: switch/switchAll/disconnect/recallPreset/ping; `ping()` re-runs connect sequence if connected; `_buildStatus()` returns meta with ports/presets/health
- [X] T008 Register `LightwareModule` in `src/main/modules/index.ts` module registry

## Phase 3: User Story 1 — Monitor Port Signal Lock Status (P1)

**Goal**: Signal lock state (locked/unlocked/unknown) reported for every input and output port within one polling interval.
**Independent Test**: Connect to device → query all ports → locked ports report `true`, no-cable ports report `false`.

- [X] T009 [US1] Implement `GETALL /MEDIA/VIDEO` parsing in `LightwareModule._parseGetAll()` — extracts `SignalPresent_Ix` and `PortName_Ix` properties to populate `state.ports` map dynamically (no hardcoded port counts) in `src/main/modules/lightware/LightwareModule.ts`
- [X] T010 [US1] Implement CHG event handler `_handleChange()` for `/MEDIA/VIDEO.SignalPresent_Ix` path — updates `port.signalLocked` in-place and sets `device.lastSeen` in `src/main/modules/lightware/LightwareModule.ts`
- [X] T011 [US1] Implement `OPEN /MEDIA/VIDEO` (and MX2/MMX variant of `/MEDIA/VIDEO/XP` or `/MEDIA/XP/VIDEO`) in `_runConnectSequence()` to subscribe to real-time signal and routing changes in `src/main/modules/lightware/LightwareModule.ts`
- [X] T012 [US1] Implement TCP disconnect handling in `LightwareLW3Transport` — on socket `close` event, emit `disconnected`, reject all pending commands, schedule exponential backoff reconnect in `src/main/modules/lightware/LightwareLW3Transport.ts`
- [X] T013 [US1] Wire `transport.on('disconnected')` in `LightwareModule.connect()` — set `state.connected = false`, clear poll timer in `src/main/modules/lightware/LightwareModule.ts`

## Phase 4: User Story 2 — Monitor and Control Input-to-Output Routing (P2)

**Goal**: Display current routing (which input feeds each output) and send switch commands to change routing.
**Independent Test**: Query routing → matches physical state; send switch command → new routing reflected within one poll interval.

- [X] T014 [US2] Implement `DestinationConnectionList` parsing in `LightwareModule._parseDestinationConnectionList()` — parses `I3:O1;I1:O2;0:O3` format, sets `connectedSource` on each output port in `src/main/modules/lightware/LightwareModule.ts`
- [X] T015 [US2] Implement `sendCommand('switch', { input, output })` — sends `CALL <xpPath>:switch(I2:O1)` with MX2/MMX path branch in `src/main/modules/lightware/LightwareModule.ts`
- [X] T016 [US2] Implement `sendCommand('switchAll', { input })` — sends `CALL <xpPath>:switchAll(I2)` in `src/main/modules/lightware/LightwareModule.ts`
- [X] T017 [US2] Implement `sendCommand('disconnect', { output })` — sends `CALL <xpPath>:switch(0:O1)` to disconnect an output in `src/main/modules/lightware/LightwareModule.ts`
- [X] T018 [US2] Create `src/renderer/components/DeviceDetail/LightwarePanel/LightwarePanel.tsx` — port signal lock grid + routing map; consumes `DeviceStatus.meta.ports` and `meta.presets` from `device:status:all` broadcast

## Phase 5: User Story 3 — Recall Routing Presets (P3)

**Goal**: List available preset names and recall a preset with a single action.
**Independent Test**: Query presets → list displayed; recall preset → routing state matches preset definition within two poll intervals.

- [X] T019 [US3] Implement MX2 preset parsing `_parsePresetsResponse()` — parses `pw /MEDIA/PRESET.Name_1=Conference Mode` lines in `src/main/modules/lightware/LightwareModule.ts`
- [X] T020 [US3] Implement MMX preset parsing `_parseMMXPresetsResponse()` — parses `pw /PRESETS/AVC/1.Name=Presentation Mode` lines in `src/main/modules/lightware/LightwareModule.ts`
- [X] T021 [US3] Implement `sendCommand('recallPreset', { name })` for MX2 (`CALL /MEDIA/PRESET/<name>:load()`) and `sendCommand('recallPreset', { index })` for MMX (`CALL /PRESETS/AVC:load(<index>)`) in `src/main/modules/lightware/LightwareModule.ts`
- [X] T022 [US3] [P] Include `meta.presets` array in `_buildStatus()` output so renderer can display the preset list in `src/main/modules/lightware/LightwareModule.ts`

## Phase 6: User Story 4 — Monitor Device Health (P4)

**Goal**: Report device model, firmware, serial number; detect temperature warnings and fan faults; update LED.
**Independent Test**: Query health properties → model/firmware/serial present; simulate fault → LED transitions to AMBER/RED.

- [X] T023 [US4] Implement device identity queries in `_runConnectSequence()`: `GET /.ProductName`, `GET /.FirmwareVersion`, `GET /.SerialNumber` → populate `state.productName`, `state.firmwareVersion`, `state.serialNumber` in `src/main/modules/lightware/LightwareModule.ts`
- [X] T024 [US4] Implement `_pollHealth()` — `GET /SYS.Temperature` and `GET /SYS.FanStatus` every 10 s, treat `pE` response as `null` (unknown), update `state.temperature` and `state.fanStatus` in `src/main/modules/lightware/LightwareModule.ts`
- [X] T025 [US4] Implement `aggregateStatus()` in `LightwareDeviceState.ts` — GREY (never connected), RED (disconnected), AMBER (fan FAULT or temperature > 70°C or any input port unlocked), GREEN (all normal) in `src/main/modules/lightware/LightwareDeviceState.ts`
- [X] T026 [US4] Start poll timer in `_runConnectSequence()` after initial snapshot via `setInterval(_pollHealth, 10_000)` in `src/main/modules/lightware/LightwareModule.ts`
- [X] T027 [US4] Clear poll timer in `disconnect()` and on `disconnected` event in `src/main/modules/lightware/LightwareModule.ts`

## Phase 7: Polish

- [X] T028 [P] Implement `LightwareLW3Transport._nextCounter()` — 4-digit hex counter wrapping 0001–9999 in `src/main/modules/lightware/LightwareLW3Transport.ts`
- [X] T029 [P] Implement `LightwareLW3Transport._rejectAllPending()` — resolves all in-flight pending commands with `ok: false` on disconnect or destroy in `src/main/modules/lightware/LightwareLW3Transport.ts`
- [X] T030 [P] Implement `LightwareLW3Transport.send()` timeout (10 s) — resolves with `ok: false` if no response block arrives within timeout in `src/main/modules/lightware/LightwareLW3Transport.ts`
- [X] T031 [P] Implement `LightwareLW3Transport.destroy()` — sets `_destroyed = true`, cancels reconnect timer, rejects all pending, destroys socket in `src/main/modules/lightware/LightwareLW3Transport.ts`
- [X] T032 [P] Confirm `device:command` IPC handler in `src/main/ipc/device-handlers.ts` routes Lightware commands (`switch`, `switchAll`, `disconnect`, `recallPreset`, `ping`) through `LightwareModule.sendCommand()`

## Dependencies & Execution Order

```
T001–T003 (Setup) → T004–T008 (Foundational) → T009–T013 (US1) → T014–T018 (US2)
→ T019–T022 (US3) → T023–T027 (US4) → T028–T032 (Polish)
```

Tasks marked [P] within the same phase can be worked in parallel.
T004 (`LightwareDeviceState.ts`) and T005 (`LightwareLW3Transport.ts`) are independent foundational tasks that can be written in parallel.
T006 (unit tests) must precede T007 (full module implementation) per test-first constitution.
T007 depends on both T004 and T005 being complete.
T009–T013 (US1 signal lock) must be complete before US2 routing work begins (routing depends on port map being populated).
