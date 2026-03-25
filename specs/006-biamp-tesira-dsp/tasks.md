# Tasks: Biamp Tesira DSP — AV Monitoring Module

**Input**: Design documents from `/specs/006-biamp-tesira-dsp/`

---

## Phase 1: Setup

- [X] T001 Add `biamp-tesira` entry to `resources/device-registry.json` as device registry SSoT (default port 22 for SSH transport)
- [X] T002 Create `src/main/db/migrations/004_biamp_configs.sql` — adds `biamp_block_configs` table (`id`, `device_id`, `block_type` CHECK IN ('level','dialer'), `instance_tag`, `label`, `channel_count`, `is_critical`, `sort_order`, UNIQUE device_id+instance_tag) and `biamp_preset_configs` table (`id`, `device_id`, `name`, `label`, `sort_order`, UNIQUE device_id+name)
- [X] T003 Extend `src/shared/ipc-types.ts` with Biamp-specific `DeviceStatus.meta` shape (`deviceModel`, `firmwareVersion`, `serialNumber`, `hostname`, `activeFaults`, `blocks`, `presets`, `transportType`)
- [X] T004 Confirm no new IPC channels are needed — state via existing `device:status:all`; mute/gain/preset commands via existing `device:command` channel

## Phase 2: Foundational

- [X] T005 [P] Create `src/main/modules/biamp-tesira/TesiraDeviceState.ts` — `FaultEntry` interface, `ChannelState` interface (`index`, `level`, `mute`), `BlockState` interface (`instanceTag`, `label`, `blockType`, `channels?`, `callState?`, `privacyMute?`, `isCritical?`), `TesiraState` interface, `createEmptyState()`, `aggregateStatus()` LED logic (GREY/RED/AMBER/GREEN with critical fault, non-critical fault, critical-block mute, dialer FAULT rules)
- [X] T006 [P] Create `src/main/modules/biamp-tesira/TTPTransport.ts` — dual-transport `EventEmitter` class; SSH path via `ssh2` `Client.shell({ term: 'vt100' })` (port 22); Telnet path via `net.Socket` + IAC negotiation byte loop (port 23), `_buildIacReply()` (WILL→DONT, DO→WONT, WONT→DONT, DONT→WONT); FIFO `_pendingQueue` (no command tagging — TTP is strictly sequential); line buffer `_handleRawData()` splitting on `\r?\n`; `_processLine()` classifying `+OK`, `-ERR`, `-CANNOT_DELIVER`, `-GENERAL_FAILURE`, combined push+ack (`! … +OK`), subscription push (`!`); `_emitPush()` extracting `publishToken` and value string; `parseTTPValue()` exported helper — quasi-JSON parser for space-delimited key-value pairs, object fields, arrays, scalars; exponential reconnect backoff (1 s → … → 30 s); `connect()`, `send()`, `destroy()` public API; typed events: `connected`, `disconnected`, `push`, `error`
- [X] T007 [P] Write unit tests `tests/unit/biamp-tesira/BiampTesiraModule.test.ts` — `getStatusPoints()` returns reachable/fault_free/audio_levels; `connect()` sends `SESSION set verbose true` as first command; `aggregateStatus()` GREEN/AMBER/RED/GREY for all LED rules; `sendCommand('setMute')` mute=true and mute=false; `sendCommand('setLevel')` gain clamp (-150→-100, 50→12, in-range unchanged); `sendCommand('recallPreset')` `DEVICE recallPresetByName "..."` format; error resilience (-ERR, -CANNOT_DELIVER do not crash module)
- [X] T008 Create `src/main/modules/biamp-tesira/BiampTesiraModule.ts` — implements `DeviceModule`; `connect()` determines transport type from port (22→ssh, 23→telnet), creates `TTPTransport`, wires `connected`/`disconnected`/`push`/`error` events, loads credentials via `loadDeviceCredentials('biamp-tesira', deviceId, ['username','password'])`, calls `transport.connect()`; `_onConnected()` sequence: `SESSION set verbose true`, `DEVICE get deviceInfo`, `DEVICE get networkStatus`, `SESSION get aliases`, `DEVICE get activeFaultList`, `_initBlocks()` (reads `biamp_block_configs` from DB, initialises level/dialer blocks and subscribes), `_loadPresetsFromDb()` (reads `biamp_preset_configs`), starts poll timer; `_runFaultPoll()` every 15 s: `DEVICE get activeFaultList`; `_handlePush()` demuxes publishToken to update channel level/mute or dialer callState/privacyMute; `sendCommand()`: setMute/toggleMute/setLevel/recallPreset/ping; gain clamped to [-100, 12] dB before send; `_sendSafe()` non-throwing wrapper; `_buildMeta()` returns full meta shape; `_parseFaultList()` regex-based quasi-JSON fault array parser; `downloadConfig()`/`restoreConfig()` return empty objects
- [X] T009 Register `BiampTesiraModule` in `src/main/modules/index.ts` module registry

