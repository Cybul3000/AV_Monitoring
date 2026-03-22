# AV_Monitoring Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-22

## Active Technologies

- Node.js 20 LTS (main process), TypeScript 5.x (renderer + modules) + Electron 30+, React 18 (renderer UI), `ssh2` (SSH sessions), `axios` (Zoom REST), `netaudio` Python subprocess bridge (Dante), custom TCP client (LG Display), `better-sqlite3` (local persistence), `electron-store` (preferences), `electron-log` (structured logging) (004-crestron-ssh-control)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

Node.js 20 LTS (main process), TypeScript 5.x (renderer + modules): Follow standard conventions

## Recent Changes

- 004-crestron-ssh-control: Added Node.js 20 LTS (main process), TypeScript 5.x (renderer + modules) + Electron 30+, React 18 (renderer UI), `ssh2` (SSH sessions), `axios` (Zoom REST), `netaudio` Python subprocess bridge (Dante), custom TCP client (LG Display), `better-sqlite3` (local persistence), `electron-store` (preferences), `electron-log` (structured logging)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
