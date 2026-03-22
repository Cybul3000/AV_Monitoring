# Feature Specification: LG Pro Display — AV Monitoring Module

**Feature Branch**: `002-lg-pro-display`  
**Created**: 2026-03-22  
**Status**: Draft  
**Input**: User description: "Add also specification for LG TV's: https://github.com/bitfocus/companion-module-lgtv-prodisplay"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Monitor LG Display Power and Connectivity State (Priority: P1)

An AV monitoring operator needs to know at a glance whether each LG Pro Display in a room is powered on and reachable over the network. The system connects to each display by IP address, polls its power state, and raises an alert when a display is offline or powered off unexpectedly during business hours.

**Why this priority**: Power state is the most fundamental health signal. Detecting an offline display before a meeting starts prevents user disruption and is the core value of any AV monitoring system.

**Independent Test**: Can be fully tested by connecting to a single LG display over TCP, sending the power state query command, and verifying the module correctly reflects On/Off state and detects when the TCP connection drops.

**Acceptance Scenarios**:

1. **Given** an LG display is powered on and reachable on the network, **When** the monitoring module connects and polls, **Then** the display's power state is reported as "On" within one polling interval.
2. **Given** an LG display is powered off or disconnected from the network, **When** the next poll occurs, **Then** the module reports the display as "Offline" or "Off" and triggers an alert.
3. **Given** a display's TCP connection drops mid-session, **When** the module detects the disconnection, **Then** it attempts to reconnect automatically and logs the event.

---

### User Story 2 - Monitor and Control Active Input Source (Priority: P2)

A room manager needs to confirm which input source is active on each display (e.g., HDMI 1 for the room PC, HDMI 2 for a video conferencing unit). During a meeting, if the wrong input is selected, the operator can remotely switch it from the monitoring dashboard without entering the room.

**Why this priority**: Input source verification is the second most common AV issue after power state, and remote correction saves significant time in multi-room deployments.

**Independent Test**: Can be fully tested by querying current input on a single display, verifying the returned value matches the expected input label, and then sending an input-switch command and confirming the display changes input.

**Acceptance Scenarios**:

1. **Given** a display is set to HDMI 1, **When** the module polls the input state, **Then** the current input is displayed as "HDMI 1" in the monitoring interface.
2. **Given** an operator selects "HDMI 2" from the monitoring dashboard, **When** the switch command is sent, **Then** the display switches to HDMI 2 and the module confirms the new state within one polling interval.
3. **Given** a display has no signal on the active input, **When** the module polls, **Then** the input name is still correctly reported (signal detection is a separate display function outside this module's scope).

---

### User Story 3 - Monitor Audio and Screen Mute States (Priority: P3)

An AV technician needs to verify that displays in a meeting room are not inadvertently muted (audio or screen) at the start of a session. The module reports both screen mute and volume mute states, and allows the operator to clear a mute condition remotely without entering the room.

**Why this priority**: Mute states directly affect meeting quality but are less critical than power and input (which prevent the meeting entirely). They are most commonly needed as status visibility, with occasional remote correction.

**Independent Test**: Can be fully tested by enabling screen mute on a display, polling the module, and verifying it reports "Muted", then sending a mute-off command and confirming the display unmutes.

**Acceptance Scenarios**:

1. **Given** a display's screen is muted, **When** the module polls, **Then** screen mute state is shown as "Muted" in the monitoring interface.
2. **Given** a display's audio is muted, **When** the module polls, **Then** volume mute state is shown as "Muted".
3. **Given** an operator sends a "Screen Mute Off" command, **When** the command is received by the display, **Then** the display unmutes and the module reflects the updated state on the next poll.

---

### User Story 4 - Monitor Volume Level (Priority: P4)

A room coordinator checking room readiness before a meeting wants to confirm each display's volume is set to the standard operating level (e.g., 50%). The module reports the current volume level and allows it to be adjusted remotely if needed.

**Why this priority**: Volume level is an operational nicety rather than a critical health signal. It is included for completeness but does not block meeting functionality.

**Independent Test**: Can be fully tested by setting a display to a known volume, polling the module, and verifying the reported level matches.

**Acceptance Scenarios**:

1. **Given** a display is set to volume level 50, **When** the module polls, **Then** the reported volume level is "50".
2. **Given** an operator increases volume by 10 from the monitoring dashboard, **When** the command is sent, **Then** the display increases its volume by 10 and the module confirms the new level.
3. **Given** a volume increase command would exceed 100, **When** the command is processed, **Then** the volume is capped at 100 and no error is raised.

---

### Edge Cases

- What happens when a display is unreachable (host does not respond) — the module must mark the display as offline rather than hanging indefinitely.
- What happens when multiple displays share the same IP but different Set IDs — the Set ID correctly routes commands to the intended display.
- What happens when a command returns an `NG` (Not Good) response — the module logs the error but does not crash or stop polling.
- What happens when a display is mid-power-cycle — the module receives a dropped connection, reconnects, and resumes polling without manual intervention.
- What happens when volume is already at 0 and a "decrease" command is issued — volume remains at 0 with no underflow error.
- What happens when the polling interval is set too low (near 1000 ms) — the display may queue responses; the module must handle out-of-order or merged TCP data gracefully.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The module MUST establish a persistent TCP connection to each LG Pro Display using a configurable IP address and port (default: TCP port 9761).
- **FR-002**: The module MUST support a configurable Set ID (0–99) to address individual displays in a multi-screen installation sharing the same network address.
- **FR-003**: The module MUST periodically poll each display at a configurable interval (default: 5 000 ms; range: 1 000–60 000 ms) to retrieve power state, input source, screen mute state, volume mute state, and volume level.
- **FR-004**: The module MUST send commands in the format `{command_code} {set_id_hex} {data_hex}\r` and parse responses in the format `{cmd_char} {set_id} {OK|NG}{value_hex}`.
- **FR-005**: The module MUST support querying the current state of all monitored properties by sending `FF` as the data value.
- **FR-006**: The module MUST expose the following control actions: Power On, Power Off, Select Input Source, Screen Mute On/Off, Volume Mute On/Off, Set Volume Level, Increase Volume Level, Decrease Volume Level.
- **FR-007**: The module MUST expose the following state variables: Power State (On/Off), Current Input, Screen Mute State (Muted/Unmuted), Volume Mute State (Muted/Unmuted), Volume Level (0–100).
- **FR-008**: The module MUST detect TCP disconnection events and automatically attempt to reconnect without requiring a manual restart.
- **FR-009**: The module MUST handle `NG` responses from the display gracefully — logging the error and continuing to operate without crashing.
- **FR-010**: The module MUST provide configurable verbose logging that, when enabled, logs all outbound commands and inbound responses for diagnostics.
- **FR-011**: Volume level commands MUST clamp the target value to the range 0–100; values outside this range must not be sent to the display.

### Key Entities

- **Display**: An LG Pro Display identified by its IP address, TCP port, and Set ID. Tracks the five real-time state properties (power, input, screen mute, volume mute, volume level).
- **Command**: A structured control message comprising a two-character command code, a hex-encoded Set ID, and a hex-encoded data value, terminated by a carriage return.
- **Poll Cycle**: A timed sequence that sends five query commands (power, input, screen mute, volume level, volume mute) to a display and processes the responses to update the display's state properties.
- **Set ID**: A numeric identifier (0–99) used to address a specific display. Address `00` (hex) is used for Set ID 0; the value is always two hex digits.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The module correctly reflects a display's power state (On/Off) within one polling interval of the actual state change — verified by toggling display power and observing the update.
- **SC-002**: All five state variables (power state, input source, screen mute, volume mute, volume level) are populated and accurate within the first two polling cycles after connection.
- **SC-003**: A TCP disconnection is detected within 10 seconds, and reconnection is attempted automatically — without any manual action by the operator.
- **SC-004**: All eight control actions produce the expected changes on the display and are reflected in the module's state variables within one polling interval.
- **SC-005**: The module operates without errors or crashes for a minimum continuous run of 72 hours against a live display.
- **SC-006**: Verbose logging captures every sent command and received response with sufficient detail to diagnose protocol-level issues without requiring a network trace tool.

## Assumptions

- LG Pro Displays have network (TCP/IP) connectivity enabled and port 9761 is accessible from the monitoring server's network segment.
- The companion module source at `bitfocus/companion-module-lgtv-prodisplay` accurately reflects the RS-232 / TCP command set used by LG Professional Displays (Series: LG Pro Display supporting the LG Monitor Control API).
- Set ID `0` is used for standalone single-display deployments; multi-display daisy-chain configurations use IDs 1–99.
- The LG display responds to all five queried commands within a single polling interval; no command sequencing or inter-command delay is required.
- Signal presence detection (whether a source has an active video signal) is handled by the display hardware and is outside the scope of this module.
- The protocol described matches LG Commercial Display models that support the RS-232 / TCP command set (e.g., LG UH5, UH7, UL3, UT640S, and similar Pro Display series). Specific model compatibility is the integrator's responsibility.