## Phase 3: User Story 1 — Monitor Device Faults and Health Status (P1)

**Goal**: Connect to device, display identity (model/firmware/serial/hostname), LED reflects fault severity.
**Independent Test**: Connect → GREEN (no faults); inject fault → AMBER; inject critical fault → RED.

- [X] T010 [US1] Implement connect sequence step 1: `SESSION set verbose true` sent as first command after SSH/Telnet session is ready in `src/main/modules/biamp-tesira/TTPTransport.ts` and `src/main/modules/biamp-tesira/BiampTesiraModule.ts`
- [X] T011 [US1] Implement connect sequence steps 2–3: `DEVICE get deviceInfo` and `DEVICE get networkStatus` — parse quasi-JSON via `parseTTPValue()` to populate `state.deviceModel`, `state.firmwareVersion`, `state.serialNumber`, `state.hostname` in `src/main/modules/biamp-tesira/BiampTesiraModule.ts`
- [X] T012 [US1] Implement `_runFaultPoll()` — sends `DEVICE get activeFaultList`, calls `_parseFaultList()` to parse `+OK "value":[{...}]` or `+OK "list":[{...}]`, updates `ctx.state.activeFaults` in `src/main/modules/biamp-tesira/BiampTesiraModule.ts`
- [X] T013 [US1] Implement `aggregateStatus()` LED rules in `src/main/modules/biamp-tesira/TesiraDeviceState.ts` — GREY (never connected: `connected=false && deviceModel=null`), RED (disconnected after seen), RED (any fault severity `critical` case-insensitive), AMBER (any fault present), AMBER (isCritical level block channel muted), AMBER (dialer block callState=FAULT), GREEN (all normal)
- [X] T014 [US1] Start poll timer in `_onConnected()` via `_startPollTimer(ctx, 15_000)` after blocks are initialised in `src/main/modules/biamp-tesira/BiampTesiraModule.ts`
- [X] T015 [US1] Handle `transport.on('disconnected')` — set `ctx.state.connected = false` (poll timer continues, returns errors until reconnect) in `src/main/modules/biamp-tesira/BiampTesiraModule.ts`
- [X] T016 [US1] Create `src/renderer/components/DeviceDetail/BiampTesiraPanel/BiampTesiraPanel.tsx` — fault list + block grid + preset list; consumes `DeviceStatus.meta` from `device:status:all` broadcast

## Phase 4: User Story 2 — Monitor and Control Audio Levels (P2)

**Goal**: Display gain (dB) and mute state for each configured LevelControl block; allow mute/unmute and gain changes.
**Independent Test**: Query level block → gain and mute values displayed; send mute command → state confirmed within one poll interval.

- [X] T017 [US2] Implement `_initLevelBlock()` — queries `get level` and `get mute` per channel (1..channel_count), then subscribes with `subscribe level <ch> <token> 500` and `subscribe mute <ch> <token> 100`; token format: `{instanceTag}_level_{ch}` and `{instanceTag}_mute_{ch}` in `src/main/modules/biamp-tesira/BiampTesiraModule.ts`
- [X] T018 [US2] Implement `_handlePush()` for level blocks — parses publishToken `{instanceTag}_{field}_{channel}`, finds block in `ctx.state.blocks`, updates `ch.level` (parseFloat) or `ch.mute` (=== 'true') in `src/main/modules/biamp-tesira/BiampTesiraModule.ts`
- [X] T019 [US2] Implement `_cmdSetMute()` — sends `{instanceTag} set mute {channel} true/false`; requires `instanceTag`, `channel`, `mute` params in `src/main/modules/biamp-tesira/BiampTesiraModule.ts`
- [X] T020 [US2] Implement `_cmdToggleMute()` — sends `{instanceTag} toggle mute {channel}` in `src/main/modules/biamp-tesira/BiampTesiraModule.ts`
- [X] T021 [US2] Implement `_cmdSetLevel()` with `clampLevel()` — clamps `levelDb` to `[-100, 12]` before sending `{instanceTag} set level {channel} {levelDb}` in `src/main/modules/biamp-tesira/BiampTesiraModule.ts`
- [X] T022 [US2] Implement `parseTTPValue()` quasi-JSON parser in `src/main/modules/biamp-tesira/TTPTransport.ts` — handles `+OK "value":{...}` object (space-delimited pairs), `+OK "value":scalar`, `+OK "list":[...]` array, plain scalar; uses regex extraction (no `JSON.parse` on multi-field payloads)

## Phase 5: User Story 3 — Recall Audio Presets (P3)

**Goal**: Display operator-configured preset list; recall a preset by name with one action.
**Independent Test**: Preset list displayed from DB config; recall command sends `DEVICE recallPresetByName`; states updated within two poll intervals.

