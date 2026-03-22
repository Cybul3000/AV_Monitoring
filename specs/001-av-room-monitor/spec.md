# Feature Specification: AV Monitoring & Self-Healing — Zoom Room Manager

**Feature Branch**: `001-av-room-monitor`  
**Created**: 2026-03-22  
**Status**: Draft  
**Input**: User description: Cross-platform local desktop application that monitors and self-heals Zoom Room meeting rooms with layered UI, device modules, floor maps, configuration management, OTel/New Relic integration, and log export.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Global Health Dashboard (Priority: P1)

A support engineer opens the app and immediately sees the health status of every
region (e.g., EMEA, APAC, AMER) represented as a single LED indicator each.
RED means at least one room in that region has a critical issue; AMBER means a
warning-level condition exists; GREEN means all rooms are healthy. The engineer
can see at a glance which part of the world needs attention without any other
action.

**Why this priority**: This is the primary reason the app exists — immediate
global situational awareness. Everything else builds on this foundation.

**Independent Test**: Launch the app with a pre-loaded data set containing rooms
in two regions where one region has a device with a simulated failure. The global
dashboard must show one RED and one GREEN region LED. Delivering this standalone
provides actionable value to a support engineer.

**Acceptance Scenarios**:

1. **Given** the app has location data configured with at least two regions, **When** the app opens, **Then** each region is displayed with exactly one LED indicator showing its aggregated health status.
2. **Given** all rooms in a region report healthy devices, **When** the dashboard is viewed, **Then** the region LED is GREEN.
3. **Given** one room in a region has a device reporting a critical error, **When** the dashboard is viewed, **Then** the region LED is RED.
4. **Given** a region has only warning-level events and no critical errors, **When** the dashboard is viewed, **Then** the region LED is AMBER.
5. **Given** the app is running, **When** a device's health status changes, **Then** the change propagates to the room LED, floor LED, office LED, and region LED within the configured polling interval.

---

### User Story 2 — Hierarchical Drill-Down to Room Level (Priority: P2)

A support engineer clicks on a RED region to see which offices are affected.
They then click an office to see which floors have issues, click a floor to see
which rooms are affected, and finally click a specific room to view the detailed
health status of all individual devices within it. Each intermediate level shows
only aggregated LED status until the room level, where device-level detail is
revealed.

**Why this priority**: The drill-down workflow is the core navigation of the
tool. Without it the global view has no depth.

**Independent Test**: With a populated hierarchy of Region → Office → Floor →
Room → Devices, clicking through each level must progressively reveal more
detail until, at the room level, all monitored devices and their individual
statuses are visible.

**Acceptance Scenarios**:

1. **Given** a region is selected, **When** the user clicks on it, **Then** a list of offices/cities within that region is shown, each with its own aggregated LED.
2. **Given** an office is selected, **When** the user clicks on it, **Then** floors/levels within that office are shown, each with an aggregated LED.
3. **Given** a floor is selected, **When** the user clicks on it, **Then** meeting rooms on that floor are shown as labelled elements with LED indicators.
4. **Given** a room is selected, **When** the user clicks on it, **Then** all devices configured for that room are displayed with individual device status, name, type, and last-checked timestamp.
5. **Given** the user is on any intermediate view, **When** they press the back control or breadcrumb, **Then** they return to the previous level without losing state.
6. **Given** a room has no devices configured, **When** it is selected, **Then** the app shows the room detail panel with a clear message that no devices are configured yet.

---

### User Story 3 — Floor Map & Room Placement (Priority: P3)

A support engineer uploads a floor plan image for a particular office floor. They
create room areas by drawing rectangles on the image and labelling them. They can
then place individual device elements inside each room area. Each device element
is rendered as a labelled square tile showing the device name, device type, and a
status LED — not merely a bare LED indicator. The floor map becomes the visual
canvas for that floor's health view.

**Why this priority**: Visual floor-map context dramatically reduces the cognitive
load of locating a problem room; it also maps to how real support engineers think
about physical spaces.

