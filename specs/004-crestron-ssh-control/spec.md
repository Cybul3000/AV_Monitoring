# Feature Specification: Crestron Series 3 and 4 SSH Connection and Control

**Feature Branch**: `004-crestron-ssh-control`  
**Created**: 2026-03-22  
**Status**: Draft  
**Input**: User description: "Add SSH connection and control for Crestron Series 3 and 4 devices"

## Clarifications

### Session 2026-03-22

- Q: How is the SSH session lifecycle managed — per-command, per-operator session, or always-on background connection? → A: The user opens an interactive workspace via a dedicated button; SSH commands are invoked within that workspace. The session is established when the workspace opens and remains active for the duration of the workspace, closed when the workspace is closed (or via `BYE`).
- Q: How does the operator invoke commands in the workspace — pre-built buttons, free-text terminal, or hybrid? → A: Hybrid — the workspace provides a dedicated button or control for each of the 9 supported commands, plus a free-text input field for issuing any additional commands not covered by the pre-built controls.
- Q: Should destructive commands require a confirmation prompt before executing? → A: Yes — `REBOOT`, `FORCEDREBOOT`, and `PROGRESet` must require a confirmation prompt before executing. Read-only commands execute immediately without confirmation.
- Q: How does the operator specify the program slot number for `PROGRESet`? → A: The operator enters the slot number at click-time, inside the confirmation prompt. There is no pre-configuration of slot number per device.
- Q: Who is permitted to open the SSH workspace? → A: Any authenticated user of the AV monitoring app can open the SSH workspace for any device. No role restriction is applied.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Establish SSH Connection to a Crestron Device (Priority: P1)

An AV technician or system operator needs to connect to a Crestron Series 3 or Series 4 control processor over the network using SSH, authenticate with the standard `admin` account, and receive a working console session ready to accept commands.

**Why this priority**: Without an established connection, no subsequent commands can be issued. A reliable SSH connection is the foundation of every other operation in this feature.

**Independent Test**: Can be fully tested by clicking the workspace button for a configured device, confirming an SSH session is established, and receiving an interactive console prompt ready for commands. Delivers value as a standalone capability.

**Acceptance Scenarios**:

1. **Given** a Crestron device is configured with a known IP address, **When** any authenticated user of the AV monitoring app opens the SSH workspace for that device, **Then** an SSH session is established using `ssh admin@<IPAddress>` and the device prompt is returned in the workspace.
2. **Given** the workspace is open and active, **When** the operator closes the workspace, **Then** the SSH session is terminated cleanly.
3. **Given** an incorrect password is provided, **When** the operator attempts to open the workspace, **Then** authentication is rejected and a clear error is shown.
4. **Given** the device IP address is unreachable or the SSH port is blocked, **When** the operator attempts to open the workspace, **Then** a timeout or connection refused error is reported without hanging indefinitely.

---

### User Story 2 - Read Device Status and System Information (Priority: P2)

An AV technician needs to query the current state of a Crestron device — including its software version, IP configuration, network table, error log, and system readiness — to diagnose issues and confirm the device is operating correctly.

**Why this priority**: Read-only status queries are the most common daily use case. They carry no risk of service disruption and provide immediate diagnostic value on top of the SSH connection.

**Independent Test**: Can be tested independently by connecting to a device and invoking each status command via its dedicated button, verifying that output is returned and displayed in the workspace.

**Acceptance Scenarios**:

1. **Given** an active SSH session, **When** `INFO` is issued, **Then** the device returns its software version, program information, and hardware capabilities.
2. **Given** an active SSH session, **When** `IPCONFIG` is issued, **Then** the device returns its current IP address, subnet mask, default gateway, hostname, and DHCP/static mode.
3. **Given** an active SSH session, **When** `IPTable` is issued, **Then** the device returns its IP table showing connected devices and their addresses.
4. **Given** an active SSH session, **When** `ERRlog` is issued, **Then** the device returns its current error log entries, including timestamps and error descriptions.
5. **Given** an active SSH session, **When** `SYSTEMREADY` is issued, **Then** the device reports whether the control system has fully booted and all loaded programs are running.

---

### User Story 3 - Restart a Running Program (Priority: P3)

An AV technician needs to restart a specific program running on a Crestron control processor — for example, program slot 1 — without rebooting the entire device, to recover from a software fault or apply a settings change.

