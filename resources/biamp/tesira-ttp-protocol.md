# Biamp Tesira Text Protocol (TTP) — Module Reference

**Source**: https://tesira-help.biamp.com/index.htm#t=System_Control%2FTesira_Text_Protocol%2FOverview.htm  
**Tesira firmware version covered**: v5.3 and earlier  
**Purpose**: Reference document for building the AV Monitoring Biamp Tesira module  
**Protocol confirmed for registry entry**: Telnet (primary), SSH (secure), RS-232 (serial)

---

## 1. Protocol Overview

Tesira devices are controlled via the **Tesira Text Protocol (TTP)** — an ASCII-based, text-line protocol. Commands are sent as plain text strings terminated by a line feed (`\n` or `\r\n`). Responses are returned as ASCII text.

Supported connection methods:

| Method   | Transport     | Port | Encrypted | Max Sessions | Notes |
|----------|---------------|------|-----------|--------------|-------|
| Telnet   | TCP/IP        | 23   | No        | 32           | Option negotiation required before first command |
| SSH      | TCP/IP        | 22   | Yes       | 80 (soft cap at 64) | Requires username/password |
| RS-232   | Serial        | n/a  | No        | 1 per port   | No auth in unprotected systems |

> **Module recommendation**: Use **SSH** for all production monitoring to ensure encrypted credential handling. Fall back to Telnet only on devices where SSH is explicitly disabled.

---

## 2. Connection Details

### 2.1 Telnet (Port 23)

Tesira implements a Telnet server per RFC 854/855. Before TTP commands can be sent, the client **must** complete a Telnet option negotiation handshake.

**Minimum viable negotiation (raw TCP client)**:

For every option negotiation packet received from the server, the client **must reject all options**:

| Server sends  | IAC (`0xFF`) | WILL (`0xFB`)  | `<byte X>` |
|---------------|--------------|----------------|------------|
| Client replies | IAC (`0xFF`) | DON'T (`0xFE`) | `<byte X>` |

| Server sends  | IAC (`0xFF`) | DO (`0xFD`)   | `<byte X>` |
|---------------|--------------|---------------|------------|
| Client replies | IAC (`0xFF`) | WON'T (`0xFC`) | `<byte X>` |

Once all options are negotiated the server sends:

```
0x0D 0x0A Welcome to the Tesira Text Protocol Server 0x0D 0x0A
```

The session is now ready to accept TTP commands.

**Line endings**: Server responses end with `CR LF` (`0x0D 0x0A`) or `CR NUL` (`0x0D 0x00`). The client must read one byte after every `0x0D` to discard the trailing byte.

**Example option negotiation sequence (client rejecting all)**:

| Source        | IAC  | Cmd  | Option | Description              |
|---------------|------|------|--------|--------------------------|
| Tesira Server | 0xFF | 0xFD | 0x18   | Do Terminal Type         |
| Client        | 0xFF | 0xFC | 0x18   | Won't Terminal Type      |
| Tesira Server | 0xFF | 0xFD | 0x20   | Do Terminal Speed        |
| Client        | 0xFF | 0xFC | 0x20   | Won't Terminal Speed     |
| Tesira Server | 0xFF | 0xFB | 0x03   | Will Suppress Go Ahead   |
| Client        | 0xFF | 0xFE | 0x03   | Don't Suppress Go Ahead  |
| Tesira Server | 0xFF | 0xFD | 0x01   | Do Echo                  |
| Client        | 0xFF | 0xFC | 0x01   | Won't Echo               |
| ...           | ...  | ...  | ...    | (reject all remaining)   |
| Tesira Server | `0x0D 0x0A Welcome to the Tesira Text Protocol Server 0x0D 0x0A` |

### 2.2 SSH (Port 22)

- Requires case-sensitive **Username** and **Password**.
- **Unprotected system**: Username = `default`, Password = *(empty / not required)*.
- **Protected system**: Credentials configured in Tesira system must be provided.
- Access levels:
  - **Controller** (or above): full read/write access — required for any `set`, `increment`, `decrement`, `toggle`, or Service commands.
  - **Observer**: read-only (`get` and `subscribe` only).
- Soft connection limit: at 64 sessions new connections begin probabilistic failure; at 80 all further connections are refused.

### 2.3 RS-232 (Serial)

