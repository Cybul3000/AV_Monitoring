# Feature Specification: Dante Network Monitor — Architectural Consistency Refactor

**Feature Branch**: `007-dante-network-monitor`
**Created**: 2026-03-25
**Status**: Draft
**Input**: User description: "Update the Dante module so it is consistently a Dante network monitor and controller, not a single-device connection. The module should discover and monitor all Dante devices on the local network (like Audinate Dante Controller), not connect to one device. Remove all contradicting entries anywhere in the project — device registry, spec, plan, data model, implementation code — so the whole project is consistent."

## Context

The existing Dante module (spec 003) was implemented with an architectural ambiguity: the device registry, data model, and some implementation code treated Dante as a per-device connection (requiring an IP address, an ARC port, or a device name upfront), while the actual module implementation already operated network-wide (mDNS discovery of all Dante devices, no IP needed). This split design is internally inconsistent.

This spec resolves that inconsistency by establishing a single canonical model: **the Dante module is a network-level monitor and controller**, not a per-device connector. It discovers, monitors, and controls all Dante-enabled endpoints present on the local network segment automatically — analogous to Audinate Dante Controller. No individual Dante device needs to be configured manually.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Register a Dante Network in a Room (Priority: P1)

An AV technician setting up a room in the monitoring system needs to declare that the room has Dante audio infrastructure. They add a single "Dante Network" entry to the room in the hierarchy — the same way they would add a display or a matrix switcher. Once added, the system automatically discovers all active Dante devices on the local network without the technician entering any IP address or device name.

**Why this priority**: This is the entry point for all Dante monitoring. It also establishes the correct mental model — the operator adds the *network*, not a specific device.

**Independent Test**: Can be fully tested by adding a Dante Network entry to a room (with no IP or device name) and observing that Dante devices on the network appear automatically.

**Acceptance Scenarios**:

1. **Given** a room in the hierarchy has no Dante entry, **When** the technician adds a "Dante Network" device to that room, **Then** no IP address, host, or device name is required — the form only offers an optional network interface field.
2. **Given** a Dante Network entry exists in a room, **When** the system starts, **Then** it automatically begins discovering Dante devices on the local network without further operator input.
3. **Given** a Dante Network entry exists, **When** the technician views the room, **Then** the room shows the Dante Network's LED status aggregating health of all discovered devices.
4. **Given** the room has no active Dante devices on the network, **When** discovery runs, **Then** the Dante Network entry shows GREY (discovery not yet completed) or AMBER (no devices found after discovery ran), not an error state.

---

### User Story 2 — View All Discovered Dante Devices (Priority: P2)

An AV technician needs to see a live inventory of all Dante devices currently active on the local network — their names, IP addresses, model identifiers, sample rates, channel counts, and heartbeat status — all from within the room view, without running Dante Controller software.

**Why this priority**: Read-only device discovery is the foundation of all monitoring and control. The technician cannot manage what they cannot see.

**Independent Test**: Can be tested by confirming that all active Dante devices on the network appear in the room view after adding a Dante Network entry.

**Acceptance Scenarios**:

1. **Given** one or more Dante devices are active on the network, **When** the technician views the Dante Network panel, **Then** all discovered devices are listed with their Dante name, IP address, model, sample rate, and number of transmit and receive channels.
2. **Given** a device is discovered, **When** the technician inspects it, **Then** heartbeat liveness (last seen timestamp) is shown.
3. **Given** a device goes offline, **When** the system detects the absence of its heartbeat, **Then** that device is marked as offline within 15 seconds.
4. **Given** two devices share the same Dante name, **When** they are listed, **Then** they are disambiguated by MAC address or IP address and the ambiguity is surfaced to the operator.

---

### User Story 3 — Monitor Audio Subscription Health (Priority: P3)

An AV technician troubleshooting audio routing issues needs to see the current subscription state of all receive channels across all discovered devices — which are connected, which are unresolved, and which are self-looped.

**Why this priority**: Audio routing failures are the most common operational problem in Dante environments. After device visibility (P2), routing health is the next most valuable read-only capability.

**Independent Test**: Can be tested independently by displaying existing subscription states without modifying any routing.

**Acceptance Scenarios**:

1. **Given** a receive channel has an active subscription, **When** the technician views the routing table, **Then** the entry shows: receive device, receive channel, transmit device, transmit channel, and status "connected".
2. **Given** a receive channel has a subscription that cannot resolve its source, **Then** status is "unresolved".
3. **Given** a receive channel is not subscribed, **Then** it shows as "unsubscribed".
4. **Given** any receive channel has an unhealthy subscription, **Then** the Dante Network LED reflects AMBER.

