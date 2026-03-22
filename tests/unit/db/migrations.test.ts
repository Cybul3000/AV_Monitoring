import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'

function applyMigration(db: Database.Database, sqlPath: string) {
  const sql = fs.readFileSync(sqlPath, 'utf-8')
  db.exec(sql)
}

const MIGRATION_PATH = path.resolve(__dirname, '../../../src/main/db/migrations/001_initial.sql')

describe('001_initial.sql migration', () => {
  let db: Database.Database
  let dbPath: string

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `av-test-${Date.now()}.db`)
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
  })

  afterEach(() => {
    db.close()
    fs.unlinkSync(dbPath)
  })

  it('applies migration without errors', () => {
    expect(() => applyMigration(db, MIGRATION_PATH)).not.toThrow()
  })

  it('creates all required tables', () => {
    applyMigration(db, MIGRATION_PATH)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain('regions')
    expect(names).toContain('offices')
    expect(names).toContain('floors')
    expect(names).toContain('rooms')
    expect(names).toContain('devices')
    expect(names).toContain('device_configs')
    expect(names).toContain('events')
    expect(names).toContain('schema_version')
  })

  it('sets schema_version to 1', () => {
    applyMigration(db, MIGRATION_PATH)
    const row = db.prepare('SELECT version FROM schema_version').get() as { version: number }
    expect(row.version).toBe(1)
  })

  it('is idempotent on re-run (uses CREATE TABLE IF NOT EXISTS)', () => {
    applyMigration(db, MIGRATION_PATH)
    expect(() => applyMigration(db, MIGRATION_PATH)).not.toThrow()
  })

  it('enforces foreign keys: inserting office without region fails', () => {
    applyMigration(db, MIGRATION_PATH)
    expect(() => {
      db.prepare("INSERT INTO offices (id, region_id, name, city) VALUES ('o1', 'nonexistent', 'Office', 'City')").run()
    }).toThrow()
  })

  it('cascades delete: deleting region removes offices', () => {
    applyMigration(db, MIGRATION_PATH)
    db.prepare("INSERT INTO regions (id, name) VALUES ('r1', 'Region 1')").run()
    db.prepare("INSERT INTO offices (id, region_id, name, city) VALUES ('o1', 'r1', 'Office 1', 'City')").run()

    db.prepare("DELETE FROM regions WHERE id = 'r1'").run()

    const offices = db.prepare("SELECT * FROM offices WHERE id = 'o1'").get()
    expect(offices).toBeUndefined()
  })

  it('allows inserting a full hierarchy', () => {
    applyMigration(db, MIGRATION_PATH)
    db.prepare("INSERT INTO regions (id, name) VALUES ('r1', 'EMEA')").run()
    db.prepare("INSERT INTO offices (id, region_id, name, city) VALUES ('o1', 'r1', 'London HQ', 'London')").run()
    db.prepare("INSERT INTO floors (id, office_id, name, level) VALUES ('f1', 'o1', 'Ground Floor', 1)").run()
    db.prepare("INSERT INTO rooms (id, floor_id, name) VALUES ('rm1', 'f1', 'Boardroom')").run()
    db.prepare("INSERT INTO devices (id, room_id, name, device_type, host, status) VALUES ('d1', 'rm1', 'Zoom 1', 'zoom-room', '10.0.1.1', 'GREY')").run()

    const device = db.prepare("SELECT * FROM devices WHERE id = 'd1'").get() as { name: string }
    expect(device.name).toBe('Zoom 1')
  })
})