| Device          | Port      | Default Baud | Default Mode        |
|-----------------|-----------|--------------|---------------------|
| SERVER / SERVER IO | Serial 1 | 9600       | Command String      |
| SERVER / SERVER IO | Serial 2 | 115200     | TTP                 |
| TesiraFORTÉ     | RS-232    | 115200       | Both                |
| IDH-1 / OH-1    | RS-232    | 115200       | Both                |

**Pinout (DB9, straight-through PC cable)**:

| Pin | Signal |
|-----|--------|
| 2   | TxD (Transmit) |
| 3   | RxD (Receive) |
| 5   | Ground |
| All others | Not used |

- No authentication in unprotected systems.
- In protected systems: authenticate at each new session; `exit` command terminates session and requires re-auth at next connection.

---

## 3. TTP Command Syntax

All elements are **case sensitive** and delimited by a **single space**. Every command string must be terminated with a **Line Feed (`\n`)**.

### 3.1 Attribute Command

Used to read or modify attributes of DSP processing blocks.

```
Instance_Tag  Command  Attribute  [Index]  [Index]  [Value]  <LF>
```

| Field          | Required | Description |
|----------------|----------|-------------|
| `Instance_Tag` | Always   | Unique name of the DSP block. Case sensitive. Spaces allowed if in double quotes. Characters `/` and `&` are illegal. |
| `Command`      | Always   | See Command table below. |
| `Attribute`    | Always   | The specific DSP parameter to act on. See attribute tables for each block type. |
| `[Index]`      | Conditional | Channel, input, output, or row number. Some commands require 2 indexes (e.g., matrix: input row, output column). Base index is 1. Must be omitted if not required. |
| `[Value]`      | Conditional | New value for `set`/`increment`/`decrement`. Omitted for `get`/`toggle`. May be quoted if it contains spaces. |
| `<LF>`         | Always   | Line feed terminates the command. |

**Commands**:

| Command       | Description |
|---------------|-------------|
| `get`         | Read current value. Never requires `[Value]`. |
| `set`         | Write a specific value. Always requires `[Value]`. |
| `increment`   | Increase value by `[Value]` amount. Negative value decreases. |
| `decrement`   | Decrease value by `[Value]` amount. Negative value increases. |
| `toggle`      | Flip a Boolean attribute between true/false. |
| `subscribe`   | Register for push notifications when attribute changes. |
| `unsubscribe` | Cancel a previously registered subscription. |

**Value types**:

| Type    | Example          | Usage |
|---------|------------------|-------|
| Boolean | `true` / `false` | Mute, crosspoint on/off, enabled states |
| Float   | `1.0`, `-15.5`   | Level in dB, gain values |
| Integer | `1001`           | Preset IDs, channel indexes |
| String  | `"BUTTERWORTH"`  | Filter types, named parameters |
| null    | `null`           | Clear/unset a value |

**Examples**:

```
# Get level on channel 1 of a level block called Level1
Level1 get level 1
+OK "value":0.000000

# Set mute on channel 1 to true
Mixer1 set inputMute 1 true
+OK

# Toggle mute on channel 2
Level1 toggle mute 2
+OK

# Increment level by 3dB on channel 1
Level1 increment level 1 3
+OK

# Instance tag with spaces — must use double quotes
"my level 2" get level 1
+OK "value":-10.000000

# Get all available instance tags
SESSION get aliases
+OK "list":["AudioMeter1" "AudioMeter2" "DEVICE" "Input1" "Mixer1" "Level1" "Output1"]
```

### 3.2 Service Command

Used to send instructions to a DSP block or perform system-wide actions. Service commands do **not** use `get`/`set` etc. — they use their own verb.

```
Instance_Tag  Service  [Value]  <LF>
```

**Examples**:

```
# Recall preset 1001
DEVICE recallPreset 1001
+OK

# Save preset by name
DEVICE savePresetByName "Morning Conference"
+OK

# Start audio
DEVICE startAudio
+OK

# Reboot connected device
DEVICE reboot
```

---

## 4. Special Instance Tags

### 4.1 `DEVICE`

References the Tesira unit the current session is connected to. Always uppercase.

**DEVICE Services** (no `get`/`set` qualifier):