**Independent Test**: Upload a PNG floor plan for a single floor, draw two room
areas, label them, add one device to each room, and verify that both room areas
display their LED status on the floor-map canvas.

**Acceptance Scenarios**:

1. **Given** an office floor is selected in the location tree, **When** the user enters edit mode and uploads an image file, **Then** the image is displayed as the background of the floor canvas.
2. **Given** a floor map is loaded, **When** the user draws a rectangle on the canvas and confirms, **Then** a room area is created with a label and a status LED.
3. **Given** a room area exists on the floor map, **When** the user adds a device element to it, **Then** the device appears as a labelled square tile inside the room boundary showing the device name, device type, and a status LED indicator.
4. **Given** rooms and devices are placed on the floor map, **When** a device health status updates, **Then** the corresponding device LED and room LED on the canvas update accordingly.
5. **Given** a floor map with rooms and devices, **When** the user saves, **Then** all placements and labels persist across app restarts.
6. **Given** no floor map has been uploaded for a floor, **When** the floor is viewed, **Then** a prompt is displayed inviting the user to upload a floor plan.
7. **Given** a floor map image, **When** uploaded, **Then** the app accepts PNG and JPEG formats at minimum.

---

### User Story 4 — Device Template & Module Registry (Priority: P4)

A support engineer opens the Configuration tab and sees a list of device
templates. Each template defines a device type (e.g., "Zoom Rooms Controller",
"Biamp Tesira DSP") and the required connection fields for that type. When the
engineer creates a new device instance in a room, they select a template, fill in
the required connectivity fields (e.g., IP address, port, credentials), and the
app uses the corresponding module to begin monitoring it.

**Why this priority**: Templates and modules are the engine of the monitoring
system. Without them no device can be monitored.

**Independent Test**: Create a device template for a single device type, add a
device instance using that template, populate required fields, and verify the
module attempts a connection and reports back a health status (simulated or real).

**Acceptance Scenarios**:

1. **Given** the user opens the Configuration tab, **When** they create a new device template, **Then** they must supply: template name, device type category, and the connection protocol (confirmed explicitly — the app must prompt for protocol selection).
2. **Given** a device template exists, **When** a user adds a device using that template, **Then** they are prompted for all required connectivity fields defined by that template (e.g., hostname/IP, port, credentials).
3. **Given** a device template has a corresponding module, **When** a device instance is saved, **Then** the module begins polling the device and reports health status within one polling cycle.
4. **Given** an existing device template, **When** the user edits required fields on the template, **Then** all device instances using that template show a warning that their configuration may need review.
5. **Given** the device registry file exists at `resources/device-registry`, **When** the Configuration tab is opened, **Then** available template types are derived from that registry.
6. **Given** a device instance is deleted, **When** the deletion is confirmed, **Then** monitoring for that device stops and its status is removed from the room health calculation.

---

### User Story 5 — Configuration Download & Restore (Priority: P5)

A support engineer selects a Zoom Room device and downloads its current
configuration snapshot. The snapshot is saved as a versioned, human-readable
file. Later, after a fault or device replacement, the engineer restores the
saved configuration to the device. The app warns the user before overwriting.

**Why this priority**: Configuration backup is a first-line recovery tool during
device failures and the primary use case for the Zoom module beyond health
monitoring.

**Independent Test**: Connect to a Zoom Room, download its configuration, modify
one setting, restore the original configuration, and confirm the device's setting
returns to the original value.

**Acceptance Scenarios**:

1. **Given** a Zoom Room device instance is configured, **When** the user selects "Download Configuration", **Then** all available Zoom Room settings are retrieved and saved as a versioned JSON or YAML file.
2. **Given** a saved configuration file exists, **When** the user selects "Restore Configuration" and confirms, **Then** the configuration is applied to the target device and the outcome (success/failure per setting) is reported.
3. **Given** the user initiates a restore, **When** the target device already has a configuration, **Then** the app displays a confirmation warning before overwriting.
4. **Given** a configuration file download completes, **When** the user opens the saved file, **Then** it is human-readable (JSON or YAML) and includes a version timestamp.
5. **Given** an earlier and a later configuration file for the same device, **When** viewed side by side, **Then** the format is consistent enough to be compared using standard diff tools.

