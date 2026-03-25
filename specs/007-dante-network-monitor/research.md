# Research — Dante Network Monitor Refactor (spec 007)

*Phase 0 output. Resolves all design decisions needed before implementation.*

---

## R-001 Singleton-Gateway Pattern

**Decision**: One `devices` table row represents the entire Dante network for a room. All discovered Dante endpoints are stored in `dante_devices`, each with a `device_id` FK pointing to that single Dante Network gateway row.

**Rationale**: Dante discovery is inherently network-wide (mDNS broadcasts). There is no upfront knowledge of which endpoints exist — they are found dynamically. Creating one `devices` row per endpoint would require inserting into `devices` at discovery time, bypassing the Config UI and breaking the device registry contract (Principle V). The gateway row is the anchor; `dante_devices` is the ephemeral discovered inventory.

**Alternatives considered**:
- *One `devices` row per discovered endpoint*: Rejected — requires dynamic `INSERT` into `devices` at discovery time, which conflicts with the Config-UI-managed device registry and creates FK linkage complexity.
- *No `devices` row at all for Dante*: Rejected — the module must integrate with the polling loop, `startPolling()`, LED aggregation, and `broadcastStatus()`, all of which assume a `devices` table row. Removing it would require forking the polling infrastructure.

---

## R-002 `devices.host` for the Gateway Row

**Decision**: The `devices.host` column stores the network interface name (e.g., `"en0"`, `"eth0"`) for the Dante gateway row. An empty string `""` means "use all interfaces". The `devices.host NOT NULL` constraint is satisfied with either a name or an empty string.

**Rationale**: `devices.host TEXT NOT NULL` cannot be null. An empty string is the correct semantic for "no specific host — this is a network-wide monitor". The interface name (if provided) is resolved to an IPv4 address by the module at runtime via `os.networkInterfaces()`.

**Alternatives considered**:
- *Nullable `host` column via migration*: Rejected — schema migration adds friction and complexity for all other modules. Empty string is sufficient.
- *Storing a dummy IP*: Rejected — misleading to operators and future developers.

---

## R-003 Anchor `deviceId` in DanteModule

**Decision**: `DanteModule` stores the `deviceId` passed to `connect(deviceId, config)` as `this._anchorDeviceId`. All `DanteDeviceState` objects created in `_onDeviceFound()` use `this._anchorDeviceId` as their `deviceId` field (replacing the broken `randomUUID()` placeholder). `ping(_deviceId)` always uses `this._anchorDeviceId` for its return value and returns an aggregate LED status.

**Rationale**: The current code sets `deviceId: randomUUID()` with the comment "Will be overridden when linked to DB device record" — but the linking step was never implemented. Storing the anchor from `connect()` is the minimal, correct fix. It makes `dante_devices.device_id` correctly point to the Dante Network gateway row in `devices`.

**Alternatives considered**:
- *Continuing to use random UUIDs*: Rejected — `ping()` never matched by `state.deviceId`, always returned GREY, making device status invisible.
- *Looking up the `devices` row from inside the module*: Rejected — modules must not access the database directly (Principle I module isolation).

---

## R-004 LED Aggregation in `ping()`

**Decision**: `ping(_deviceId)` returns the aggregate LED status of all discovered Dante devices using a worst-case roll-up:
- No devices discovered → `GREY`
- All devices GREEN → `GREEN`
- Any device AMBER, none RED → `AMBER`
- Any device RED → `RED`

The `lastSeen` field returns the most recent heartbeat timestamp across all discovered devices.

**Rationale**: The Dante Network gateway row in `devices` represents the whole network. Its LED must reflect the worst problem visible on the network, consistent with how room and floor LEDs aggregate upward.

---

## R-005 No New Database Migration Required

**Decision**: The existing migration `005_dante.sql` schema is correct as-is. `dante_devices.device_id` FK to `devices(id)` is the right structure — it just needs to be populated with the gateway's `devices.id` rather than random UUIDs. No `ALTER TABLE` is needed.

**Rationale**: The schema was designed with the FK in place. The bug was in the application code that populated it, not in the schema definition.

---

## R-006 Device Registry Cleanup

**Decision**: The `resources/device-registry.json` entry for Dante must be exactly:
```json
{
  "type": "dante-network-audio",
  "label": "Dante Network Audio",
  "module": "DanteModule",
  "protocol": "mDNS/UDP",
  "port": null,
  "configFields": [
    {
      "key": "host",
      "label": "Network Interface",
      "secret": false,
      "hint": "Interface name for Dante mDNS discovery (e.g. en0, eth0, Ethernet). Leave blank to discover on all interfaces."
    }
  ]
}
```

No `required: true`. No `arcPort` field. No `dante-audio` per-device entry. The `port: null` signals to `connectDevice()` that no port is dialled.

**Rationale**: Removes all contradictions identified in the spec-007 analysis. The single optional field (`host` = network interface name) is sufficient.

---

## R-007 `003-dante-network-audio` Spec Artifacts — Annotation Required

**Decision**: The `specs/003-dante-network-audio/data-model.md` Key Entities section incorrectly states "One physical Dante device maps to one app `devices` record". This must be corrected to reflect the singleton-gateway pattern. The `003` plan.md Constitution Check note referencing the incorrect per-device model also needs a correction note.

**Rationale**: Spec 003 artifacts are reference documents. Leaving incorrect descriptions creates confusion for future developers implementing from spec 003.