**Why this priority**: Program restarts are the most targeted recovery action available, less disruptive than a full device reboot. They are frequently used during commissioning and troubleshooting.

**Independent Test**: Can be tested independently by clicking the `PROGRESet` button, entering slot 1 in the confirmation prompt, confirming, and verifying the program restarts.

**Acceptance Scenarios**:

1. **Given** an active SSH session, **When** the operator clicks the `PROGRESet` button, **Then** a confirmation prompt is shown containing a slot number input field.
2. **Given** the confirmation prompt is shown, **When** the operator enters a valid slot number and confirms, **Then** `PROGRESet -P:<n>` is sent and only the program in that slot restarts; other slots are unaffected.
3. **Given** the confirmation prompt is shown, **When** the operator cancels, **Then** no command is sent and the workspace remains active.
4. **Given** the operator enters a slot number with no program loaded, **When** the command is confirmed and sent, **Then** the device returns an error and the workspace displays it.
5. **Given** the operator leaves the slot number field empty, **When** they attempt to confirm, **Then** submission is blocked and a validation message is shown.

---

### User Story 4 - Reboot the Device (Priority: P4)

An AV technician needs to initiate a reboot of the Crestron control processor — either as a graceful restart or as a forced immediate reboot when the system is unresponsive — to recover from a hardware or software fault.

**Why this priority**: Device reboots are a necessary recovery mechanism but more disruptive than a program restart. Two commands cover different scenarios: graceful reboot for planned restarts and forced reboot for emergency recovery.

**Independent Test**: Can be tested independently by issuing `REBOOT` or `FORCEDREBOOT` during an active session and confirming the device becomes temporarily unreachable before coming back online.

**Acceptance Scenarios**:

1. **Given** an active SSH session, **When** the operator clicks the `REBOOT` button, **Then** a confirmation prompt is shown before the command is sent.
2. **Given** the confirmation prompt is shown, **When** the operator confirms, **Then** `REBOOT` is sent, the device initiates a graceful shutdown and restart sequence, and the SSH session ends.
3. **Given** an active SSH session, **When** the operator clicks the `FORCEDREBOOT` button, **Then** a confirmation prompt is shown before the command is sent.
4. **Given** the confirmation prompt is shown, **When** the operator confirms, **Then** `FORCEDREBOOT` is sent, the device restarts immediately, and the SSH session ends.
5. **Given** a confirmation prompt is shown for either reboot command, **When** the operator cancels, **Then** no command is sent and the workspace remains active.
6. **Given** either reboot command is issued, **When** the device has restarted, **Then** a new SSH session can be established once the device is online again.

---

### User Story 5 - Close the Console Session (Priority: P5)

An AV technician needs to properly close the SSH console session when finished, freeing up the connection and ensuring the device is not left in an open, unattended state. The correct disconnect command differs by device type: Crestron Series 3/4 console devices (e.g. CP4) use `BYE`, while Linux-based devices (e.g. VC4) use `exit`.

**Why this priority**: Clean session termination is a hygiene and security concern. Crestron devices may have a limited number of concurrent SSH sessions; leaving sessions open can block access for other operators.

**Independent Test**: Can be tested independently by clicking the disconnect control and confirming the session closes cleanly on both a CP4 and a VC4 device.

**Acceptance Scenarios**:

1. **Given** an active SSH session to a CP4 or Series 3/4 device, **When** the operator closes the session, **Then** `BYE` is sent and the SSH connection terminates cleanly.
2. **Given** an active SSH session to a VC4 device, **When** the operator closes the session, **Then** `exit` is sent and the SSH connection terminates cleanly.
3. **Given** a session is closed, **When** a new connection is made immediately after, **Then** the new session is accepted without issue.

---

### Edge Cases

