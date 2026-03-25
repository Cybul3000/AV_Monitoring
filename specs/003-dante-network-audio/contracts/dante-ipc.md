# IPC Channel Contracts — Dante Network Audio Module (spec 003)

*Phase 1 design artifact. Extends `specs/001-av-room-monitor/contracts/ipc-channels.md`.*

All Dante-specific IPC channels are prefixed `dante:`. They supplement the existing `device:status:all` push broadcast (which continues to carry LED status for Dante device records). All TypeScript types below belong in `src/shared/ipc-types.ts`.

---

## `dante:scan` — Request/reply

**Direction**: renderer → main
**Purpose**: Trigger an mDNS discovery scan and ARC queries for all discovered devices. Returns the full current snapshot after the scan completes.
**Request**: `{}` (no payload)
**Response**:
```typescript
type DanteScanResponse = {
  success: boolean;
  devices: DanteDeviceSnapshot[];
  error?: string;
};

type DanteDeviceSnapshot = {
  id: string;                    // app UUID (dante_devices.id)
  deviceId: string;              // FK to devices table
  danteName: string;
  displayName: string | null;
  model: string | null;
  ipAddress: string;
  macAddress: string | null;
  sampleRate: number | null;
  encoding: number | null;
  latencyNs: number | null;
  txChannelCount: number;
  rxChannelCount: number;
  isAvio: boolean;
  ledStatus: 'GREEN' | 'AMBER' | 'RED' | 'GREY';
  txChannels: DanteChannelSnapshot[];
  rxChannels: DanteChannelSnapshot[];
};

type DanteChannelSnapshot = {
  channelNumber: number;
  channelName: string;
  direction: 'tx' | 'rx';
  gainLevel: string | null;
  subscription?: {
    txDeviceName: string;
    txChannelName: string;
    status: 'connected' | 'unresolved' | 'self-loop' | 'unsubscribed';
  };
};
```

---

## `dante:device:get` — Request/reply

**Direction**: renderer → main
**Purpose**: Get the current snapshot for a single Dante device (by app device ID).
**Request**:
```typescript
type DanteDeviceGetRequest = { deviceId: string };
```
**Response**: `{ success: boolean; device: DanteDeviceSnapshot | null; error?: string }`

---

## `dante:subscribe` — Request/reply

**Direction**: renderer → main
**Purpose**: Create or replace an audio routing subscription on an RX channel.
**Request**:
```typescript
type DanteSubscribeRequest = {
  rxDeviceId:    string;   // app UUID of the receive device
  rxChannelNum:  number;   // 1-indexed channel number
  txDeviceName:  string;   // Dante name of the transmit device
  txChannelName: string;   // Dante channel name to subscribe to
};
```
**Response**:
```typescript
type DanteSubscribeResponse = {
  success: boolean;
  status?: 'connected' | 'unresolved';  // result after command issued
  error?: string;
};
```

---

## `dante:unsubscribe` — Request/reply

**Direction**: renderer → main
**Purpose**: Remove the subscription from an RX channel.
**Request**:
```typescript
type DanteUnsubscribeRequest = {
  rxDeviceId:   string;
  rxChannelNum: number;
};
```
**Response**: `{ success: boolean; error?: string }`

---

## `dante:settings:set` — Request/reply

**Direction**: renderer → main
**Purpose**: Update device-level settings (sample rate, encoding, latency).
**Request**:
```typescript
type DanteSettingsSetRequest = {
  deviceId:    string;
  sampleRate?: 44100 | 48000 | 88200 | 96000 | 176400 | 192000;
  encoding?:   16 | 24 | 32;
  latencyNs?:  number;
};
```
**Response**: `{ success: boolean; error?: string }`

---

## `dante:rename:device` — Request/reply

**Direction**: renderer → main
**Purpose**: Rename a Dante device or reset its name to the factory default.
**Request**:
```typescript
type DanteRenameDeviceRequest = {
  deviceId:    string;
  newName:     string;    // pass empty string to reset to factory default
};
```
**Response**: `{ success: boolean; error?: string }`

---

## `dante:rename:channel` — Request/reply

**Direction**: renderer → main
**Purpose**: Rename a TX or RX channel or reset to factory default.
**Request**:
```typescript
type DanteRenameChannelRequest = {
  deviceId:     string;
  direction:    'tx' | 'rx';
  channelNum:   number;
  newName:      string;    // pass empty string to reset to factory default
};
```
**Response**: `{ success: boolean; error?: string }`

---

## `dante:gain:set` — Request/reply

**Direction**: renderer → main
**Purpose**: Set the analog gain level on an AVIO channel.
**Request**:
```typescript
type DanteGainSetRequest = {
  deviceId:    string;
  direction:   'tx' | 'rx';
  channelNum:  number;
  gainLevel:   '+24 dBu' | '+18 dBu' | '+4 dBu' | '0 dBu' | '0 dBV' | '-10 dBV';
};
```
**Response**: `{ success: boolean; error?: string }`

---

## `dante:update` — Push broadcast

**Direction**: main → renderer
**Trigger**: After any scan, heartbeat timeout, or subscription/settings change
**Purpose**: Push updated device snapshots to any open Dante panel without requiring a full re-scan.
**Payload**:
```typescript
type DanteUpdateBroadcast = {
  timestamp: string;                      // ISO-8601
  devices: DanteDeviceSnapshot[];         // all devices in current in-memory state
};
```

---

## Preload additions (`src/main/preload.ts`)

```typescript
dante: {
  scan:            ()                         => Promise<DanteScanResponse>,
  deviceGet:       (req: DanteDeviceGetRequest)    => Promise<...>,
  subscribe:       (req: DanteSubscribeRequest)    => Promise<DanteSubscribeResponse>,
  unsubscribe:     (req: DanteUnsubscribeRequest)  => Promise<...>,
  settingsSet:     (req: DanteSettingsSetRequest)  => Promise<...>,
  renameDevice:    (req: DanteRenameDeviceRequest) => Promise<...>,
  renameChannel:   (req: DanteRenameChannelRequest)=> Promise<...>,
  gainSet:         (req: DanteGainSetRequest)      => Promise<...>,
  onUpdate:        (cb: (payload: DanteUpdateBroadcast) => void) => () => void,
}
```