---

### User Story 4 — Add and Remove Audio Routing Subscriptions (Priority: P4)

An AV technician needs to route audio between discovered Dante devices and remove existing routing, without using Dante Controller.

**Why this priority**: Active routing control builds on read-only monitoring (P1–P3) and transforms the tool from a viewer into a controller.

**Independent Test**: Can be tested by adding a subscription and verifying it appears as connected, then removing it.

**Acceptance Scenarios**:

1. **Given** two Dante devices with available channels, **When** the technician subscribes a receive channel to a transmit channel, **Then** routing appears as connected.
2. **Given** an existing subscription, **When** the technician removes it, **Then** the receive channel shows as unsubscribed.
3. **Given** a receive channel already has a subscription, **When** the technician tries to add another, **Then** the system rejects the request with a clear error and requires the existing subscription to be removed first.
4. **Given** a target device or channel is not found, **When** a subscription is attempted, **Then** a clear "not found" error is shown.

---

### User Story 5 — Configure Device Settings and AVIO Gain (Priority: P5)

An AV technician needs to read and set device-level audio settings (sample rate, bit depth, latency) and, for AVIO devices, analog gain levels on input and output channels.

**Why this priority**: Device configuration is less frequent than routing management and builds on all previous stories.

**Independent Test**: Can be tested by reading then changing the sample rate on a single discovered device.

**Acceptance Scenarios**:

1. **Given** a discovered device, **When** the technician reads its settings, **Then** sample rate, bit depth, and latency are shown.
2. **Given** a device supports sample rate changes, **When** a new valid value is set, **Then** the device updates and the new value is confirmed.
3. **Given** an AVIO device, **When** the technician views its channels, **Then** per-channel gain controls are shown for inputs and outputs.
4. **Given** a non-AVIO device, **Then** no gain controls are displayed.

---

### Edge Cases

- **No devices found on start**: The Dante Network LED shows GREY and the panel displays "Discovery in progress" rather than an error. Once discovery completes with no results, it transitions to AMBER.
- **Multi-homed machine**: The optional interface selector allows the operator to constrain discovery to the adapter connected to the Dante network. If not set, all interfaces are used.
- **Device offline mid-session**: When heartbeat stops, the device is marked offline rather than immediately removed, giving the operator context about what changed.
- **Duplicate Dante names**: Two devices with the same name are disambiguated by MAC address and the ambiguity is surfaced in the UI rather than silently merged.
- **mDNS blocked by network**: If multicast is filtered, a warning is shown that discovery may be incomplete — not a crash or empty error state.
- **Subscription operation timeout**: Write operations that receive no device acknowledgement within 10 seconds are reported as failed with a clear timeout message.
- **Sample rate change with active subscriptions**: The system warns the operator that changing the sample rate may disrupt existing subscriptions before confirming the change.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST represent the Dante audio infrastructure in a room as a single "Dante Network" entry in the hierarchy. Operators add the network once; device discovery is fully automatic with no manual device configuration required.
- **FR-002**: The system MUST discover all Dante-enabled devices on the local network without requiring the operator to enter any IP address, host name, or device name. Discovery is passive and continuous via mDNS.
- **FR-003**: The "Dante Network" registry entry MUST have zero required configuration fields. An optional network interface selector MAY be provided for multi-homed machines; if omitted, all network interfaces are used.
- **FR-004**: The device registry MUST contain exactly one entry for Dante, typed `dante-network-audio`, with no required fields and no IP/host/port configuration. All legacy entries (any `dante-audio` per-device registry entries) MUST be removed.
- **FR-005**: The Dante Network LED status MUST aggregate health of all discovered Dante devices: GREEN = all reachable with healthy subscriptions; AMBER = one or more subscriptions unresolved or a device missing heartbeats; RED = complete loss of all Dante devices; GREY = discovery not yet started or no data.
- **FR-006**: The system MUST display all discovered Dante devices within the Dante Network panel: Dante name, IP address, model, sample rate, transmit channel count, receive channel count, and liveness status.
- **FR-007**: The system MUST show the full routing subscription table across all discovered devices with status (connected / unresolved / self-loop / unsubscribed) per receive channel.
- **FR-008**: The system MUST allow creating a new audio subscription. If the receive channel already has a subscription, the request MUST be rejected with an explicit error.
- **FR-009**: The system MUST allow removing an existing subscription from a receive channel.
- **FR-010**: The system MUST allow reading and setting device sample rate (44100, 48000, 88200, 96000, 176400, 192000 Hz), encoding bit depth (16, 24, 32 bit), and network latency.
- **FR-011**: The system MUST allow renaming a device's Dante name and resetting it to factory default.
- **FR-012**: The system MUST allow renaming an individual transmit or receive channel name and resetting it to factory default.
- **FR-013**: For AVIO devices only, the system MUST display and allow setting per-channel analog gain level (inputs: +24/+4/0 dBu, 0/−10 dBV; outputs: +18/+4/0 dBu, 0/−10 dBV).
- **FR-014**: Write operations MUST time out after 10 seconds if no device acknowledgement is received and report the operation as failed.
- **FR-015**: All contradictions across the project MUST be resolved: any per-device Dante registry entries removed, required `host`/`arcPort` fields removed, and any implementation stubs that assume a 1:1 `devices` row to Dante-endpoint mapping corrected to use the singleton-gateway pattern.

