# Feature Specification: Dante Network Audio Device Monitoring and Subscription Management

**Feature Branch**: `003-dante-network-audio`  
**Created**: 2025-07-16  
**Status**: Draft  
**Input**: User description: "Add Dante network audio device monitoring and subscription management"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover and Monitor Dante Devices (Priority: P1)

An AV technician or system operator needs to see all active Dante audio devices present on the local network, along with their key properties — device name, IP address, model, sample rate, and how many receive and transmit channels they expose. This gives operators a live inventory of what is online without needing Dante Controller software.

**Why this priority**: Without device discovery, no other feature is possible. A network-wide device list is the foundational view for any AV monitoring workflow. Delivering it alone already provides significant operational value.

**Independent Test**: Can be fully tested by querying the network with no additional configuration. Delivers value by showing all available Dante devices, their connectivity status, network address, and channel counts on a single screen.

**Acceptance Scenarios**:

1. **Given** one or more Dante devices are connected to the local network, **When** the system scans the network, **Then** it lists all discovered devices including their name, IP address, model identifier, and sample rate.
2. **Given** a device is discovered, **When** the operator inspects it, **Then** the number of transmit and receive channels is shown.
3. **Given** a device is powered off or disconnected, **When** the system refreshes, **Then** it is no longer shown as available (or is marked as offline).
4. **Given** multiple Dante devices are present, **When** the system lists them, **Then** all unique devices appear exactly once without duplicates.

---

### User Story 2 - Monitor Audio Subscription Routing Health (Priority: P2)

An AV technician troubleshooting audio path issues needs to see the current routing state of all receive channels across Dante devices — which channels are actively receiving audio from a transmit source, which are unresolved, and which are routed back to themselves.

**Why this priority**: Audio routing failures are the most common operational problem in Dante environments. Displaying subscription status allows operators to spot broken signal paths immediately without specialist software.

**Independent Test**: Can be tested independently of subscription management (P3) by querying and displaying existing subscriptions. Delivers value by surfacing broken audio routes at a glance.

**Acceptance Scenarios**:

1. **Given** a receive channel is successfully connected to a transmit channel, **When** the operator views subscriptions for a device, **Then** the routing is shown as connected, with the source device and channel name displayed.
2. **Given** a receive channel has a subscription configured but cannot resolve the source, **When** the operator views subscriptions, **Then** the subscription is shown as unresolved.
3. **Given** a receive channel is not subscribed to any source, **When** the operator views subscriptions, **Then** the channel is shown as unsubscribed.
4. **Given** the operator queries subscriptions across all discovered devices, **When** results are returned, **Then** each subscription entry includes the receive device name, receive channel name, transmit device name, transmit channel name, and connection status.

---

### User Story 3 - Add and Remove Audio Routing Subscriptions (Priority: P3)

An AV technician needs to route audio from one Dante device's transmit channel to another device's receive channel, and to remove an existing routing when it is no longer needed — all without Dante Controller software.

**Why this priority**: Routing control is the primary active operation on a Dante network. Read-only monitoring (P1/P2) must exist first, but the ability to modify routing transforms the tool from a viewer into a controller.

**Independent Test**: Can be tested independently by adding a subscription between two known devices and verifying it appears as connected, then removing it and verifying it disappears.

**Acceptance Scenarios**:

1. **Given** two Dante devices are present with available transmit and receive channels, **When** the operator creates a subscription from a transmit channel to a receive channel, **Then** the new subscription appears as connected in the routing view.
2. **Given** an existing subscription is in place, **When** the operator removes it, **Then** the receive channel is no longer shown as subscribed to that transmit source.
3. **Given** the operator attempts to subscribe a receive channel that is already connected to another source, **When** the action is submitted, **Then** the system either replaces the existing subscription or rejects the operation with a clear explanation.
4. **Given** a target device or channel name does not exist on the network, **When** the operator tries to create a subscription, **Then** the system reports that the device or channel was not found.

---

### User Story 4 - View and Configure Device Settings (Priority: P4)

