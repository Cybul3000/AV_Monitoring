# IPC Channel Contracts — LG Pro Display Module (spec 002)

*Phase 1 design artifact. Extends `specs/001-av-room-monitor/contracts/ipc-channels.md`.*

LG display control is handled through the shared `device:command` IPC channel (no module-specific channels needed). LED status is carried by the existing `device:status:all` push broadcast.

---

## Shared channel: `device:command` — used for LG actions

**Direction**: renderer → main
**Purpose**: Send a control command to an LG display via `LGDisplayModule.sendCommand()`.

### Supported commands for `device_type = 'lg-display'`

| `command` | `params` | Effect |
|-----------|----------|--------|
| `powerOn` | — | Send `ka {setId} 01\r` |
| `powerOff` | — | Send `ka {setId} 00\r` |
| `setInput` | `{ inputCode: string }` | Send `xb {setId} {inputCode}\r` |
| `screenMuteOn` | — | Send `kd {setId} 01\r` |
| `screenMuteOff` | — | Send `kd {setId} 00\r` |
| `volumeMuteOn` | — | Send `ke {setId} 01\r` |
| `volumeMuteOff` | — | Send `ke {setId} 00\r` |
| `setVolume` | `{ level: number }` | Send `kf {setId} {hex}\r` (clamped 0–100) |
| `volumeUp` | — | Current volume + 10, capped at 100 |
| `volumeDown` | — | Current volume − 10, floored at 0 |

**Response**: `CommandResult { success: boolean; output?: string; error?: string }`

---

## Push broadcast: `device:status:all`

LG display status is included in the existing status broadcast after each poll cycle. The `meta` field carries:

```typescript
{
  power:       'on' | 'off' | null,
  input:       string | null,
  screenMute:  boolean | null,
  volumeMute:  boolean | null,
  volume:      number | null,
  connected:   boolean
}
```

---

## `LGDisplayPanel` renderer component

The renderer reads LG state from the `device:status:all` broadcast and renders it via `LGDisplayPanel.tsx`.

**Props**:
```typescript
interface LGDisplayPanelProps {
  deviceId: string
  meta: {
    power:      'on' | 'off' | null
    input:      string | null
    screenMute: boolean | null
    volumeMute: boolean | null
    volume:     number | null
    connected:  boolean
  }
}
```

**Controls rendered**:
- Power On / Power Off buttons
- Input source selector (dropdown, values from `INPUT_CODE_MAP`)
- Screen Mute toggle
- Volume Mute toggle
- Volume slider (0–100) with Up/Down buttons