| Service                  | Value                           | Description |
|--------------------------|---------------------------------|-------------|
| `reboot`                 | —                               | Reboot the connected device (SSH/Telnet only) |
| `deleteConfigData`       | —                               | Factory-reset connected device |
| `rebootERD`              | `["hostname1", "hostname2"]`    | Reboot expander devices by hostname |
| `recallPreset`           | Integer (Preset ID)             | Recall a saved preset |
| `recallPresetShowFailures` | Integer (Preset ID)           | Recall preset; return which blocks failed |
| `recallPresetByName`     | String (preset name)            | Recall preset by name |
| `savePreset`             | Integer (Preset ID)             | Save current state as preset |
| `savePresetByName`       | String (preset name)            | Save current state as named preset |
| `sleep`                  | —                               | Put device to sleep |
| `wake`                   | —                               | Wake device |
| `startAudio`             | —                               | Start system audio processing |
| `stopAudio`              | —                               | Stop system audio processing |
| `startPartitionAudio`    | Integer (Partition ID)          | Start audio on one partition |
| `stopPartitionAudio`     | Integer (Partition ID)          | Stop audio on one partition |

**DEVICE Attributes** (use standard `get`/`set` commands):

| Attribute Code      | Command(s)              | Description / Return |
|---------------------|------------------------|----------------------|
| `deviceInfo`        | `get`                  | Returns: `deviceModel`, `deviceRevision`, `serialNumber`, `firmwareVersion`, `ipAddress` |
| `serialNumber`      | `get`                  | Device serial number string |
| `version`           | `get`                  | Firmware version string |
| `networkStatus`     | `get`                  | Full network status: hostname, interfaces, IP, MAC, DNS, mDNS, Telnet/SSH state |
| `ipConfig`          | `get` / `set`          | Get/set DHCP, IP, netmask, gateway per interface. Index: interface name (e.g., `control`) |
| `ipStatus`          | `get`                  | Current IP status for an interface. Index: interface name |
| `hostname`          | `get` / `set`          | Hostname (only settable in unconfigured state) |
| `activeFaultList`   | `get`                  | Returns list of active faults on the device |
| `dnsConfig`         | `get` / `set`          | DNS server configuration |
| `dnsStatus`         | `get`                  | Current DNS status |
| `networkPortInfo`   | `get`                  | Port names, link speed, packet statistics, LLDP info, port role |
| `telnetDisabled`    | `get` / `set`          | Enable/disable Telnet. Value: `true` (disabled) / `false` (enabled) |
| `sshDisabled`       | `get` / `set`          | Enable/disable SSH. Value: `true` (disabled) / `false` (enabled) |
| `mDNSEnabled`       | `get` / `set` / `toggle` | Enable/disable mDNS |
| `rstpEnabled`       | `get` / `set` / `toggle` | Enable/disable RSTP on device |
| `poeEnabled`        | `get` / `set`          | PoE per port. Index: port name (e.g., `"P2"`) |
| `poeInfo`           | `get`                  | PoE status information |
| `ptpInfo`           | `get`                  | PTP/gPTP timing information |
| `msrpInfo`          | `get`                  | MSRP stream reservation information |
| `danteInfo`         | `get`                  | Dante audio network configuration and status |
| `discoveredServers` | `get`                  | List of Tesira servers discovered on the network |
| `blockInfo`         | `get`                  | Block introspection — returns channel counts, capabilities |
| `avbPDelayThreshold`| `get` / `set` / `increment` / `decrement` | AVB peer delay threshold (0–2,147,483,647) |

**Examples**:

```
# Get device information (model, serial, firmware, IP)
DEVICE get deviceInfo
+OK "value":{"deviceModel":"TesiraFORTE_CI" "deviceRevision":"B" "serialNumber":"12345678" "firmwareVersion":"3.14.0.2" "ipAddress":"192.168.1.50"}

# Get network status
DEVICE get networkStatus
+OK "value":{"schemaVersion":2 "hostname":"TesiraServer91" ...}

# Get serial number
DEVICE get serialNumber
+OK "value":"01842224"

# Set device to use DHCP
DEVICE set ipConfig control {"autoIPEnabled":true}
+OK

# Get active faults
DEVICE get activeFaultList
+OK "value":[]

# Disable Telnet
DEVICE set telnetDisabled true
+OK
```

### 4.2 `SESSION`

References the current active control session (Telnet, SSH, or RS-232).

