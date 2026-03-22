# Feature Specification: Lightware Matrix Switcher — AV Monitoring Module

**Feature Branch**: `005-lightware-matrix-switcher`
**Created**: 2026-03-22
**Status**: Draft
**Input**: User description: Monitor and control Lightware AV matrix switchers (MX2, MMX, MODEX series) via LW3 protocol over TCP.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Monitor Port Signal Lock Status (Priority: P1)

An AV technician needs to see at a glance whether each input and output port on a Lightware matrix switcher has an active, locked video signal. A port without a locked signal means either a cable fault, a source that is off, or a display that is unpowered — all of which cause meeting disruption before anyone walks into the room.

**Why this priority**: Signal lock is the most actionable health signal for a matrix switcher. A locked signal means the video path is working end-to-end; no lock means someone in the room has no picture.

**Independent Test**: Connect to a single Lightware device, query all port signal lock states, and verify that ports with connected active sources report locked and ports with no cable report unlocked.

**Acceptance Scenarios**:

1. **Given** a Lightware device is reachable on the network, **When** the module connects and polls, **Then** the signal lock state (locked / unlocked) is reported for every input and output port.
2. **Given** a source device connected to an input port is powered off, **When** the module polls, **Then** that input port is reported as unlocked.
3. **Given** a display connected to an output port loses sync, **When** the module polls, **Then** that output port is reported as unlocked and the room LED reflects the degraded state.
4. **Given** a TCP connection to the Lightware device drops, **When** the module detects it, **Then** all ports are marked as unknown and automatic reconnection is attempted.

---

### User Story 2 — Monitor and Control Input-to-Output Routing (Priority: P2)

A room manager needs to see which input is currently routed to each output on a matrix switcher and, when the wrong source is displayed, remotely switch the routing from the monitoring dashboard without physically accessing the equipment rack.

**Why this priority**: Routing control is the primary operational action on a matrix switcher. Monitoring alone (P1) is valuable but the ability to correct routing faults remotely is what turns this from a read-only view into an active support tool.

**Independent Test**: Query current routing on a device, verify the reported input-to-output mapping matches the physical state, then send a switch command and verify the new routing is reflected within one polling interval.

**Acceptance Scenarios**:

1. **Given** a Lightware device is connected, **When** the module polls routing state, **Then** the current source input routed to each output port is displayed.
2. **Given** an operator selects a different input for an output port, **When** the switch command is sent, **Then** the device updates its routing and the module confirms the new state within one polling interval.
3. **Given** an operator initiates a routing change that would disconnect a live meeting signal, **When** the action is submitted, **Then** the app presents a confirmation dialog before executing.
4. **Given** a routing switch command is sent, **When** the command returns an error from the device, **Then** the module logs the error and the routing state is not changed in the UI.

---

### User Story 3 — Recall Routing Presets (Priority: P3)

An AV technician setting up for a scheduled meeting wants to apply a named preset (e.g., "Presentation Mode" or "Video Conference Mode") that routes all sources and outputs to the correct configuration in a single action, rather than switching each output individually.

**Why this priority**: Presets dramatically reduce setup time for recurring room configurations. They depend on routing visibility (P2) being in place first.

**Independent Test**: List available presets on a device, recall one preset, and verify the resulting routing state matches the preset definition.

**Acceptance Scenarios**:

1. **Given** a Lightware device has presets configured, **When** the module is polled, **Then** the list of available preset names is displayed.
2. **Given** the operator selects a preset to recall, **When** the command is sent, **Then** the device applies the preset and the new routing state is reflected in the module within one polling interval.
3. **Given** no presets are configured on the device, **When** the module queries presets, **Then** an empty list is shown with no error.

---

### User Story 4 — Monitor Device Health (Fans, Temperature, Hardware Errors) (Priority: P4)

A facility manager needs to know whether any Lightware device is reporting a hardware fault — overheating, fan failure, or firmware-level error — so that preventive maintenance can be scheduled before equipment fails during a live meeting.

**Why this priority**: Hardware health monitoring prevents reactive failures. It is lower priority because it does not affect day-to-day routing but is important for longer-term operational reliability.