- What happens if the SSH session is dropped mid-command (e.g., network interruption)? The system must detect the disconnection and report it rather than waiting indefinitely for a response.
- What if `FORCEDREBOOT` is issued but the device does not come back online? The system should report that the device is unreachable after a reasonable timeout and not assume the reboot completed successfully.
- What if `PROGRESet` is issued with a program slot number outside the supported range? The device should return an error, and the system should surface it to the operator.
- What if the `admin` account password has been changed from the factory default? Authentication will fail; the system must report an authentication error clearly and not retry automatically with the default password.
- What if `ERRlog` returns an empty log? The system should present an empty result cleanly rather than treating it as an error condition.
- What if multiple commands are queued and the device reboots mid-sequence (e.g., after `REBOOT`)? Subsequent commands should be abandoned and the operator notified that the session was lost due to a reboot.
- What if `SYSTEMREADY` returns a "not ready" state? The system should surface this clearly and allow the operator to re-query after a waiting period without automatically sending further commands.
- What if the console prompt does not match any known pattern? The system must still handle the session gracefully and not hang waiting for a prompt it will never recognise — a configurable or auto-detected prompt should be supported.
- What if a free-text command entered by the operator is not recognised by the device? The device's error response should be surfaced in the workspace verbatim; the system must not suppress or mask unknown-command errors.
- What if the operator dismisses the confirmation prompt for `REBOOT` or `FORCEDREBOOT`? The command must be silently cancelled with no state change; the workspace should remain fully active.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a dedicated button or entry point per configured Crestron device that opens an interactive SSH workspace.
- **FR-002**: When the SSH workspace is opened, the system MUST automatically establish an SSH connection to the configured device using `ssh admin@<IPAddress>` on the standard SSH port.
- **FR-003**: The SSH workspace MUST present a dedicated button or control for each of the 9 supported commands (`BYE`, `ERRlog`, `FORCEDREBOOT`, `INFO`, `IPCONFIG`, `IPTable`, `PROGRESet`, `REBOOT`, `SYSTEMREADY`), allowing the operator to invoke them with a single interaction.
- **FR-004**: The SSH workspace MUST include a free-text input field through which the operator can type and send any command not covered by the pre-built controls.
- **FR-005**: The system MUST authenticate using the `admin` account with a configurable password.
- **FR-006**: The system MUST report a clear error within the workspace if the SSH connection cannot be established (unreachable host, authentication failure, or connection timeout).
- **FR-007**: Within the workspace, the system MUST send the `INFO` command and return the device's software version, loaded program information, and hardware capabilities.
- **FR-008**: Within the workspace, the system MUST send the `IPCONFIG` command and return the device's IP address, subnet mask, default gateway, hostname, and DHCP/static configuration mode.
- **FR-009**: Within the workspace, the system MUST send the `IPTable` command and return the device's IP table, showing connected devices and their network addresses.
- **FR-010**: Within the workspace, the system MUST send the `ERRlog` command and return the full current error log from the device, including any available timestamps and error descriptions.
- **FR-011**: Within the workspace, the system MUST send the `SYSTEMREADY` command and return the system readiness status, indicating whether all programs are running and the control system is fully operational.
- **FR-012**: Within the workspace, the `PROGRESet` confirmation prompt MUST include a slot number input field. The system MUST send `PROGRESet -P:<n>` using the slot number entered by the operator, where `<n>` is a positive integer. Submission MUST be blocked if the slot number field is empty.
- **FR-013**: Within the workspace, the system MUST send the `REBOOT` command to initiate a graceful device reboot, and close the session upon completion.
- **FR-014**: Within the workspace, the system MUST send the `FORCEDREBOOT` command to initiate an immediate device reboot when a graceful restart is not possible, and close the session upon completion.
- **FR-015**: Within the workspace, the system MUST send the appropriate disconnect command to cleanly terminate the console session and close the SSH connection. The disconnect command is device-type-dependent: `BYE` for CP4 and other Series 3/4 Crestron console devices; `exit` for VC4 Linux-based devices.
- **FR-016**: The system MUST display the raw command output returned by the device within the workspace for all commands (whether invoked via button or free-text), so operators can read and interpret the results directly.
- **FR-017**: The system MUST terminate the SSH session and close the workspace cleanly when the operator closes the workspace.
- **FR-018**: The system MUST handle a session disconnection or lost connection gracefully, reporting the failure within the workspace without hanging.
- **FR-019**: The system MUST present a confirmation prompt before executing `REBOOT`, `FORCEDREBOOT`, or `PROGRESet`. If the operator cancels the prompt, the command MUST NOT be sent. Read-only commands (`INFO`, `IPCONFIG`, `IPTable`, `ERRlog`, `SYSTEMREADY`) and session commands (`BYE`) MUST execute immediately without a confirmation prompt.
- **FR-020**: The SSH workspace button and all commands within it MUST be accessible to any authenticated user of the AV monitoring app. No additional role or permission check is required beyond being logged in.

