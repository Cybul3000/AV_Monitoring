# AV_Monitoring Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-22

## Active Technologies
- TypeScript 5.x — Electron 30 (main process, Node.js 20 LTS) + React 18 (renderer) + `electron` 30, `react` 18, `ssh2` 1.x, `better-sqlite3` 9.x, `electron-store` 9.x, `keytar`, `vite` (renderer HMR) (004-crestron-ssh-control)
- SQLite (local, `better-sqlite3`) — device registry, device configs, events audit log (004-crestron-ssh-control)
- TypeScript 5.x — Electron 30 (main process, Node.js 20 LTS) + React 18 (renderer) + `electron` 30, `react` 18, `ssh2` 1.x (SSH transport — already in stack), Node.js `net` (Telnet fallback), `better-sqlite3` 9.x, `electron-store` 9.x, `keytar`, `vite` (renderer HMR) (006-biamp-tesira-dsp)
- SQLite (local, `better-sqlite3`) — device records, events audit log, biamp_block_configs, biamp_preset_configs (006-biamp-tesira-dsp)
- Node.js `net.Socket` (no npm package) — raw TCP LW3 protocol, port 6107 (005-lightware-matrix-switcher)
- SQLite (local, `better-sqlite3`) — device records, events audit log (005-lightware-matrix-switcher)

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
- 006-biamp-tesira-dsp: Added TTP over SSH/Telnet, Node.js `net` (Telnet fallback), quasi-JSON parser, biamp_block_configs + biamp_preset_configs tables
- 005-lightware-matrix-switcher: Added LW3 raw TCP transport, Node.js `net.Socket`, device-family detection (MX2 vs MMX/MODEX)
- 004-crestron-ssh-control: Added TypeScript 5.x — Electron 30 (main process, Node.js 20 LTS) + React 18 (renderer) + `electron` 30, `react` 18, `ssh2` 1.x, `better-sqlite3` 9.x, `electron-store` 9.x, `keytar`, `vite` (renderer HMR)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
