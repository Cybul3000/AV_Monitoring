# Feature Specification: Biamp Tesira DSP — AV Monitoring Module

**Feature Branch**: `006-biamp-tesira-dsp`
**Created**: 2026-03-22
**Status**: Draft
**Input**: User description: Monitor and control Biamp Tesira DSP/conferencing audio devices (Tesira SERVER, Tesira FORTE, Tesira FLEX) via TTP (Tesira Text Protocol) over TCP.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Monitor Device Faults and Health Status (Priority: P1)

An AV technician needs to know immediately when a Biamp Tesira device reports a hardware or system fault — such as a missing network module, DSP overload, or internal hardware error — so the problem can be resolved before a scheduled meeting.

**Why this priority**: A Tesira device reporting faults but appearing "up" is the most dangerous state in a conferencing room — audio may be silently broken without any visual indication at the room level. Fault detection is the foundational health signal.

**Independent Test**: Connect to a Tesira device, query the system fault status, and verify that a device with no faults reports GREEN and a device with a simulated fault reports AMBER or RED.

**Acceptance Scenarios**:

1. **Given** a Tesira device is reachable on the network, **When** the module connects and polls, **Then** device identity (hostname, firmware version, serial number) is displayed.
2. **Given** a Tesira device has no active system faults, **When** the module polls, **Then** the device LED is GREEN.
3. **Given** a Tesira device reports one or more system faults, **When** the module polls, **Then** the device LED transitions to AMBER and each fault description is logged.
4. **Given** a Tesira device reports a critical hardware failure (e.g., missing required expander), **When** the module polls, **Then** the device LED transitions to RED and the event is written with severity CRITICAL.
5. **Given** the TCP connection to the Tesira device is lost, **When** the module detects it, **Then** the device LED transitions to RED and reconnection is attempted automatically.

---

### User Story 2 — Monitor and Control Audio Levels (Gain and Mute) (Priority: P2)

A room AV technician needs to verify that microphone inputs and loudspeaker outputs are set to expected gain levels and are not inadvertently muted. The technician can read current levels and mute states for named audio blocks in the Tesira configuration, and can mute/unmute or adjust gain remotely without entering the room.

**Why this priority**: Audio level and mute state monitoring directly affects meeting quality. After confirming the device is healthy (P1), verifying audio levels is the primary day-to-day operational check.

**Independent Test**: Query the gain level and mute state for a named LevelControl block in the Tesira device, verify the values match the physical state, then send a mute command and confirm the updated state is reflected within one polling interval.

**Acceptance Scenarios**:

1. **Given** a Tesira device is configured with named audio blocks, **When** the module polls, **Then** the current gain level (dB) and mute state for each monitored LevelControl block are displayed.
2. **Given** a LevelControl block is muted, **When** the module polls, **Then** the block is shown as muted and contributes to an AMBER device LED if it is a critical path block.
3. **Given** an operator sends a mute command for a block, **When** the command is received by the device, **Then** the block transitions to muted and the module reflects the new state on the next poll.
4. **Given** an operator sets a gain level for a block, **When** the command is received, **Then** the device applies the new gain and the module confirms it within one polling interval.
5. **Given** a gain set command would exceed the block's configured maximum gain, **When** the command is processed, **Then** the value is clamped to the maximum and the operator is informed.

---

### User Story 3 — Recall Audio Presets (Priority: P3)

Before a large meeting or a room reconfiguration event, an AV technician applies a named audio preset (e.g., "Town Hall Mode", "Presentation Mode") that adjusts gain, routing, and mute states across the Tesira configuration in one action.

**Why this priority**: Presets are the fastest way to apply a known-good configuration to a room. They depend on being able to see the current state (P1, P2) before deciding to apply a preset.

**Independent Test**: List available presets on a Tesira device, recall one, and verify the resulting gain and mute states match the preset definition.

**Acceptance Scenarios**:

1. **Given** a Tesira device has presets defined in its session file, **When** the module is polled, **Then** the list of available preset names is displayed.
2. **Given** the operator selects a preset to recall, **When** the command is sent, **Then** the device applies the preset and the module confirms updated audio states within one polling interval.
3. **Given** no presets are defined in the session file, **When** the module queries presets, **Then** an empty list is shown with no error.

---

### User Story 4 — Monitor Conferencing Call State (Priority: P4)

A support engineer monitoring a live meeting needs to see whether a VoIP or USB conferencing call is active on a Tesira conferencing system, what the current privacy mute state is, and whether the call is in a fault state — all without entering the meeting room.

**Why this priority**: Call state is specific to Tesira deployments in conferencing rooms. It is lower priority because it requires a conferencing-enabled Tesira configuration and is not relevant to all Tesira deployments (e.g., pure audio amplification setups).

**Independent Test**: On a Tesira device with a VoIP dialer block configured, query call state and verify it correctly reports idle or active, and that privacy mute state is accurately reflected.