### Key Entities

- **Crestron Device**: A Series 3 or Series 4 Crestron control processor reachable via SSH. Key properties: IP address, device name/hostname, firmware version, program slots (typically 1–10), operational status.
- **SSH Session**: An authenticated interactive connection to a Crestron device's console, scoped to the lifetime of an open workspace. Key properties: target IP address, credential set (username/password), connection state (connected / disconnected / timed out), console prompt string (used to detect session readiness and command completion), disconnect command (device-type-dependent: `BYE` for CP4/Series 3-4 console devices, `exit` for VC4 Linux-based devices). The session is opened when the operator opens the workspace and closed when the workspace is closed or the disconnect command is issued. Known prompt examples: `CP4N>` (CP4 Series 4 processor), `[admin@<hostname> ~]$` (VC4 Linux-based devices such as `[admin@vc-4-pc-3-event-space ~]$`).
- **SSH Workspace**: The interactive panel or view opened by the operator via a dedicated button to connect to and issue commands on a specific Crestron device. Key properties: associated device (target IP), open/closed state, active SSH session reference. The workspace presents two interaction modes: (1) dedicated buttons for each of the 9 supported commands, and (2) a free-text input field for issuing any additional commands not covered by the pre-built controls.
- **Console Command**: A named instruction sent to the device during an active session. Key properties: command name, optional parameters (e.g., `-P:1`), access level (Operator or Programmer), expected response type (status output / confirmation / session termination).
- **Program Slot**: A numbered slot (starting at 1) on the control processor that holds a running control program. Key properties: slot number, program name, running state. The slot number is entered by the operator at the time of invoking `PROGRESet`; it is not pre-configured per device.
- **Error Log Entry**: A record returned by `ERRlog` describing a fault on the device. Key properties: timestamp, error code or description.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can establish an SSH session to a reachable Crestron device and receive a ready console prompt within 5 seconds of initiating the connection on a standard local network.
- **SC-002**: All nine supported commands (`BYE`, `ERRlog`, `FORCEDREBOOT`, `INFO`, `IPCONFIG`, `IPTable`, `PROGRESet`, `REBOOT`, `SYSTEMREADY`) can be issued and return a response or confirmation without manual intervention.
- **SC-003**: A program restart via `PROGRESet -P:1` completes and the device confirms the action within 10 seconds of the command being issued.
- **SC-004**: Connection failures (unreachable host, bad credentials, timeout) are reported to the operator within 10 seconds without the system hanging.
- **SC-005**: A session closed with `BYE` terminates cleanly, and a new session can be established to the same device immediately afterwards.

## Assumptions

- All target devices are Crestron Series 3 or Series 4 control processors with SSH enabled and accessible on the standard port (22).
- The `admin` account is used for all connections. The password is configurable and not assumed to be the factory default.
- Program slots are numbered starting at 1. The `PROGRESet` command uses the `-P:<n>` parameter to identify the target slot.
- `REBOOT` performs a graceful shutdown and restart; `FORCEDREBOOT` performs an immediate restart without graceful shutdown — the distinction is meaningful for devices that may be in an unresponsive state.
- `SYSTEMREADY` is a Programmer-level command; no elevated access beyond the `admin` account is assumed to be required in practice for Series 3/4 devices.
- The system does not need to parse or interpret the content of `ERRlog` output in this iteration — returning the raw text to the operator is sufficient.
- Console prompts and disconnect commands differ by device type. Currently known values: CP4 Series 4 — prompt `CP4N>`, disconnect `BYE`; VC4 Linux-based devices — prompt `[admin@<hostname> ~]$`, disconnect `exit`. Additional device-type mappings will be documented as more device types are onboarded.
- The SSH workspace is accessible to any authenticated user of the AV monitoring app. No role-based access control is applied to this feature. Access restriction beyond app authentication is out of scope.
- The SSH session is scoped to an operator-opened workspace: it is established automatically when the workspace opens and terminated when it closes. There is no background or always-on connection.
- Only one SSH workspace per device at a time is assumed for this feature. Concurrent session management is out of scope.
