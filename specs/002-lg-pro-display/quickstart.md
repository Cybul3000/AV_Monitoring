# Quickstart — LG Pro Display Module (spec 002)

*Phase 1 design artifact. Supplement to `specs/001-av-room-monitor/quickstart.md`.*

---

## Dependencies

No new npm dependencies. Transport uses Node.js built-in `net.Socket`.

---

## Key source files

```text
src/main/modules/lg-display/
├── LGTCPTransport.ts     # Persistent TCP connection, command queue, auto-reconnect
└── LGDisplayModule.ts    # DeviceModule implementation — poll cycle, LED logic, commands

src/renderer/components/DeviceDetail/LGDisplayPanel/
└── LGDisplayPanel.tsx    # Power, input, mute, volume controls

tests/unit/lg-display/
└── LGDisplayModule.test.ts
```

---

## Protocol verification

Confirm an LG display is reachable on TCP port 9761:

```bash
# Query power state (ka = power, ff = query)
echo -ne 'ka 00 ff\r' | nc -w1 <DISPLAY_IP> 9761
# Expected response: "a 0 OK01x" (on) or "a 0 OK00x" (off)
```

---

## Agent start files

1. `specs/002-lg-pro-display/spec.md` — requirements
2. `specs/002-lg-pro-display/plan.md` — this plan
3. `specs/002-lg-pro-display/research.md` — protocol details
4. `specs/002-lg-pro-display/data-model.md` — state types
5. `specs/002-lg-pro-display/contracts/lg-ipc.md` — IPC contracts
6. `specs/001-av-room-monitor/data-model.md` — shared schema
7. `specs/001-av-room-monitor/contracts/ipc-channels.md` — shared IPC patterns

---

## LED rules

| State | LED |
|-------|-----|
| TCP disconnected | RED |
| Connected, not yet polled | GREY |
| Power off or screen muted | AMBER |
| Power on, no mute | GREEN |

---

## Poll cycle (every 5 s by default)

Sends five queries in sequence:

1. `ka ff` — power state
2. `xb ff` — input source
3. `kd ff` — screen mute
4. `ke ff` — volume mute
5. `kf ff` — volume level

NG responses are logged as warnings; polling continues.