---

### User Story 6 — Self-Healing & Control Actions (Priority: P6)

A support engineer sees a RED device LED on a Zoom Room. They open the room
detail, select the affected device, and trigger a self-healing action (e.g.,
reboot). If the device exposes a web interface (Zoom Controller WebUI or Biamp
Workplace WebUI), the app opens it in a browser panel or the system browser.
The engineer can initiate the action and observe the health LED updating after
the device recovers.

**Why this priority**: Control actions turn the tool from a passive monitor into
an active resolution tool. They depend on device detail (P2) and templates (P4)
being in place first.

**Independent Test**: With a configured Zoom Room device instance, trigger the
"Open WebUI" action and verify it opens the correct URL in the system browser.
Trigger a simulated reboot action and verify the device LED transitions through
AMBER (action in progress) to GREEN (recovery) or RED (failed).

**Acceptance Scenarios**:

1. **Given** a device is in RED or AMBER state, **When** the user selects "Reboot", **Then** the app sends the reboot command via the device's module and the device LED transitions to AMBER (pending).
2. **Given** a Zoom Controller device has a configured WebUI URL, **When** the user selects "Open WebUI", **Then** the URL opens in the system browser.
3. **Given** a Biamp device has a configured Workplace WebUI URL, **When** the user selects "Open WebUI", **Then** the URL opens in the system browser.
4. **Given** a reboot command was sent, **When** the device comes back online within the expected recovery window, **Then** the LED transitions to GREEN and a log entry records the event.
5. **Given** a reboot command was sent, **When** the device does not recover within the expected window, **Then** the LED remains RED and the log records a failed recovery event.
6. **Given** any control action is about to be executed, **When** the action is irreversible or disruptive, **Then** the app presents a confirmation dialog before proceeding.

---

### User Story 7 — Log Export & OpenTelemetry Config Generation (Priority: P7)

A support engineer opens the Logs section, reviews timestamped entries for all
rooms and devices, and downloads a structured log file. Separately, they
navigate to the Observability section and generate an OpenTelemetry collector
configuration file pre-configured to send room health data to their New Relic
account. They copy or download the file and use it to configure their OTel
collector.

**Why this priority**: Observability outputs require core monitoring (P1–P4) to
be in place. They are high-value but not blocking for initial use.

**Independent Test**: With at least one room and device producing health events,
download the log file and verify it contains timestamped, structured entries.
Generate an OTel config file and validate it against the OTel collector schema.

**Acceptance Scenarios**:

1. **Given** the app has been running and monitoring devices, **When** the user opens the Logs section, **Then** all recorded events are displayed in reverse-chronological order with timestamp, severity, source (device/room/floor), and description.
2. **Given** the Logs view is open, **When** the user clicks "Download Logs", **Then** a structured log file (JSON or CSV) is saved to the user-specified location.
3. **Given** the app has location and device data configured, **When** the user requests an OTel config export, **Then** the app generates a valid OpenTelemetry collector configuration YAML pre-configured for New Relic ingest.
4. **Given** an OTel config is generated, **When** the user opens the file, **Then** it includes: metric definitions for each monitored device type, a New Relic exporter block, and a placeholder for the New Relic ingest key.
5. **Given** an OTel config file is generated, **When** validated against the official OTel collector configuration schema, **Then** it passes without errors.

---

### Edge Cases

- A region has no offices configured yet — the region should appear in the hierarchy with an UNKNOWN/GREY LED and prompt the user to add locations.
- A device module cannot reach the device (network timeout) — the device LED turns RED and the reason is logged; self-healing actions remain available.
- A floor map image is deleted or moved from its original path — the floor view shows a missing-image placeholder with an option to re-upload.
- Two device instances share the same IP address — the app must warn the user during configuration and prevent duplicate monitoring connections.
- A configuration restore is attempted while the device is offline — the app must report the failure clearly and not corrupt the saved configuration file.
- App is closed mid-polling cycle — on restart the polling cycle resumes cleanly without duplicate log entries.
- A device's module is not yet implemented (registry entry exists but no module) — the device template is shown as "pending module" and cannot be used to create active instances until the module is available.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Location Hierarchy

