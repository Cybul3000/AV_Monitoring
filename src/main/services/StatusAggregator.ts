import type { LEDStatus } from '@shared/ipc-types'
export type { LEDStatus }

/**
 * Aggregates LED statuses upward through the hierarchy.
 * Rules (from data-model.md):
 *  - Any RED   → RED
 *  - Any AMBER (no RED) → AMBER
 *  - All GREEN → GREEN
 *  - All GREY / empty → GREY
 */
export function aggregateStatus(statuses: LEDStatus[]): LEDStatus {
  if (statuses.length === 0) return 'GREY'
  if (statuses.includes('RED')) return 'RED'
  if (statuses.includes('AMBER')) return 'AMBER'
  if (statuses.every(s => s === 'GREEN')) return 'GREEN'
  return 'GREY'
}

// ── Hierarchy-level aggregators ───────────────────────────────────────────────

export function computeRoomStatus(deviceStatuses: LEDStatus[]): LEDStatus {
  return aggregateStatus(deviceStatuses)
}

export function computeFloorStatus(roomStatuses: LEDStatus[]): LEDStatus {
  return aggregateStatus(roomStatuses)
}

export function computeOfficeStatus(floorStatuses: LEDStatus[]): LEDStatus {
  return aggregateStatus(floorStatuses)
}

export function computeRegionStatus(officeStatuses: LEDStatus[]): LEDStatus {
  return aggregateStatus(officeStatuses)
}

// ── Full-hierarchy aggregation ────────────────────────────────────────────────

export interface DeviceRow {
  id: string
  room_id: string
  status: LEDStatus
}

export interface RoomRow {
  id: string
  floor_id: string
}

export interface FloorRow {
  id: string
  office_id: string
}

export interface OfficeRow {
  id: string
  region_id: string
}

export interface HierarchyLEDs {
  rooms: Record<string, LEDStatus>
  floors: Record<string, LEDStatus>
  offices: Record<string, LEDStatus>
  regions: Record<string, LEDStatus>
}

export function computeFullHierarchyLEDs(
  devices: DeviceRow[],
  rooms: RoomRow[],
  floors: FloorRow[],
  offices: OfficeRow[]
): HierarchyLEDs {
  const roomLEDs: Record<string, LEDStatus> = {}
  const floorLEDs: Record<string, LEDStatus> = {}
  const officeLEDs: Record<string, LEDStatus> = {}
  const regionLEDs: Record<string, LEDStatus> = {}

  // Room ← devices
  for (const room of rooms) {
    const deviceStatuses = devices
      .filter(d => d.room_id === room.id)
      .map(d => d.status)
    roomLEDs[room.id] = computeRoomStatus(deviceStatuses)
  }

  // Floor ← rooms
  for (const floor of floors) {
    const floorRoomStatuses = rooms
      .filter(r => r.floor_id === floor.id)
      .map(r => roomLEDs[r.id] ?? 'GREY')
    floorLEDs[floor.id] = computeFloorStatus(floorRoomStatuses)
  }

  // Office ← floors
  for (const office of offices) {
    const officeFloorStatuses = floors
      .filter(f => f.office_id === office.id)
      .map(f => floorLEDs[f.id] ?? 'GREY')
    officeLEDs[office.id] = computeOfficeStatus(officeFloorStatuses)
  }

  // Region ← offices (regions are inferred from offices)
  const regionIds = [...new Set(offices.map(o => o.region_id))]
  for (const regionId of regionIds) {
    const regionOfficeStatuses = offices
      .filter(o => o.region_id === regionId)
      .map(o => officeLEDs[o.id] ?? 'GREY')
    regionLEDs[regionId] = computeRegionStatus(regionOfficeStatuses)
  }

  return { rooms: roomLEDs, floors: floorLEDs, offices: officeLEDs, regions: regionLEDs }
}
