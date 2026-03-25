# Quickstart — Dante Network Monitor Refactor (spec 007)

## Branch

`007-dante-network-monitor`

## What This Refactor Touches

| File | Change |
|------|--------|
| `resources/device-registry.json` | Remove required `host`/`arcPort` fields; optional `host` = network interface name |
| `src/main/modules/dante/DanteModule.ts` | Store `_anchorDeviceId`; fix `_onDeviceFound()`; fix `ping()` aggregate LED |
| `specs/003-dante-network-audio/data-model.md` | Add correction note on Key Entities section |
| `specs/003-dante-network-audio/plan.md` | Add correction note on Constitution Check |
| `tests/unit/dante/DanteModule.test.ts` | Update `ping()` tests to reflect aggregate behaviour |

## No Migration Required

Migration `005_dante.sql` is correct as-is. Schema version stays at 5.

## Running Tests

```bash
npm test -- tests/unit/dante/DanteModule.test.ts
npm test -- tests/integration/dante/
```

## Key Implementation Files

- Module: `src/main/modules/dante/DanteModule.ts`
- Registry: `resources/device-registry.json`
- Spec 003 data model: `specs/003-dante-network-audio/data-model.md`

## Verification Checklist

After implementation, confirm:
- [ ] `resources/device-registry.json` has exactly one `dante-network-audio` entry with one optional `host` field
- [ ] No `dante-audio` per-device entry exists anywhere in the registry
- [ ] `DanteModule.connect(deviceId, config)` stores `deviceId` as `this._anchorDeviceId`
- [ ] `DanteModule._onDeviceFound()` sets `state.deviceId = this._anchorDeviceId`
- [ ] `DanteModule.ping()` returns aggregate LED (not always GREY)
- [ ] All dante unit tests pass
- [ ] Adding a Dante Network device via Config UI shows only one optional field (Network Interface)
