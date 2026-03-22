<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.0.2
Modified principles: N/A (initial ratification)
Added sections:
  - Core Principles (I–VIII)
  - Technology & Architecture Constraints
  - Development Workflow & Quality Gates
  - Governance
Removed sections: N/A
Templates requiring updates:
  ✅ .specify/templates/plan-template.md — Constitution Check gates reviewed; no structural changes required
  ✅ .specify/templates/spec-template.md — Mandatory sections and FR pattern align with constitution
  ✅ .specify/templates/tasks-template.md — Task-first + observability task categories align with constitution
Follow-up TODOs: None — all fields resolved at ratification
-->

# AV Monitoring Constitution

## Core Principles

### I. Module-First Architecture

Every device type MUST have a dedicated, self-contained module responsible for all
communication with that device. Modules MUST be derived from official documentation
stored under `/resources/` (e.g., `/resources/Zoom/`, `/resources/Companion/`).
No device-communication logic may exist outside its module. Each module MUST expose
a consistent internal interface so it can be swapped or extended without touching
the rest of the application. Modules MUST be independently testable in isolation
before they are integrated into the larger app.

**Rationale**: The device ecosystem (Zoom Rooms, Biamp, etc.) will grow over time.
Strict module boundaries prevent coupling and make it safe to add or replace
integrations without regressions.

### II. Layered Hierarchy — NON-NEGOTIABLE

The application MUST enforce a strict five-level drill-down hierarchy at all times:

```
Global → Region (e.g., EMEA, APAC) → Office/City → Floor/Level → Meeting Room
```

LED health status MUST be aggregated upward through every level: a room incident
rolls up to the floor, office, region, and global view. High-level views (Region,
Office, Floor) MUST display only aggregated LED status; individual device detail
MUST only appear when a specific room is selected. Navigation MUST always be
top-down; there is no shortcut that bypasses an intermediate level.

**Rationale**: Support engineers need instant situational awareness across hundreds
of rooms. Displaying all device detail at once would create noise; the hierarchy
focuses attention at the right level of granularity.

### III. Verify, Never Assume

No feature or module implementation may begin while any requirement remains
ambiguous. When a specification, user story, or device behaviour is unclear,
implementation MUST stop and explicit confirmation MUST be obtained before
proceeding. Open questions MUST be marked `NEEDS CLARIFICATION` in specs and tasks,
and MUST be resolved (not made assumptions about) before the relevant task is
started. This principle applies equally to device behaviour, UI interactions, and
data formats.

**Rationale**: Incorrect assumptions in a monitoring tool can silently mask real
outages or trigger false self-healing actions, causing operational harm.

### IV. Test-First with Clear Outcomes — NON-NEGOTIABLE

Test-Driven Development is mandatory for every task. The sequence is strictly
enforced:

1. Write tests with explicitly stated expected outcomes.
2. Confirm tests fail (red phase) before implementation begins.
3. Implement until tests pass (green phase).
4. Refactor if needed, while keeping tests green.

