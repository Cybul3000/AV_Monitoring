# Feature Specification: AV Monitoring & Self-Healing — Zoom Room Manager

**Feature Branch**: `001-av-room-monitor`
**Created**: 2026-03-22
**Status**: Draft
**Input**: User description: Cross-platform local desktop application that monitors and self-heals Zoom Room meeting rooms with layered UI, device modules, floor maps, configuration management, OTel/New Relic integration, and log export.

## Clarifications

### Session 2026-03-23

- Q: What should the scope of the alert rules settings export be? → A: App settings export — alert rules + preferences (polling interval, N-failures threshold, tooltip settings) as a single JSON/YAML file (Option B).
- Q: What is the health monitoring mechanism for Zoom Rooms and what is the Zoom API used for? → A: Zoom health monitoring = network reachability only (ICMP/TCP ping to device IP). The Zoom API is used exclusively for on-demand commands (reboot, config download/restore, speaker test). Mute state and volume level are not monitored. Primary device monitoring focus is Lightware switcher, Biamp DSP, and LG display (TV input selection).
- Q: What should the app do when OS keychain credential access fails for a configured device? → A: Mark the affected device GREY with a "Credentials unavailable — click to re-enter" message in the device detail panel. Monitoring resumes immediately on re-entry. Credential failure MUST NOT trigger alert rules or be reported as a device fault (Option A).
- Q: How should the "expected HDMI input" for LG display alerting be defined? → A: A single operator-configured field on the LG device instance (e.g., "Expected HDMI Input: 1"). Alert fires when the current active input differs from this configured value. Set in the device setup form alongside IP/port (Option A).
- Q: How are Zoom Room device instances created in the hierarchy? → A: The user selects an office location and triggers an "Import Zoom Rooms" action. The app calls the Zoom API with the office's Zoom location ID to fetch all Zoom Rooms for that location and creates device instances automatically. This is a configuration function, not ongoing polling. App-level Zoom OAuth credentials are stored separately from per-device credentials.

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
5. **Given** the device registry file exists at `resources/device-registry.json`, **When** the Configuration tab is opened, **Then** available template types are derived from that registry.
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

### User Story 8 — Configurable Alert Rules per Device Status (Priority: P8)

A support engineer reviews the app's alert settings and decides which specific status conditions should generate a visible alert badge or notification. For example, they may want an alert when a Biamp's USB connection drops, but not when USB streaming stops. They toggle alerting on or off for each individual status data point, per device type. This allows tuning the signal-to-noise ratio so the team is only notified about conditions that matter in their environment.

**Why this priority**: Without configurable alerting, every status change would either always alert (too noisy) or never alert (no operational value). This unlocks the monitoring system's practical day-to-day usability.

**Independent Test**: Open alert settings, disable alerting for one specific status point (e.g., Lightware USB input), trigger that condition, and confirm no alert badge is shown. Then re-enable it, trigger the same condition, and confirm the badge appears.

**Acceptance Scenarios**:

1. **Given** the app is configured with at least one device, **When** the user opens Alert Settings, **Then** they see a list of all monitorable status data points grouped by device type, each with an on/off toggle for alerting.
2. **Given** alerting is enabled for a status point, **When** that status transitions to an alert-worthy value (e.g., disconnected, no signal), **Then** the device LED transitions to AMBER or RED and a visible alert indicator appears.
3. **Given** alerting is disabled for a status point, **When** that same condition occurs, **Then** the status is still displayed as informational but does NOT trigger a colour change to AMBER or RED.
4. **Given** the user changes alert toggle settings, **When** the app is restarted, **Then** all toggle states are preserved exactly as configured.
5. **Given** a new device instance is added, **When** it is first saved, **Then** alert toggles for that device type are pre-configured with sensible defaults (alertable conditions default ON; informational conditions default OFF).

---

### User Story 9 — Dante Network Audio Control Tab with Deep-Link Navigation (Priority: P9)

