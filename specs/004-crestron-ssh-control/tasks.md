# Tasks: Crestron SSH Control — AV Monitoring Module

**Input**: Design documents from `/specs/004-crestron-ssh-control/`

---

## Phase 1: Setup

- [X] T001 Add `crestron-ssh` entry to `resources/device-registry.json` as device registry SSoT
- [X] T002 Extend `src/shared/ipc-types.ts` with `SSHSessionState` union type and SSH IPC payload types (`SSHOpenPayload`, `SSHSendPayload`, `SSHOutputEvent`, `SSHStateEvent`)
- [X] T003 Verify `ssh2` 1.x is present in `package.json` dependencies (already required by project stack)
- [X] T004 Confirm `ssh_device_profiles` table exists in `src/main/db/migrations/001_initial.sql` with `device_type`, `prompt_pattern`, `disconnect_cmd`, `default_program_slot` columns

## Phase 2: Foundational

- [X] T005 [P] Create `src/main/modules/crestron-ssh/SSHSessionManager.ts` — `EventEmitter` subclass wrapping `ssh2` `Client.shell()`, state machine (CLOSED→CONNECTING→READY→BUSY→CLOSED/ERROR), prompt regex detection, output streaming, `open()`/`send()`/`close()`/`destroy()` methods
- [X] T006 [P] Write unit tests `tests/unit/crestron-ssh/SSHSessionManager.test.ts` — state transitions, prompt detection for CP4 (`CP4N>`) and VC4 (`[admin@hostname ~]$`), prompt timeout (10 s), auth failure, `shell()` error, output event emission, disconnect command (`BYE`/`exit`), unexpected stream close
- [X] T007 Create `src/main/modules/crestron-ssh/CrestronSSHModule.ts` — implements `DeviceModule`; registers device config on `connect()` without opening SSH; `sendCommand('openSSH')` creates `SSHSessionManager`, loads credentials from keychain via `loadDeviceCredentials`, loads profile from `ssh_device_profiles` DB table (falls back to CP4 defaults); `disconnect()` closes session; `ping()` performs TCP probe via `net.createConnection`; `registerCallbacks()` wires state/output events; `downloadConfig()`/`restoreConfig()` return empty objects
- [X] T008 Write unit tests `tests/unit/crestron-ssh/CrestronSSHModule.test.ts` — `getStatusPoints()`, module identity (`type`, `label`, `supportedActions`), `connect()` deferred SSH, `disconnect()` with/without session, `ping()` GREEN/RED/timeout, `openSSH` credential loading, CP4/VC4 default profiles, keychain failure, `closeSSH`, raw `sendCommand` READY vs non-READY guard, `reboot` command, ERROR state handling, `registerCallbacks` output wiring, `downloadConfig`/`restoreConfig`
- [X] T009 Register `CrestronSSHModule` in `src/main/modules/index.ts` module registry

## Phase 3: User Story 1 — Establish SSH Connection (P1)

**Goal**: Open an interactive SSH workspace for a configured Crestron device, receive a ready console prompt.
**Independent Test**: Click workspace button → SSH session established → device prompt returned.

- [X] T010 [US1] Implement `SSHSessionManager.open()` with SSH `Client.shell({ term: 'dumb' })`, prompt regex detection, 10 s prompt timeout, and state transitions CONNECTING→READY/ERROR in `src/main/modules/crestron-ssh/SSHSessionManager.ts`
- [X] T011 [US1] Implement `_openSSH()` in `CrestronSSHModule` — load password from keychain under `av-monitoring:crestron-ssh:<deviceId>`, load profile from DB with fallback to `getDefaultProfile()`, wire `state`/`output` event callbacks, call `session.open()` non-blocking in `src/main/modules/crestron-ssh/CrestronSSHModule.ts`
- [X] T012 [US1] Create `src/main/ipc/ssh-handlers.ts` — `ipcMain.handle('ssh:open', ...)` delegates to `CrestronSSHModule.sendCommand('openSSH')`; `ipcMain.handle('ssh:close', ...)` delegates to `sendCommand('closeSSH')`; `ipcMain.handle('ssh:send', ...)` delegates to `sendCommand('sendCommand', { command })`; `webContents.send('ssh:output', ...)` and `webContents.send('ssh:state', ...)` push events via registered callbacks
- [X] T013 [US1] [P] Create `src/renderer/components/SSHWorkspace/SSHWorkspace.tsx` — outer panel component managing session state (CLOSED/CONNECTING/READY/BUSY/ERROR), connection/disconnection UI, error display
- [X] T014 [US1] [P] Create `src/renderer/hooks/useSSHSession.ts` — React hook wrapping `window.electron.ipcRenderer.invoke('ssh:open')`, `ssh:close`, `ssh:send`; subscribes to `ssh:output` and `ssh:state` push events; exposes `sessionState`, `output`, `open()`, `close()`, `send()` to components

## Phase 4: User Story 2 — Read Device Status and System Information (P2)

**Goal**: Issue INFO, IPCONFIG, IPTable, ERRlog, SYSTEMREADY commands via dedicated buttons and receive raw output.
**Independent Test**: Connect → click each status button → output returned and displayed.