- **FR-001**: System MUST allow users to create and manage a five-level location hierarchy: Global → Region → Office → Floor → Room.
- **FR-002**: System MUST display an aggregated LED health status (GREEN / AMBER / RED / GREY) at every level of the hierarchy.
- **FR-003**: System MUST aggregate status upward: a device failure propagates to room → floor → office → region → global level.
- **FR-004**: System MUST show device-level detail only when a specific room is selected; intermediate levels MUST show only aggregated LEDs.
- **FR-005**: System MUST persist the full location hierarchy across application restarts.

#### Floor Map & Layout

- **FR-006**: System MUST allow users to upload a floor plan image (PNG or JPEG) for any floor.
- **FR-007**: System MUST allow users to draw, label, and reposition rectangular room areas on the floor-map canvas.
- **FR-008**: System MUST allow users to place device elements inside room areas on the floor map. Each device element MUST be rendered as a square tile displaying the device name, device type, and a status LED indicator — a bare LED dot is not sufficient.
- **FR-009**: System MUST display live health status LEDs on both room areas and device elements on the floor-map canvas.
- **FR-010**: System MUST persist all floor-map layouts (room positions, device positions, labels) locally.

#### Device Templates & Module Registry

- **FR-011**: System MUST maintain a device registry file as the authoritative list of supported device types.
- **FR-012**: System MUST allow users to create device templates derived from the device registry.
- **FR-013**: When creating a device template, the system MUST prompt the user to explicitly confirm the connection protocol before the template is saved.
- **FR-014**: Each device template MUST have exactly one corresponding communication module.
- **FR-015**: System MUST allow users to add device instances to rooms by selecting a template and supplying required connectivity fields.
- **FR-016**: Credentials entered for device instances MUST be stored in the OS credential store, never in plain text.

#### Monitoring & Health Status

- **FR-017**: System MUST poll each configured device at the interval specified in settings and update its health status.
- **FR-018**: System MUST define at minimum three health states per device: GREEN (healthy), AMBER (warning), RED (critical / unreachable).
- **FR-019**: System MUST display a timestamp of the last successful check for each device.
- **FR-020**: System MUST log every health status change with timestamp, source, old state, and new state.
- **FR-021**: Health status MUST be determined as follows: GREEN = device is reachable and responding normally; AMBER = device is reachable but reporting a non-critical fault (e.g., a Zoom Room in a "Needs Attention" state); RED = device is unreachable after N consecutive failed polls. The default polling interval MUST be 30 seconds. The value of N (consecutive failures before RED) MUST be configurable in application settings, with a default of 3.

#### Control & Self-Healing

- **FR-022**: System MUST provide a "Reboot" action for devices whose module supports it.
- **FR-023**: System MUST provide an "Open WebUI" action for Zoom Controller and Biamp Workplace devices where a WebUI URL is configured.
- **FR-024**: System MUST display a confirmation dialog before executing any disruptive control action.
- **FR-025**: System MUST log all control actions with outcome (success/failure) and operator identity.
- **FR-026**: The set of supported control/self-healing actions for a given device MUST be defined by that device's module. At minimum, every module MUST declare which actions it supports; the UI MUST display only the actions the module exposes. Reboot is the only action required of every module; additional actions (e.g., soft restart, cache clear, API command) are module-specific and enumerated when the module is created.

#### Configuration Management

- **FR-027**: System MUST allow users to download a full configuration snapshot from any Zoom Room device.
- **FR-028**: Configuration snapshots MUST be saved as versioned, human-readable JSON or YAML files.
- **FR-029**: System MUST allow users to restore a saved configuration snapshot to a Zoom Room device.
- **FR-030**: System MUST display a warning before overwriting an existing device configuration during restore.
- **FR-031**: No application update may render previously exported configuration files unreadable.