A support engineer notices a Biamp device is reporting a Dante audio network issue. The device detail panel shows an alert badge labelled "Dante Issue" that includes a "View Dante" link. The engineer clicks the link and is taken directly to the dedicated Dante tab, which shows the Dante audio network status for devices on the same network segment. This tab is also accessible from the main navigation bar at any time, independent of any alert.

**Why this priority**: Dante audio routing issues are a common cause of Biamp-reported faults. Without a dedicated view, engineers must use external tools (Dante Controller) to diagnose. Deep-linking from the Biamp alert eliminates that context-switch.

**Independent Test**: Configure a Biamp device that reports a Dante fault. Verify that the "View Dante" link appears in the device alert section. Click it and confirm the Dante tab opens and shows Dante network status. Also verify the Dante tab is reachable from the main navigation independently.

**Acceptance Scenarios**:

1. **Given** the main navigation is visible, **When** the user looks at the top-level tabs, **Then** a "Dante" tab is present alongside Dashboard, Configuration, Logs, and Observability.
2. **Given** the Dante tab is selected, **When** it loads, **Then** it displays discovered Dante audio network devices and their status (subscription health, device online/offline) for the current network segment.
3. **Given** a Biamp device is reporting a Dante-related status issue, **When** the user opens that device's detail panel, **Then** a "View Dante" hyperlink is displayed adjacent to the Dante status indicator.
4. **Given** the "View Dante" link is clicked from a Biamp device detail, **When** the navigation completes, **Then** the Dante tab is activated and shown in the foreground.
5. **Given** the Dante tab is reached via deep-link, **When** the user presses the back control, **Then** they are returned to the Biamp device detail that triggered the navigation.

---

### User Story 10 — Biamp Device Deep Monitoring & Controls (Priority: P10)

A support engineer opens a room containing a Biamp Tesira DSP. The device detail panel shows a rich set of status indicators: USB connection state (with an alert if disconnected), whether USB audio streaming is active (informational), the mute state of USB audio inputs and outputs, whether the FIRE mute input is active (if the device supports it), the Dante audio network status, and — where available — the connection status from a Crestron control processor. The engineer can toggle the USB mute and FIRE mute states from within the app, and can trigger a device reboot with a confirmation prompt.

**Why this priority**: Biamp devices are the audio hub of most meeting rooms. Visibility into USB, mute, and Dante state directly informs rapid fault resolution.

**Independent Test**: Configure a Biamp device instance. Verify that USB connection, USB streaming, USB input mute, USB output mute, and Dante status all appear in the device detail panel. Trigger the USB mute toggle and verify the displayed state updates accordingly. Trigger a reboot and verify the confirmation dialog appears.

**Acceptance Scenarios**:

1. **Given** a Biamp device is configured and reachable, **When** the user opens its detail panel, **Then** the following status indicators are displayed: USB Connected (with alert badge if disconnected), USB Streaming Active (informational), USB Input Muted, USB Output Muted, Dante Status (with alert badge on any fault), and Crestron Control Connection Status (displayed only if the Biamp device has a Crestron control connection configured).
2. **Given** a Biamp device supports a FIRE mute input, **When** the device detail is viewed, **Then** the FIRE Mute state is displayed as a status indicator; if FIRE mute is unavailable on that device model it is hidden.
3. **Given** the USB input or output mute indicator is visible, **When** the user clicks the toggle control next to it, **Then** a confirmation prompt appears; on confirmation the mute state is changed and the indicator updates to reflect the new state.
4. **Given** a Biamp device is reachable, **When** the user selects "Reboot", **Then** a confirmation dialog is shown; on confirmation the reboot command is sent and the device LED transitions to AMBER (pending recovery).
5. **Given** alerting is enabled for USB Connected, **When** the USB connection is lost, **Then** the device LED changes to RED and an alert badge labelled "USB Disconnected" appears in the device detail.
6. **Given** alerting is enabled for Dante, **When** the Biamp reports any Dante fault, **Then** the device LED changes to at least AMBER, an alert badge labelled "Dante Issue" appears, and a "View Dante" link is shown in the alert section.