**Acceptance Scenarios**:

1. **Given** a Tesira device has a VoIP dialer block, **When** the module polls, **Then** the call state (idle / active / fault) is shown.
2. **Given** a VoIP call is active and privacy mute is engaged, **When** the module polls, **Then** the call privacy mute state is shown as engaged.
3. **Given** a Tesira device has no dialer block configured, **When** the module polls, **Then** no call state is shown and no error is raised.
4. **Given** a VoIP dialer block is in a fault state, **When** the module polls, **Then** the device LED transitions to AMBER and the fault reason is logged.

---

### Edge Cases

- A TTP command targets a block that does not exist in the device's session file — the device returns an error; the module logs it and does not crash.
- The Tesira device is reachable but its session file is empty or has not been loaded — the module must report this as a configuration warning, not a health failure.
- A gain adjustment command is sent while the device is running a preset recall — the device may reject the command; the module must surface the rejection without corrupting local state.
- Multiple LevelControl blocks share identical names (operator configuration error) — the module must use the full attribute path to disambiguate, not just the block name.
- A TCP connection is established but the TTP handshake is not completed within the timeout — the module must treat this as a connection failure and retry.
- A Tesira SERVER with expander chassis has modules distributed across multiple slots — the module must poll all slots' fault status, not just the main chassis.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The module MUST connect to a Tesira device via TTP (Tesira Text Protocol) over TCP (default port: 23).
- **FR-002**: The module MUST authenticate with the device using a username and password stored in the OS keychain.
- **FR-003**: The module MUST periodically poll each device at a configurable interval (default: 15 000 ms) to retrieve device fault status, identity, and all monitored audio block states.
- **FR-004**: The module MUST report device identity: hostname, firmware version, and serial number.
- **FR-005**: The module MUST query and report the system fault list from the device; any active fault changes the LED to AMBER; a critical fault changes it to RED.
- **FR-006**: The module MUST allow configuration of one or more named LevelControl blocks to monitor, identified by their TTP attribute path.
- **FR-007**: The module MUST report the gain level (dB) and mute state for each configured LevelControl block.
- **FR-008**: The module MUST expose a control action to mute or unmute a specified LevelControl block.
- **FR-009**: The module MUST expose a control action to set the gain level of a specified LevelControl block, clamping the value to the block's permitted range.
- **FR-010**: The module MUST list all named presets defined in the device's session file.
- **FR-011**: The module MUST expose a control action to recall a named preset.
- **FR-012**: The module MUST query and report VoIP dialer call state (idle / active / fault) and privacy mute state for any configured dialer block.
- **FR-013**: The module MUST detect TCP disconnection events and automatically attempt to reconnect without requiring a manual restart.
- **FR-014**: The module MUST handle TTP error responses gracefully — logging the error and maintaining current known state without crashing.

### Key Entities

- **Tesira Device**: A Biamp DSP unit identified by IP address and TCP port. Tracks system fault list, firmware version, and the collection of monitored audio blocks.
- **LevelControl Block**: A named audio processing block in the Tesira session file that exposes gain level and mute state. Identified by its TTP attribute path.
- **Preset**: A named configuration snapshot stored in the device session file. Applying a preset changes gain, routing, and mute states across the session.
- **Dialer Block**: A VoIP or USB conferencing block in the Tesira session file. Exposes call state (idle / active / fault) and privacy mute state.
- **System Fault**: A hardware or software fault reported by the device at the system level. Properties: fault code, severity, and description string.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: System fault state is accurately reflected in the device LED within one polling interval of a fault being raised or cleared on the device.
- **SC-002**: Gain level and mute state for all configured LevelControl blocks are polled and displayed correctly within two polling intervals of connection.
- **SC-003**: A preset recall command completes and updated block states are confirmed in the module within two polling intervals.
- **SC-004**: A TCP disconnection is detected within 20 seconds and reconnection is attempted automatically without manual action.
- **SC-005**: A mute or gain command is confirmed as applied by the device and reflected in the module within one polling interval.

## Assumptions

- Tesira devices are accessible from the monitoring host network segment with TCP port 23 open.
- TTP (Tesira Text Protocol) is the primary command interface; REST API (available in newer Tesira firmware) is out of scope for v1.
- Authentication requires a username and password; credentials are stored in the OS keychain under `av-monitoring:biamp-tesira:<deviceId>`.
- Audio blocks to monitor (LevelControl, dialer) are identified by their full TTP attribute path, which the operator must supply during device configuration in the app.
- Preset names are read from the device at startup and do not change during a session; if the session file is reloaded on the device, a module reconnect is needed to refresh them.
- Tesira FORTE, FORTE X, SERVER, and SERVER-IO are all supported via the same TTP interface; FLEX and EX expanders are out of scope for v1 unless connected to a supported SERVER.
