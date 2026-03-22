# IPC Channel Contracts — AV Monitoring Desktop Application

*Phase 1 design artifact. Defines all Electron main ↔ renderer IPC channels.*

All channels use `ipcMain.handle` (request/reply) or `webContents.send` (push broadcast) as noted. Renderer uses `ipcRenderer.invoke` for request/reply and `ipcRenderer.on` for push.

All TypeScript types referenced below are in `src/shared/ipc-types.ts`.

---

## Device Channels

### `device:status:all` — Push broadcast

**Direction**: main → renderer  
**Trigger**: Every polling tick (configurable interval per device) and on-demand after a command completes  
**Payload**:
```typescript
type DeviceStatusBroadcast = {
  timestamp: string;           // ISO-8601
  statuses: {
    deviceId: string;
    status: 'GREEN' | 'AMBER' | 'RED' | 'GREY';
    lastSeen: string | null;
    meta?: Record<string, unknown>;
  }[];
  hierarchy: {
    rooms:   Record<string, 'GREEN' | 'AMBER' | 'RED' | 'GREY'>;
    floors:  Record<string, 'GREEN' | 'AMBER' | 'RED' | 'GREY'>;
    offices: Record<string, 'GREEN' | 'AMBER' | 'RED' | 'GREY'>;
    regions: Record<string, 'GREEN' | 'AMBER' | 'RED' | 'GREY'>;
  };
};
```

---

### `device:command` — Request/reply

**Direction**: renderer → main  
**Purpose**: Execute any named command on a device module  
**Request**:
```typescript
type DeviceCommandRequest = {
  deviceId: string;
  command: string;
  params?: Record<string, unknown>;
};
```
**Response**:
```typescript
type DeviceCommandResponse = {
  success: boolean;
  output?: string;
  error?: string;
};
```

---

### `device:ping` — Request/reply

**Direction**: renderer → main  
**Purpose**: Trigger an immediate out-of-cycle status poll for one device  
**Request**: `{ deviceId: string }`  
**Response**: `DeviceStatus` (see data-model.md)

---

## SSH Channels (Crestron SSH Module)

### `ssh:open` — Request/reply

**Direction**: renderer → main  
**Purpose**: Open an SSH session for a Crestron device; idempotent (returns current state if already open)  
**Request**: `{ deviceId: string }`  
**Response**:
```typescript
type SSHOpenResponse = {
  success: boolean;
  sessionState: 'CONNECTING' | 'READY' | 'ERROR';
  error?: string;
};
```

---

### `ssh:close` — Request/reply

**Direction**: renderer → main  
**Purpose**: Gracefully close the SSH session (sends disconnect command then closes the channel)  
**Request**: `{ deviceId: string }`  
**Response**: `{ success: boolean; error?: string }`

---

### `ssh:send` — Request/reply

**Direction**: renderer → main  
**Purpose**: Send a raw command string through the open SSH session  
**Request**:
```typescript
type SSHSendRequest = {
  deviceId: string;
  command: string;   // raw command string, e.g. "PROGSTATUS" or "REBOOT"
};
```
**Response**: `{ success: boolean; error?: string }` — response does NOT include output; output is pushed via `ssh:output`

---

### `ssh:output` — Push broadcast

**Direction**: main → renderer  
**Trigger**: Any time data arrives on the SSH shell channel  
**Payload**:
```typescript
type SSHOutput = {
  deviceId: string;
  data: string;       // raw output chunk from the SSH shell
  timestamp: string;  // ISO-8601
};
```

---

### `ssh:state` — Push broadcast

**Direction**: main → renderer  
**Trigger**: SSH session state changes  
**Payload**:
```typescript
type SSHStateChange = {
  deviceId: string;
  state: 'CONNECTING' | 'READY' | 'BUSY' | 'CLOSED' | 'ERROR';
  reason?: string;    // human-readable reason for ERROR state
};
```

---

## Configuration Channels

### `config:export` — Request/reply

**Direction**: renderer → main  
**Purpose**: Download the current device configuration and save it as a versioned JSON file  
**Request**: `{ deviceId: string; savePath?: string }` — if `savePath` omitted, main process shows a save dialog  
**Response**: `{ success: boolean; filePath?: string; version?: number; error?: string }`

---

### `config:import` — Request/reply

**Direction**: renderer → main  
**Purpose**: Restore a previously exported configuration to the device  
**Request**:
```typescript
type ConfigImportRequest = {
  deviceId: string;
  configJson: string;   // JSON string of the config to restore
};
```
**Response**: `{ success: boolean; error?: string }`