- [X] T015 [US2] Create `src/renderer/components/SSHWorkspace/SSHCommandButtons.tsx` — grid of 9 named command buttons (BYE, ERRlog, FORCEDREBOOT, INFO, IPCONFIG, IPTable, PROGRESet, REBOOT, SYSTEMREADY) with read-only vs destructive styling distinction
- [X] T016 [US2] [P] Create `src/renderer/components/SSHWorkspace/SSHOutput.tsx` — scrolling terminal output display, auto-scrolls to bottom on new data
- [X] T017 [US2] Verify `_sendRawCommand()` in `CrestronSSHModule` correctly guards on `sessionState === 'READY'` before calling `session.send()` in `src/main/modules/crestron-ssh/CrestronSSHModule.ts`

## Phase 5: User Story 3 — Restart a Running Program (P3)

**Goal**: PROGRESet button shows confirmation dialog with slot number input; sends `PROGRESet -P:<n>` on confirm.
**Independent Test**: Click PROGRESet → dialog with slot input → enter slot 1 → confirm → program restarts.

- [X] T018 [US3] Create `src/renderer/components/SSHWorkspace/ConfirmationDialog.tsx` — modal for REBOOT, FORCEDREBOOT, PROGRESet; includes slot number text input for PROGRESet; blocks submission when slot field is empty; Cancel does not send any command
- [X] T019 [US3] Wire `PROGRESet -P:<n>` construction in `SSHCommandButtons.tsx` — on confirm, builds command string with operator-entered slot number and sends via `useSSHSession.send()`

## Phase 6: User Story 4 — Reboot the Device (P4)

**Goal**: REBOOT and FORCEDREBOOT buttons each show a confirmation prompt before sending the command.
**Independent Test**: Click REBOOT → confirm → command sent → session ends; click cancel → no command sent.

- [X] T020 [US4] Wire REBOOT command in `SSHCommandButtons.tsx` — requires confirmation via `ConfirmationDialog.tsx` before sending `REBOOT` via `useSSHSession.send()` in `src/renderer/components/SSHWorkspace/SSHCommandButtons.tsx`
- [X] T021 [US4] Wire FORCEDREBOOT command in `SSHCommandButtons.tsx` — requires confirmation before sending `FORCEDREBOOT`; session ends after command in `src/renderer/components/SSHWorkspace/SSHCommandButtons.tsx`

## Phase 7: User Story 5 — Close the Console Session (P5)

**Goal**: Disconnect control sends device-type-appropriate command (BYE/exit) and closes the SSH session cleanly.
**Independent Test**: Click disconnect on CP4 → `BYE` sent → session closed; same on VC4 → `exit` sent.

- [X] T022 [US5] Implement `SSHSessionManager.close()` — sends `disconnectCmd` (BYE/exit) to shell stream, waits 200 ms, then calls `_doDestroy()` and emits CLOSED state in `src/main/modules/crestron-ssh/SSHSessionManager.ts`
- [X] T023 [US5] Verify `_closeSSH()` in `CrestronSSHModule` calls `session.close()` and resets `sessionState` to CLOSED in `src/main/modules/crestron-ssh/CrestronSSHModule.ts`

## Phase 8: Polish

- [X] T024 [P] Add `src/renderer/hooks/useSSHSession.ts` free-text input field wiring — operator can type any command not covered by pre-built buttons and send via `useSSHSession.send()`
- [X] T025 [P] Handle network interruption in `SSHSessionManager` — `stream.on('close')` while READY emits ERROR state with reason `'Shell stream closed unexpectedly'` in `src/main/modules/crestron-ssh/SSHSessionManager.ts`
- [X] T026 [P] Confirm `ssh2` `readyTimeout` is set to `PROMPT_TIMEOUT_MS` (10 000 ms) in `client.connect()` options in `src/main/modules/crestron-ssh/SSHSessionManager.ts`
- [X] T027 [P] Confirm `algorithms` kex/serverHostKey lists in `SSHSessionManager.open()` include legacy Crestron-compatible algorithms (`diffie-hellman-group1-sha1`, `ssh-rsa`) in `src/main/modules/crestron-ssh/SSHSessionManager.ts`
- [X] T028 Register `ssh-handlers.ts` in `src/main/index.ts` app entry point
- [X] T029 [P] Write `src/renderer/components/SSHWorkspace/SSHCommandButton.tsx` — single command button component distinguishing read-only (executes immediately) from destructive (requires confirmation)

## Dependencies & Execution Order

```
T001–T004 (Setup) → T005–T009 (Foundational) → T010–T014 (US1) → T015–T017 (US2)
→ T018–T019 (US3) → T020–T021 (US4) → T022–T023 (US5) → T024–T029 (Polish)
```

Tasks marked [P] within the same phase can be worked in parallel.
T006 (SSHSessionManager tests) must precede T007 (module implementation) per test-first constitution.
T008 (module tests) must precede final module wiring in T009.
T014 (`useSSHSession` hook) depends on T012 (IPC handlers) being available.
T018 (`ConfirmationDialog`) must be complete before T019–T021 (command wiring that uses it).