---

### User Story 11 — Lightware Matrix Switcher Monitoring & Self-Healing (Priority: P11)

A support engineer opens a room containing a Lightware matrix switcher. The device detail panel shows which USB inputs are currently active, whether each HDMI input has a valid signal, and the current routing state (which inputs are mapped to which outputs for both USB and HDMI). Alerting is optionally configurable for "no USB input active" and "no HDMI signal". The engineer can switch any input to any output directly from the panel. Critically, the engineer can save the current routing state as a "healthy snapshot" and later restore the switcher to that snapshot in a single click — the core self-healing action.

**Why this priority**: Lightware routing issues (dropped signals, incorrect input selections) are among the most common and most disruptive meeting room faults. The snapshot-restore self-healing workflow directly addresses the primary use case.

**Independent Test**: Configure a Lightware device. Verify that USB input active status and HDMI signal status are shown. Change an input routing and verify the panel reflects the new state. Save a healthy snapshot, change routing again, restore the snapshot, and confirm routing returns to the saved state.

**Acceptance Scenarios**:

1. **Given** a Lightware device is configured and reachable, **When** the user views its detail panel, **Then** USB input active status is shown (informational by default; optionally alertable) and each HDMI input's signal presence is shown (alertable if no signal).
2. **Given** the routing panel is open, **When** the user selects a different input source for any HDMI or USB output, **Then** a confirmation prompt appears; on confirmation the routing change is applied and the panel updates to reflect the new mapping.
3. **Given** the current routing state is correct and healthy, **When** the user selects "Save as Healthy State", **Then** the full current routing configuration (all USB and HDMI input-to-output mappings) is saved as a named snapshot.
4. **Given** a healthy snapshot exists, **When** the user selects "Restore Healthy State" and confirms, **Then** the switcher routing is restored to the saved snapshot values and a log entry records the restore action.
5. **Given** alerting is enabled for "No HDMI Signal", **When** a configured HDMI input loses its signal, **Then** the device LED transitions to at least AMBER and an alert badge is displayed.
6. **Given** alerting is enabled for "No USB Input Active", **When** no USB input is active, **Then** an alert badge is shown; when alerting for this condition is disabled, it is displayed as informational status only.

---

### User Story 12 — LG Professional Display Control & Alerting (Priority: P12)

A support engineer opens a room containing an LG professional display. The device detail panel shows the current power state (ON or OFF) and the active HDMI input. The engineer can turn the display on or off directly from the panel. They can also switch the active HDMI input. Alerting is configurable for both power-off state and HDMI input changes.

**Why this priority**: LG displays are common endpoints in meeting rooms. Unexpected power-off or wrong input selection are frequent first-response issues. Direct control eliminates the need for physical access.

**Independent Test**: Configure an LG display device instance. Verify power state and HDMI input are displayed. Trigger a power toggle and verify the panel state updates. Enable HDMI input alerting, change the input to an unexpected value, and verify the alert appears.

**Acceptance Scenarios**:

1. **Given** an LG display device is configured and reachable, **When** the user opens its detail panel, **Then** the current power state (ON/OFF) and active HDMI input number are displayed.
2. **Given** the display is ON, **When** the user clicks "Power Off" and confirms, **Then** the power-off command is sent and the status updates to OFF.
3. **Given** the display is OFF, **When** the user clicks "Power On" and confirms, **Then** the power-on command is sent and the status updates to ON.
4. **Given** the HDMI input control is visible, **When** the user selects a different input number and confirms, **Then** the input change command is sent and the active input indicator updates.
5. **Given** alerting is enabled for power state, **When** the display is unexpectedly powered off, **Then** the device LED transitions to at least AMBER and an alert badge is shown.
6. **Given** alerting is enabled for HDMI input and an expected HDMI input value is configured on the device instance, **When** the active HDMI input differs from the configured expected value, **Then** an alert badge is displayed. If no expected input value is configured, HDMI input alerting is unavailable and the toggle is disabled.

