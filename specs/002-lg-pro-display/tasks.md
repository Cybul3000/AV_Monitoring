# Tasks: LG Pro Display — AV Monitoring Module

**Input**: Design documents from `/specs/002-lg-pro-display/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/lg-ipc.md ✅

---

## Phase 1: Setup

- [X] T001 Verify `lg-display` entry exists in `resources/device-registry.json`
- [X] T002 Verify `LGDisplayModule` is registered in `src/main/modules/index.ts`
- [X] T003 [P] Create directory `src/main/modules/lg-display/`
- [X] T004 [P] Create directory `src/renderer/components/DeviceDetail/LGDisplayPanel/`
- [X] T005 [P] Create directory `tests/unit/lg-display/`

---

## Phase 2: Foundational

- [X] T006 Create `LGTCPTransport.ts` — persistent TCP socket, command queue, exponential backoff reconnect in `src/main/modules/lg-display/LGTCPTransport.ts`
- [X] T007 [P] Write unit tests for `LGDisplayModule` LED logic and poll cycle in `tests/unit/lg-display/LGDisplayModule.test.ts`

---

## Phase 3: User Story 1 — Monitor Power and Connectivity (P1) 🎯 MVP

**Goal**: TCP connection established; power state polled and reflected in LED status within one poll interval.

**Independent Test**: Connect to a display, toggle power, verify LED flips GREEN ↔ AMBER/RED within 5 s.

- [X] T008 [US1] Implement `LGDisplayModule.ts` — `connect()`, `disconnect()`, `ping()`, `_pollDevice()` (power query `ka ff`), `_calculateLED()` in `src/main/modules/lg-display/LGDisplayModule.ts`
- [X] T009 [P] [US1] Implement LED rules: GREY (not polled) → GREEN (power on) → AMBER (power off or screen muted) → RED (disconnected) in `src/main/modules/lg-display/LGDisplayModule.ts`
- [X] T010 [P] [US1] Implement auto-reconnect on TCP disconnect via `_scheduleReconnect()` with exponential backoff in `src/main/modules/lg-display/LGTCPTransport.ts`
- [X] T011 [US1] Create `LGDisplayPanel.tsx` — connection status banner, power state badge, Power On / Power Off buttons in `src/renderer/components/DeviceDetail/LGDisplayPanel/LGDisplayPanel.tsx`

**Checkpoint**: Power monitoring functional and independently testable.

---

## Phase 4: User Story 2 — Monitor and Control Input Source (P2)

**Goal**: Current input source polled and displayed; operator can switch input remotely.

**Independent Test**: Query display input, verify label (e.g. "HDMI 1") shown; send `setInput` command, confirm display switches.

- [X] T012 [US2] Extend `_pollDevice()` with input source query `xb ff`; map hex codes to labels via `INPUT_CODE_MAP` in `src/main/modules/lg-display/LGDisplayModule.ts`
- [X] T013 [P] [US2] Implement `setInput` case in `sendCommand()` with `inputCode` param validation in `src/main/modules/lg-display/LGDisplayModule.ts`
- [X] T014 [P] [US2] Add input source display and dropdown selector to `LGDisplayPanel.tsx` in `src/renderer/components/DeviceDetail/LGDisplayPanel/LGDisplayPanel.tsx`

**Checkpoint**: Input monitoring and switching functional.

---

## Phase 5: User Story 3 — Monitor Audio and Screen Mute States (P3)

**Goal**: Screen mute and volume mute states polled; operator can toggle either mute remotely.

**Independent Test**: Enable screen mute on display, verify module reports "Muted"; send `screenMuteOff`, verify unmuted.

- [X] T015 [US3] Extend `_pollDevice()` with screen mute `kd ff` and volume mute `ke ff` queries in `src/main/modules/lg-display/LGDisplayModule.ts`
- [X] T016 [P] [US3] Implement `screenMuteOn`, `screenMuteOff`, `volumeMuteOn`, `volumeMuteOff` cases in `sendCommand()` in `src/main/modules/lg-display/LGDisplayModule.ts`
- [X] T017 [P] [US3] Add screen mute and volume mute sections with toggle buttons to `LGDisplayPanel.tsx` in `src/renderer/components/DeviceDetail/LGDisplayPanel/LGDisplayPanel.tsx`

**Checkpoint**: Mute monitoring and control functional.

---

## Phase 6: User Story 4 — Monitor Volume Level (P4)

**Goal**: Volume level (0–100) polled and displayed; operator can set, increase, or decrease volume.

**Independent Test**: Set display to volume 50, verify module reports 50; send `volumeUp`, verify 60 reported.

- [X] T018 [US4] Extend `_pollDevice()` with volume level query `kf ff` in `src/main/modules/lg-display/LGDisplayModule.ts`
- [X] T019 [P] [US4] Implement `setVolume` (clamped 0–100), `volumeUp` (+10, max 100), `volumeDown` (−10, min 0) in `sendCommand()` in `src/main/modules/lg-display/LGDisplayModule.ts`
- [X] T020 [P] [US4] Add volume level display, visual bar, and +10/−10 buttons to `LGDisplayPanel.tsx` in `src/renderer/components/DeviceDetail/LGDisplayPanel/LGDisplayPanel.tsx`

**Checkpoint**: All four user stories complete. Module fully functional.

---

## Phase 7: Polish

- [X] T021 [P] Verify `LGDisplayPanel` is wired into `RoomView.tsx` for `device_type === 'lg-display'`
- [X] T022 [P] Confirm NG response handling: logged as `console.warn` with `[LGDisplayModule]` prefix, polling continues
- [X] T023 [P] Confirm verbose logging in `LGTCPTransport.ts`: all sent/received lines logged when `verbose = true`
- [X] T024 Run full test suite (`npm test`) — verify all tests pass

---

## Phase 8: Post-integration Fixes & Enhancements

- [X] T025 Fix `_drainBuffer()` — replace `\r`/`\n` line-split with regex pattern scan (`MSG_RE`) to handle LG displays that terminate with `x` only, no CR/LF in `src/main/modules/lg-display/LGTCPTransport.ts`
- [X] T026 Fix `_handleLine()` regex — allow zero-or-more hex digits after OK/NG to parse `"NGx"` firmware variant (no data bytes) in `src/main/modules/lg-display/LGTCPTransport.ts`
- [X] T027 Fix volume mute (`ke`) polarity — `0x00` = muted, `0x01` = not muted (reversed vs screen mute convention) in `src/main/modules/lg-display/LGDisplayModule.ts`
- [X] T028 Add configurable Set ID — `setId` configField in device-registry, `options_json` column (migration 007), end-to-end options pipeline from form → DB → `module.connect()` in `resources/device-registry.json`, `src/main/db/migrations/007_device_options.sql`, `src/main/ipc/hierarchy-handlers.ts`, `src/main/ipc/device-handlers.ts`
- [X] T029 Fix `config` dropped in Add Device handlers — pass `data.config` in `ConfigView.tsx` and `RoomView.tsx` `handleAdd` calls in `src/renderer/views/ConfigView.tsx`, `src/renderer/views/RoomView.tsx`
- [X] T030 Add LG protocol trace toggle — `onTrace` callback writes TX/RX to `events` table when `pref:lgProtocolTrace` is enabled; Settings > Debug checkbox in `src/main/modules/lg-display/LGDisplayModule.ts`, `src/main/modules/lg-display/LGTCPTransport.ts`, `src/renderer/views/SettingsView.tsx`
- [X] T031 [P] Write unit tests for `LGTCPTransport` — bare-x, CR, CRLF, NGx (no data), zero-padded setId, setSetId formatting in `tests/unit/lg-display/LGTCPTransport.test.ts`
- [X] T032 [P] Fix integration test DB setup — apply all migrations in order instead of cherry-picked files in `tests/integration/alert-rules.test.ts`, `tests/integration/ipc/hierarchy-ipc.test.ts`
- [X] T033 Run full test suite (`npm test`) — verify all 294 tests pass

---

## Dependencies & Execution Order

- **Phase 1–2**: Setup and transport layer — T006 blocks all module tasks
- **Phase 3 (US1)**: Must complete before phases 4–6 (LED and poll cycle are foundational)
- **Phases 4–6 (US2–US4)**: Can proceed in parallel after US1 poll cycle is implemented
- **Phase 7**: After all user stories complete

## Parallel Opportunities

Within each story: module and renderer tasks marked [P] can run in parallel.
US2, US3, US4 can be implemented in parallel once US1 poll cycle is complete.

## Implementation Strategy

### MVP (US1 only)
1. T001–T007 Setup + Transport
2. T008–T011 Power monitoring + LED
3. Validate independently — display power state visible in UI

### Full Delivery
Add US2 → US3 → US4 in sequence, validating each story independently.