- [X] T023 [US3] Implement `_loadPresetsFromDb()` — queries `biamp_preset_configs WHERE device_id = ?` ordered by `sort_order`, maps to `{ name, label }` array in `ctx.state.presets` in `src/main/modules/biamp-tesira/BiampTesiraModule.ts`
- [X] T024 [US3] Implement `_cmdRecallPreset()` — sends `DEVICE recallPresetByName "{name}"` (name must be double-quoted in command), requires `name` param in `src/main/modules/biamp-tesira/BiampTesiraModule.ts`
- [X] T025 [US3] Include `state.presets` in `_buildMeta()` output so renderer can display the operator-configured preset list in `src/main/modules/biamp-tesira/BiampTesiraModule.ts`

## Phase 6: User Story 4 — Monitor Conferencing Call State (P4)

**Goal**: Display VoIP dialer call state (IDLE/ACTIVE/FAULT) and privacy mute for configured dialer blocks.
**Independent Test**: On device with dialer block configured → call state and privacy mute shown; no dialer configured → no call state shown, no error.

- [X] T026 [US4] Implement `_initDialerBlock()` — queries `get callState 1` and `get privacyMute 1`, subscribes with tokens `{instanceTag}_callState_1` and `{instanceTag}_privacyMute_1` (interval 100 ms) in `src/main/modules/biamp-tesira/BiampTesiraModule.ts`
- [X] T027 [US4] Implement `_handlePush()` for dialer blocks — updates `block.callState` (IDLE/ACTIVE/FAULT guard) and `block.privacyMute` from push events in `src/main/modules/biamp-tesira/BiampTesiraModule.ts`
- [X] T028 [US4] Handle `-ERR address not found` in `_initDialerBlock()` gracefully — log WARN, mark block state unknown (callState=null), do not crash `_onConnected()` sequence in `src/main/modules/biamp-tesira/BiampTesiraModule.ts`
- [X] T029 [US4] Include dialer blocks with `callState` and `privacyMute` in `_buildMeta()` blocks array in `src/main/modules/biamp-tesira/BiampTesiraModule.ts`

## Phase 7: Polish

- [X] T030 [P] Implement `TTPTransport` Telnet IAC negotiation in `_connectTelnet()` — byte-level state machine handles WILL/WONT/DO/DONT, replies with `_buildIacReply()`, strips IAC bytes from text, declares connected when non-IAC text received in `src/main/modules/biamp-tesira/TTPTransport.ts`
- [X] T031 [P] Implement `TTPTransport._processLine()` combined push+ack detection — line starts with `!` and ends with ` +OK`: dispatch push via `_emitPush()` then resolve head of pending queue in `src/main/modules/biamp-tesira/TTPTransport.ts`
- [X] T032 [P] Implement `TTPTransport._handleDisconnect()` — drains pending queue with error response, calls `_teardown()`, emits `disconnected`, schedules reconnect (if not destroyed) in `src/main/modules/biamp-tesira/TTPTransport.ts`
- [X] T033 [P] Implement `_sendSafe()` in `BiampTesiraModule` — wraps `ctx.transport.send()` with try/catch, returns `{ ok: false, value: null, error: 'send failed' }` on throw; all connect-sequence sends use this method in `src/main/modules/biamp-tesira/BiampTesiraModule.ts`
- [X] T034 [P] Implement `SESSION get aliases` call in `_onConnected()` connect sequence (step 4) — non-fatal; validates configured block instance tags exist in the active Tesira design in `src/main/modules/biamp-tesira/BiampTesiraModule.ts`
- [X] T035 [P] Implement `_refreshAllBlocks()` used by `ping()` — re-queries `get level` and `get mute` per channel for all level blocks, and `get callState` for all dialer blocks in `src/main/modules/biamp-tesira/BiampTesiraModule.ts`
- [X] T036 [P] Confirm `biamp_block_configs` migration in `src/main/db/migrations/004_biamp_configs.sql` includes `is_critical` column (INTEGER, default 0) used by LED aggregation for critical-muted-channel AMBER rule
- [X] T037 [P] Confirm `device:command` IPC handler in `src/main/ipc/device-handlers.ts` routes Biamp commands (`setMute`, `toggleMute`, `setLevel`, `recallPreset`, `ping`) through `BiampTesiraModule.sendCommand()`

## Dependencies & Execution Order

```
T001–T004 (Setup) → T005–T009 (Foundational) → T010–T016 (US1) → T017–T022 (US2)
→ T023–T025 (US3) → T026–T029 (US4) → T030–T037 (Polish)
```

Tasks marked [P] within the same phase can be worked in parallel.
T005 (`TesiraDeviceState.ts`) and T006 (`TTPTransport.ts`) are independent foundational tasks that can be written in parallel.
T007 (unit tests) must precede T008 (full module implementation) per test-first constitution.
T008 depends on both T005 and T006 being complete.
T002 (DB migration) must be applied before T008 can query `biamp_block_configs` and `biamp_preset_configs`.
T017–T022 (US2 audio levels) depends on T010 (`SESSION set verbose true`) because the subscription `! +OK` ack pattern is only reliable after verbose mode is enabled.
T026–T029 (US4 dialer) depends on US2 foundational block initialisation patterns being in place (T017–T018 push handling).