---

### User Story 13 — Crestron Enhanced Status Display (Priority: P13)

A support engineer opens a room containing a Crestron control processor. In addition to overall connection status, the device detail panel shows — where the Crestron program makes them available — the connection status of the touch-panel tablet application and the Biamp DSP connection status as managed by Crestron. The engineer can also trigger a device reboot and a program reset from the panel, consistent with the existing Crestron specification (spec 004).

**Why this priority**: Crestron is the control hub of many room systems. Knowing that the Crestron-managed Biamp connection is healthy, or that the tablet app has lost contact with Crestron, is key context for rapid triage.

**Independent Test**: Configure a Crestron device whose program exposes tablet-app connection and Biamp-connection status signals. Verify both indicators appear in the device detail panel. Trigger a program reset and verify the confirmation dialog appears.

**Acceptance Scenarios**:

1. **Given** a Crestron device is configured, reachable, and the running program exposes tablet-app connection status, **When** the user views its detail panel, **Then** the tablet application connection state is shown (Connected / Disconnected).
2. **Given** the Crestron program exposes a Biamp DSP connection status signal, **When** the device detail is viewed, **Then** the Biamp control connection state is shown; if the signal is not available, this indicator is hidden.
3. **Given** the device detail is open, **When** the user selects "Reboot", **Then** a confirmation dialog is shown; on confirmation the reboot command is sent and the device LED transitions to AMBER (pending recovery), consistent with spec 004 behaviour.
4. **Given** the device detail is open, **When** the user selects "Program Reset", **Then** a confirmation dialog is shown with an explicit warning that this will restart the Crestron program; on confirmation the reset command is sent.
5. **Given** tablet-app connection alerting is enabled, **When** the tablet application disconnects from Crestron, **Then** the device LED changes to at least AMBER and an alert badge is shown.

---

### User Story 14 — Zoom Room Speaker Test (Priority: P14)

A support engineer opens a room containing a Zoom Room. The device detail panel shows the device's online/offline status (from network reachability). The engineer can trigger a "Run Speaker Test" action that calls Zoom's built-in audio self-check on demand. They can also reboot the Zoom Room directly from the panel (consistent with US6). Mute state and volume level are not monitored — the Zoom API is not polled; it is used for commands only.

**Why this priority**: A speaker test eliminates the need to open the Zoom admin portal for basic audio diagnostics. Reboot (US6) is already available; this story adds only the speaker test capability.

**Independent Test**: Configure a Zoom Room device instance. Trigger the "Run Speaker Test" and verify a confirmation prompt appears, the command is dispatched, and the outcome (pass/fail) is displayed in the panel and logged.

**Acceptance Scenarios**:

1. **Given** the user selects "Run Speaker Test", **When** the confirmation dialog is accepted, **Then** the speaker test command is sent to the Zoom Room via the Zoom API and the outcome (pass/fail) is displayed in the device detail panel and recorded in the log.
2. **Given** the Zoom Room is in an active meeting, **When** "Run Speaker Test" is triggered and confirmed, **Then** the command returns an error, the panel displays a clear message (e.g., "Speaker test unavailable — room is in an active meeting"), and the event is logged; no silent failure is acceptable.
3. **Given** the user selects "Reboot Room" and confirms, **Then** the reboot command is sent and the device LED transitions to AMBER (pending recovery), consistent with US6 behaviour.

---

### Edge Cases

