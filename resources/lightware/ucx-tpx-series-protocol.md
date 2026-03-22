# Lightware UCX-TPX Series — Control Protocol Reference

**Document purpose**: Module implementation reference for Lightware Taurus UCX-TPX Series AV-over-IP extender/switchers.  
**Protocol confirmed for registry entry**: REST API over HTTP/HTTPS (primary), LW3 over TCP (secondary), WebSocket/WSS (event-driven)  
**Source**: [Lightware UCX-TPX Series User Manual v3 (2026-03-10)](https://assets.prod.pim.lightware.com/assets/File-Downloads/Guides-and-Manuals/User-Manual/HTML/UCX-TPX_series/UCX-TPX_series_UserManual.html)  
**Last reviewed**: 2026-03-22

---

## Table of Contents

1. [Device Overview](#1-device-overview)
2. [Connection Methods & Ports](#2-connection-methods--ports)
3. [Authentication](#3-authentication)
4. [REST API Reference](#4-rest-api-reference)
5. [LW3 Protocol Reference](#5-lw3-protocol-reference)
6. [WebSocket (WS/WSS) & Subscriptions](#6-websocket-wswss--subscriptions)
7. [Health & Status Properties](#7-health--status-properties)
8. [Device Control Actions](#8-device-control-actions)
9. [Module Implementation Notes](#9-module-implementation-notes)
10. [Reference Links](#10-reference-links)

---

## 1. Device Overview

Lightware Taurus UCX-TPX Series devices are AV-over-IP extenders for meeting room environments. They consist of transmitter (TX) and receiver (RX) units connected via TPX (twisted pair) cabling, combining video/USB/audio switching and extension with built-in control APIs.

### Supported Models

| Model | Role | USB-C In | HDMI In | Outputs | RS-232 | GPIO | OCS | Notes |
|-------|------|----------|---------|---------|--------|------|-----|-------|
| UCX-4x3-TPX-TX20 | TX | 2x | 2x | 3× HDMI | 2x | Yes | No | 5 inputs incl. TPX Welcome screen |
| UCX-2x1-TPX-TX20 | TX | 1x | 1x | 1× HDMI | 1x | Yes | No | 4 Ethernet ports; controls 2 RX ports |
| DCX-3x1-TPX-TX10 | TX | 1x (video only) | 2x | 1× HDMI | No | No | No | No RS-232, no GPIO |
| UCX-3x3-TPX-RX20 | RX | — | — | 3× HDMI | 2x | Yes | Yes | Standalone RX with OCS |
| HDMI-UCX-TPX-RX107 | RX | — | — | 1× HDMI | 1x | No | Yes | HDMI-only RX; powered by TX PoE |
| All -LCC variants | Same | Same | Same | Same | Same | Same | Same | FIPS 140-2 Level 1 validated (Lightware Crypto Core) |

> **Factory default IP**: DHCP. Static fallback: `192.168.0.100`, mask `255.255.255.0`, gateway `192.168.0.1`.  
> **TX controls RX**: The TX device exposes control APIs for both itself (`/V1/SYS/DEVICES/TX`) and its connected RX (`/V1/SYS/DEVICES/RX`).  
> **DCX-3x1-TPX-TX10**: Only one Ethernet port; no RS-232 port; no GPIO port.

---

## 2. Connection Methods & Ports

### Network Port Summary

| Port | Protocol | Service | Notes |
|------|----------|---------|-------|
| **80** | TCP (HTTP) | LW3 over WS, REST API, LARA panels, file transfer | Disabled by default from FW v1.19.0 (TX) / v1.8.0 (RX). Use HTTPS. |
| **443** | TCP (HTTPS) | LW3 over WSS, REST API, LARA management GUI | Recommended — encrypted. LARA management only available here. |
| **6107** | TCP | LW3 protocol (raw TCP) | Used by Lightware Device Controller (LDC). Can be disabled. |
| **8001** | TCP | Serial over IP — RS-232 P1 | Can be disabled. Up to 20 simultaneous connections per port. |
| **8002** | TCP | Serial over IP — RS-232 P2 | Can be disabled. |
| **8003** | TCP | Serial over IP — RS-232 P3 (RX unit only) | RX serial port exposed via TX. |
| **6970** | TCP | TCI protocol (TX ↔ BlueRiver Control Server) | Internal UCX-TPX API ↔ BlueRiver. |
| **8080** | TCP | Internal service | |
| **5353** | UDP | mDNS / Bonjour (device discovery) | Multicast 224.0.0.251 |
| **37421** | UDP | Remote IP discovery | Multicast 230.76.87.82 |

> **Security recommendation**: Disable port 80 and 6107. Use HTTPS (443) and WSS. Enable authentication. Disable Serial over IP ports (8001, 8002) if RS-232 control is not needed.

### Maximum Concurrent Clients

The device manages **18 connected clients simultaneously** across all WS (80), WSS (443), and LW3 (6107) ports combined.

### Connection Methods Matrix

| Method | Port | Protocol | Best For |
|--------|------|----------|---------|
| REST API (HTTP) | 80 | HTTP | Simple stateless control. Not recommended (unencrypted). |
| REST API (HTTPS) | 443 | HTTPS | Recommended for production. Encrypted. |
| LW3 Raw TCP | 6107 | TCP | Terminal-style control. Persistent session. |
| WebSocket (WS) | 80 | WS | Event-driven via LW3. Persistent. |
| WebSocket Secure (WSS) | 443 | WSS | Recommended event-driven. Encrypted. |

---

## 3. Authentication

### Credentials

| Field | Value | Notes |
|-------|-------|-------|
| Username | `admin` | Fixed. Cannot be changed. |
| Password | Set by admin | Default from FW v1.19.0 (TX) / v1.8.0 (RX): `Lightware10g`. Factory QR label shows initial password. |
| Auth type | HTTP Basic Auth | Applied per port (80 or 443 separately). Password is **not** encrypted over HTTP. |
| Factory default | `admin` / (QR code on device) | Default password is on the label sticker QR code. |

> **From FW v1.19.0 (UCX-TPX-TX) and v1.8.0 (UCX-3x3-TPX-RX20)**: HTTP is disabled by default after first factory reset; HTTPS + authentication are enabled. Default password: `Lightware10g`.

### Authentication Flow

1. Set password via LDC (Network tab) or REST API (`POST /api/V1/MANAGEMENT/NETWORK/SERVICES/HTTP/Password`).
2. Enable authentication on the chosen port (HTTP or HTTPS).
3. Restart HTTP(S) services to apply.

### Authentication in REST API (curl examples)

```bash
# Without auth
curl -X GET http://192.168.0.100/api/V1/MANAGEMENT/LABEL/DeviceLabel

# With basic auth
curl --user admin:mypassword -X GET https://192.168.0.100/api/V1/MANAGEMENT/LABEL/DeviceLabel

# HTTPS with self-signed cert (ignore cert validation in dev)
curl -k --user admin:mypassword -X GET https://192.168.0.100/api/V1/MANAGEMENT/UID/PACKAGE/Version

# HTTPS POST example
curl -k --user admin:mypassword -X POST -i https://192.168.0.100/api/V1/MEDIA/VIDEO/XP/switch --data I2:O1
```

### Authentication in LW3

Authentication is not natively enforced on raw TCP LW3 (port 6107). To secure communications, disable port 6107 and use WSS (443) instead.

---

## 4. REST API Reference

### General Rules

- All names and parameters are **case-insensitive**.
- Methods, nodes, properties are separated by `/`.
- Arguments and values in HTTP request **body** as `text/plain`.
- Supported methods: `GET`, `PUT`, `POST` (PUT and POST are equivalent for writes).
- No maximum request size or character length.
- URL format: `http(s)://<ip>/api/<NODEPATH>/<PropertyOrMethod>`
- LW3 path translation: `/V1/MEDIA/VIDEO/I2.SignalPresent` → REST: `<ip>/api/V1/MEDIA/VIDEO/I2/SignalPresent`
- **Serial message sending** is only available via REST API — not in LW3.

### Response Codes

| HTTP Code | Meaning |
|-----------|---------|
| 200 | OK — success |
| 401 | Unauthorized — auth required |
| 404 | Not Found — invalid node path or property name |
| 405 | Method Not Allowed — attempting to write a read-only property |
| 406 | Not Acceptable — LW3 property error (`pE`) or method error (`mE`) |
| 500 | Internal Server Error |

---

### 4.1 Device Management Commands

#### Get Device Label

```
GET http://<ip>/api/V1/MANAGEMENT/LABEL/DeviceLabel
→ body: UCXroom
```

#### Set Device Label

```
POST http://<ip>/api/V1/MANAGEMENT/LABEL/DeviceLabel
body: UCXroom
→ 200 OK, body: UCXroom
```
Max 49 ASCII characters. Longer names are truncated.

#### Get Firmware Package Version

```
GET http://<ip>/api/V1/MANAGEMENT/UID/PACKAGE/Version
→ body: 1.0.0b2
```

#### Reboot Device

```
POST http://<ip>/api/V1/SYS/DEVICES/<TX|RX>/restart
body: (empty, Content-Type: text/plain)
→ 200 OK
```

#### Restore Factory Defaults

```
POST http://<ip>/api/V1/SYS/DEVICES/<TX|RX>/factoryDefaults
body: (empty)
→ 200 OK
```
> Warning: Resets all config. Device reboots. LARA configurations are erased.

#### Identify Device (LEDs blink for 10 seconds)

```
POST http://<ip>/api/V1/MANAGEMENT/UI/identifyMe
body: (empty)
→ 200 OK
```

#### Control Lock (Front Panel Buttons)

```
POST http://<ip>/api/V1/MANAGEMENT/UI/ControlLock
body: <lock_status>
→ 200 OK
```

| Value | Meaning |
|-------|---------|
| `None` | All front panel buttons enabled |
| `locked` | Locked; can be unlocked by button combination |
| `force locked` | Locked; can only be unlocked via LDC or LW3/REST API |

#### Set Current Time (ISO 8601)

```
POST http://<ip>/api/V1/MANAGEMENT/DATETIME/setTime
body: 2026-03-22T14:00:00
→ 200 OK
```

#### Dark Mode Toggle

```
POST http://<ip>/api/V1/MANAGEMENT/UI/DARKMODE/Enable
body: true | false
→ 200 OK
```
> In dark mode all LEDs are off except the RJ45 connector LEDs.

#### Dark Mode Delay (seconds, 0 = immediate)

```
POST http://<ip>/api/V1/MANAGEMENT/UI/DARKMODE/Delay
body: <seconds>
→ 200 OK
```

---

### 4.2 Video Crosspoint Commands

#### Switch Video Input to Output

```
POST http://<ip>/api/V1/MEDIA/VIDEO/XP/switch
body: I2:O1
→ 200 OK
```
> Use `0` as input to disconnect output: `body: 0:O1`

> **Hardware limitation**: I1 and I3–I5* cannot be selected to any output simultaneously. The second switch will return HTTP 405.  
> *I3 (UCX-2x1-TPX-TX20), I4 (UCX-3x3-TPX-RX20, DCX-3x1-TPX-TX10), I5 (UCX-4x3-TPX-TX20)*

#### Switch Input to ALL Outputs

```
POST http://<ip>/api/V1/MEDIA/VIDEO/XP/switchAll
body: I1
→ 200 OK
```

#### Query Connected Source on Output

```
GET http://<ip>/api/V1/MEDIA/VIDEO/XP/O1/ConnectedSource
→ body: I5
```

#### Query Connected Destinations of Input

```
GET http://<ip>/api/V1/MEDIA/VIDEO/XP/I3/ConnectedDestinations
→ body: ["O1","O2"]
```

#### Query Input Switching Capability

```
GET http://<ip>/api/V1/MEDIA/VIDEO/XP/O2/SWITCHABLE/I1
→ body: OK | Busy | Locked
```

#### Query Video Signal Presence

```
GET http://<ip>/api/V1/MEDIA/VIDEO/<port>/SignalPresent
→ body: true | false
```

#### Lock/Unlock Video Port

```
POST http://<ip>/api/V1/MEDIA/VIDEO/XP/<port>/Lock
body: true | false
→ 200 OK
```

#### Mute/Unmute Video Port

```
POST http://<ip>/api/V1/MEDIA/VIDEO/XP/<port>/Mute
body: true | false
→ 200 OK
```

#### Set Video Autoselect Policy

```
POST http://<ip>/api/V1/MEDIA/VIDEO/AUTOSELECT/<out>/Policy
body: Off | Last Detect | First Detect
→ 200 OK
```

#### Include/Exclude Input in Autoselect

```
POST http://<ip>/api/V1/MEDIA/VIDEO/AUTOSELECT/<out>/<in>/Included
body: true | false
→ 200 OK
```

#### Set HDCP on Input (allowed version)

```
POST http://<ip>/api/V1/MEDIA/VIDEO/<in>/HDCP/AllowedHdcpVersion
body: HDCP 1.4 | HDCP 2.2 | Off
→ 200 OK
```
> HDCP 2.2 is limited to 2 input ports simultaneously.

#### Set Output Signal Type (HDMI / DVI)

```
POST http://<ip>/api/V1/MEDIA/VIDEO/<out>/OutputSignalType
body: Auto | DVI
→ 200 OK
```

#### Set Output 5V Mode

```
POST http://<ip>/api/V1/MEDIA/VIDEO/<out>/Output5VMode
body: On | Off | Auto
→ 200 OK
```

---

### 4.3 Audio Commands

#### Switch Audio Input to Output

```
POST http://<ip>/api/V1/MEDIA/AUDIO/XP/switch
body: I2:O4
→ 200 OK
```
> Audio input ports: I1–I4. Analog audio output ports: O2, O4.

#### Query Audio Connected Source

```
GET http://<ip>/api/V1/MEDIA/AUDIO/XP/O4/ConnectedSource
→ body: I2
```

#### Set Audio Autoselect Policy

```
POST http://<ip>/api/V1/MEDIA/AUDIO/AUTOSELECT/<audio_out>/Policy
body: Follow video | Off
→ 200 OK
```

#### Lock/Unlock Audio Port

```
POST http://<ip>/api/V1/MEDIA/AUDIO/XP/<audio_port>/Lock
body: true | false
→ 200 OK
```

#### Mute/Unmute Audio Port

```
POST http://<ip>/api/V1/MEDIA/AUDIO/XP/<audio_port>/Mute
body: true | false
→ 200 OK
```

#### Query Audio Signal Presence

```
GET http://<ip>/api/V1/MEDIA/AUDIO/<audio_port>/SignalPresent
→ body: true | false
```

#### Set Analog Audio Output Volume (dB)

```
POST http://<ip>/api/V1/MEDIA/AUDIO/<audio_out>/VolumedB
body: <level>    (e.g. -10)
→ 200 OK
```

#### Set Analog Audio Output Volume (Percent)

```
POST http://<ip>/api/V1/MEDIA/AUDIO/<audio_out>/VolumePercent
body: 50
→ 200 OK
```

#### Set Audio Balance

```
POST http://<ip>/api/V1/MEDIA/AUDIO/<audio_out>/Balance
body: <level>    (-100 to +100, 0 = center)
→ 200 OK
```

---

### 4.4 USB Commands

#### Switch USB Host

```
POST http://<ip>/api/V1/MEDIA/USB/XP/switch
body: U1:H1
→ 200 OK
```
> Use `0` to disconnect. Host values: U1–U4. Hub: H1.

#### Query USB Connected Source

```
GET http://<ip>/api/V1/MEDIA/USB/XP/H1/ConnectedSource
→ body: U4
```

#### Set USB Autoselect Policy

```
POST http://<ip>/api/V1/MEDIA/USB/AUTOSELECT/H1/Policy
body: Off | Last Detect | First Detect | Follow video
→ 200 OK
```

#### Lock USB Port

```
POST http://<ip>/api/V1/MEDIA/USB/XP/<usb_port>/Lock
body: true | false
→ 200 OK
```

#### Set USB-A 5V Power Mode

```
POST http://<ip>/api/V1/MEDIA/USB/H1/<device_id>/Power5VMode
body: Auto | Off
→ 200 OK
```
`<device_id>` = D1–D4 (downstream USB-A ports).

#### Set USB-C Power Reserved

```
POST http://<ip>/api/V1/MEDIA/USB/<usb-c_port>/POWER/Reserved
body: 15W | 30W | 60W | 100W
→ 200 OK
```

#### Set DP Alternate Mode Policy

```
POST http://<ip>/api/V1/MEDIA/USB/<usb-c_port>/DpAltModePolicy
body: Auto | Force C | Force D
→ 200 OK
```
> Force C = 4-lane video. Force D = 2-lane video (use when 4-lane not supported, from FW v1.8.0).

---

### 4.5 CEC Commands

#### Send CEC Command

```
POST http://<ip>/api/V1/MEDIA/VIDEO/<out>/CEC/send
body: <hex_command>
→ 200 OK, body: ACK | NACK | Timeout | Internal Error
```

| CEC Code | Function |
|----------|----------|
| `04` | Power on |
| `0D` | Power off |
| `36` | Standby |
| `821000` | Select input 1 |
| `822000` | Select input 2 |
| `823000` | Select input 3 |

#### Send Remote Control Click

```
POST http://<ip>/api/V1/MEDIA/VIDEO/<out>/CEC/sendUserControlClick
body: 6D | 6C
→ 200 OK, body: ACK
```
> `6D` = Power on, `6C` = Power off (Remote Control codes).

CEC response codes: `ACK` (HTTP 200), `NACK` (HTTP 444), `Timeout` (HTTP 408), `Internal Error` (HTTP 500).

---

### 4.6 EDID Management

> Not available on HDMI-UCX-TPX-RX107.

#### Query Emulated EDIDs

```
GET http://<ip>/api/V1/EDID/EdidStatus
→ body: ["F47:E1","F47:E2","F47:E3","F47:E4"]
```
> E1–E4 = emulated EDIDs per input. F1–F159 = factory; U1–U100 = user; D1–D3 = dynamic.

#### Emulate EDID to Input Port

```
POST http://<ip>/api/V1/EDID/switch
body: F49:E2
→ 200 OK
```

#### Emulate EDID to All Inputs

```
POST http://<ip>/api/V1/EDID/switchAll
body: F47
→ 200 OK
```

#### Copy EDID to User Memory

```
POST http://<ip>/api/V1/EDID/copy
body: F1:U2
→ 200 OK
```

#### Delete EDID from User Memory

```
POST http://<ip>/api/V1/EDID/delete
body: U2
→ 200 OK
```

#### Reset All Emulated EDIDs to Factory Default

```
POST http://<ip>/api/V1/EDID/reset
body: (empty)
→ 200 OK
```
> Default factory EDID: Factory #47 (Universal HDMI PCM).

---

### 4.7 Network Configuration

#### Set DHCP State

```
POST http://<ip>/api/V1/MANAGEMENT/NETWORK/DhcpEnabled
body: true | false
→ 200 OK

POST http://<ip>/api/V1/MANAGEMENT/NETWORK/applySettings
body: (empty)
→ 200 OK    ← Saves and reboots device
```

#### Set Static IP Address

```
POST http://<ip>/api/V1/MANAGEMENT/NETWORK/StaticIpAddress
body: 192.168.0.110
→ 200 OK

POST http://<ip>/api/V1/MANAGEMENT/NETWORK/applySettings
body: (empty)
→ 200 OK
```

#### Set Subnet Mask (Static)

```
POST http://<ip>/api/V1/MANAGEMENT/NETWORK/StaticNetworkMask
body: 255.255.255.0
→ 200 OK
```

#### Set Gateway (Static)

```
POST http://<ip>/api/V1/MANAGEMENT/NETWORK/StaticGatewayAddress
body: 192.168.0.1
→ 200 OK
```

#### Set Hostname

```
POST http://<ip>/api/V1/MANAGEMENT/NETWORK/HostName
body: room-switcher
→ 200 OK
```
> 1–64 characters. Letters, numbers, hyphen (not as last char).  
> Restart HTTP(S) services after change. New SSL certificate generated.

#### Enable/Disable Ethernet Port

```
POST http://<ip>/api/V1/MEDIA/ETHERNET/<ethernet_port>/Enabled
body: true | false
→ 200 OK
```
> `<ethernet_port>` = P1–P7 on UCX-4x3-TPX-TX20; P1–P6 on UCX-2x1-TPX-TX20.

#### Enable/Disable Network Service Port

```
POST http://<ip>/api/V1/MANAGEMENT/NETWORK/SERVICES/<port>/Enabled
body: true | false
```
`<port>` = `HTTP` | `HTTPS` | `LW3` | `SERIAL1` | `SERIAL2`

#### Set VLAN Preset

```
POST http://<ip>/api/V1/MEDIA/ETHERNET/VlanPreset
body: Transparent | Dedicated | SeparatedBYOD
→ 200 OK
```

#### Set VLAN ID on Port

```
POST http://<ip>/api/V1/MEDIA/ETHERNET/<port>/VlanMembership
body: <vlan_id>      (1000 = Management VLAN)
→ 200 OK
```

---

### 4.8 Serial Port (RS-232)

> Not available on DCX-3x1-TPX-TX10.

#### Set Baud Rate

```
POST http://<ip>/api/V1/MEDIA/SERIAL/P1/Baudrate
body: 9600 | 19200 | 38400 | 57600 | 115200
→ 200 OK
```

#### Set Stop Bits

```
POST http://<ip>/api/V1/MEDIA/SERIAL/P1/StopBits
body: 1 | 2
→ 200 OK
```

#### Set Parity

```
POST http://<ip>/api/V1/MEDIA/SERIAL/P1/Parity
body: None | Odd | Even
→ 200 OK
```

#### Enable/Disable Serial over IP

```
POST http://<ip>/api/V1/MEDIA/SERIAL/P1/SERIALOVERIP/Enabled
body: true | false
→ 200 OK
```

#### Send Serial Message (REST API only — not available in LW3)

```
POST http://<ip>/api/V1/MEDIA/SERIAL/P1/send
body: PWR0
→ 200 OK
```
> Any format accepted (text, binary, hex). Max 100 KB. Response from connected device accepted within 100 ms window (one-way — use Serial over IP if bidirectional is needed).

---

### 4.9 GPIO Port

> Not available on DCX-3x1-TPX-TX10 or HDMI-UCX-TPX-RX107.

#### Set GPIO Pin Direction

```
POST http://<ip>/api/V1/MEDIA/GPIO/P1/Direction
body: Input | Output
→ 200 OK
```

#### Set GPIO Output Level

```
POST http://<ip>/api/V1/MEDIA/GPIO/P1/Output
body: High | Low
→ 200 OK
```

#### Set GPIO Level for Specified Duration

```
POST http://<ip>/api/V1/MEDIA/GPIO/P1/interval
body: Low;1        (value;seconds, 1–120)
→ 200 OK
```

#### Toggle GPIO Output Level

```
POST http://<ip>/api/V1/MEDIA/GPIO/P1/toggle
body: (empty)
→ 200 OK
```

---

### 4.10 OCS (Occupancy Sensor) Port

> Available on UCX-3x3-TPX-RX20 and HDMI-UCX-TPX-RX107.  
> UCX-4x3-TPX-TX20 and UCX-2x1-TPX-TX20 can control the OCS of the HDMI-UCX-TPX-RX107.  
> Available from FW package v1.2.0b3.

#### Query OCS Input Level

```
GET http://<ip>/api/V1/MEDIA/OCS/P1/InputLevel
→ body: High | Low
```

#### Set OCS Sensor Type

```
POST http://<ip>/api/V1/MEDIA/OCS/P1/SensorType
body: Active high | Active low
→ 200 OK
```

#### Query OCS State

```
GET http://<ip>/api/V1/MEDIA/OCS/P1/State
→ body: Free | Occupied
```

---

### 4.11 Remote System Logging

```
POST http://<ip>/api/V1/MANAGEMENT/LOG/REMOTE/Enabled
body: true | false

POST http://<ip>/api/V1/MANAGEMENT/LOG/REMOTE/ServerAddress
body: 192.168.0.1

POST http://<ip>/api/V1/MANAGEMENT/LOG/REMOTE/Protocol
body: TCP | UDP | TLS

POST http://<ip>/api/V1/MANAGEMENT/LOG/REMOTE/LogFormat
body: RFC3164 | RFC5424

POST http://<ip>/api/V1/MANAGEMENT/LOG/REMOTE/PortNumber
body: 6514
```

---

## 5. LW3 Protocol Reference

### Overview

LW3 (Lightware Protocol #3) is an ASCII-based protocol organized as a tree of nodes, properties, and methods.

- **Port**: 6107 (TCP)
- **Termination**: Every command line must end with `\r\n` (Carriage Return + Line Feed)
- **Case sensitivity**: Case-sensitive
- **Max line length**: 800 bytes (command + path + parameters)
- **Max concurrent clients**: 18 (shared across WS/WSS/LW3 ports)

### Establishing LW3 Connection (Putty / terminal)

1. Connect device to LAN
2. Open terminal (e.g. Putty)
3. Enter device IP (default: DHCP)
4. Port: **6107**
5. Connection type: **Raw**

### WebSocket Path

```
ws://<ip>/lw3    (port 80)
wss://<ip>/lw3   (port 443, recommended)
```

### Command Types

| Command | Syntax | Description |
|---------|--------|-------------|
| GET | `GET /V1/MEDIA/VIDEO/I2.SignalPresent` | Read value of a property |
| GETALL | `GETALL /V1/MEDIA/UART` | Read all child nodes & properties of a node |
| SET | `SET /V1/MANAGEMENT/LABEL.DeviceLabel=name` | Write a read-write property |
| CALL | `CALL /V1/EDID:switchAll(F49)` | Invoke a method |
| OPEN | `OPEN /V1/MEDIA/VIDEO` | Subscribe to a node (receive CHG events) |
| CLOSE | `CLOSE /V1/MEDIA/VIDEO` | Unsubscribe from a node |
| MAN | `MAN /V1/MEDIA/VIDEO/O1.Pwr5vMode` | Get human-readable manual for a node/property |

### Response Prefixes

| Prefix | Meaning |
|--------|---------|
| `pr` | Read-only property response |
| `pw` | Read-write property response |
| `mO` | Method executed successfully |
| `mF` | Method execution failed |
| `mE` | Method error |
| `pE` | Property error |
| `n-` | Node |
| `ns` | Child node of a node |
| `pm` | Manual for a property |
| `mm` | Manual for a method |
| `nm` | Manual for a node |
| `CHG` | Change notification (from subscription) |

### Escaping Special Characters

Control characters must be escaped with `\` in property values and method parameters:  
`\ { } # % ( ) \r \n \t`

```
Original:  CALL /V1/MEDIA/UART/P1:sendMessage(Set(01))
Escaped:   CALL /V1/MEDIA/UART/P1:sendMessage(Set\(01\))
```

### Signatures

Attach a 4-digit hex signature to group request + response lines:

```
»1700#GET /V1/EDID.*
«{1700
«pr /V1/EDID.EdidStatus=F47:E1;F47:E2
«...
«}
```

---

### 5.1 Device Management

#### Get/Set Device Label

```
»GET /V1/MANAGEMENT/LABEL.DeviceLabel
«pw /V1/MANAGEMENT/LABEL.DeviceLabel=UCX_Conference_room1

»SET /V1/MANAGEMENT/LABEL.DeviceLabel=UCX_Conference_room1
«pw /V1/MANAGEMENT/LABEL.DeviceLabel=UCX_Conference_room1
```

#### Reboot Device

```
»CALL /V1/SYS/DEVICES/TX:restart()
«mO /V1/SYS/DEVICES/TX:restart=

»CALL /V1/SYS/DEVICES/RX:restart()
«mO /V1/SYS/DEVICES/RX:restart=
```

#### Restore Factory Defaults

```
»CALL /V1/SYS/DEVICES/TX:factoryDefaults()
«mO /V1/SYS/DEVICES/TX:factoryDefaults=
```

#### Get Firmware Version

```
»GET /V1/MANAGEMENT/UID/PACKAGE.Version
«pr /V1/MANAGEMENT/UID/PACKAGE.Version=1.0.0b2
```

#### Identify Device (LEDs blink 10s)

```
»CALL /V1/MANAGEMENT/UI:identifyMe()
«mO /V1/MANAGEMENT/UI:identifyMe=
```

#### Control Lock

```
»SET /V1/MANAGEMENT/UI.ControlLock=force locked
«pw /V1/MANAGEMENT/UI.ControlLock=force locked
```

#### Dark Mode

```
»SET /V1/MANAGEMENT/UI/DARKMODE.Enable=true
«pw /V1/MANAGEMENT/UI/DARKMODE.Enable=true

»SET /V1/MANAGEMENT/UI/DARKMODE.Delay=10
«pw /V1/MANAGEMENT/UI/DARKMODE.Delay=10
```

---

### 5.2 Video Crosspoint

#### Switch Input to Output

```
»CALL /V1/MEDIA/VIDEO/XP:switch(I2:O1)
«mO /V1/MEDIA/VIDEO/XP:switch=
```

#### Switch Input to All Outputs

```
»CALL /V1/MEDIA/VIDEO/XP:switchAll(I1)
«mO /V1/MEDIA/VIDEO/XP:switchAll=
```

#### Query Connected Source on Output

```
»GET /V1/MEDIA/VIDEO/XP/O3.ConnectedSource
«pw /V1/MEDIA/VIDEO/XP/O3.ConnectedSource=I2
```

#### Query Connected Destinations of Input

```
»GET /V1/MEDIA/VIDEO/XP/I3.ConnectedDestinations
«pr /V1/MEDIA/VIDEO/XP/I3.ConnectedDestinations=O1;O2
```

#### Query Signal Presence

```
»GET /V1/MEDIA/VIDEO/I1.SignalPresent
«pr /V1/MEDIA/VIDEO/I1.SignalPresent=false
```

#### Query Active Resolution

```
»GET /V1/MEDIA/VIDEO/I2.ActiveResolution
«pr /V1/MEDIA/VIDEO/I2.ActiveResolution=1920x1080p60.00Hz
```

#### Query Switching Capability

```
»GET /V1/MEDIA/VIDEO/XP/O2/SWITCHABLE.I1
«pr /V1/MEDIA/VIDEO/XP/O2/SWITCHABLE.I1=Busy
```

#### Lock/Mute Video Port

```
»SET /V1/MEDIA/VIDEO/XP/I1.Lock=true
«pw /V1/MEDIA/VIDEO/XP/I1.Lock=true

»SET /V1/MEDIA/VIDEO/XP/I1.Mute=true
«pw /V1/MEDIA/VIDEO/XP/I1.Mute=true
```

#### Set Video Autoselect Policy

```
»SET /V1/MEDIA/VIDEO/AUTOSELECT/O2.Policy=First Detect
«pw /V1/MEDIA/VIDEO/AUTOSELECT/O2.Policy=First Detect
```

#### Set Output 5V Mode

```
»SET /V1/MEDIA/VIDEO/O1.Output5VMode=On
«pw /V1/MEDIA/VIDEO/O1.Output5VMode=On
```

---

### 5.3 Audio Commands

#### Switch Audio Input to Output

```
»CALL /V1/MEDIA/AUDIO/XP:switch(I2:O3)
«mO /V1/MEDIA/AUDIO/XP:switch=
```

#### Query Audio Connected Source

```
»GET /V1/MEDIA/AUDIO/XP/O4.ConnectedSource
«pw /V1/MEDIA/AUDIO/XP/O4.ConnectedSource=I2
```

#### Query Audio Signal Presence

```
»GET /V1/MEDIA/AUDIO/I1.SignalPresent
«pr /V1/MEDIA/AUDIO/I1.SignalPresent=false
```

#### Lock/Mute Audio Port

```
»SET /V1/MEDIA/AUDIO/XP/I2.Lock=false
«pw /V1/MEDIA/AUDIO/XP/I2.Lock=false

»SET /V1/MEDIA/AUDIO/XP/I2.Mute=false
«pw /V1/MEDIA/AUDIO/XP/I2.Mute=false
```

#### Set Volume (dB)

```
»SET /V1/MEDIA/AUDIO/O4.VolumedB=-10
«pw /V1/MEDIA/AUDIO/O4.VolumedB=-10
```

#### Adjust Balance

```
»CALL /V1/MEDIA/AUDIO/O4:stepBalance(-5)
«mO /V1/MEDIA/AUDIO/O4:stepBalance=
```

---

### 5.4 USB Commands

#### Switch USB Host

```
»CALL /V1/MEDIA/USB/XP:switch(U1:H1)
«mO /V1/MEDIA/USB/XP:switch=
```

#### Query USB Connected Source

```
»GET /V1/MEDIA/USB/XP/H1.ConnectedSource
«pw /V1/MEDIA/USB/XP/H1.ConnectedSource=U4
```

#### Lock USB Port

```
»SET /V1/MEDIA/USB/XP/U2.Lock=false
«pw /V1/MEDIA/USB/XP/U2.Lock=false
```

#### Set USB Autoselect Policy

```
»SET /V1/MEDIA/USB/AUTOSELECT/H1.Policy=Follow video
«pw /V1/MEDIA/USB/AUTOSELECT/H1.Policy=Follow video
```

#### Set USB-C Power

```
»SET /V1/MEDIA/USB/U1/POWER.Reserved=30 W
«pw /V1/MEDIA/USB/U1/POWER.Reserved=30 W
```

#### Set DP Alternate Mode Policy

```
»SET /V1/MEDIA/USB/U2.DpAltModePolicy=Auto
«pw /V1/MEDIA/USB/U2.DpAltModePolicy=Auto
```

---

### 5.5 CEC Commands

#### Send CEC Command

```
»CALL /V1/MEDIA/VIDEO/O2/CEC:send(446D)
«mO /V1/MEDIA/VIDEO/O2/CEC:send=OK
```

| LW3 Code | Function |
|----------|----------|
| `446D` | Power on |
| `446C` | Power off |
| `36` | Standby |
| `446901` | Select input 1 |
| `446902` | Select input 2 |
| `446903` | Select input 3 |

#### Remote Control Click

```
»CALL /V1/MEDIA/VIDEO/O1/CEC:sendUserControlClick(6D)
```

---

### 5.6 EDID Management

#### Query Emulated EDIDs

```
»GET /V1/EDID.EdidStatus
«pr /V1/EDID.EdidStatus=F89:E1;D1:E2;D1:E3;D1:E4
```

#### Emulate EDID to Input Port

```
»CALL /V1/EDID:switch(F49:E2)
«mO /V1/EDID:switch
```

#### Emulate EDID to All Ports

```
»CALL /V1/EDID:switchAll(F47)
«mO /V1/EDID:switchAll
```

#### Copy EDID to User Memory

```
»CALL /V1/EDID:copy(F1:U2)
«mO /V1/EDID:copy
```

#### Reset All Emulated EDIDs

```
»CALL /V1/EDID:reset()
«mO /V1/EDID:reset
```

---

### 5.7 Network Configuration

#### Enable/Disable DHCP

```
»SET /V1/MANAGEMENT/NETWORK.DhcpEnabled=true
«pw /V1/MANAGEMENT/NETWORK.DhcpEnabled=true

»CALL /V1/MANAGEMENT/NETWORK:applySettings()
«mO /V1/MANAGEMENT/NETWORK:applySettings
```

#### Set Static IP

```
»SET /V1/MANAGEMENT/NETWORK.StaticIpAddress=192.168.0.85
«pw /V1/MANAGEMENT/NETWORK.StaticIpAddress=192.168.0.85

»CALL /V1/MANAGEMENT/NETWORK:applySettings()
«mO /V1/MANAGEMENT/NETWORK:applySettings
```

#### Enable/Disable Ethernet Port

```
»SET /V1/MEDIA/ETHERNET/P4.Enabled=true
«pw /V1/MEDIA/ETHERNET/P4.Enabled=true
```

#### Enable/Disable Service Port

```
»SET /V1/MANAGEMENT/NETWORK/SERVICES/HTTP.Enabled=false
«pw /V1/MANAGEMENT/NETWORK/SERVICES/HTTP.Enabled=false
```

#### Enable Authentication

```
»SET /V1/MANAGEMENT/NETWORK/SERVICES/HTTP.AuthenticationEnabled=true
«pw /V1/MANAGEMENT/NETWORK/SERVICES/HTTP.AuthenticationEnabled=true

»CALL /V1/MANAGEMENT/NETWORK/SERVICES/HTTP:restart()
«mO /V1/MANAGEMENT/NETWORK/SERVICES/HTTP:restart=
```

#### Set VLAN Preset

```
»SET /V1/MEDIA/ETHERNET.VlanPreset=Dedicated
«pw /V1/MEDIA/ETHERNET.VlanPreset=Dedicated
```

#### Management Network on Ethernet Port (VLAN 1000)

```
»SET /V1/MEDIA/ETHERNET/P1.VlanMembership=1000
«pw /V1/MEDIA/ETHERNET/P1.VlanMembership=1000
```

---

### 5.8 Serial Port (RS-232)

> Not available on DCX-3x1-TPX-TX10.

#### Set Baud Rate

```
»SET /V1/MEDIA/SERIAL/P1.Baudrate=19200
«pw /V1/MEDIA/SERIAL/P1.Baudrate=19200
```

#### Set Parity

```
»SET /V1/MEDIA/SERIAL/P1.Parity=None
«pw /V1/MEDIA/SERIAL/P1.Parity=None
```

> Serial message **sending** is REST API only. See Section 4.8.

---

### 5.9 GPIO Port

> Not available on DCX-3x1-TPX-TX10 or HDMI-UCX-TPX-RX107.

#### Set Direction

```
»SET /V1/MEDIA/GPIO/P1.Direction=Input
«pw /V1/MEDIA/GPIO/P1.Direction=Input
```

#### Set Output Level

```
»SET /V1/MEDIA/GPIO/P1.Output=High
«pw /V1/MEDIA/GPIO/P1.Output=High
```

#### Set Level for Duration

```
»CALL /V1/MEDIA/GPIO/P1:interval(Low;1)
«mO /V1/MEDIA/GPIO/P1:interval=
```

#### Toggle Output

```
»CALL /V1/MEDIA/GPIO/P1:toggle()
«mO /V1/MEDIA/GPIO/P1:toggle
```

---

### 5.10 OCS Port

#### Query OCS Input Level

```
»GET /V1/MEDIA/OCS/P1.InputLevel
«pr /V1/MEDIA/OCS/P1.InputLevel=Low
```

#### Set Sensor Type

```
»SET /V1/MEDIA/OCS/P1.SensorType=Active low
«pw /V1/MEDIA/OCS/P1.SensorType=Active low
```

#### Query OCS State

```
»GET /V1/MEDIA/OCS/P1.State
«pr /V1/MEDIA/OCS/P1.State=Free
```

---

### 5.11 Remote Power (TX POE to RX)

> Available on UCX-4x3-TPX-TX20 and UCX-2x1-TPX-TX20 when receiver is HDMI-UCX-TPX-RX107.

```
»SET /V1/LINK/TX/POE/POWER.Reserved=30 W
«pw /V1/LINK/TX/POE/POWER.Reserved=30 W
```
> `30 W` = remote power enabled; `0 W` = remote power disabled.

---

## 6. WebSocket (WS/WSS) & Subscriptions

### Connection

Open WebSocket to:
- `ws://<ip>/lw3` — port 80 (unencrypted)
- `wss://<ip>/lw3` — port 443 (encrypted, recommended)

Once connected, use the same LW3 commands as raw TCP.

### Subscribing to Property Changes (OPEN)

The `OPEN` command is **LW3 only** — not supported in REST API.

```
»OPEN /V1/MEDIA/VIDEO
← CHG /V1/MEDIA/VIDEO/I1.SignalPresent=true    (when signal changes)
← CHG /V1/MEDIA/VIDEO/XP/O1.ConnectedSource=I2 (when crosspoint changes)
```

### Unsubscribing

```
»CLOSE /V1/MEDIA/VIDEO
```

### Common Subscription Targets for Monitoring

| Node Path | Events Generated |
|-----------|-----------------|
| `/V1/MEDIA/VIDEO` | Signal presence, resolution, crosspoint changes |
| `/V1/MEDIA/AUDIO` | Audio signal, crosspoint, volume changes |
| `/V1/MEDIA/USB` | USB host connection/disconnection |
| `/V1/MEDIA/GPIO` | GPIO pin level changes |
| `/V1/MEDIA/OCS` | Occupancy state changes |
| `/V1/MANAGEMENT` | Device label, firmware, network changes |
| `/V1/MEDIA/ETHERNET` | Ethernet port state changes |

> **Note**: REST API does not support OPEN/CLOSE. For real-time monitoring, use LW3 over WS/WSS.

---

## 7. Health & Status Properties

These are the key properties to query for health monitoring and LED status calculation.

### 7.1 Device-Level Health

| Property Path (LW3) | REST API Equivalent | Description |
|---------------------|---------------------|-------------|
| `/V1/MANAGEMENT/LABEL.DeviceLabel` | `GET /api/V1/MANAGEMENT/LABEL/DeviceLabel` | Device name/label |
| `/V1/MANAGEMENT/UID/PACKAGE.Version` | `GET /api/V1/MANAGEMENT/UID/PACKAGE/Version` | Firmware version |
| `/V1/MANAGEMENT/NETWORK.IpAddress` | `GET /api/V1/MANAGEMENT/NETWORK/IpAddress` | Current IP address |
| `/V1/MANAGEMENT/NETWORK.DhcpEnabled` | `GET /api/V1/MANAGEMENT/NETWORK/DhcpEnabled` | DHCP mode state |

### 7.2 Video Signal Health

| Property Path (LW3) | Description |
|---------------------|-------------|
| `/V1/MEDIA/VIDEO/<in>.SignalPresent` | `true` if video signal detected on input |
| `/V1/MEDIA/VIDEO/<in>.ActiveResolution` | Active resolution, e.g. `1920x1080p60.00Hz` |
| `/V1/MEDIA/VIDEO/XP/O<n>.ConnectedSource` | Which input is routed to this output |
| `/V1/MEDIA/VIDEO/XP/<out>/SWITCHABLE.<in>` | `OK`, `Busy`, or `Locked` |

### 7.3 Audio Signal Health

| Property Path (LW3) | Description |
|---------------------|-------------|
| `/V1/MEDIA/AUDIO/<port>.SignalPresent` | `true` if audio signal present |
| `/V1/MEDIA/AUDIO/XP/<out>.ConnectedSource` | Active audio source on output |

### 7.4 USB Host Health

| Property Path (LW3) | Description |
|---------------------|-------------|
| `/V1/MEDIA/USB/XP/H1.ConnectedSource` | Active USB host (U1–U4) |
| `/V1/MEDIA/USB/<port>.Connected` | USB port connection state |
| `/V1/MEDIA/USB/<usb-c_port>.HostSupportsDpAltMode` | DP Alt mode support |
| `/V1/MEDIA/USB/<usb-c_port>.ActiveAltMode` | `N/A`, `None`, or `DP` |

### 7.5 OCS State

| Property Path (LW3) | Description |
|---------------------|-------------|
| `/V1/MEDIA/OCS/P1.State` | `Free` or `Occupied` |
| `/V1/MEDIA/OCS/P1.InputLevel` | Raw pin state: `High` or `Low` |

### 7.6 Ethernet Port Health

| Property Path (LW3) | Description |
|---------------------|-------------|
| `/V1/MEDIA/ETHERNET/P<n>.Enabled` | Whether the port is enabled |
| `/V1/MEDIA/ETHERNET/P<n>.Connected` | Whether a device is connected |

### 7.7 Health → LED Mapping

| Condition | LED State | Rationale |
|-----------|-----------|-----------|
| Device responds to REST API (any `200 OK`) | GREEN | Reachable, operational |
| Device responds but `SignalPresent=false` on expected input | AMBER | Reachable but AV fault |
| No response after N consecutive polls | RED | Device unreachable |
| Module not yet configured | GREY | Unknown/unconfigured |

---

## 8. Device Control Actions

### 8.1 Supported Actions

| Action | REST API | LW3 | Notes |
|--------|----------|-----|-------|
| **Reboot TX** | `POST /api/V1/SYS/DEVICES/TX/restart` | `CALL /V1/SYS/DEVICES/TX:restart()` | Terminates connections |
| **Reboot RX** | `POST /api/V1/SYS/DEVICES/RX/restart` | `CALL /V1/SYS/DEVICES/RX:restart()` | Terminates connections |
| **Factory Reset TX** | `POST /api/V1/SYS/DEVICES/TX/factoryDefaults` | `CALL /V1/SYS/DEVICES/TX:factoryDefaults()` | Clears all config including LARA |
| **Factory Reset RX** | `POST /api/V1/SYS/DEVICES/RX/factoryDefaults` | `CALL /V1/SYS/DEVICES/RX:factoryDefaults()` | |
| **Identify** | `POST /api/V1/MANAGEMENT/UI/identifyMe` | `CALL /V1/MANAGEMENT/UI:identifyMe()` | LEDs blink 10 seconds |
| **Switch Video** | `POST /api/V1/MEDIA/VIDEO/XP/switch` body: `I2:O1` | `CALL /V1/MEDIA/VIDEO/XP:switch(I2:O1)` | |
| **Send RS-232** | `POST /api/V1/MEDIA/SERIAL/P1/send` body: `<msg>` | REST API only | One-way; 100 ms response window |
| **CEC Power On** | `POST /api/V1/MEDIA/VIDEO/O1/CEC/send` body: `04` | `CALL /V1/MEDIA/VIDEO/O1/CEC:send(446D)` | |
| **CEC Standby** | `POST /api/V1/MEDIA/VIDEO/O1/CEC/send` body: `36` | `CALL /V1/MEDIA/VIDEO/O1/CEC:send(36)` | |
| **Open Web UI** | `https://<ip>/` (browser) | N/A | Built-in web LDC |

---

## 9. Module Implementation Notes

### 9.1 TX vs. RX Addressing

The TX device is the control gateway for the entire TX+RX system. All REST API and LW3 commands are sent to the TX IP address. The TX exposes both its own state and the RX state via the same API.

- Restart TX: `CALL /V1/SYS/DEVICES/TX:restart()`
- Restart RX: `CALL /V1/SYS/DEVICES/RX:restart()`
- The RX has its own IP address for direct control when accessed directly, but typically management is via the TX.

### 9.2 Recommended Connection Sequence (REST API)

```
1. Connect to https://<ip>/  (HTTPS, port 443)
2. Authenticate: Basic Auth header → admin:<password>
3. Poll: GET /api/V1/MANAGEMENT/UID/PACKAGE/Version  → confirm device alive
4. Poll: GET /api/V1/MEDIA/VIDEO/I<n>/SignalPresent   → per-input signal status
5. Poll: GET /api/V1/MEDIA/VIDEO/XP/O<n>/ConnectedSource  → crosspoint state
6. (Optional) Poll: GET /api/V1/MEDIA/OCS/P1/State    → occupancy status
```

### 9.3 Recommended Connection Sequence (LW3 WebSocket — event-driven)

```
1. Open WSS connection: wss://<ip>/lw3  (port 443)
2. Provide auth if required
3. OPEN /V1/MEDIA/VIDEO  → subscribe to video changes
4. OPEN /V1/MEDIA/OCS    → subscribe to occupancy changes
5. OPEN /V1/MANAGEMENT   → subscribe to management/network changes
6. Receive CHG events in real time
7. On disconnect: re-open connection and re-send OPEN commands
```

### 9.4 Polling Strategy for Health Monitor

- **Primary poll**: REST API `GET /api/V1/MANAGEMENT/UID/PACKAGE/Version` — fastest round-trip, confirms device reachability.
- **Secondary poll** (on GREEN): `GET /api/V1/MEDIA/VIDEO/I<n>/SignalPresent` for each expected active input.
- **OCS poll** (optional): `GET /api/V1/MEDIA/OCS/P1/State` for room occupancy (if model supports OCS).
- **Recommended interval**: 30 seconds (configurable per constitution).
- **Failure threshold**: 3 consecutive failures → RED.

### 9.5 HTTPS Certificate Handling

- Device generates a **self-signed certificate** automatically.
- New certificate generated after hostname change or factory reset.
- In module code: accept self-signed certs (verify=False in dev) OR upload a trusted cert.
- **IMPORTANT**: Ensure device time/date is set correctly — incorrect time causes cert rejection.

### 9.6 Crosspoint Hardware Limitation

The UCX-TPX TX models have a video crosspoint limitation:

- **UCX-4x3-TPX-TX20**: I1 and I5 cannot be selected to any output simultaneously.
- **UCX-2x1-TPX-TX20**: I1 and I3 cannot be selected simultaneously.
- **UCX-3x3-TPX-RX20** / **DCX-3x1-TPX-TX10**: I1 and I4 cannot be selected simultaneously.

When attempting an invalid switch, the REST API returns HTTP 405. Always query `SWITCHABLE` before switching if the state is uncertain.

### 9.7 Port Matrix for Minimal Secure Setup

```
Required open ports (minimum for AV monitoring):
  443/TCP   — HTTPS REST API + WSS

Disable for security:
  80/TCP    — HTTP (unencrypted)
  6107/TCP  — LW3 raw TCP (unless LDC software needed)
  8001/TCP  — Serial over IP P1 (unless RS-232 bidirectional control needed)
  8002/TCP  — Serial over IP P2 (unless RS-232 bidirectional control needed)
  8003/TCP  — Serial over IP P3 / RX (unless RS-232 bidirectional control needed)
```

### 9.8 Port Numbering Cheat Sheet

#### Audio/Video Ports

| Port | UCX-4x3-TPX-TX20 | UCX-2x1-TPX-TX20 | DCX-3x1-TPX-TX10 | UCX-3x3-TPX-RX20 |
|------|------------------|------------------|------------------|------------------|
| USB-C In 1 | I1 | I1 | I1 | — |
| USB-C In 2 | I2 | — | — | — |
| HDMI In 1 | I3 | — | I2 | — |
| HDMI In 2 | I4 | — | I3 | — |
| TPX / Welcome | I5 | I3 | I4 | I4 |
| HDMI Out 1 | O1 | O1 | O1 | O1 |
| HDMI Out 2 | O2 | — | — | O2 |
| HDMI Out 3 | O3 | — | — | O3 |

#### GPIO Ports

| Port Name | LW3 Port |
|-----------|----------|
| GPIO1 | P1 |
| GPIO2 | P2 |
| GPIO3 | P3 |
| GPIO4 | P4 |
| GPIO5 | P5 |
| GPIO6 | P6 |

#### OCS Port (UCX-3x3-TPX-RX20, HDMI-UCX-TPX-RX107)

| Port Name | LW3 Port |
|-----------|----------|
| OCS1 | P1 |

#### RS-232 Ports

| Port Name | LW3 Port | Serial over IP Port |
|-----------|----------|---------------------|
| RS-232 1 | P1 | 8001 |
| RS-232 2 | P2 | 8002 |
| RX RS-232 | P3 | 8003 |

### 9.9 Factory Default Settings

| Setting | Default Value |
|---------|---------------|
| IP mode | DHCP |
| Static IP | 192.168.0.100 |
| Static mask | 255.255.255.0 |
| Static gateway | 192.168.0.1 |
| HTTP (port 80) | Disabled (from FW v1.19.0 TX / v1.8.0 RX) |
| HTTPS (port 443) | Enabled |
| Authentication | Enabled (from FW v1.19.0 TX / v1.8.0 RX), password: `Lightware10g` |
| LW3 (port 6107) | Enabled |
| Serial over IP | Enabled |
| RS-232 (TX) | 9600 baud, 8 data bits, No parity, 1 stop bit |
| RS-232 (HDMI-UCX-TPX-RX107) | 115200 baud, 8, N, 1 |
| GPIO direction | Input, level: Low |
| OCS sensor type | Active high |
| Video autoselect | Disabled |
| EDID emulated | Factory #47 (Universal HDMI PCM) |
| Audio volume | 0 dB (100%), Balance: 0 (center) |
| USB autoselect | Follow video O1 |
| USB-C Power Limit | 100W |
| DP Alternate Mode | 4-Lane |
| Port Power Role | Dual Role |
| Welcome Screen Image | true (TX models) |
| Welcome Screen Message | false |
| Control lock | Disabled |
| Dark mode | Disabled |
| LARA | Enabled (from FW v1.19.0 TX / v1.8.0 RX) |
| VLAN preset | Transparent |

---

## 10. Reference Links

1. [UCX-TPX Series User Manual (HTML, v3)](https://assets.prod.pim.lightware.com/assets/File-Downloads/Guides-and-Manuals/User-Manual/HTML/UCX-TPX_series/UCX-TPX_series_UserManual.html)
2. [UCX-TPX Series REST API Reference (Chapter 7)](https://assets.prod.pim.lightware.com/assets/File-Downloads/Guides-and-Manuals/User-Manual/HTML/UCX-TPX_series/UM.html#_idTextAnchor098)
3. [UCX-TPX Series LW3 Programmers' Reference (Chapter 8)](https://assets.prod.pim.lightware.com/assets/File-Downloads/Guides-and-Manuals/User-Manual/HTML/UCX-TPX_series/UM.html#_idTextAnchor153)
4. [Lightware Support — Online User Manuals](https://www.lightware.com/support/online-user-manuals)
5. [Lightware Device Controller (LDC) Download](https://www.lightware.com/)
6. [LARA Room Automation Platform](https://lightware.com/lara)
7. [LARA User Manual](https://go.lightware.com/lara-hum)
8. [UCX-TPX Advanced Ethernet Security](https://go.lightware.com/ucx-advanced-ethernet-security)
9. [Lightware Device Updater V2 (LDU2)](https://www.lightware.com/)