Every test MUST state a concrete, observable outcome (e.g., "LED status becomes
RED when device ping times out after 5 s"). Tests that only assert "it works" or
"no error" are not acceptable. Integration tests MUST cover: device module
communication, UI hierarchy drill-down, floor-map interaction, and configuration
download/restore round-trips.

**Rationale**: A monitoring tool that is itself unreliable is worse than no tool.
Known-good tests at each step are the only way to ship confidently.

### V. Device Registry as Single Source of Truth

A canonical device registry file (e.g., `resources/device-registry.md` or
`resources/device-registry.json`) MUST exist and MUST be the authoritative list
of every supported device type. Device templates in the configuration UI MUST be
generated from this registry. When a new device template is created, its
corresponding module MUST also be created in the same step — template and module
are inseparable. No device template may exist without a module, and no module
without an entry in the registry.

**Rationale**: Keeping templates and modules in sync prevents the state where a
device appears in the UI but has no communication capability, which would produce
misleading health data.

### VI. Configuration Integrity

All device configurations that can be downloaded from a device MUST be exportable
from the application and restorable to the device. Configuration files MUST be
versioned and human-readable (JSON or YAML). Zoom Room configuration MUST be
supported first; other device types follow. No application update may break
previously exported configuration files (backward compatibility required).
The application MUST warn the user before overwriting a saved configuration.

**Rationale**: Configuration backup and restore is a primary safety net during
self-healing operations and device replacements.

### VII. Observability Built-In

Every significant application event MUST be logged with a timestamp, severity
level, source (device/module/room), and human-readable description. Logs MUST be
downloadable from within the application at any time. The application MUST be able
to generate an OpenTelemetry (OTel) collector configuration file compatible with
New Relic so that room health data can flow into the organisation's observability
platform. OTel configuration generation is a first-class feature, not a
post-launch addition.

**Rationale**: Support engineers need an audit trail for incident retrospectives,
and the organisation's New Relic instance provides the longitudinal visibility that
the local app alone cannot.

### VIII. Cross-Platform by Default

All application code MUST run on both macOS and Windows without platform-specific
workarounds visible to application-layer code. Any OS-level difference (file
paths, system tray behaviour, network APIs) MUST be abstracted behind a
platform-adapter layer. UI components and device modules MUST be validated on
both platforms during development. No feature may be shipped as
"macOS-only" or "Windows-only" unless explicitly approved as a deliberate,
documented exception.

**Rationale**: The support team operates on both operating systems; a tool that
works only on one platform creates inequality in operational capability.

## Technology & Architecture Constraints

- **Platform**: Cross-platform desktop application (macOS 12+ and Windows 10+).
- **UI Paradigm**: Electron or equivalent cross-platform framework MUST be used
  unless an alternative is explicitly approved. The layered map/floor-plan view
  requires a canvas or SVG rendering approach capable of handling uploaded images
  and draggable room/device elements.
- **Device Communication**: Each module is responsible for its own protocol
  (HTTP/REST, WebSocket, SSH, etc.) as defined by the device's documentation in
  `/resources/`. Modules MUST handle timeouts and connection failures gracefully
  and report them via the standard status interface.
- **Data Persistence**: Application state (room hierarchy, floor maps, device
  configurations, device registry) MUST be persisted locally (e.g., SQLite or
  structured JSON files). No remote database dependency for core functionality.
- **Slack Integration**: Designed as a future integration. Architecture MUST
  include a notification/event-bus abstraction so Slack (and future channels) can
  be plugged in without modifying core monitoring logic.
- **Security**: Credentials for devices (e.g., Zoom API keys, Biamp credentials)
  MUST be stored using the OS keychain / credential store, never in plain text.
  No credentials in source code or exported configuration files.
- **Resources Directory**: `/resources/Zoom/` holds Zoom API and controller
  documentation. For all non-Zoom device modules, the primary upstream reference
  is the **Bitfocus** open-source ecosystem at https://github.com/bitfocus —
  module authors MUST use the relevant Bitfocus Companion module repository as
  the authoritative source when building integrations for those device types.
  Other subdirectories under `/resources/` will be added per device type. All
  module authors MUST cite the specific documentation file or repository URL they
  used.

## Development Workflow & Quality Gates

1. **Requirement confirmation first** — no task begins with an unresolved
   `NEEDS CLARIFICATION` item.
2. **Registry entry before template** — new device types MUST be added to the
   device registry before template or module work begins.
   2a. **Protocol confirmation** — before any new module is created, the user
       MUST explicitly confirm the connection protocol to be used
       (e.g., HTTP/REST, WebSocket, SSH, Telnet, serial, proprietary SDK, etc.).
       No default protocol may be assumed. Work on the module MUST NOT begin
       until this confirmation is on record.
3. **Red before green** — tests MUST be confirmed failing before implementation.
4. **Module isolation test** — each new module MUST pass its isolated tests
   before it is wired into the application.
5. **Cross-platform smoke test** — every UI feature MUST be manually verified on
   both macOS and Windows before a task is marked complete.
6. **Configuration round-trip test** — any configuration download/restore feature
   MUST be verified by export → modify device → restore → confirm device state.
7. **OTel validation** — generated OTel configuration MUST be validated against
   the OTel collector schema and tested with a New Relic ingest endpoint.
8. **Log download verification** — log export MUST be tested to produce a
   complete, human-readable file with no missing events.

## Governance

This constitution supersedes all other development practices and informal
agreements for the AV Monitoring project. Amendments require:

1. A written rationale describing the change and the version bump type
   (MAJOR / MINOR / PATCH per semantic versioning rules defined below).
2. Review and explicit approval before the amended constitution is committed.
3. A propagation check across all `.specify/templates/` files to update any
   references that the amendment affects.

**Versioning policy**:
- MAJOR — removal or incompatible redefinition of a principle.
- MINOR — new principle or materially expanded guidance added.
- PATCH — clarifications, wording improvements, typo fixes.

All feature specs and plans MUST include a "Constitution Check" gate that
references the principles relevant to the feature. Any violation of a principle
MUST be explicitly justified in the plan's Complexity Tracking table, or the
feature MUST be revised to comply.

**Version**: 1.0.2 | **Ratified**: 2026-03-22 | **Last Amended**: 2026-03-22
