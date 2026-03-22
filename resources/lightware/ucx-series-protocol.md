# Lightware UCX Series — Control Protocol Reference

**Document purpose**: Module implementation reference for Lightware Taurus UCX Series universal switchers.  
**Protocol confirmed for registry entry**: REST API over HTTP/HTTPS (primary), LW3 over TCP (secondary), WebSocket/WSS (event-driven)  
**Source**: [Lightware UCX Series User Manual v2 (2026-03-16)](https://assets.prod.pim.lightware.com/assets/File-Downloads/Guides-and-Manuals/User-Manual/HTML/UCX_Series/UCX_series_UserManual.html)  
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

Lightware Taurus UCX Series devices are universal AV switchers designed for meeting room environments. They combine video/USB/audio switching with built-in control APIs.

### Supported Models

| Model | USB-C Inputs | HDMI Inputs | HDMI Outputs | Notes |
|-------|-------------|-------------|--------------|-------|
| UCX-2x1-HC30 | 1x | 1x | 1x | HC30 family |
| UCX-2x2-H30 | — | 2x | 2x | No USB-C inputs |
| UCX-4x2-HC30 | 2x | 2x | 2x | HC30 family |
| UCX-4x2-HC30D | 2x | 2x | 2x | + Dante audio output |
| UCX-2x1-HC40 | 1x | 1x | 1x | HC40 family (4K/5K) |
| UCX-2x2-H40 | 1x | 1x | 2x | HC40 family |
| UCX-4x2-HC40 | 3x | 1x | 2x | HC40 family |
| UCX-4x2-HC40D | 2x | 2x | 2x | + Dante audio |
| UCX-4x3-HC40 | 2x | 2x | 3x | 3-output, HC40 |
| UCX-4x3-HC40-BD | 2x | 2x | 3x | Bi-directional Dante |
| All -LCC variants | Same as base model | Same | Same | FIPS 140-2 validated |

> **5K support**: Only on H(C)40 models from FW v2.20.0+.  
> **Factory default IP**: DHCP. Static fallback: `192.168.0.100`, mask `255.255.255.0`, gateway `192.168.0.1`.

---

## 2. Connection Methods & Ports

### Network Port Summary

| Port | Protocol | Service | Notes |
|------|----------|---------|-------|
| **80** | TCP (HTTP) | LW3 over WS, REST API, LARA, file transfer | Disabled by default from FW v2.16.0 (HC30). Use HTTPS instead. |
| **443** | TCP (HTTPS) | LW3 over WSS, REST API, LARA management | Recommended — encrypted. Self-signed cert auto-generated. |
| **6107** | TCP | LW3 protocol (raw TCP) | Used by Lightware Device Controller (LDC). Can be disabled. |
| **8001** | TCP | Serial over IP — RS-232 P1 | Can be disabled. Up to 20 simultaneous connections. |
| **8002** | TCP | Serial over IP — RS-232 P2 | Can be disabled. |
| **5353** | UDP | mDNS / Bonjour (device discovery) | Multicast 224.0.0.251 |
| **37421** | UDP | Remote IP discovery | Multicast 230.76.87.82 |
| **20000–30000** | TCP | LARA service deployment | Only open when LARA is enabled. No firewall protection. |

> **Security recommendation**: Disable port 80 and 6107. Use HTTPS (443) and WSS for all control traffic. Enable authentication.

### Maximum Concurrent Clients

The device can manage **18 connected clients simultaneously** across WS (80), WSS (443), and LW3 (6107) ports combined.

### Connection Methods Matrix

| Method | Port | Protocol | Best For |
|--------|------|----------|---------|
| REST API (HTTP) | 80 | HTTP | Simple request-response control. Stateless. |
| REST API (HTTPS) | 443 | HTTPS | Recommended for production. Encrypted. |
| LW3 Raw TCP | 6107 | TCP | Terminal-style control. Persistent session. |
| WebSocket (WS) | 80 | WS | Event-driven LW3. Persistent connection. |
| WebSocket Secure (WSS) | 443 | WSS | Recommended event-driven. Encrypted. |

---

## 3. Authentication

### Credentials

| Field | Value | Notes |
|-------|-------|-------|
| Username | `admin` | Fixed. Cannot be changed. |
| Password | Set by admin | Default from FW v2.16.0: `Lightware10g`. Must change after first login. |
| Auth type | HTTP Basic Auth | Applied per port (80 or 443 separately). Password is **not** encrypted over HTTP. |
| Min length | 10 characters | UTF-8; max 100 characters. |
| Lockout | 5 failed attempts | Denied for 15 minutes. |
| Password history | Last 10 passwords | Cannot reuse previous 10 passwords. |

> **From FW v2.16.0 (HC30)**: Authentication is **enabled by default** after first factory reset. Default password `Lightware10g` is applied.

### Session Management (webLDC)

- Maximum session length: **120 minutes**
- Inactivity timeout: **30 minutes** (pop-up warning at 5 min before)
- From FW v2.9.0.

### Authentication in REST API (curl example)

```bash
# Without auth
curl -X GET http://192.168.0.100/api/V1/MANAGEMENT/LABEL/DeviceLabel

# With basic auth
curl --user admin:mypassword -X GET https://192.168.0.100/api/V1/MANAGEMENT/LABEL/DeviceLabel

# HTTPS with self-signed cert (ignore cert validation in dev)
curl -k --user admin:mypassword -X GET https://192.168.0.100/api/V1/MANAGEMENT/UID/PACKAGE/Version
```

### Authentication in LW3 (TCP 6107)

Authentication is not applied on the raw TCP LW3 port by default. To secure the LW3 port, disable it and use WSS (443) instead.

---

## 4. REST API Reference

### General Rules

- All names and parameters are **case-insensitive** (from FW v2.9.0).
- Methods, nodes, properties are separated by `/`.
- Arguments and values in HTTP request **body** as `text/plain`.
- Supported methods: `GET`, `PUT`, `POST` (PUT and POST are equivalent for writes).
- No maximum request size.
- URL format: `http://<ip>/api/<NODEPATH>/<PropertyOrMethod>`
- LW3 path `/V1/MEDIA/VIDEO/I2.SignalPresent` → REST API path: `<ip>/api/V1/MEDIA/VIDEO/I2/SignalPresent`

### Response Codes

| HTTP Code | Meaning |
|-----------|---------|
| 200 | OK — success |
| 401 | Unauthorized — auth required |
| 404 | Not Found — invalid node path or property name |
| 405 | Method Not Allowed — attempting to write a read-only property |
| 406 | Not Acceptable — LW3 property error (`pE`) or method error (`mE`) |
| 500 | Internal Server Error |

### 4.1 Device Management Commands

#### Get Device Label

```
GET http://<ip>/api/V1/MANAGEMENT/LABEL/DeviceLabel
→ body: <device_label>
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
POST http://<ip>/api/V1/SYS/restart
body: (empty, Content-Type: text/plain)
→ 200 OK
```

#### Restore Factory Defaults

```
POST http://<ip>/api/V1/SYS/factoryDefaults
body: (empty)
→ 200 OK
```
> Warning: Resets all config. Device reboots.

#### Identify Device (LED blink for 10s)

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
| `locked` | Locked; can be unlocked by button combo |
| `force locked` | Locked; can only be unlocked via LDC or LW3 |

#### Set Current Time

```
POST http://<ip>/api/V1/MANAGEMENT/DATETIME/setTime
body: 2026-03-22T14:00:00    (ISO 8601)
→ 200 OK
```

#### Dark Mode Toggle

```
POST http://<ip>/api/V1/MANAGEMENT/UI/DARKMODE/Enable
body: true | false
→ 200 OK
```

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

#### Switch Input to ALL Outputs

```
POST http://<ip>/api/V1/MEDIA/VIDEO/XP/switchAll
body: I1
→ 200 OK
```

#### Query Connected Source on Output

```
GET http://<ip>/api/V1/MEDIA/VIDEO/XP/O2/ConnectedSource
→ body: I1
```

#### Query Connected Destinations of Input

```
GET http://<ip>/api/V1/MEDIA/VIDEO/XP/I3/ConnectedDestinations
→ body: ["O1","O2"]
```

#### Query Signal Presence on Input

```
GET http://<ip>/api/V1/MEDIA/VIDEO/<in>/SignalPresent
→ body: true | false
```

#### Lock/Unlock Video Port

```
POST http://<ip>/api/V1/MEDIA/VIDEO/XP/<port>/Lock
body: true | false
→ 200 OK
```

#### Query Input Switching Capability

```
GET http://<ip>/api/V1/MEDIA/VIDEO/XP/O2/SWITCHABLE/I1
→ body: OK | Busy | Locked
```

> Note: I1 and I5 ports cannot be selected to any output at the same time (hardware limitation).

#### Mute Video Port (embedded audio mute on output)

```
POST http://<ip>/api/V1/MEDIA/VIDEO/XP/I2/Mute
body: true | false
→ 200 OK
```

---

### 4.3 Network Configuration

#### Get IP Address Mode

```
GET http://<ip>/api/V1/MANAGEMENT/NETWORK/NetworkMode
→ body: DHCP | Static
```

#### Set Static IP Address

```
POST http://<ip>/api/V1/MANAGEMENT/NETWORK/StaticNetworkAddress
body: 192.168.0.200
→ 200 OK

POST http://<ip>/api/V1/MANAGEMENT/NETWORK/applySettings
body: (empty)
→ 200 OK   ← Saves and reboots the device
```

#### Enable/Disable Ethernet Port

```
POST http://<ip>/api/V1/MEDIA/ETHERNET/<port>/Enabled
body: true | false
→ 200 OK
```
`<port>` = P1–P5 (P1–P3 on HC30/HC40 2-input models).

#### Enable/Disable Network Service Port

```
POST http://<ip>/api/V1/MANAGEMENT/NETWORK/SERVICES/<port>/Enabled
body: true | false
```
`<port>` = `HTTP` | `HTTPS` | `LW3` | `SERIAL1` | `SERIAL2`

---

### 4.4 Serial Port (RS-232)

#### Set Baud Rate

```
POST http://<ip>/api/V1/MEDIA/SERIAL/P1/Baudrate
body: 9600 | 19200 | 38400 | 57600 | 115200
→ 200 OK
```

#### Send Serial Message (REST API only — not available in LW3)

```
POST http://<ip>/api/V1/MEDIA/SERIAL/P1/send
body: PWR0
→ 200 OK
```
Any format accepted (text, binary, hex). Max 100 KB. Response from connected device accepted within 100 ms window.

---

### 4.5 Remote System Logging

```
POST http://<ip>/api/V1/MANAGEMENT/LOG/REMOTE/ServerAddress
body: 192.168.0.1

POST http://<ip>/api/V1/MANAGEMENT/LOG/REMOTE/Protocol
body: TCP | UDP | TLS

POST http://<ip>/api/V1/MANAGEMENT/LOG/REMOTE/LogFormat
body: RFC3164 | RFC5424

POST http://<ip>/api/V1/MANAGEMENT/LOG/REMOTE/PortNumber
body: 6514

POST http://<ip>/api/V1/MANAGEMENT/LOG/REMOTE/Enabled
body: true
```

> Available from FW v2.19.0 in UCX-HC40 models. Logs sent via TCP/UDP/TLS. No certificate validation for TLS (anonymous TLS).

---

## 5. LW3 Protocol Reference

### Overview

LW3 (Lightware Protocol #3) is an ASCII-based protocol organized as a tree of nodes, properties, and methods. Implemented in all Lightware devices since 2012.

- **Port**: 6107 (TCP)
- **Termination**: Every command line must end with `\r\n` (Carriage Return + Line Feed)
- **Case sensitivity**: Case-sensitive up to FW v2.9.0; case-insensitive from FW v2.9.0
- **Max line length**: 800 bytes (command + path + parameters)
- **Max concurrent clients**: 18 (shared across WS/WSS/LW3 ports)

### Establishing LW3 Connection (Putty / terminal)

1. Connect device to LAN
2. Open terminal (e.g. Putty)
3. Enter device IP address (default: DHCP)
4. Port: **6107**
5. Connection type: **Raw**

### Command Types

| Command | Syntax | Description |
|---------|--------|-------------|
| GET | `GET /V1/MEDIA/VIDEO/I2.SignalPresent` | Read value of a property |
| SET | `SET /V1/MANAGEMENT/LABEL.DeviceLabel=name` | Write a read-write property |
| CALL | `CALL /V1/SYS:restart()` | Invoke a method |
| OPEN | `OPEN /V1/MEDIA/VIDEO` | Subscribe to a node (receive CHG events) |
| CLOSE | `CLOSE /V1/MEDIA/VIDEO` | Unsubscribe from a node |

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
| `ns` | Child node |
| `CHG` | Change notification (from subscription) |

### 5.1 Device Management

#### Get Device Label
```
»GET /V1/MANAGEMENT/LABEL.DeviceLabel
«pw /V1/MANAGEMENT/LABEL.DeviceLabel=UCX_Conference_room1
```

#### Set Device Label
```
»SET /V1/MANAGEMENT/LABEL.DeviceLabel=UCX_Conference_room1
«pw /V1/MANAGEMENT/LABEL.DeviceLabel=UCX_Conference_room1
```

#### Reboot Device
```
»CALL /V1/SYS:restart()
«mO /V1/SYS:restart=
```

#### Restore Factory Defaults
```
»CALL /V1/SYS:factoryDefaults()
«mO /V1/SYS:factoryDefaults=
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
»SET /V1/MANAGEMENT/UI.ControlLock=locked
«pw /V1/MANAGEMENT/UI.ControlLock=locked
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
»GET /V1/MEDIA/VIDEO/XP/O1.ConnectedSource
«pw /V1/MEDIA/VIDEO/XP/O1.ConnectedSource=I5
```

#### Query Signal Presence
```
»GET /V1/MEDIA/VIDEO/I2.SignalPresent
«pr /V1/MEDIA/VIDEO/I2.SignalPresent=true
```

#### Query Active Resolution
```
»GET /V1/MEDIA/VIDEO/I2.ActiveResolution
«pr /V1/MEDIA/VIDEO/I2.ActiveResolution=1920x1080p60.00Hz
```

#### Lock Video Port
```
»SET /V1/MEDIA/VIDEO/XP/I1.Lock=true
«pw /V1/MEDIA/VIDEO/XP/I1.Lock=true
```

---

### 5.3 Network Configuration

#### Enable/Disable Ethernet Port
```
»SET /V1/MEDIA/ETHERNET/P4.Enabled=false
«pw /V1/MEDIA/ETHERNET/P4.Enabled=false
```

#### Enable/Disable Service Port
```
»SET /V1/MANAGEMENT/NETWORK/SERVICES/HTTP.Enabled=false
«pw /V1/MANAGEMENT/NETWORK/SERVICES/HTTP.Enabled=false
```

#### Enable Authentication
```
»SET /V1/MANAGEMENT/NETWORK/AUTH.Enabled=true
«pw /V1/MANAGEMENT/NETWORK/AUTH.Enabled=true
```

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
| `/V1/MEDIA/USB` | USB host connection/disconnection |
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
| `/V1/SYS.Uptime` | `GET /api/V1/SYS/Uptime` | Device uptime |
| `/V1/MANAGEMENT/NETWORK.IpAddress` | `GET /api/V1/MANAGEMENT/NETWORK/IpAddress` | Current IP address (DHCP) |
| `/V1/MANAGEMENT/NETWORK.NetworkMode` | `GET /api/V1/MANAGEMENT/NETWORK/NetworkMode` | DHCP or Static |

### 7.2 Video Signal Health

| Property Path (LW3) | Description |
|---------------------|-------------|
| `/V1/MEDIA/VIDEO/<in>.SignalPresent` | `true` if video signal detected on input |
| `/V1/MEDIA/VIDEO/<in>.ActiveResolution` | Active resolution string, e.g. `1920x1080p60.00Hz` |
| `/V1/MEDIA/VIDEO/XP/O<n>.ConnectedSource` | Which input is routed to this output |
| `/V1/MEDIA/VIDEO/XP/<out>/SWITCHABLE.<in>` | `OK`, `Busy`, or `Locked` |

### 7.3 USB Host Health

| Property Path (LW3) | Description |
|---------------------|-------------|
| `/V1/MEDIA/USB/XP/H1.ConnectedSource` | Which USB host is currently active |
| `/V1/MEDIA/USB/<port>.Connected` | USB port connection state |

### 7.4 Ethernet Port Health

| Property Path (LW3) | Description |
|---------------------|-------------|
| `/V1/MEDIA/ETHERNET/P<n>.Enabled` | Whether the port is enabled |
| `/V1/MEDIA/ETHERNET/P<n>.Connected` | Whether a device is connected |

### 7.5 Health → LED Mapping

| Condition | LED State | Rationale |
|-----------|-----------|-----------|
| Device responds to REST API (any `200 OK`) | GREEN | Reachable, operational |
| Device responds but `SignalPresent=false` on expected input | AMBER | Reachable but AV fault |
| No response after N consecutive polls | RED | Device unreachable |
| Module not yet configured | GREY | Unknown/unconfigured |

---

## 8. Device Control Actions

### 8.1 Supported Actions (declared at module creation)

| Action | REST API | LW3 | Notes |
|--------|----------|-----|-------|
| **Reboot** | `POST /api/V1/SYS/restart` (empty body) | `CALL /V1/SYS:restart()` | Required action for all modules |
| **Factory Reset** | `POST /api/V1/SYS/factoryDefaults` (empty body) | `CALL /V1/SYS:factoryDefaults()` | Clears all configuration. Use with caution. |
| **Identify** | `POST /api/V1/MANAGEMENT/UI/identifyMe` | `CALL /V1/MANAGEMENT/UI:identifyMe()` | Blinks LEDs for 10 seconds |
| **Switch Video** | `POST /api/V1/MEDIA/VIDEO/XP/switch` body: `I2:O1` | `CALL /V1/MEDIA/VIDEO/XP:switch(I2:O1)` | Switch input to output |
| **Open Web UI** | `https://<ip>/` (browser) | N/A | Opens LDC built-in web interface |
| **Send RS-232** | `POST /api/V1/MEDIA/SERIAL/P1/send` body: `<message>` | REST API only | Send serial message to connected device |

### 8.2 CEC Commands (via HDMI outputs)

Available from FW v1.4.0b4+.

```
POST http://<ip>/api/V1/MEDIA/VIDEO/O1/CEC/send
body: 04    ← Power on
```

| CEC Code | Function |
|----------|----------|
| `04` | Power on |
| `0D` | Power off |
| `36` | Standby |
| `821000` | Select input 1 |
| `822000` | Select input 2 |

LW3 equivalent:
```
»CALL /V1/MEDIA/VIDEO/O1/CEC:send(446D)
«mO /V1/MEDIA/VIDEO/O1/CEC:send=OK
```

CEC response codes: `ACK` (200), `NACK` (444), `Timeout` (408), `Internal Error` (500).

---

## 9. Module Implementation Notes

### 9.1 Recommended Connection Sequence (REST API)

```
1. Connect to https://<ip>/  (HTTPS, port 443)
2. Authenticate: Basic Auth header → admin:<password>
3. Poll: GET /api/V1/MANAGEMENT/UID/PACKAGE/Version  → confirm device is alive
4. Poll: GET /api/V1/MEDIA/VIDEO/I<n>/SignalPresent  → per-input signal status
5. Poll: GET /api/V1/MEDIA/VIDEO/XP/O<n>/ConnectedSource  → crosspoint state
```

### 9.2 Recommended Connection Sequence (LW3 WebSocket — event-driven)

```
1. Open WSS connection: wss://<ip>/lw3  (port 443)
2. Send auth header if required
3. OPEN /V1/MEDIA/VIDEO  → subscribe to video changes
4. OPEN /V1/MANAGEMENT   → subscribe to management/network changes
5. Receive CHG events in real time
6. On disconnect: re-open connection and re-send OPEN commands
```

### 9.3 Polling Strategy for Health Monitor

- **Primary poll**: REST API `GET /api/V1/MANAGEMENT/UID/PACKAGE/Version` — fastest round-trip, confirms device reachability.
- **Secondary poll** (on GREEN): `GET /api/V1/MEDIA/VIDEO/I<n>/SignalPresent` for each expected active input.
- **Recommended interval**: 30 seconds (configurable per constitution).
- **Failure threshold**: 3 consecutive failures → RED.

### 9.4 HTTPS Certificate Handling

- Device generates a **self-signed certificate** automatically.
- Custom CA certificates can be uploaded from FW v2.2.0+.
- In module code, set TLS to accept self-signed certs OR upload a trusted cert.
- New certificate is generated after hostname change or factory reset.
- Ensure UCX time/date is set correctly — incorrect time causes cert rejection.

### 9.5 Port Matrix for Minimal Secure Setup

```
Required open ports (minimum for AV monitoring):
  443/TCP   — HTTPS REST API + WSS
  (optional) 6107/TCP  — LW3 raw TCP (if not using WS)

Disable for security:
  80/TCP    — HTTP (unencrypted)
  8001/TCP  — Serial over IP P1 (unless serial control needed)
  8002/TCP  — Serial over IP P2 (unless serial control needed)
  6107/TCP  — LW3 (if using WSS instead)
```

### 9.6 Port Numbering Cheat Sheet (most common models)

| Port Name | HC30/HC40 4-input models | 2-input models | Notes |
|-----------|--------------------------|----------------|-------|
| USB-C Host 1 | U1 | U1 | Video + USB + Ethernet |
| USB-C Host 2 | U2 | — | |
| USB-B Host 3 | U3 | U2 | |
| USB-B Host 4 | U4 | — | |
| USB Hub | H1 | H1 | |
| USB Downstream 1-4 | D1–D4 | D1–D4 | |
| Ethernet 1 (Control) | P1 | P1 | Secure Control LAN |
| Ethernet 2 (Utility) | P2 | — | BYOD LAN |
| Ethernet 3 (Config) | P3 | — | Configurable |
| USB-C Ethernet in1 | P4 | — | |
| USB-C Ethernet in2 | P5 | — | |

### 9.7 Factory Default Settings (key values)

| Setting | Default Value |
|---------|---------------|
| IP mode | DHCP |
| Static IP | 192.168.0.100 |
| Static mask | 255.255.255.0 |
| Static gateway | 192.168.0.1 |
| HTTP | Disabled (from FW v2.16.0 HC30) |
| HTTPS | Enabled |
| Authentication | Enabled (from FW v2.16.0), password: `Lightware10g` |
| LW3 (port 6107) | Enabled |
| Serial over IP | Enabled |
| RS-232 settings | 9600 baud, 8 data bits, No parity, 1 stop bit |
| GPIO direction | Input, level: Low |
| OCS sensor type | Active high |
| Control lock | Disabled |
| Dark mode | Disabled |
| LARA | Enabled (from FW v2.16.0) |
| VLAN preset | Transparent |

---

## 10. Reference Links

1. [UCX Series User Manual (HTML, v2)](https://assets.prod.pim.lightware.com/assets/File-Downloads/Guides-and-Manuals/User-Manual/HTML/UCX_Series/UCX_series_UserManual.html)
2. [Lightware Support — Online User Manuals](https://www.lightware.com/support/online-user-manuals)
3. [Lightware Device Controller (LDC) Download](https://www.lightware.com/)
4. [Lightware REST API Reference (in manual, Chapter 7)](https://assets.prod.pim.lightware.com/assets/File-Downloads/Guides-and-Manuals/User-Manual/HTML/UCX_Series/UM.html#_idTextAnchor102)
5. [LW3 Programmers' Reference (in manual, Chapter 8)](https://assets.prod.pim.lightware.com/assets/File-Downloads/Guides-and-Manuals/User-Manual/HTML/UCX_Series/UM.html#_idTextAnchor158)
6. [UCX Series PDF Manual](https://go.lightware.com/ucx-s-pum)
7. [LARA Room Automation Platform](https://lightware.com/lara)
8. [LARA User Manual](https://go.lightware.com/lara-hum)
9. [Taurus UCX Advanced Ethernet Security Application Notes](https://go.lightware.com/ucx-advanced-ethernet-security)
10. [Lightware Device Updater V2 (LDU2)](https://www.lightware.com/)
