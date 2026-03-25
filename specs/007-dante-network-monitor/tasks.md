# Tasks: Dante Network Monitor — Architectural Consistency Refactor

**Input**: Design documents from `/specs/007-dante-network-monitor/`
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅

**Scope**: Targeted refactor — 3 source files + 2 spec annotation files. No new migration, no new IPC channels, no renderer changes.

**Tests**: Constitution Principle IV (Test-First) is mandatory. Tests must fail before implementation on each phase.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

**Purpose**: Verify baseline — no new project setup needed; existing structure is used as-is.

- [X] T001 Verify branch `007-dante-network-monitor` is checked out and `resources/device-registry.json`, `src/main/modules/dante/DanteModule.ts`, and `tests/unit/dante/DanteModule.test.ts` are readable

---

## Phase 2: Foundational — Device Registry Correction

**Purpose**: The device registry is the entry point. All user stories depend on the correct registry definition before the Config UI or module wiring can be verified.

**⚠️ CRITICAL**: US1 cannot be tested until this phase is complete.

- [X] T002 [US1] Write failing test in `tests/unit/dante/DanteModule.test.ts` asserting that `DanteModule.type === 'dante-network-audio'` (smoke check — confirms module type matches registry)
- [X] T003 Update `resources/device-registry.json`: replace the `dante-network-audio` entry so it has `"module": "DanteModule"`, `"protocol": "mDNS/UDP"`, `"port": null`, and a single optional `host` field with label `"Network Interface"` and hint text — remove `required: true`, remove `arcPort` field, remove any `dante-audio` per-device entry
- [X] T004 Verify no `dante-audio` or any other legacy Dante entry exists anywhere in `resources/device-registry.json`

**Checkpoint**: Registry has exactly one Dante entry with zero required fields.

---

## Phase 3: User Story 1 — Register Dante Network with Zero Required Config (Priority: P1) 🎯 MVP

**Goal**: Operator adds a Dante Network entry to a room with no mandatory IP, host, or device name — only an optional network interface field.

**Independent Test**: Inspect `resources/device-registry.json` and confirm: type=`dante-network-audio`, configFields has exactly one entry (`host`), no field has `required: true`, no `arcPort` field exists.

- [X] T005 [US1] Write failing test in `tests/unit/dante/DanteModule.test.ts`: call `mod.connect('anchor-id', {})` (empty config — simulating blank interface field) and assert it does not throw
- [X] T006 [US1] Update `DanteModule.connect()` in `src/main/modules/dante/DanteModule.ts`: change signature from `connect(_deviceId, _config)` to `connect(deviceId, config)` (remove underscore prefixes); store `this._anchorDeviceId = deviceId`; pass `resolveInterfaceIp(config.host)` to all three `start()` calls (discovery, heartbeat, notification)
- [X] T007 [US1] Add private field `private _anchorDeviceId: string | null = null` to the `DanteModule` class body in `src/main/modules/dante/DanteModule.ts`
- [X] T008 [US1] Confirm T005 test now passes — `connect('anchor-id', {})` does not throw and `_anchorDeviceId` is set

**Checkpoint**: `DanteModule.connect()` accepts the app-level `deviceId` and stores it. Config UI shows only one optional field.

---

## Phase 4: User Story 2 — Discovered Devices Use Correct Gateway `deviceId` (Priority: P2)

**Goal**: All `DanteDeviceState` objects created on device discovery use the gateway `deviceId` (from `connect()`), not a random UUID. Ensures `dante_devices.device_id` FK correctly points to the Dante Network gateway row.

**Independent Test**: Call `connect('anchor-id', {})`, simulate a `device-found` event, then call `getDeviceSnapshots()` and verify that each returned snapshot has `deviceId === 'anchor-id'`.

