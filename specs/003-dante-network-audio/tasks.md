# Tasks: Dante Network Audio Device Monitoring and Subscription Management

**Input**: Design documents from `/specs/003-dante-network-audio/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/dante-ipc.md ✅

**Tests**: Included — Constitution Principle IV (Test-First) is NON-NEGOTIABLE.

**Organization**: Tasks grouped by user story. Each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story ([US1]–[US5])
- Exact file paths included in all descriptions

---

## Phase 1: Setup

**Purpose**: Install dependency, create directory structure, register device type.

- [X] T001 Install `multicast-dns` npm package and `@types/multicast-dns` dev dependency in `package.json`
- [X] T002 [P] Create directory structure: `src/main/modules/dante/`, `src/renderer/components/DantePanel/`, `tests/unit/dante/`, `tests/integration/dante/`
- [X] T003 [P] Add `dante-network-audio` entry to `resources/device-registry.json` with `host` (text, required) and `arcPort` (number, default 4440) config fields

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared codec, transport, and type infrastructure required by all user stories.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Create `src/main/db/migrations/005_dante.sql` with `dante_devices`, `dante_channels`, `dante_subscriptions` tables and `INSERT INTO schema_version (version) VALUES (5)` per data-model.md
- [X] T005 [P] Add all Dante IPC type definitions to `src/shared/ipc-types.ts`: `DanteScanResponse`, `DanteDeviceSnapshot`, `DanteChannelSnapshot`, `DanteDeviceGetRequest`, `DanteSubscribeRequest`, `DanteSubscribeResponse`, `DanteUnsubscribeRequest`, `DanteSettingsSetRequest`, `DanteRenameDeviceRequest`, `DanteRenameChannelRequest`, `DanteGainSetRequest`, `DanteUpdateBroadcast`
- [X] T006 [P] Implement `src/main/modules/dante/DantePacket.ts` — ARC binary codec: `buildRequest(opcode, txnId, payload)` writes 8-byte big-endian header (protocol 0x27FF, length, txnId, opcode); `parseResponse(buf)` reads 10-byte response header (protocol, length, txnId, opcode, resultCode) and returns body; include opcode constants for 0x1000/0x1001/0x1002/0x1003/0x1100/0x1101/0x2000/0x2010/0x3000/0x3010/0x3014; include pagination helpers (starting_channel field)
- [X] T007 Implement `src/main/modules/dante/DanteUdpTransport.ts` — `dgram.createSocket({ type: 'udp4' })`, `request(host, port, buf, timeoutMs)` returns `Promise<Buffer>` using txnId map; read timeout 5000ms, write timeout 10000ms (passed by caller); `send(host, port, buf)` for fire-and-forget; `close()` destroys socket
- [X] T008 [P] Implement `src/main/modules/dante/DanteDeviceCommands.ts` — packet builder functions for all opcodes: `getChannelCount(txnId)`, `getDeviceName(txnId)`, `getDeviceInfo(txnId)`, `getSettings(txnId)`, `setSettings(txnId, {sampleRate?,encoding?,latencyNs?})`, `setDeviceName(txnId, name)`, `listTxChannels(txnId, startingChannel)`, `listTxChannelNames(txnId, startingChannel)`, `listRxChannels(txnId, startingChannel)`, `addSubscription(txnId, rxChannelNum, txDeviceName, txChannelName)`, `removeSubscription(txnId, rxChannelNum)`; Settings port builders: `buildSettingsPacket(mac, commandBytes)` with 0xFFFF header + 6-byte MAC + 8-byte Audinate magic; `getGain(mac, direction, channelNum)`, `setGain(mac, direction, channelNum, gainIndex)`
- [X] T009 [P] Write failing unit tests for `DantePacket.ts` in `tests/unit/dante/DantePacket.test.ts` — encode/decode round-trip for ARC request header, response header parsing extracts txnId and resultCode, Settings packet format (0xFFFF + MAC + magic), pagination field encoding for starting_channel 0 and 16
- [X] T010 [P] Write failing unit tests for `DanteUdpTransport.ts` in `tests/unit/dante/DanteUdpTransport.test.ts` — txnId matching (mismatched txnId ignored), read timeout fires after 5s, write timeout fires after 10s, concurrent requests resolved independently

**Checkpoint**: Codec, transport, types, and migration ready — user story implementation can now begin.

---

## Phase 3: User Story 1 — Discover and Monitor Dante Devices (Priority: P1) 🎯 MVP

**Goal**: Operator sees all active Dante devices with name, IP, model, sample rate, channel counts, and LED status on demand and as devices appear/disappear.

**Independent Test**: Trigger `dante:scan` on a network with Dante devices — response includes one entry per physical device (deduplicated by MAC) with `danteName`, `ipAddress`, `model`, `sampleRate`, `txChannelCount`, `rxChannelCount`, `ledStatus`.

### Tests for User Story 1

> **Write these tests FIRST — confirm they FAIL before implementing**

- [X] T011 [P] [US1] Write failing unit tests for `DanteMdnsDiscovery.ts` in `tests/unit/dante/DanteMdnsDiscovery.test.ts` — four `_netaudio-*._udp.local` service types browsed, `device-discovered` event carries `{danteName, ipAddress, macAddress, model, sampleRate, arcPort}`, `device-removed` event fires on mDNS removal, records grouped by `.local.` hostname (same device = one entry)
- [X] T012 [P] [US1] Write failing unit tests for `DanteHeartbeatListener.ts` in `tests/unit/dante/DanteHeartbeatListener.test.ts` — multicast join on 224.0.0.233:8708, `heartbeat` event emitted per packet with MAC address, `device-offline` event emitted after 15s silence for a specific MAC, multiple devices tracked independently
- [X] T013 [P] [US1] Write failing unit tests for `DanteModule.ts` (US1 scope) in `tests/unit/dante/DanteModule.test.ts` — `connect()` starts mDNS watch, `disconnect()` tears down all listeners, `ping()` sends ARC 0x1002 probe and returns true on valid response / false on timeout, `getStatusPoints()` returns `ledStatus: 'GREY'` before first ARC query / `'GREEN'` after successful query + heartbeat / `'RED'` after 15s heartbeat silence
- [X] T014 [P] [US1] Write failing integration tests for `dante:scan` IPC in `tests/integration/dante/dante-ipc.test.ts` — returns `{ success: true, devices: [] }` on empty network, returns `DanteDeviceSnapshot[]` with all required fields, no duplicate devices for same MAC

### Implementation for User Story 1

- [X] T015 [US1] Implement `src/main/modules/dante/DanteMdnsDiscovery.ts` — use `multicast-dns` to browse `_netaudio-arc._udp.local`, `_netaudio-cmc._udp.local`, `_netaudio-dbc._udp.local`, `_netaudio-chan._udp.local`; parse SRV record for `arcPort`, TXT record for `id` (MAC), `model`, `rate` (sampleRate), `latency_ns`; parse A record for `ipAddress`; group all service records by `.local.` hostname (one `device-discovered` event per physical device); emit `device-removed` on mDNS goodbye
- [X] T016 [US1] Implement `src/main/modules/dante/DanteHeartbeatListener.ts` — `dgram.createSocket({ type: 'udp4', reuseAddr: true })`, bind `0.0.0.0:8708`, `addMembership('224.0.0.233', ifaceAddr)` for every non-internal IPv4 interface via `os.networkInterfaces()`; parse incoming packets for sub-block `0x8002` (lock state); emit `heartbeat` event with MAC; start per-MAC 15s timer, emit `device-offline` if no heartbeat received within window
- [X] T017 [US1] Implement `src/main/modules/dante/DanteModule.ts` (US1 scope) — implements `DeviceModule` interface; `connect(config)` stores config, starts `DanteMdnsDiscovery` + `DanteHeartbeatListener`, on `device-discovered` issues `DanteDeviceCommands.getDeviceName/getDeviceInfo/getChannelCount` via `DanteUdpTransport`, stores result in `Map<macAddress, DanteDeviceState>`; on `device-offline` sets `ledStatus: 'RED'`; `disconnect()` stops all listeners; `ping()` = ARC 0x1002 probe; `getStatusPoints()` returns snapshot array from in-memory map; LED rules from data-model.md
- [X] T018 [US1] Register `DanteModule` in `src/main/modules/index.ts` with static import: `import { DanteModule } from './dante/DanteModule'` and `registerModule('dante-network-audio', () => new DanteModule())`
- [X] T019 [US1] Implement `dante:scan` and `dante:update` handlers in `src/main/ipc/dante-handlers.ts` — `dante:scan`: calls module's scan trigger, upserts `dante_devices` rows keyed by `mac_address`, returns `DanteScanResponse`; wire `device-discovered`/`device-offline` events to push `dante:update` broadcast via `webContents.send`
- [X] T020 [US1] Add `dante` preload wrappers to `src/main/preload.ts` — `scan: () => ipcRenderer.invoke('dante:scan')` and `onUpdate: (cb) => { ipcRenderer.on('dante:update', cb); return () => ipcRenderer.removeListener('dante:update', cb) }`
- [X] T021 [P] [US1] Implement `src/renderer/components/DantePanel/useDanteState.ts` — `useState<DanteDeviceSnapshot[]>([])`, subscribe to `api().dante.onUpdate` on mount, expose `devices`, `scan()`, `loading`, `error`
- [X] T022 [P] [US1] Implement `src/renderer/components/DantePanel/DanteDeviceCard.tsx` — shows `danteName`, `ipAddress`, `model ?? '—'`, `sampleRate` formatted as kHz or "Unknown", `txChannelCount` TX / `rxChannelCount` RX, LED badge; if two devices share `danteName` show `macAddress` suffix
- [X] T023 [US1] Implement `src/renderer/components/DantePanel/DantePanel.tsx` — Scan button + loading spinner, error banner with message, empty state ("No Dante devices found — check mDNS is not blocked"), device list of `DanteDeviceCard`, click-to-select for detail pane; uses `useDanteState`
- [X] T024 [US1] Add `DantePanel` import and conditional render in `src/renderer/views/RoomView.tsx` for `device.type === 'dante-network-audio'`

**Checkpoint**: US1 complete — operator can discover and monitor all Dante devices independently.

---

## Phase 4: User Story 2 — Monitor Audio Subscription Routing Health (Priority: P2)

**Goal**: Operator sees per-device RX channel routing status (connected / unresolved / self-loop / unsubscribed) for all devices in a single view.

**Independent Test**: Call `dante:device:get` for a discovered device — response includes `rxChannels` array with `subscription.status` for each channel, and `ledStatus` is AMBER if any subscription is unresolved.

### Tests for User Story 2

- [X] T025 [P] [US2] Write failing unit tests for channel query and subscription mapping (US2 scope) in `tests/unit/dante/DanteModule.test.ts` — `listRxChannels` issues two ARC requests when channel count > 16 (pagination: `startingChannel` 0 then 16), subscription status bytes map to `'connected'`/`'unresolved'`/`'self-loop'`/`'unsubscribed'`, `ledStatus` becomes `'AMBER'` when any RX subscription is `'unresolved'` or `'self-loop'`
- [X] T026 [P] [US2] Write failing integration test for `dante:device:get` in `tests/integration/dante/dante-ipc.test.ts` — returns `{ success: true, device: DanteDeviceSnapshot }` with `rxChannels` array containing subscription fields

### Implementation for User Story 2

- [X] T027 [US2] Extend `src/main/modules/dante/DanteDeviceCommands.ts` with paginated channel list builders: `listTxChannels(txnId, startingChannel)` (0x2000, 32/page), `listTxChannelNames(txnId, startingChannel)` (0x2010), `listRxChannels(txnId, startingChannel)` (0x3000, 16/page); parse RX response bytes to `DanteSubscription.status` enum
- [X] T028 [US2] Extend `src/main/modules/dante/DanteModule.ts` with channel query logic — after `getChannelCount`, issue paginated TX+RX channel requests, merge names and subscription data into `DanteDeviceState.txChannels`/`rxChannels`; update `ledStatus` to `'AMBER'` if any `subscription.status` is `'unresolved'` or `'self-loop'`
- [X] T029 [US2] Add `dante:device:get` IPC handler to `src/main/ipc/dante-handlers.ts`; extend `dante:scan` handler to also upsert `dante_channels` and `dante_subscriptions` rows after channel queries complete
- [X] T030 [US2] Add `deviceGet` preload wrapper to `src/main/preload.ts`
- [X] T031 [P] [US2] Implement `src/renderer/components/DantePanel/DanteSubscriptionTable.tsx` — table columns: RX channel name, TX device, TX channel, status badge (`connected`=green, `unresolved`=amber, `self-loop`=amber, `unsubscribed`=grey); sortable by status; shows all RX channels including unsubscribed
- [X] T032 [US2] Integrate `DanteSubscriptionTable` into `src/renderer/components/DantePanel/DantePanel.tsx` — render below selected device card; refresh on `dante:update` event

**Checkpoint**: US1 + US2 complete — full routing health visible without needing to modify subscriptions.

---

## Phase 5: User Story 3 — Add and Remove Audio Routing Subscriptions (Priority: P3)

**Goal**: Operator can create a subscription (TX→RX) or remove an existing one. Creating on an already-subscribed RX channel returns a clear rejection error.

**Independent Test**: Call `dante:subscribe` with valid TX+RX — channel appears as `connected` in routing view. Call `dante:unsubscribe` — channel reverts to `unsubscribed`. Call `dante:subscribe` again on a subscribed channel — returns `{ success: false, error: 'Channel already subscribed...' }`.

### Tests for User Story 3

- [X] T033 [P] [US3] Write failing unit tests for subscribe/unsubscribe (US3 scope) in `tests/unit/dante/DanteModule.test.ts` — `sendCommand('subscribe', ...)` rejects with error when RX channel status is not `'unsubscribed'`, successful subscribe sends ARC 0x3010 packet and updates in-memory subscription, `sendCommand('unsubscribe', ...)` sends 0x3014 and sets status to `'unsubscribed'`
- [X] T034 [P] [US3] Write failing integration tests for `dante:subscribe` and `dante:unsubscribe` in `tests/integration/dante/dante-ipc.test.ts` — subscribe to already-subscribed RX returns `{ success: false, error: '...' }`, successful subscribe updates dante_subscriptions row, unsubscribe deletes dante_subscriptions row

### Implementation for User Story 3

- [X] T035 [US3] Extend `src/main/modules/dante/DanteDeviceCommands.ts` with subscription write builders: `addSubscription(txnId, rxChannelNum, txChannelName, txDeviceName)` (0x3010, binary record format from research.md), `removeSubscription(txnId, rxChannelNum)` (0x3014)
- [X] T036 [US3] Add `subscribe`/`unsubscribe` cases to `sendCommand()` in `src/main/modules/dante/DanteModule.ts` — validate RX channel exists in in-memory state, validate `subscription.status === 'unsubscribed'` before subscribe (else return `{ success: false, error: 'Channel already subscribed — remove existing subscription first' }`), send packet with 10s timeout, update in-memory state and emit broadcast trigger
- [X] T037 [US3] Implement `dante:subscribe` and `dante:unsubscribe` IPC handlers in `src/main/ipc/dante-handlers.ts` — map to `module.sendCommand`, upsert `dante_subscriptions` row on success / delete on unsubscribe
- [X] T038 [US3] Add `subscribe`/`unsubscribe` preload wrappers to `src/main/preload.ts`
- [X] T039 [P] [US3] Add subscribe form and remove button to `src/renderer/components/DantePanel/DanteSubscriptionTable.tsx` — per-row Remove button (visible only when subscribed), Add Subscription row at bottom with TX device dropdown (from `useDanteState.devices`) and TX channel name text input; show error toast on rejection; disable Add button if RX row is already subscribed

**Checkpoint**: US1–US3 complete — full read/write routing control without Dante Controller software.

---

## Phase 6: User Story 4 — View and Configure Device Settings (Priority: P4)

**Goal**: Operator reads and sets sample rate, encoding, latency. Renames device Dante name or channel names. Invalid values are rejected with allowed-values message.

**Independent Test**: Call `dante:settings:set` with `{ sampleRate: 48000 }` — `dante:device:get` returns updated `sampleRate: 48000`. Call with `sampleRate: 12000` — returns `{ success: false, error: '...' }`.

### Tests for User Story 4

- [X] T040 [P] [US4] Write failing unit tests for Settings protocol codec in `tests/unit/dante/DantePacket.test.ts` — Settings packet: 0xFFFF header, 3-byte prefix (ID + 0x00 + length), 6-byte MAC, 8-byte Audinate magic marker; `getSettings` (0x1100) decode extracts `sampleRate`/`encoding`/`latencyNs`; `setSettings` (0x1101) encodes correct bytes for each of 6 sample rates and 3 encodings
- [X] T041 [P] [US4] Write failing unit tests for settings/rename handlers in `tests/unit/dante/DanteModule.test.ts` — `setSettings` rejects `sampleRate: 12000` with message listing valid values, `setDeviceName` updates `danteName` not `displayName`, `setChannelName` with empty string sends factory-reset command, 10s write timeout enforced

### Implementation for User Story 4

- [X] T042 [US4] Extend `src/main/modules/dante/DantePacket.ts` with Settings port codec: `buildSettingsRequest(mac, commandBytes)` produces 0xFFFF header + 1-byte 0x00 + 1-byte length + 6-byte MAC + 8-byte Audinate magic + command; `parseSettingsResponse(buf)` extracts result; add `getSettings`/`setSettings`/`setDeviceName`/`setChannelName` builders using this codec
- [X] T043 [US4] Add Settings port `DanteUdpTransport` instance to `src/main/modules/dante/DanteModule.ts` — second transport on port 8700 for settings/gain; same host as ARC transport, 10s timeout for all sends
- [X] T044 [US4] Add `setSettings`/`setDeviceName`/`setChannelName` cases to `sendCommand()` in `src/main/modules/dante/DanteModule.ts` — validate sampleRate in `{44100,48000,88200,96000,176400,192000}`, encoding in `{16,24,32}`; send via settings transport; update in-memory state on success
- [X] T045 [US4] Implement `dante:settings:set`, `dante:rename:device`, `dante:rename:channel` IPC handlers in `src/main/ipc/dante-handlers.ts` — 10s write timeout, update `dante_devices.dante_name` or `dante_channels.channel_name`/`factory_name` on success
- [X] T046 [US4] Add `settingsSet`/`renameDevice`/`renameChannel` preload wrappers to `src/main/preload.ts`
- [X] T047 [P] [US4] Implement `src/renderer/components/DantePanel/DanteSettingsForm.tsx` — sample rate `<select>` (6 values), encoding `<select>` (16/24/32 bit), latency number input (display ms, convert to ns: value × 1,000,000), device rename text + Reset button (empty string = factory default), shows active-subscriptions warning when changing sample rate
- [X] T048 [US4] Integrate `DanteSettingsForm` into `src/renderer/components/DantePanel/DantePanel.tsx` in collapsible "Device Settings" section; channel rename inline inputs in `DanteSubscriptionTable`

**Checkpoint**: US1–US4 complete — full device configuration and rename without Dante Controller software.

---

## Phase 7: User Story 5 — Monitor AVIO Analog I/O Gain Levels (Priority: P5)

**Goal**: For AVIO devices only, operator reads and sets per-channel input/output gain. Non-AVIO devices show no gain controls.

**Independent Test**: For an AVIO device, call `dante:gain:set` with `{ direction: 'rx', channelNum: 1, gainLevel: '+4 dBu' }` — `dante:device:get` returns channel with `gainLevel: '+4 dBu'`. Same call on non-AVIO device returns `{ success: false, error: '...' }`.

### Tests for User Story 5

- [X] T049 [P] [US5] Write failing unit tests for AVIO gain handlers in `tests/unit/dante/DanteModule.test.ts` — `gainSet` on non-AVIO device returns `{ success: false, error: 'Device is not an AVIO adaptor' }`, input gain rejects `'+18 dBu'` (output-only value), output gain rejects `'+24 dBu'` (input-only value), valid gain sends Settings port packet and updates in-memory `gainLevel`

### Implementation for User Story 5

- [X] T050 [US5] Extend `src/main/modules/dante/DanteDeviceCommands.ts` with AVIO gain packet builders for Settings port 8700: `readGain(mac, direction, channelNum)`, `writeGain(mac, direction, channelNum, gainIndex)` where gainIndex is ordinal position in allowed-values enum per direction
- [X] T051 [US5] Add `gainSet` case to `sendCommand()` in `src/main/modules/dante/DanteModule.ts` — validate `device.isAvio`, validate `gainLevel` in direction-appropriate set (inputs: `['+24 dBu','+4 dBu','0 dBu','0 dBV','-10 dBV']`; outputs: `['+18 dBu','+4 dBu','0 dBu','0 dBV','-10 dBV']`), send via settings transport, update `DanteChannel.gainLevel`
- [X] T052 [US5] Implement `dante:gain:set` IPC handler in `src/main/ipc/dante-handlers.ts` — reject non-AVIO (from `dante_devices.is_avio`), update `dante_channels.gain_level` on success
- [X] T053 [US5] Add `gainSet` preload wrapper to `src/main/preload.ts`
- [X] T054 [P] [US5] Add AVIO gain controls to `src/renderer/components/DantePanel/DantePanel.tsx` — render per-channel gain `<select>` only when `device.isAvio === true`; RX (input) channels show input gain options; TX (output) channels show output gain options; section hidden entirely for non-AVIO devices

**Checkpoint**: All 5 user stories complete and independently testable.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T055 Implement `src/main/modules/dante/DanteNotificationListener.ts` — `dgram` multicast on 224.0.0.231:8702, parse topology-change sub-blocks (routing changed, sample rate changed, device reboot, AES67 status), emit targeted `device-changed` event with MAC address to trigger per-device ARC re-query
- [X] T056 [P] Wire `DanteNotificationListener` into `src/main/modules/dante/DanteModule.ts` and `src/main/ipc/dante-handlers.ts` — on `device-changed` event re-query that device's channels/subscriptions and push `dante:update` broadcast
- [X] T057 [P] Add structured event logging throughout `src/main/modules/dante/DanteModule.ts` and `src/main/ipc/dante-handlers.ts` — log device discovered (MAC, IP, name), device offline (MAC, last-seen), subscription added/removed, settings changed (field+value), rename completed, scan complete (device count + elapsed ms); all with ISO-8601 timestamp and source tag
- [X] T058 [P] Windows multicast fix in `src/main/modules/dante/DanteHeartbeatListener.ts` and `DanteNotificationListener.ts` — enumerate `os.networkInterfaces()` for all non-internal IPv4 interfaces and call `socket.addMembership(group, ifaceAddr)` on each interface address
- [X] T059 Run `.specify/scripts/bash/update-agent-context.sh claude` to update `CLAUDE.md` with Dante module entry

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — first story, no US dependencies
- **US2 (Phase 4)**: Depends on Phase 2 + US1 (channel query extends DanteModule from US1)
- **US3 (Phase 5)**: Depends on Phase 2 + US2 (subscription write extends US2's channel state)
- **US4 (Phase 6)**: Depends on Phase 2 + US1 (settings extend DanteModule; independent of US2/US3)
- **US5 (Phase 7)**: Depends on Phase 2 + US1 + US4 (gain uses Settings transport from US4)
- **Polish (Phase 8)**: Depends on all user stories

### User Story Dependencies

```
Phase 2 (Foundational)
    └── US1 (P1) ─┬── US2 (P2) ── US3 (P3)
                  └── US4 (P4) ── US5 (P5)