- A region has no offices configured yet — the region should appear in the hierarchy with an UNKNOWN/GREY LED and prompt the user to add locations.
- A device module cannot reach the device (network timeout) — the device LED turns RED and the reason is logged; self-healing actions remain available.
- The OS keychain denies access or returns no credential for a device — the device is shown as GREY with "Credentials unavailable — click to re-enter"; monitoring is suspended for that device only; alert rules are not fired; no health fault is logged (FR-016).
- An LG display device instance has no expected HDMI input value configured — the HDMI input alert toggle in AlertSettingsView is shown as disabled with a tooltip "Configure expected input on the device to enable this alert"; no false alerts are fired.
- A floor map image is deleted or moved from its original path — the floor view shows a missing-image placeholder with an option to re-upload.
- Two device instances share the same IP address — the app must warn the user during configuration and prevent duplicate monitoring connections.
- A configuration restore is attempted while the device is offline — the app must report the failure clearly and not corrupt the saved configuration file.
- App is closed mid-polling cycle — on restart the polling cycle resumes cleanly without duplicate log entries.
- A device's module is not yet implemented (registry entry exists but no module) — the device template is shown as "pending module" and cannot be used to create active instances until the module is available.
- Alerting is configured for a status point, but the device is unreachable — alert toggles must not reset; they remain as configured when connectivity is restored.
- A Biamp device is in a room without a Crestron device — the "Crestron Control Connection" indicator must not appear in the Biamp device detail.
- A Crestron program does not expose tablet-app or Biamp connection signals — those indicators must be hidden entirely rather than shown as unknown.
- Lightware "Save as Healthy State" is triggered while routing is in a known-bad state — the UI must warn the user that the current state may not be healthy and require explicit confirmation.
- Dante tab is opened directly (not via deep-link) when no Dante devices are discovered — the tab shows an empty state with guidance on how to verify network connectivity.
- A Zoom Room speaker test is triggered while the room is in an active meeting — the module must surface the error cleanly and log it; no silent failure is acceptable.
- App settings (alert rules + preferences) are exported then imported on a different machine or after a reinstall — the imported file must restore all toggles and preference values exactly as exported, with no data loss (FR-038, FR-039).

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

- **FR-011**: System MUST maintain `resources/device-registry.json` as the authoritative list of supported device types.
- **FR-012**: System MUST allow users to create device templates derived from the device registry.
- **FR-013**: When creating a device template, the system MUST prompt the user to explicitly confirm the connection protocol before the template is saved.
- **FR-014**: Each device template MUST have exactly one corresponding communication module.
- **FR-015**: System MUST allow users to add device instances to rooms by selecting a template and supplying required connectivity fields.
- **FR-015a**: System MUST provide an "Import Zoom Rooms" action at the office level in the Configuration view. When triggered, the app uses app-level Zoom OAuth credentials (stored separately in the OS keychain under a dedicated app-level entry, not per-device) to call the Zoom API and fetch all Zoom Room devices associated with the office's configured Zoom Location ID. The app MUST create a device instance for each returned room that does not already exist (matched by Zoom Room ID); existing instances MUST NOT be duplicated. The Zoom Location ID is an optional field on the Office entity set during office configuration.
- **FR-016**: Credentials entered for device instances MUST be stored in the OS credential store, never in plain text. If the OS keychain denies access or returns no credential for a configured device, the system MUST mark that device GREY (not RED) with a "Credentials unavailable — click to re-enter" indicator in the device detail panel; monitoring for that device is suspended until credentials are re-entered. Credential failure MUST NOT trigger alert rules and MUST NOT be logged as a device health fault. If the OS keychain denies access or returns no credential for a configured device, the system MUST mark that device GREY (not RED) with a "Credentials unavailable — click to re-enter" indicator in the device detail panel; monitoring for that device is suspended until credentials are re-entered. Credential failure MUST NOT trigger alert rules and MUST NOT be logged as a device health fault.

#### Monitoring & Health Status