**Key SESSION attributes**:

| Attribute  | Command(s)          | Description |
|------------|---------------------|-------------|
| `verbose`  | `get` / `set`       | `true` = responses include field names; `false` = compact values only. Default: `true`. |
| `aliases`  | `get`               | Returns list of all valid Instance Tags in the current system design. |

**Examples**:

```
# Switch to non-verbose mode (compact responses)
SESSION set verbose false
+OK

# Get all instance tags
SESSION get aliases
+OK "list":["AudioMeter1" "DEVICE" "Input1" "Mixer1" "Level1" "Output1"]
```

---

## 5. Responses

All responses are ASCII text. Two response modes are available, controlled by `SESSION set verbose true/false`.

### 5.1 Successful Responses

**Verbose (default)**:
```
+OK "fieldName":"value"
```

**Non-verbose**:
```
+OK "value"
```

### 5.2 Error Responses

All errors start with `-ERR` followed by an error description and, where applicable, the character offset in the command where parsing failed.

| Response Example | Cause | Fix |
|-----------------|-------|-----|
| `+OK` | Command executed successfully | — |
| `-ERR address not found: {...}` | Instance tag does not exist or is misspelled | Check capitalisation; use `SESSION get aliases` to list valid tags |
| `-ERR Parse error at N: verb was not one of the commands supported by Services` | Command verb is wrong (e.g., capitalised) | Fix case — all commands are lowercase |
| `-ERR Parse error at N: not enough parameters supplied` | Missing `[Value]` or `[Index]` | Add required parameters |
| `-ERR INVALID_PARAMETER Index out of range: channelIndex min:X max:Y received:Z` | Index exceeds block channel count | Use an index within the reported range |
| `-ERR WRONG_STATE` | Command is not valid given current device state (e.g., VoIP not connected) | Check device/call state |
| `-CANNOT_DELIVER` | Multi-server system: target DSP block is on a different server with a communication issue | Check inter-server Ethernet |
| `-GENERAL_FAILURE` | Catch-all error. Often: Instance Tag exists in controller but not in current Tesira design file | Verify Instance Tag is in the deployed design |

### 5.3 Subscription Push Responses

Subscription updates arrive unsolicited and always begin with `!`:

**Verbose**:
```
! "publishToken":"MyLevelName" "value":-35.299999
```

**Non-verbose**:
```
! "myLevelName" -35.299999
```

The module MUST distinguish `!` responses from `+OK`/`-ERR` responses so they can be routed to the subscription dispatcher rather than a pending command's response handler.

---

## 6. Subscriptions

Subscriptions allow the device to push attribute value changes to the client without polling.

### 6.1 Subscribe

```
Instance_Tag  subscribe  Attribute  [Index]  [CustomLabel]  [IntervalMs]  <LF>
```

| Field          | Required | Description |
|----------------|----------|-------------|
| `[CustomLabel]` | Recommended | Unique identifier returned in push notifications. Allows parsing without knowing the Instance Tag. |
| `[IntervalMs]` | Optional | Minimum time (ms) between successive push updates. Updates still only fire on value change. |

**Example** — subscribe to level changes on channel 1, 500 ms throttle:
```
Level1 subscribe level 1 MyLevelMonitor 500
! "publishToken":"MyLevelMonitor" "value":-100.000000 +OK
```

Subsequent pushes (as value changes):
```
! "publishToken":"MyLevelMonitor" "value":-77.800003
```

> **Important**: Subscriptions are lost when the device reboots or a new configuration is sent. The module must re-subscribe after reconnecting, using the same `[CustomLabel]` to avoid duplicate subscriptions.

### 6.2 Unsubscribe

```
Instance_Tag  unsubscribe  Attribute  [Index]  [CustomLabel]  <LF>
```

Must use the same Index and CustomLabel as the original subscribe command.

```
Level1 unsubscribe level 1 MyLevelMonitor
+OK
```

---

## 7. Multi-Device Systems

- In a Tesira Multi-Frame (TMF) file, all devices share one address space. Commands that reference blocks on other servers are automatically proxied by the connected server.
- System-wide commands (e.g., `startAudio`, `recallPreset`) are forwarded to all devices automatically.
- Block commands (e.g., `set`, `get` on a DSP block) are routed to whichever server hosts that block.
- For systems where Tesira devices are **not** part of the same TMF file, each server requires its own separate session.

