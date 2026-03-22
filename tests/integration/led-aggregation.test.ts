import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  computeRoomStatus,
  computeFloorStatus,
  computeOfficeStatus,
  computeRegionStatus,
  computeFullHierarchyLEDs
} from '../../src/main/services/StatusAggregator'
import type { LEDStatus } from '../../src/main/services/StatusAggregator'

const MIGRATION_PATH = path.resolve(__dirname, '../../src/main/db/migrations/001_initial.sql')

function seedHierarchy(db: Database.Database) {
  db.exec(fs.readFileSync(MIGRATION_PATH, 'utf-8'))
  db.prepare("INSERT INTO regions (id, name) VALUES ('r1', 'EMEA'), ('r2', 'APAC')").run()
  db.prepare("INSERT INTO offices (id, region_id, name, city) VALUES ('o1', 'r1', 'London', 'London'), ('o2', 'r2', 'Sydney', 'Sydney')").run()
  db.prepare("INSERT INTO floors (id, office_id, name, level) VALUES ('f1', 'o1', 'Floor 1', 1), ('f2', 'o2', 'Floor 1', 1)").run()
  db.prepare("INSERT INTO rooms (id, floor_id, name) VALUES ('rm1', 'f1', 'Room A'), ('rm2', 'f2', 'Room B')").run()
  db.prepare("INSERT INTO devices (id, room_id, name, device_type, host, status) VALUES ('d1', 'rm1', 'Zoom A', 'zoom-room', '10.0.0.1', 'GREEN')").run()
  db.prepare("INSERT INTO devices (id, room_id, name, device_type, host, status) VALUES ('d2', 'rm2', 'Zoom B', 'zoom-room', '10.0.0.2', 'GREEN')").run()
}

describe('LED aggregation integration', () => {
  let db: Database.Database
  let dbPath: string

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `av-led-test-${Date.now()}.db`)
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    seedHierarchy(db)
  })

  afterEach(() => {
    db.close()
    fs.unlinkSync(dbPath)
  })

  it('room with all GREEN devices is GREEN', () => {
    const rows = db.prepare('SELECT status FROM devices WHERE room_id = ?').all('rm1') as { status: LEDStatus }[]
    expect(computeRoomStatus(rows.map(r => r.status))).toBe('GREEN')
  })

  it('room with one RED device is RED', () => {
    db.prepare("UPDATE devices SET status = 'RED' WHERE id = 'd1'").run()
    const rows = db.prepare('SELECT status FROM devices WHERE room_id = ?').all('rm1') as { status: LEDStatus }[]
    expect(computeRoomStatus(rows.map(r => r.status))).toBe('RED')
  })

  it('floor aggregates room statuses', () => {
    db.prepare("UPDATE devices SET status = 'AMBER' WHERE id = 'd1'").run()
    const rows = db.prepare('SELECT status FROM devices WHERE room_id = ?').all('rm1') as { status: LEDStatus }[]
    const roomLED = computeRoomStatus(rows.map(r => r.status))
    expect(computeFloorStatus([roomLED])).toBe('AMBER')
  })

  it('full hierarchy LEDs computed correctly', () => {
    const devices = db.prepare('SELECT id, room_id, status FROM devices').all() as { id: string; room_id: string; status: LEDStatus }[]
    const rooms = db.prepare('SELECT id, floor_id FROM rooms').all() as { id: string; floor_id: string }[]
    const floors = db.prepare('SELECT id, office_id FROM floors').all() as { id: string; office_id: string }[]
    const offices = db.prepare('SELECT id, region_id FROM offices').all() as { id: string; region_id: string }[]

    const leds = computeFullHierarchyLEDs(devices, rooms, floors, offices)

    expect(leds.rooms['rm1']).toBe('GREEN')
    expect(leds.rooms['rm2']).toBe('GREEN')
    expect(leds.floors['f1']).toBe('GREEN')
    expect(leds.offices['o1']).toBe('GREEN')
    expect(leds.regions['r1']).toBe('GREEN')
  })

  it('RED device propagates through hierarchy', () => {
    db.prepare("UPDATE devices SET status = 'RED' WHERE id = 'd1'").run()

    const devices = db.prepare('SELECT id, room_id, status FROM devices').all() as { id: string; room_id: string; status: LEDStatus }[]
    const rooms = db.prepare('SELECT id, floor_id FROM rooms').all() as { id: string; floor_id: string }[]
    const floors = db.prepare('SELECT id, office_id FROM floors').all() as { id: string; office_id: string }[]
    const offices = db.prepare('SELECT id, region_id FROM offices').all() as { id: string; region_id: string }[]

    const leds = computeFullHierarchyLEDs(devices, rooms, floors, offices)

    expect(leds.rooms['rm1']).toBe('RED')
    expect(leds.floors['f1']).toBe('RED')
    expect(leds.offices['o1']).toBe('RED')
    expect(leds.regions['r1']).toBe('RED')
    // Region 2 (APAC / Sydney) is unaffected
    expect(leds.regions['r2']).toBe('GREEN')
  })

  describe('computeOfficeStatus', () => {
    it('multi-floor office uses worst floor status', () => {
      expect(computeOfficeStatus(['GREEN', 'RED'])).toBe('RED')
    })
  })

  describe('computeRegionStatus', () => {
    it('all offices GREEN → region GREEN', () => {
      expect(computeRegionStatus(['GREEN', 'GREEN'])).toBe('GREEN')
    })

    it('one AMBER office → region AMBER', () => {
      expect(computeRegionStatus(['GREEN', 'AMBER'])).toBe('AMBER')
    })
  })
})