### Key Entities

- **Dante Network**: The single configurable entry in the room hierarchy representing the Dante audio infrastructure. Zero required configuration fields. Acts as the discovery gateway for all Dante devices on the local network segment. Its LED status is an aggregate of all discovered endpoints' health.
- **Dante Device** (discovered automatically, not configured): A networked audio endpoint found via mDNS. Properties: Dante name (mutable), display name (read-only), IP address, MAC address (stable unique identifier), model, sample rate, bit depth, latency, transmit channels, receive channels. Not stored as a top-level device entry — lives only in the Dante-specific storage layer.
- **Transmit Channel**: A named audio output on a Dante device.
- **Receive Channel**: A named audio input on a Dante device that can subscribe to any transmit channel on the network. One subscription maximum per receive channel.
- **Subscription**: An audio routing link from a transmit channel to a receive channel, with status (connected / unresolved / self-loop / unsubscribed).
- **AVIO Device**: A subtype of Dante Device with physical analog I/O interfaces. Exposes per-channel gain level controls not shown on standard Dante devices.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can add a Dante Network entry to a room and see all active Dante devices within 10 seconds, with zero manual IP or device-name configuration.
- **SC-002**: The Dante Network LED accurately reflects aggregate device health and updates within 20 seconds of any device going offline or a subscription becoming unhealthy.
- **SC-003**: All routing subscriptions across all discovered devices are visible in a single panel without inspecting each device individually.
- **SC-004**: An operator can create or remove an audio subscription in under 30 seconds from identifying the source and destination channels.
- **SC-005**: After the refactor, a project-wide review confirms zero references to per-device IP configuration for Dante, zero orphaned `dante-audio` registry entries, and zero unimplemented `deviceId` linking stubs in the Dante module.
- **SC-006**: All existing Dante unit and integration tests pass after the refactor with no regressions.

---

## Assumptions

- The AV monitoring application and the Dante devices are on the same local network segment where mDNS (multicast DNS) traffic is not blocked.
- A room can have at most one Dante Network entry. Multiple rooms on the same physical network may each have their own entry — discovery scope is per-adapter, not per-room.
- The Dante Network LED aggregates health of all Dante endpoints visible on the configured network interface — not scoped to devices physically in that specific room.
- The optional network interface field stores the interface name as seen by the operating system (e.g., `en0`, `eth0`, `Ethernet`), resolved to an IP address at runtime. An empty value means "use all interfaces".
- The `devices` table row for a Dante Network entry uses an empty string for the `host` column since no host IP applies. The Dante module ignores this value entirely.
- Discovered Dante endpoints are NOT stored as rows in the top-level `devices` table. They live only in the Dante-specific `dante_devices` table, with a foreign key back to the single Dante Network `devices` row (singleton-gateway pattern).
- This refactor covers the full stack: device registry JSON, spec 003 artifacts, implementation source files, and unit tests that may assert the old per-device model.

---

## Clarifications

### Session 2026-03-25

- Q: Should the Dante Network be one-per-room or one-per-network-segment? → A: One per room in the hierarchy (consistent with all other device types), but discovery covers the full local network segment visible on the chosen adapter — not scoped to a physical room.
- Q: Should discovered Dante devices each get their own row in the top-level `devices` table? → A: No. The Dante Network entry is the only row in `devices`. Discovered Dante endpoints live exclusively in `dante_devices`, keyed by MAC address, with a foreign key back to the single Dante Network `devices` row (singleton-gateway pattern).
- Q: What LED does the Dante Network entry show when there are zero discovered devices after discovery completes? → A: AMBER — the absence of expected devices is a warning condition worth surfacing to the operator.