An AV technician needs to read and change device-level audio settings — specifically sample rate, bit depth encoding, and audio latency — to ensure consistent audio quality and minimize synchronisation issues across the Dante network.

**Why this priority**: Device configuration is less frequent than routing but operationally important when integrating new equipment or troubleshooting audio artefacts. It builds on device discovery and does not depend on subscription management.

**Independent Test**: Can be tested independently by querying and then changing the sample rate of a single device, and verifying the value updates correctly.

**Acceptance Scenarios**:

1. **Given** a discovered Dante device, **When** the operator reads its settings, **Then** the current sample rate (in Hz), encoding bit depth (16, 24, or 32 bit), and network latency (in milliseconds) are shown.
2. **Given** a device supports sample rate changes, **When** the operator sets a new sample rate, **Then** the device updates and the new value is confirmed.
3. **Given** a device supports encoding configuration, **When** the operator sets a different bit depth, **Then** the device updates and the new value is reflected.
4. **Given** the operator sets device latency, **When** the change is applied, **Then** the new latency value is confirmed and shown in milliseconds.
5. **Given** an unsupported configuration value is requested (e.g., a non-standard sample rate), **When** the operator submits it, **Then** the system rejects the value and shows which values are accepted.

---

### User Story 5 - Monitor AVIO Analog I/O Gain Levels (Priority: P5)

An AV technician working with AVIO analog interface adaptors needs to read and set the input or output gain level on each device to match studio-level, consumer-level, or broadcast-level signal standards.

**Why this priority**: AVIO devices are a common Dante endpoint type for connecting analog equipment. Gain control is specific to these devices and does not affect broader Dante networking capability, so it is lowest priority.

**Independent Test**: Can be tested independently on hardware that includes an AVIO device, by setting and then reading back a gain level.

**Acceptance Scenarios**:

1. **Given** an AVIO device is discovered on the network, **When** the operator views its channel settings, **Then** the current gain level for each analog input and output channel is shown.
2. **Given** an AVIO input channel, **When** the operator selects a gain level from the supported range (+24 dBu, +4 dBu, 0 dBu, 0 dBV, −10 dBV), **Then** the gain is applied and confirmed.
3. **Given** an AVIO output channel, **When** the operator selects a gain level from the supported range (+18 dBu, +4 dBu, 0 dBu, 0 dBV, −10 dBV), **Then** the gain is applied and confirmed.
4. **Given** a Dante device that is not an AVIO adaptor, **When** the operator views its settings, **Then** no gain level controls are shown.

---

### Edge Cases

- What happens when mDNS discovery returns no devices? The system must show an empty list with a clear indication that no devices were found, rather than failing silently.
- How does the system handle a device that goes offline mid-session? Subscriptions and channel data from that device should be marked as stale or unavailable on the next refresh.
- What if two devices on the network share the same name? The system must distinguish them by IP address or MAC address, and surface this ambiguity clearly to the operator.
- What happens when a subscription add command is sent but no confirmation is received? The system should report the operation as unconfirmed rather than assuming success.
- What if a device's sample rate is changed while active subscriptions are in place? The system should warn that existing subscriptions may be disrupted by a sample rate mismatch.
- How does the system behave on a network segment with multicast filtering or mDNS blocking? Device discovery will fail for blocked services; the system should indicate that discovery may be incomplete and suggest a network-level check.
- What if a device supports only some configuration options (e.g., no encoding change)? The system must gracefully report unsupported operations rather than silently failing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST discover all Dante-enabled devices on the local network without requiring manual IP address configuration.
- **FR-002**: The system MUST display each discovered device's name, IPv4 address, model identifier, and sample rate.
- **FR-003**: The system MUST display the number of transmit channels and receive channels for each discovered device.
- **FR-004**: The system MUST list all active audio subscription routes, showing for each entry: receive device name, receive channel name, transmit device name, transmit channel name, and connection status.
- **FR-005**: The system MUST identify and display the connection status of each subscription as one of: connected (unicast), unresolved, or subscribed to own signal.
- **FR-006**: The system MUST allow an operator to create a new audio subscription by specifying a transmit device, transmit channel, receive device, and receive channel.
- **FR-007**: The system MUST allow an operator to remove an existing subscription from a receive channel by specifying the receive device and receive channel.
- **FR-008**: The system MUST display and allow updating the sample rate for any discovered device that supports sample rate changes. Supported values are 44100, 48000, 88200, 96000, 176400, and 192000 Hz.
- **FR-009**: The system MUST display and allow updating the audio encoding bit depth for any discovered device. Supported values are 16, 24, and 32 bit.
- **FR-010**: The system MUST display and allow updating the network latency for any discovered device, expressed in milliseconds.
- **FR-011**: The system MUST allow renaming a device and resetting a device name to its factory default.
- **FR-012**: The system MUST allow renaming an individual transmit or receive channel on a device, and resetting a channel name to its factory default.
- **FR-013**: The system MUST display and allow setting the analog gain level on AVIO input channels from the supported input gain values.
- **FR-014**: The system MUST display and allow setting the analog gain level on AVIO output channels from the supported output gain values.
- **FR-015**: The system MUST produce structured output (e.g., JSON) for all device, channel, and subscription queries to support downstream integration and automation.
- **FR-016**: The system MUST handle network discovery failures gracefully, reporting when no devices are found rather than returning an error.