**Independent Test**: Query device health properties on a running Lightware unit and verify that all reported health fields (fan status, temperature, error flags) are present and plausible.

**Acceptance Scenarios**:

1. **Given** a Lightware device is connected, **When** the module polls, **Then** the device model, firmware version, and serial number are displayed.
2. **Given** a device reports a hardware fault (e.g., over-temperature warning), **When** the module polls, **Then** the device LED transitions to AMBER and the fault description is logged.
3. **Given** a device reports a critical hardware failure, **When** the module polls, **Then** the device LED transitions to RED and the event is written to the audit log with severity CRITICAL.

---

### Edge Cases

- A port query returns no data because the device firmware does not support that property — the module must mark the field as unknown rather than crashing.
- A routing command is sent while a preset recall is already in progress — the device may reject the command; the module must handle the rejection and surface it to the operator.
- A device has more ports than the default configuration expects — the module must enumerate all ports dynamically rather than hardcoding port counts.
- A TCP connection is refused because the device's LW3 server is disabled — the module must report this as a configuration error, not a network timeout.
- Two simultaneous commands are issued rapidly — the module must queue them and not interleave command/response parsing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The module MUST connect to a Lightware device via the LW3 protocol over TCP (default port: 6107).
- **FR-002**: The module MUST authenticate with the device using a username and password stored in the OS keychain.
- **FR-003**: The module MUST periodically poll each device at a configurable interval (default: 10 000 ms) to retrieve port signal lock states and routing state for all ports.
- **FR-004**: The module MUST report the signal lock status (locked / unlocked / unknown) for every input and output port.
- **FR-005**: The module MUST report the current source input routed to each output port.
- **FR-006**: The module MUST expose a control action to switch a specified input to a specified output port.
- **FR-007**: The module MUST list all named routing presets available on the device.
- **FR-008**: The module MUST expose a control action to recall a named routing preset.
- **FR-009**: The module MUST report device identity information: model name, firmware version, and serial number.
- **FR-010**: The module MUST report hardware health status: temperature warnings and fan fault flags where supported by device firmware.
- **FR-011**: The module MUST detect TCP disconnection events and automatically attempt to reconnect without requiring a manual restart.
- **FR-012**: The module MUST handle LW3 `NACK` error responses gracefully — logging the error and maintaining current known state without crashing.
- **FR-013**: The module MUST enumerate ports dynamically from the device rather than relying on hardcoded port counts.

### Key Entities

- **Lightware Device**: A matrix switcher identified by IP address and TCP port. Tracks signal lock per port, routing state, preset list, and hardware health.
- **Port**: An individual input or output connector on the device. Properties: port number, port label, direction (input/output), signal lock state, and (for outputs) currently routed input.
- **Route**: A mapping from one input port to one output port. Properties: output port number, source input port number.
- **Preset**: A named routing configuration stored on the device. Properties: preset name/index and the full set of input-to-output mappings it defines.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Signal lock state for all ports is reported accurately within one polling interval of a physical cable being connected or removed.
- **SC-002**: A routing switch command takes effect on the device and is confirmed in the module within one polling interval.
- **SC-003**: A preset recall command completes and the resulting routing state is visible in the module within two polling intervals.
- **SC-004**: A TCP disconnection is detected within 15 seconds and reconnection is attempted automatically without manual action.
- **SC-005**: Hardware health properties (temperature, fan status) are polled and logged; a fault condition changes the device LED to AMBER or RED within one polling interval.

## Assumptions

- Lightware devices are accessible from the monitoring host network segment with TCP port 6107 open.
- The LW3 protocol (Lightware Protocol v3) is the command interface used by MX2, MMX, and MODEX series devices.
- Authentication with username/password is required; credentials are stored in the OS keychain under `av-monitoring:lightware:<deviceId>`.
- Port enumeration, routing state, and preset list are all queryable via standard LW3 commands without requiring proprietary SDK access.
- Hardware health properties (temperature, fan) availability depends on device firmware version; missing fields are treated as unknown rather than errors.
- Signal presence detection (whether the source is actively outputting a valid signal, vs. cable connected but source off) uses signal lock state as a proxy; deep EDID or HDCP state inspection is out of scope for v1.