---

### `config:list` — Request/reply

**Direction**: renderer → main  
**Purpose**: List saved configuration snapshots for a device  
**Request**: `{ deviceId: string }`  
**Response**:
```typescript
type ConfigListResponse = {
  configs: {
    id: string;
    version: number;
    exportedAt: string;
    note?: string;
  }[];
};
```

---

## Network Channels

### `network:status` — Push broadcast

**Direction**: main → renderer  
**Trigger**: Every 10 seconds, and immediately on network interface change  
**Payload**:
```typescript
type NetworkStatus = {
  vpnActive: boolean;       // true if any interface has IP in 10.x.6.0/23
  ssidMatch: boolean;       // true if connected SSID === 'MeetingRoom'
  currentSsid: string | null;
  timestamp: string;        // ISO-8601
};
```

---

### `network:get` — Request/reply

**Direction**: renderer → main  
**Purpose**: Request current network status on demand (e.g., on view load)  
**Request**: `{}`  
**Response**: `NetworkStatus` (same type as push broadcast payload)

---

## Log Channels

### `log:download` — Request/reply

**Direction**: renderer → main  
**Purpose**: Export all events from SQLite to a structured file  
**Request**: `{ format: 'json' | 'csv'; savePath?: string }` — if `savePath` omitted, shows save dialog  
**Response**: `{ success: boolean; filePath?: string; rowCount?: number; error?: string }`

---

### `log:query` — Request/reply

**Direction**: renderer → main  
**Purpose**: Query recent events for display in the Logs view  
**Request**:
```typescript
type LogQueryRequest = {
  deviceId?: string;
  roomId?: string;
  severity?: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  since?: string;     // ISO-8601; defaults to last 24 h
  limit?: number;     // defaults to 500
};
```
**Response**:
```typescript
type LogQueryResponse = {
  events: {
    id: string;
    deviceId: string | null;
    roomId: string | null;
    severity: string;
    message: string;
    occurredAt: string;
  }[];
};
```

---

## Preference Channels

### `preferences:get` — Request/reply

**Direction**: renderer → main  
**Request**: `{ key: string }`  
**Response**: `{ value: unknown }`

---

### `preferences:set` — Request/reply

**Direction**: renderer → main  
**Request**: `{ key: string; value: unknown }`  
**Response**: `{ success: boolean }`

---

### `preferences:getAll` — Request/reply

**Direction**: renderer → main  
**Request**: `{}`  
**Response**: `{ preferences: Record<string, unknown> }`

---

## Hierarchy / Registry Channels

### `hierarchy:get` — Request/reply

**Direction**: renderer → main  
**Purpose**: Fetch full hierarchy tree (used on initial load and after edits)  
**Request**: `{}`  
**Response**:
```typescript
type HierarchyNode = {
  id: string;
  name: string;
  type: 'region' | 'office' | 'floor' | 'room' | 'device';
  ledStatus: 'GREEN' | 'AMBER' | 'RED' | 'GREY';
  children?: HierarchyNode[];
};
type HierarchyResponse = { roots: HierarchyNode[] };
```

---

### `hierarchy:update` — Request/reply

**Direction**: renderer → main  
**Purpose**: Create / update / delete a node in the hierarchy (rooms, devices, floors, etc.)  
**Request**:
```typescript
type HierarchyUpdateRequest = {
  action: 'create' | 'update' | 'delete';
  type: 'region' | 'office' | 'floor' | 'room' | 'device';
  id?: string;            // required for update/delete
  parentId?: string;      // required for create
  data?: Record<string, unknown>;
};
```
**Response**: `{ success: boolean; id?: string; error?: string }`

---

## OTel Channels

### `otel:generateConfig` — Request/reply

**Direction**: renderer → main  
**Purpose**: Generate an OTel collector YAML config for New Relic ingest  
**Request**: `{ savePath?: string }`  
**Response**: `{ success: boolean; filePath?: string; yaml?: string; error?: string }`

---

## Security Notes

- Credentials (SSH passwords, OAuth tokens) are NEVER passed through any IPC channel. Modules load them directly from the OS keychain using `keytar` in the main process.
- IPC handlers validate all incoming payloads (check for unexpected keys, type-check required fields) before acting on them. Malformed requests return `{ success: false, error: 'Invalid payload' }`.
- Context isolation is enabled on the `BrowserWindow`. A `contextBridge`-based preload script exposes only the above typed channels — the renderer has no direct access to Node.js APIs.
