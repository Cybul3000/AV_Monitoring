# Research — AV Monitoring Desktop Application (Whole-App Plan)

*Phase 0 output. All unknowns resolved. No blocking clarifications remain.*

---

## R-001: Electron Version & Node.js Compatibility

**Decision**: Electron 30 with its bundled Node.js 20 LTS.

**Rationale**:
- Electron 30 supports macOS 12+ and Windows 10+ natively and ships Node.js 20 internally, so no separate Node runtime is required at build time.
- `ssh2` 1.x, `better-sqlite3` 9.x, and `electron-store` 9.x all support Node.js 20 without native module rebuild issues when using `electron-rebuild`.
- `netaudio` runs as a Python child process (not a Node module), so the Node version has no impact on it.

**Alternatives considered**:
- **Tauri (Rust)**: Lighter binary, but `netaudio` subprocess and `ssh2` are Node.js-native; bridging both into Rust IPC would require significant rewrite with no verified benefit for a desktop tool.
- **NW.js**: Older toolchain, fewer available packages, less community momentum than Electron.

---

## R-002: SSH Library — Crestron SSH Module

**Decision**: `ssh2` npm package for interactive shell sessions.

**Rationale**:
- `ssh2` supports channel-based interactive shell sessions (`Client.shell()`), which are required to detect prompt strings (`CP4N>` and `[admin@<hostname> ~]$`), send commands, and capture streamed output.
- Pure-JavaScript with no native bindings — no `electron-rebuild` complexity.
- Actively maintained; handles keep-alive and connection error events cleanly.

**Session lifecycle** (per clarified spec FR-001/FR-002):
1. SSH session opens when the user activates the SSH Workspace panel for a Crestron device.
2. Session remains open until the workspace panel closes OR the user triggers disconnect (`BYE` for CP4, `exit` for VC4).
3. Session is workspace-scoped: closing the Electron window or selecting a different workspace terminates the session automatically.

**Alternatives considered**:
- **`node-ssh`**: Thin wrapper around `ssh2`; less control over raw shell channel needed for prompt-detection.
- **OS `ssh` subprocess via `child_process`**: Works but output parsing is fragile on Windows (no built-in OpenSSH `ssh` on older Windows 10 builds); `ssh2` handles all platforms uniformly.

---

## R-003: Dante `netaudio` Bridge

**Decision**: Python child process spawned by `DanteModule.ts` using Node.js `child_process.spawn`. Output is exchanged as newline-delimited JSON.

**Rationale**:
- `netaudio` is a Python library with no JavaScript bindings and implements a reverse-engineered Dante UDP/binary protocol — rewriting it in Node.js carries high risk.
- Spawning a Python subprocess and parsing JSON stdout is the lowest-risk integration path.
- The subprocess is owned by `DanteModule`; if it crashes, the module restarts it and reports the device as AMBER.

**Prerequisite**: Python 3.9+ must be available on the host machine. The `quickstart.md` documents this dependency and the `DanteModule` checks for it at startup, showing a configurable-path preference fallback if `python3` is not on PATH.

**Alternatives considered**:
- **REST proxy daemon wrapping `netaudio`**: Unnecessary complexity — adds a second long-running process and HTTP round-trips inside a single desktop app.
- **Rewrite in Node.js**: The Dante mDNS discovery + UDP binary control protocol is not publicly documented; `netaudio` itself is a research artifact. Risk is too high.

---

## R-004: Responsive Layout Strategy (1080p / 2K / 4K)

**Decision**: CSS custom properties (design tokens) + Flexbox + CSS Grid. No fixed pixel widths on layout containers. Tested at `window.devicePixelRatio` 1×, 1.5×, and 2×.

**Rationale**:
- Electron renders in Chromium, so all standard web responsive techniques apply.
- Design tokens (`--spacing-sm`, `--spacing-md`, `--font-scale`) are adjusted per DPR breakpoint via a `<html data-dpr="1|1.5|2">` attribute set in `main.ts` from `screen.getPrimaryDisplay().scaleFactor`.
- All panels use `min-width` / `max-width` with `vh`/`vw` sizing, preventing overflow and clipping at any resolution.
- The SSH Workspace panel uses a fixed aspect-ratio container so the terminal output area never overflows its parent.

**Breakpoints** (Electron viewport width):
| Name | Viewport Width | Typical Display |
|------|---------------|----------------|
| `compact` | < 1400 px | 1080p at 125% scale |
| `standard` | 1400–2000 px | 1080p native / 2K at 125% |
| `wide` | > 2000 px | 2K native / 4K at 125–150% |

**Alternatives considered**:
- Separate layout files per resolution: maintenance burden triples with only marginal visual benefit.
- Electron `webContents.setZoomFactor`: Scales everything uniformly, but does not allow layout reflow; persists as a Power-User preference only.

---

## R-005: Network Status Check — VPN & SSID Detection

**Decision**: `src/main/platform/network-check.ts` uses two mechanisms:

1. **IP range check** (VPN): Reads all network interfaces via Node.js `os.networkInterfaces()`. If any interface has an IPv4 address in `10.x.6.0/23` (VLan 6), the user is assumed to be on the corporate VPN.
2. **SSID check** (WiFi): Platform-specific shell command:
   - macOS: `/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I | grep SSID`
   - Windows: `netsh wlan show interfaces | findstr SSID`
   - If the connected SSID equals `MeetingRoom`, the user is on the correct WiFi segment.