---

## 8. Security

| Scenario | Telnet | SSH | RS-232 |
|----------|--------|-----|--------|
| Unprotected system | No auth — session starts immediately after Telnet negotiation | Username: `default`, Password: (empty) | No auth required |
| Protected system | Username/password prompt after Telnet negotiation | Configured credentials (case sensitive) | Login prompt when LF is sent; persists until `exit` |
| Access level: Controller | Full read/write | Full read/write | Full read/write |
| Access level: Observer | Read only (`get`, `subscribe`) | Read only | Read only |

Default credentials on unprotected systems:
- **Username**: `default`
- **Password**: `default` (or empty depending on firmware)

---

## 9. Module Implementation Notes

### Connection Sequence (SSH — recommended)

1. Open TCP connection to device IP on port 22.
2. Perform SSH handshake; authenticate with username/password (stored in OS keychain — never hardcoded).
3. On login prompt, send credentials.
4. Begin TTP exchange.
5. On session start, optionally send `SESSION set verbose true` (default) to ensure predictable response parsing.
6. Query `DEVICE get deviceInfo` to confirm connectivity and capture model/firmware/serial for health record.
7. Poll `DEVICE get activeFaultList` and `DEVICE get networkStatus` on each monitoring cycle.

### Connection Sequence (Telnet — fallback)

1. Open TCP connection to device IP on port 23.
2. During Telnet option negotiation: for every IAC WILL/DO packet, respond with IAC DON'T/WON'T with same option byte.
3. Wait for `Welcome to the Tesira Text Protocol Server` banner.
4. Send credentials if prompted (protected system).
5. Continue with steps 5–7 above.

### Reconnect & Subscription Recovery

- On disconnect, attempt reconnect with exponential back-off.
- Re-subscribe all previously active subscriptions on reconnect (using original Custom Labels).
- Log disconnect and reconnect events with timestamp.

### Health Status Mapping

| Condition | LED State |
|-----------|-----------|
| Session connected + `activeFaultList` returns empty list | GREEN |
| Session connected + `activeFaultList` contains one or more entries | AMBER |
| Session cannot be established after N retries (configurable, default 3) | RED |
| Session connected but `deviceInfo` query times out | AMBER |

### Supported Actions (module-defined)

| Action | TTP Command | Notes |
|--------|-------------|-------|
| Reboot | `DEVICE reboot` | Requires Controller-level credentials; SSH/Telnet only |
| Recall Preset | `DEVICE recallPreset <id>` | Requires preset ID to be known |
| Start Audio | `DEVICE startAudio` | System-wide |
| Stop Audio  | `DEVICE stopAudio`  | System-wide |
| Get Fault List | `DEVICE get activeFaultList` | Used for health polling |
| Get Device Info | `DEVICE get deviceInfo` | Used at connect and for health record |

---

## 10. Reference Links

- TTP Overview: https://tesira-help.biamp.com/System_Control/Tesira_Text_Protocol/Overview.htm
- TTP Syntax: https://tesira-help.biamp.com/System_Control/Tesira_Text_Protocol/Syntax.htm
- Telnet: https://tesira-help.biamp.com/System_Control/Tesira_Text_Protocol/Telnet.htm
- SSH: https://tesira-help.biamp.com/System_Control/Tesira_Text_Protocol/SSH.htm
- RS-232: https://tesira-help.biamp.com/System_Control/Tesira_Text_Protocol/RS-232.htm
- Responses: https://tesira-help.biamp.com/System_Control/Tesira_Text_Protocol/REsponses.htm
- Subscriptions: https://tesira-help.biamp.com/System_Control/Tesira_Text_Protocol/Subscriptions.htm
- Device Attributes & Services: https://tesira-help.biamp.com/System_Control/Tesira_Text_Protocol/Attribute_tables/Service_Addresses/Device.html
- TTP Security: https://tesira-help.biamp.com/System_Control/Tesira_Text_Protocol/TTP_Security.htm
- Attribute Tables (all blocks): https://tesira-help.biamp.com/System_Control/Tesira_Text_Protocol/Attribute_tables/Interface_tables.htm
- TTP Command String Calculator: https://support.biamp.com/Tesira/Control/Tesira_command_string_calculator