- **FR-017**: System MUST poll each configured device at the interval specified in settings and update its health status.
- **FR-018**: System MUST define at minimum three health states per device: GREEN (healthy), AMBER (warning), RED (critical / unreachable).
- **FR-019**: System MUST display a timestamp of the last successful check for each device.
- **FR-020**: System MUST log every health status change with timestamp, source, old state, and new state.
- **FR-021**: Health status MUST be determined as follows: GREEN = device is reachable and responding normally; AMBER = device is reachable but reporting a non-critical fault; RED = device is unreachable after N consecutive failed polls. The default polling interval MUST be 30 seconds. The value of N (consecutive failures before RED) MUST be configurable in application settings, with a default of 3. **For Zoom Room devices specifically**, health is determined by network reachability only (ICMP/TCP probe to the device IP) — the Zoom API is NOT called during polling. The Zoom API is used exclusively for on-demand commands (reboot, configuration download/restore, speaker test).

#### Control & Self-Healing

- **FR-022**: System MUST provide a "Reboot" action for every device instance. Reboot is the only action required of every module (see FR-026); all other actions are module-specific.
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

#### Settings Export & Import

- **FR-038**: System MUST allow users to export all app settings — alert rule toggles (per device type, per status point) and all preference values (polling interval, N-failures threshold, tooltips enabled) — as a single human-readable JSON or YAML file.
- **FR-039**: System MUST allow users to import a previously exported settings file. On import, all alert rules and preferences in the file MUST be applied atomically; the app MUST warn the user that existing settings will be overwritten before proceeding. The file format MUST be round-trippable without data loss across app versions.

#### Platform & Access

- **FR-036**: System MUST run on macOS 12+ and Windows 10+ with full feature parity.
- **FR-037**: The application MUST operate as a single-user local tool with no login screen and no role-based access control. Device credentials MUST be stored in the OS keychain tied to the current OS user account. Audit log entries MUST record the OS username as the operator identity.

### Key Entities

- **Region**: Top-level geographic grouping (e.g., EMEA, APAC). Attributes: name, aggregated health status.
- **Office**: A physical office/city within a Region. Attributes: name, region reference, aggregated health status, optional Zoom Location ID (used by FR-015a to filter the Zoom API room list for that office).
- **Floor**: A physical level within an Office. Attributes: level number/name, office reference, floor-map image, aggregated health status.
- **Room**: A meeting room on a Floor. Attributes: name, floor reference, canvas position/dimensions, aggregated health status.
- **Device Instance**: A physical device in a Room. Attributes: name, template reference, connectivity fields (encrypted), current health status, last-checked timestamp, canvas position, module-specific optional fields (e.g., `expectedHdmiInput` for LG display devices — stored unencrypted as a plain integer alongside other device config).
- **Device Template**: A reusable configuration blueprint for a device type. Attributes: name, device type (from registry), connection protocol, required connectivity fields list, reference to module.
- **Device Registry Entry**: A record in the canonical registry file. Attributes: device type name, manufacturer, module reference, documentation source URL.
- **Configuration Snapshot**: A versioned export of a device's settings. Attributes: device reference, timestamp, format version, payload (JSON/YAML).
- **Log Entry**: A single recorded application event. Attributes: timestamp, severity, source (device/room/floor/system), message, before/after state where applicable.
- **Floor Map Layout**: The canvas state for a floor. Attributes: floor reference, image file, room area definitions (position, size, label), device element positions.

---

## Assumptions

- The app runs as a single-user local tool on the engineer's machine; network access to monitored devices is assumed (no proxy or remote-agent architecture required for v1).
- Zoom Room device instances are created via the "Import Zoom Rooms" action (FR-015a), not by manual entry. The Zoom API is used for: room discovery (list by location), configuration download/restore, and on-demand commands (reboot, speaker test). Health monitoring uses TCP reachability only — the Zoom API is not polled.
- App-level Zoom OAuth credentials (client ID + secret) are stored once in the OS keychain under a single app-level entry and shared across all Zoom API operations. Per-device Zoom credentials are not required.
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