#### Observability & Logging

- **FR-032**: System MUST record every significant event (status change, control action, config export/restore, error) with: timestamp, severity, source, and description.
- **FR-033**: System MUST allow users to view logs within the application and download them as a structured file (JSON or CSV).
- **FR-034**: System MUST generate an OpenTelemetry collector configuration YAML pre-configured for New Relic ingest based on the configured device inventory.
- **FR-035**: The generated OTel configuration MUST include metric definitions for each monitored device type and a New Relic exporter block.

#### Platform & Access

- **FR-036**: System MUST run on macOS 12+ and Windows 10+ with full feature parity.
- **FR-037**: The application MUST operate as a single-user local tool with no login screen and no role-based access control. Device credentials MUST be stored in the OS keychain tied to the current OS user account. Audit log entries MUST record the OS username as the operator identity.

### Key Entities

- **Region**: Top-level geographic grouping (e.g., EMEA, APAC). Attributes: name, aggregated health status.
- **Office**: A physical office/city within a Region. Attributes: name, region reference, aggregated health status.
- **Floor**: A physical level within an Office. Attributes: level number/name, office reference, floor-map image, aggregated health status.
- **Room**: A meeting room on a Floor. Attributes: name, floor reference, canvas position/dimensions, aggregated health status.
- **Device Instance**: A physical device in a Room. Attributes: name, template reference, connectivity fields (encrypted), current health status, last-checked timestamp, canvas position.
- **Device Template**: A reusable configuration blueprint for a device type. Attributes: name, device type (from registry), connection protocol, required connectivity fields list, reference to module.
- **Device Registry Entry**: A record in the canonical registry file. Attributes: device type name, manufacturer, module reference, documentation source URL.
- **Configuration Snapshot**: A versioned export of a device's settings. Attributes: device reference, timestamp, format version, payload (JSON/YAML).
- **Log Entry**: A single recorded application event. Attributes: timestamp, severity, source (device/room/floor/system), message, before/after state where applicable.
- **Floor Map Layout**: The canvas state for a floor. Attributes: floor reference, image file, room area definitions (position, size, label), device element positions.

---

## Assumptions

- The app runs as a single-user local tool on the engineer's machine; network access to monitored devices is assumed (no proxy or remote-agent architecture required for v1).
- Zoom Room configuration download will use the Zoom Room API documented in `/resources/Zoom/`.
- Zoom Controller WebUI and Biamp Workplace WebUI are accessible via HTTP/HTTPS on the local network.
- PNG and JPEG are sufficient floor-map formats for v1; PDF and SVG support may be added later.
- The device registry file at `/resources/device-registry` will be created as a separate deliverable before module work begins (per Constitution Principle V).
- Log retention is managed by the user (download and archive); the app does not auto-purge logs for v1 beyond a configurable maximum entry count.
- Slack integration is explicitly out of scope for this feature; architecture must accommodate it as a future notification channel.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A support engineer can identify the region and office containing a faulty room within 30 seconds of opening the app, without prior knowledge of which room is affected.
- **SC-002**: All health status changes (device → room → floor → office → region) are reflected on screen within two polling cycles of the event occurring.
- **SC-003**: A complete Zoom Room configuration can be downloaded, saved, and fully restored to a device in under 5 minutes.
- **SC-004**: 100% of supported device types have a corresponding module with an isolated passing test suite before the module is used in production monitoring.
- **SC-005**: The generated OTel configuration file passes schema validation without errors on the first attempt for any configured device inventory.
- **SC-006**: All application events are present and correctly ordered in a downloaded log file; zero events are missing or duplicated.
- **SC-007**: Every floor-map layout, room placement, and device position survives an application restart without manual re-entry.
- **SC-008**: The app installs and runs with full feature parity on both macOS 12+ and Windows 10+ without any platform-specific setup steps beyond the standard installer.
