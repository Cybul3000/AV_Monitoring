# Quickstart — AV Monitoring Desktop Application

*Phase 1 design artifact. Developer onboarding and environment setup.*

---

## Prerequisites

| Requirement | Version | Notes |
|------------|---------|-------|
| Node.js | 20 LTS | <https://nodejs.org/en/download/> — use `nvm` or `fnm` to manage versions |
| Python | 3.9+ | Required for Dante module only (`netaudio` package); macOS ships Python 3 from Xcode CLT; Windows: <https://python.org> |
| Git | Any recent | For branch checkouts |
| macOS | 12+ | For macOS builds and E2E tests |
| Windows | 10+ | For Windows builds and E2E tests |

### Python Setup (Dante module)

```bash
# Install netaudio globally or in a venv
pip3 install netaudio

# Verify
python3 -c "import netaudio; print('ok')"
```

If `python3` is not on your PATH, set the path in app preferences:  
**App Menu → Preferences → Modules → Python Executable**

---

## Install

```bash
# Clone the repository
git clone <repo-url>
cd av-monitoring

# Install Node.js dependencies
npm install

# (Electron native modules are rebuilt automatically by install script)
# If you see a sqlite3 or keytar error, run manually:
npm run rebuild:native
```

---

## Development

```bash
# Start the app in development mode (Electron + Vite HMR)
npm run dev
```

This launches:
- Vite dev server for the renderer (React HMR)
- Electron main process with `--inspect` for Node.js DevTools

Open Electron DevTools: **View → Toggle Developer Tools** in the app menu, or `Ctrl+Shift+I` / `Cmd+Option+I`.

---

## Testing

```bash
# Unit + integration tests (Vitest)
npm run test

# Watch mode
npm run test:watch

# With coverage report
npm run test:coverage

# E2E tests (Playwright — requires a built app or dev server running)
npm run test:e2e

# E2E on a specific platform (run from that platform)
npm run test:e2e -- --project=mac
npm run test:e2e -- --project=windows
```

**Test-First Rule (§IV)**: All implementation must follow Red → Green → Refactor. Write failing tests before implementing any feature. The `npm run test` command must pass before any PR is opened.

---

## Build

```bash
# macOS code-signed app bundle (.dmg)
npm run build:mac

# Windows installer (.exe via NSIS)
npm run build:win

# Both platforms (requires macOS with Rosetta for cross-compile)
npm run build:all
```

Build output goes to `dist/`.

---

## Project Structure (Quick Reference)

```
av-monitoring/
├── src/
│   ├── main/          # Electron main process (Node.js / TypeScript)
│   └── renderer/      # React renderer (TypeScript + CSS)
├── resources/
│   └── device-registry.json   ← MUST exist before any module work
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── specs/             # Feature specifications and plans
```

See `specs/004-crestron-ssh-control/plan.md` for the full source tree.

---

## First-Run Setup

On first launch, the app guides the user through:

1. **Hierarchy setup**: Create at least one Region → Office → Floor → Room.
2. **Device registry**: Device types are loaded automatically from `resources/device-registry.json`.
3. **Add a device**: In a Room detail view → "Add Device" → select type → fill connection fields → credentials are stored in the OS keychain.
4. **Network check**: The status bar shows VPN / MeetingRoom WiFi status. LAN-based devices (LG, Dante, Crestron) require VPN or MeetingRoom WiFi.

---

## Adding a New Device Module

1. Add an entry to `resources/device-registry.json` (see `data-model.md` for schema).
2. Create `src/main/modules/<module-name>/` containing:
   - `<ModuleName>Module.ts` implementing the `DeviceModule` interface
   - `<ModuleName>.test.ts` with unit tests
3. Register the module in `src/main/modules/index.ts`.
4. Add IPC client hooks in the renderer if the module exposes custom commands beyond `DeviceModule.sendCommand`.
5. Add documentation under `src/renderer/menu/docs/<module-name>.md`.
6. Add Playwright E2E smoke test covering: connect → poll → status GREEN → disconnect.

---

## SSH Workspace (Crestron)

To test the Crestron SSH module locally without real hardware:

```bash
# Start a local test SSH server (requires Docker)
docker run -d -p 2222:22 --name crestron-mock \
  -e SSH_ALLOW_USER="admin:admin" \
  linuxserver/openssh-server

# In app preferences: set device host to 127.0.0.1, port 2222, username admin, password admin, type CP4
```

The mock server does not emulate Crestron prompts. For full prompt-detection testing, a real CP4 or VC4 is required. Unit tests use a mock SSH channel that injects prompt strings.

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `development` | Set to `production` in builds |
| `AV_MON_LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `AV_MON_DB_PATH` | OS app data dir | Override SQLite database file location |
| `AV_MON_PYTHON` | `python3` | Override Python executable path (Dante module) |

---

## Multi-Agent Build — Getting Started

See `plan.md § R-008` for the full agent work-stream breakdown. To start work as a specific agent:

| Agent | First Task | File to start with |
|-------|-----------|-------------------|
| **A — App Shell** | Electron bootstrap, window + menu | `src/main/index.ts` |
| **B — Data Layer** | SQLite schema + DeviceModule interface | `src/main/db/migrations/001_initial.sql` + `src/main/modules/_base/DeviceModule.ts` |
| **C — Zoom Module** | ZoomModule.ts + tests | `src/main/modules/zoom/ZoomModule.ts` |
| **D — LG Module** | LGDisplayModule.ts + tests | `src/main/modules/lg-display/LGDisplayModule.ts` |
| **E — Dante Module** | DanteModule.ts + subprocess bridge | `src/main/modules/dante/DanteModule.ts` |
| **F — Crestron SSH** | CrestronSSHModule.ts + SSHWorkspace UI | `src/main/modules/crestron-ssh/CrestronSSHModule.ts` |
| **G — Hierarchy UI** | GlobalDashboard + navigation shell | `src/renderer/views/GlobalDashboard.tsx` |
| **H — E2E** | Playwright config + first smoke test | `tests/e2e/playwright.config.ts` |

**Agents C–H must not start** until Agent B has merged `DeviceModule.ts` and `device-registry.json`.

---

## Useful Commands

```bash
# Lint and type-check
npm run lint
npm run typecheck

# Format code
npm run format

# Regenerate OTel config example (uses current preferences)
npm run otel:generate-example

# Export current database schema as SQL
npm run db:schema

# Rebuild native modules after Node version change
npm run rebuild:native
```