### Key Entities

- **Dante Device**: A networked audio endpoint that participates in the Dante protocol. Key properties: device name, IP address, MAC address, model identifier, sample rate, encoding bit depth, network latency, and list of transmit and receive channels.
- **Transmit Channel**: A named audio output channel on a Dante device. Key properties: channel number, channel name, device association.
- **Receive Channel**: A named audio input channel on a Dante device that can subscribe to a transmit channel from any device on the network. Key properties: channel number, channel name, device association, current subscription status.
- **Subscription**: An audio routing link from a transmit channel to a receive channel, potentially across different devices. Key properties: transmit device name, transmit channel name, receive device name, receive channel name, connection status.
- **AVIO Device**: A subtype of Dante Device that includes physical analog I/O interfaces. Additional properties: per-channel gain level for inputs and outputs.
- **Gain Level**: A dBu or dBV rating applied to an AVIO analog channel. Inputs support: +24 dBu, +4 dBu, 0 dBu, 0 dBV, −10 dBV. Outputs support: +18 dBu, +4 dBu, 0 dBu, 0 dBV, −10 dBV.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All Dante devices active on the local network are discovered and listed within 10 seconds of initiating a scan on a network with up to 50 devices.
- **SC-002**: An operator can view the complete routing subscription map for the entire network in a single query without needing to inspect each device individually.
- **SC-003**: An operator can add or remove an audio subscription in under 30 seconds from identifying the source and destination channels.
- **SC-004**: All read operations (device list, channel list, subscription list) return results in under 5 seconds on a local network segment under normal load.
- **SC-005**: Device configuration changes (sample rate, encoding, latency) are confirmed and reflected in a subsequent query without requiring a manual page refresh or service restart.
- **SC-006**: Device and channel rename operations complete and are discoverable on the next network scan without additional manual steps.

## Assumptions

- The AV monitoring application and the Dante devices are on the same local network segment where mDNS traffic is not blocked.
- The `netaudio` open-source Python library will be used as the underlying transport mechanism for all Dante protocol communications during the implementation phase.
- The system does not need to manage Dante presets, clocking configurations, or multicast flow creation beyond what the `netaudio` library already supports.
- AVIO gain control will only be exposed for devices that identify as AVIO hardware via their model identifier; non-AVIO Dante endpoints do not receive gain controls.
- Device lock and metering capabilities are in scope for monitoring (read operations) but active triggering or configuration of metering streams is deferred to a future iteration.
- All Dante devices are assumed to use Dante protocol version compatible with the `netaudio` library, which was reverse-engineered from observed Dante Controller network traffic.
- Structured JSON output is the assumed integration format for downstream dashboard tools or other modules within the AV monitoring application.