- [X] T009 [US2] Write failing test in `tests/unit/dante/DanteModule.test.ts`: after `connect('anchor-id', {})`, emit a mock `device-found` event on the discovery instance, then call `mod.getDeviceSnapshots()` and assert that `snapshots[0].deviceId === 'anchor-id'`
- [X] T010 [US2] Update `DanteModule._onDeviceFound()` in `src/main/modules/dante/DanteModule.ts`: replace `deviceId: randomUUID(), // Will be overridden when linked to DB device record` with `deviceId: this._anchorDeviceId ?? randomUUID()` in the new `DanteDeviceState` object construction
- [X] T011 [US2] Confirm T009 test now passes — discovered device snapshot carries `deviceId === 'anchor-id'`

**Checkpoint**: `dante_devices.device_id` will be set to the gateway `devices.id` for all discovered Dante endpoints.

---

## Phase 5: User Story 3 — `ping()` Returns Aggregate LED Status (Priority: P3)

**Goal**: `DanteModule.ping(deviceId)` returns a meaningful aggregate LED status across all discovered Dante devices, not always GREY. The Dante Network gateway's LED in the hierarchy now reflects real network health.

**Independent Test**: After `connect('anchor-id', {})`: with no discovered devices, `ping()` returns GREY; with one GREEN device, returns GREEN; with one AMBER device, returns AMBER; with one RED device, returns RED; with discovery completed but zero devices found (handled by AMBER fallback).

- [X] T012 [US3] Write failing tests in `tests/unit/dante/DanteModule.test.ts`:
  - `ping('anchor-id')` with no discovered devices → `status: 'GREY'`, `deviceId: 'anchor-id'`
  - After injecting one device state with `ledStatus: 'GREEN'` → `status: 'GREEN'`
  - After injecting one device state with `ledStatus: 'AMBER'` → `status: 'AMBER'`
  - After injecting one device state with `ledStatus: 'RED'` → `status: 'RED'`
  - After injecting two device states (one GREEN, one AMBER) → `status: 'AMBER'`
- [X] T013 [US3] Rewrite `DanteModule.ping()` in `src/main/modules/dante/DanteModule.ts`: remove the `found`/`state.deviceId` search logic; implement aggregate roll-up: if `_devices` is empty → GREY; iterate all states using worst-case: RED beats AMBER beats GREEN beats GREY; return `{ deviceId: this._anchorDeviceId ?? _deviceId, status: worstStatus, lastSeen: latestSeen }`
- [X] T014 [US3] Handle edge case in `ping()`: if `_devices.size > 0` but worst status is still GREY (devices discovered via mDNS but ARC not yet queried), return AMBER instead — indicates "discovered but not yet confirmed healthy"
- [X] T015 [US3] `lastSeen` in `ping()` return value: iterate all device states and return the most recent `lastHeartbeat.toISOString()`, or `null` if none has a heartbeat yet
- [X] T016 [US3] Confirm all T012 tests now pass

**Checkpoint**: The Dante Network LED in `device:status:all` broadcast now reflects real Dante network health. Hierarchy roll-up (room → floor → office → region) works correctly for Dante.

---

## Phase 6: User Stories 4 & 5 — Verify No Regression in Subscriptions and Settings

**Goal**: The subscription (US4) and settings/AVIO gain (US5) commands in `DanteModule.sendCommand()` were not broken by spec 003. Confirm they still work after the refactor and receive the correct `deviceId` pass-through.

**Independent Test**: Call `mod.sendCommand('anchor-id', 'setSettings', { deviceId: 'non-existent', sampleRate: 12000 })` and assert it returns `success: false` (invalid sample rate).

- [X] T017 [P] [US4] Confirm existing test `'setSettings rejects invalid sampleRate'` still passes after T013 rewrite in `tests/unit/dante/DanteModule.test.ts`
- [X] T018 [P] [US4] Confirm existing test `'setSettings rejects invalid encoding'` still passes in `tests/unit/dante/DanteModule.test.ts`
- [X] T019 [P] [US5] Confirm existing test `'gainSet on non-AVIO device returns error'` still passes in `tests/unit/dante/DanteModule.test.ts`

**Checkpoint**: Subscription and settings tests green — no regression from refactor.

---

## Phase 7: Polish & Spec Corrections