```

US2 and US4 can be worked in parallel after US1. US3 needs US2. US5 needs US4.

### Within Each User Story

1. Write tests (all marked [P] within story — write in parallel)
2. Confirm tests FAIL (red phase)
3. Implement (sequential where noted, parallel where marked [P])
4. Confirm tests PASS (green phase)
5. Refactor if needed

---

## Parallel Execution Examples

### Phase 2 (Foundational)
```
Parallel: T005, T006, T008, T009, T010
Sequential after T006+T007: T007 depends on DantePacket constants
```

### Phase 3 (US1)
```
Parallel tests:  T011, T012, T013, T014
Parallel impl:   T021, T022 (renderer — independent of main-process work)
Sequential impl: T015 → T016 → T017 → T018 → T019 → T020 → T023 → T024
```

### Phase 4 (US2)
```
Parallel tests:  T025, T026
Parallel impl:   T031 (renderer — independent of T027/T028/T029)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004–T010)
3. Complete Phase 3: User Story 1 (T011–T024)
4. **STOP and VALIDATE**: mDNS discovers real Dante devices, scan returns correct data, LED statuses correct, panel renders in RoomView
5. Demo to stakeholders

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. + US1 → device inventory (MVP)
3. + US2 → routing health visibility
4. + US3 → routing control (full operator workflow)
5. + US4 → device configuration
6. + US5 → AVIO gain control (complete feature)

---

## Notes

- MAC address is the stable device identity key — all upserts in `dante_devices` use `mac_address` as the conflict target
- Display name (opcode 0x1003) is read-only — `dante:rename:device` only sets the Dante name (opcode 0x1001)
- Subscription conflict: `dante:subscribe` MUST reject if RX channel status ≠ `'unsubscribed'`
- ARC port read from mDNS SRV record — do not hardcode 4440 per device
- Settings port (8700) requires MAC address in every packet — retrieve from `dante_devices.mac_address`
- Write timeout is 10s (SC-003); read timeout is 5s (SC-004)
- [P] = different files, safe to parallelize; omitting [P] means sequential dependency on previous task in same phase