A top-level `NetworkBadge` component in the status bar shows one of: `VPN` (green), `MeetingRoom WiFi` (green), `Unknown Network` (amber), `No Network` (red). It refreshes every 10 s.

**Rationale**: Both checks require no elevated privileges. SSID detection uses the same CLI tools that Electron already shells out to on each platform. Falls back gracefully to "unknown" on wired connections.

**Connection requirement per module**:
- **Zoom REST** — reachable on any internet connection (no VPN/SSID requirement).
- **LG Display, Dante, Crestron SSH** — require VPN OR MeetingRoom WiFi to reach equipment on the office LAN.

**Alternatives considered**:
- `node-wifi` npm package: Adds native bindings; breaks on Windows Arm builds.
- Pinging the gateway: Adds 50–200 ms overhead per check; gateway IP varies per location.

---

## R-006: Tooltip System

**Decision**: A single `<Tooltip>` React component wraps any interactive or labelled element. It reads `tooltipsEnabled` from the preferences store via a `usePreference` hook.

Behaviour:
- When `tooltipsEnabled: true` — renders a floating label on `mouseenter` after a 400 ms delay.
- When `tooltipsEnabled: false` — renders children directly without any tooltip wrapper overhead.
- The delay prevents tooltip flash during rapid cursor movement.
- Tooltips respect the CSS `overflow: hidden` boundary of their scroll container using a portal rendered into `document.body`.

**User preference location**: App Menu → Preferences → Interface → "Show hover tooltips" toggle (persisted via `electron-store`).

**Alternatives considered**:
- Third-party tooltip library (e.g., Floating UI): Viable, but adds a dependency for something we can implement in ~80 lines; the custom component ensures strict compliance with the preferences flag.

---

## R-007: Floor Map Implementation

**Decision**: SVG-based canvas using React state for element positions. Floor plan image rendered as an SVG `<image>` element with `preserveAspectRatio="xMidYMid meet"`.

**Rationale**:
- SVG scales perfectly at all DPR values — no pixelation at 4K.
- Draggable room rectangles and device icons are standard SVG elements with `onMouseDown`/`onMouseMove` handlers for drag interaction.
- Room positions stored as percentage-based offsets (0–100% of the floor map viewport) so they remain correct when the window is resized or displayed at a different DPR.

**Alternatives considered**:
- HTML5 Canvas: High-DPI rendering requires explicit pixel ratio scaling; React integration is more complex; SVG is simpler and more accessible.
- Konva.js / Fabric.js: Full canvas libraries — significantly over-engineered for a relatively small number of room elements per floor.

---

## R-008: Multi-Agent Build Strategy

**Decision**: Eight parallel implementation streams as documented in `plan.md § Phase 0 / R-007`.

**Critical path to integration milestone**:
```
Week 0–1:  Agent A (App Shell)  +  Agent B (Data Layer)  [in parallel; no dependencies]
Week 1–2:  Agents C–G start once Agent B delivers DeviceModule interface + SQLite schema
Week 3–4:  All agent streams converge; Agent H runs E2E tests
```

**Shared contracts** that all agents depend on (must be authored by Agent B before other agents start module work):
1. `src/main/modules/_base/DeviceModule.ts` — TypeScript interface every device module must implement.
2. `resources/device-registry.json` — canonical list of device types; modules MAY NOT be instantiated without a registry entry.
3. IPC channel names (see `contracts/ipc-channels.md`) — must be stable before renderer code consumes them.

**Rationale**: Partitioning by architectural layer (shell / data / modules / UI / E2E) minimises merge conflicts. Each stream has a well-defined input contract and output artifact, enabling true parallel work.

---

## R-009: Credential Storage

**Decision**: `keytar` npm package — Electron-compatible OS keychain wrapper (macOS Keychain, Windows Credential Manager).

**Rules** (from Constitution §VI / OWASP A02):
- No credentials stored in `electron-store`, SQLite, JSON files, or environment variables.
- All passwords (SSH admin password, Zoom OAuth tokens) are stored under the service name `av-monitoring` with account key `<device-type>:<deviceId>`.
- Credentials are read into memory only when the module opens a connection; they are not passed through IPC channels.

**Alternatives considered**:
- `safeStorage` (Electron built-in): Encrypts data using the OS credential store but stores ciphertext in `electron-store` — slightly more complex without additional benefit over `keytar`.

---

## R-010: In-App Documentation

**Decision**: Markdown files rendered using `react-markdown` in a dedicated Documentation view accessible from the App Menu → Help → Documentation.

File location: `src/renderer/menu/docs/*.md`

Each device module has its own documentation page:
- `overview.md` — system overview and hierarchy
- `zoom-module.md` — Zoom Rooms polling, OAuth, config export
- `lg-display.md` — TCP commands, poll interval configuration
- `dante.md` — mDNS discovery, subscription routing, Python prerequisite
- `crestron-ssh.md` — SSH workspace, command buttons, safety dialogues

**Alternatives considered**:
- External browser documentation: Not accessible without internet; the requirement is explicit that docs live within the app.
- PDF embedded in app: Not searchable or maintainable compared to Markdown.