**Purpose**: Update spec 003 artifacts with correction notes and run full test suite.

- [X] T020 [P] Add correction note to the Key Entities section of `specs/003-dante-network-audio/data-model.md`: prepend a blockquote stating `> **Correction (spec 007)**: The description below originally stated "One physical Dante device maps to one app 'devices' record". The correct model is the singleton-gateway pattern. See specs/007-dante-network-monitor/data-model.md for the authoritative corrected model.`
- [X] T021 [P] Add correction note to the Constitution Check section of `specs/003-dante-network-audio/plan.md`: add a line under Principle II noting `> **Correction (spec 007)**: The original plan noted Dante devices exist within Rooms as device-per-endpoint. Corrected to singleton-gateway — one 'devices' row = Dante Network gateway; all discovered endpoints in dante_devices only.`
- [X] T022 Run full Dante test suite in `tests/unit/dante/` and confirm all tests pass: `npm test -- tests/unit/dante/`
- [X] T023 Run `tests/integration/dante/` if available and confirm no regressions
- [X] T024 Verify `resources/device-registry.json` against the quickstart.md verification checklist in `specs/007-dante-network-monitor/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: No dependencies — registry fix is independent
- **Phase 3 (US1)**: Depends on Phase 2 (registry must be correct before connect() test makes sense)
- **Phase 4 (US2)**: Depends on Phase 3 (`_anchorDeviceId` must exist before `_onDeviceFound` can use it)
- **Phase 5 (US3)**: Depends on Phase 4 (`_anchorDeviceId` must be stored before `ping()` can return it)
- **Phase 6 (US4/US5)**: Can run in parallel with Phase 5 — independent verification
- **Phase 7 (Polish)**: Depends on Phases 5 and 6 — run after all implementation complete

### User Story Dependencies

- **US1 (P1)**: Registry fix — independent, no code dependencies
- **US2 (P2)**: Requires `_anchorDeviceId` from US1 phase
- **US3 (P3)**: Requires `_anchorDeviceId` from US2 phase (`ping()` uses it)
- **US4/US5 (P4/P5)**: Independent regression check — parallel with US3

### Within Each Phase

- Write failing test → implement → confirm test passes (TDD sequence)
- T007 must precede T006 (field before method that uses it)
- T009 depends on T006+T007 (`_anchorDeviceId` must exist for `_onDeviceFound` test)
- T012 depends on T010 (tests injecting discovered device states work only after `_anchorDeviceId` propagation)

### Parallel Opportunities

- T002, T003, T004 can run in parallel (different concerns within the registry)
- T017, T018, T019 can run in parallel (independent regression checks)
- T020, T021 can run in parallel (different spec files)

---

## Parallel Example: Phase 6

```bash
# Run all three regression checks simultaneously:
Task: T017 — Confirm setSettings invalid sampleRate test passes
Task: T018 — Confirm setSettings invalid encoding test passes
Task: T019 — Confirm gainSet non-AVIO test passes
```

---

## Implementation Strategy

### MVP (US1 Only)

1. Complete T001–T004 (Setup + Foundational)
2. Complete T005–T008 (US1 — registry fix + connect() stores deviceId)
3. **STOP and VALIDATE**: Config form shows one optional field; `connect()` stores anchor

### Full Refactor (Recommended)

1. T001–T004: Baseline + registry
2. T005–T008: US1 anchor pattern
3. T009–T011: US2 `_onDeviceFound` fix
4. T012–T016: US3 `ping()` aggregate LED
5. T017–T019: US4/US5 regression (parallel)
6. T020–T024: Polish + test suite

### Single-Developer Sequence

All 24 tasks in order T001 → T024. Each task is small (single method or annotation). Estimated effort: 1–2 hours total.

---

## Notes

- [P] tasks = different files or independent assertions, no inter-task dependencies
- Constitution IV (Test-First) is mandatory — tests MUST fail before implementation at each phase
- The TDD sequence is: write test → confirm fail → implement → confirm pass
- No new files created — only edits to existing files
- Commit after each phase checkpoint to enable easy rollback
