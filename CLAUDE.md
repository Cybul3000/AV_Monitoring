# AV_Monitoring Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-25

## Active Technologies
- TypeScript 5.x — Electron 30 (main process, Node.js 20 LTS) + React 18 (renderer) + `electron` 30, `react` 18, `ssh2` 1.x, `better-sqlite3` 9.x, `electron-store` 9.x, `keytar`, `vite` (renderer HMR) (004-crestron-ssh-control)
- SQLite (local, `better-sqlite3`) — device registry, device configs, events audit log (004-crestron-ssh-control)
- TypeScript 5.x — Electron 30 (main process, Node.js 20 LTS) + React 18 (renderer) + `electron` 30, `react` 18, `ssh2` 1.x (SSH transport — already in stack), Node.js `net` (Telnet fallback), `better-sqlite3` 9.x, `electron-store` 9.x, `keytar`, `vite` (renderer HMR) (006-biamp-tesira-dsp)
- SQLite (local, `better-sqlite3`) — device records, events audit log, biamp_block_configs, biamp_preset_configs (006-biamp-tesira-dsp)
- Node.js `net.Socket` (no npm package) — raw TCP LW3 protocol, port 6107 (005-lightware-matrix-switcher)
- SQLite (local, `better-sqlite3`) — device records, events audit log (005-lightware-matrix-switcher)
- TypeScript 5.x (Electron 30 main process, Node.js 20 LTS) + `multicast-dns` (new, npm) + `dgram` / `Buffer` / `os` (built-in Node.js) (003-dante-network-audio)
- SQLite (`better-sqlite3`) — migration `005_dante.sql` adds `dante_devices`, `dante_channels`, `dante_subscriptions` (003-dante-network-audio)
- TypeScript 5.x (Electron 30 main process, Node.js 20 LTS) + Node.js `net.Socket` (built-in) — no new npm packages (002-lg-pro-display)
- SQLite (`better-sqlite3`) — shared `devices` table; no dedicated migration needed (002-lg-pro-display)

## Project Structure

```text
src/
tests/
```

## Commands

# Add commands for 

## Code Style

: Follow standard conventions

## Recent Changes
- 002-lg-pro-display: Added TypeScript 5.x (Electron 30 main process, Node.js 20 LTS) + Node.js `net.Socket` (built-in) — no new npm packages
- 003-dante-network-audio: Completed US2–US5 — subscription management (ARC 0x3010/0x3014), settings validation (6 sample rates, 3 encodings), device/channel rename (ARC 0x1001), AVIO gain (Settings port 8700), DanteNotificationListener (multicast 224.0.0.231:8702), all IPC handlers (dante:subscribe, dante:unsubscribe, dante:settings:set, dante:rename:device, dante:rename:channel, dante:gain:set), renderer components (DanteSubscriptionTable, DanteSettingsForm); all 273 tests passing
- 003-dante-network-audio: Added TypeScript 5.x (Electron 30 main process, Node.js 20 LTS) + `multicast-dns` (new, npm) + `dgram` / `Buffer` / `os` (built-in Node.js)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
