# Research: LG Pro Display Module (spec 002)

**Branch**: `002-lg-pro-display` | **Date**: 2026-03-25 | **Phase**: 0 output

---

## R-001 Protocol — LG Monitor Control API (RS-232 / TCP)

**Decision**: Raw TCP on port 9761, ASCII line-based protocol.

**Rationale**: LG Professional Displays expose the same RS-232 command set over TCP/IP. The Bitfocus Companion module (`bitfocus/companion-module-lgtv-prodisplay`) is the authoritative open-source reference confirming all command codes and framing used in this implementation.

**Alternatives considered**: HTTP/REST — not available on most LG Pro Display firmware. LG WebOS commercial SDK — only available on smart display models, not the Pro Display line.

---

## R-002 Transport — Node.js `net.Socket` (no npm package)

**Decision**: `LGTCPTransport` built on Node.js built-in `net.Socket`. No third-party TCP library.

**Rationale**: Same pattern used for Lightware LW3 (spec 005). The protocol is simple ASCII line-based with \r termination — no framing complexity that would justify an npm dependency. Pure-JS, fully cross-platform.

**Alternatives considered**: `node-telnet-client` — overkill (no IAC negotiation needed). `ssh2` — not applicable.

---

## R-003 Command Frame Format

```
Send:    {command_code} {setId_2hex} {data_2hex}\r
Receive: {cmd_char} {setId_dec} OK{value_2hex}x\r
      or {cmd_char} {setId_dec} NG{value_2hex}x\r
```

- `command_code`: two-char string, e.g. `ka`, `xb`, `kd`, `ke`, `kf`
- `setId_2hex`: Set ID as 2-digit hex (00 = Set ID 0)
- Response matched by `cmd_char` (second char of command_code): `a`, `b`, `d`, `e`, `f`
- `FF` as data value = query current state
- `NG` response = device rejected command; logged, not fatal

---

## R-004 Command Codes

| Property | Query cmd | Value codes |
|----------|-----------|-------------|
| Power state | `ka ff` | `01`=on, `00`=off |
| Input source | `xb ff` | `0x00`=DTV, `0x10`=AV, `0x20`=Component, `0x40`=HDMI1, `0x41`=HDMI2, `0x42`=HDMI3, `0x60`=DisplayPort, `0x90`=HDMI4 |
| Screen mute | `kd ff` | `01`=muted, `00`=unmuted |
| Volume mute | `ke ff` | `01`=muted, `00`=unmuted |
| Volume level | `kf ff` | hex integer 0x00–0x64 (0–100) |

---

## R-005 Connection Management

**Decision**: Persistent TCP connection with exponential backoff reconnect (1s initial, 2× multiplier, 30s max). Commands are serialised (one in-flight at a time) via a queue.

**Rationale**: Matches LG display expectation — it does not accept concurrent commands. Backoff prevents connection storms on unstable networks.

---

## R-006 LED Aggregation Rules

| Condition | LED |
|-----------|-----|
| TCP disconnected | RED |
| Connected, not yet polled | GREY |
| Polled, power=off | AMBER |
| Polled, screen mute=true | AMBER |
| Polled, power=on, no mute | GREEN |

---

## R-007 References

- Bitfocus Companion module: `https://github.com/bitfocus/companion-module-lgtv-prodisplay`
- Protocol: LG Monitor Control API (RS-232/TCP) — same command set as RS-232 serial
