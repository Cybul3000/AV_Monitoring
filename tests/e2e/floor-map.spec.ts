import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'
import Database from 'better-sqlite3'

const MIGRATION_PATH = path.resolve(__dirname, '../../src/main/db/migrations/001_initial.sql')
const APP_ENTRY = path.resolve(__dirname, '../../dist/main/index.js')
const FIXTURE_PNG = path.resolve(__dirname, '../fixtures/floor-plan.png')

function seedFloorMapDb(dbPath: string, mapPath?: string) {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(fs.readFileSync(MIGRATION_PATH, 'utf-8'))

  db.prepare("INSERT INTO regions (id, name) VALUES ('r1', 'EMEA')").run()
  db.prepare("INSERT INTO offices (id, region_id, name, city) VALUES ('o1', 'r1', 'London HQ', 'London')").run()
  db.prepare(`INSERT INTO floors (id, office_id, name, level, floor_map_path) VALUES ('f1', 'o1', 'Ground Floor', 1, ?)`)
    .run(mapPath ?? null)
  db.prepare("INSERT INTO rooms (id, floor_id, name, map_x, map_y, map_w, map_h) VALUES ('rm1', 'f1', 'Boardroom', 10, 10, 30, 20)").run()
  db.prepare("INSERT INTO rooms (id, floor_id, name, map_x, map_y, map_w, map_h) VALUES ('rm2', 'f1', 'Huddle Room', 50, 10, 30, 20)").run()
  db.prepare("INSERT INTO devices (id, room_id, name, device_type, host, status) VALUES ('d1', 'rm1', 'Zoom 1', 'zoom-room', '10.0.0.1', 'GREEN')").run()
  db.prepare("INSERT INTO devices (id, room_id, name, device_type, host, status) VALUES ('d2', 'rm2', 'Zoom 2', 'zoom-room', '10.0.0.2', 'AMBER')").run()
  db.close()
}

function createFixturePng(): string {
  // Create a minimal valid 1x1 PNG
  const fixtureDir = path.dirname(FIXTURE_PNG)
  if (!fs.existsSync(fixtureDir)) fs.mkdirSync(fixtureDir, { recursive: true })
  if (!fs.existsSync(FIXTURE_PNG)) {
    // Minimal 1x1 white PNG (89 bytes)
    const minimalPng = Buffer.from(
      '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de' +
      '0000000c4944415478016360f8cfc00000000200014e02164800000000049454e44ae426082',
      'hex'
    )
    fs.writeFileSync(FIXTURE_PNG, minimalPng)
  }
  return FIXTURE_PNG
}

test.describe('Floor map view', () => {
  let dbDir: string
  let dbPath: string
  let pngPath: string

  test.beforeAll(() => {
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-floormap-'))
    dbPath = path.join(dbDir, 'database.db')
    pngPath = createFixturePng()
    seedFloorMapDb(dbPath, pngPath)
  })

  test.afterAll(() => {
    try { fs.rmSync(dbDir, { recursive: true }) } catch { /* ignore */ }
  })

  test('floor with map path shows Map View toggle', async () => {
    if (!fs.existsSync(APP_ENTRY)) {
      test.skip()
      return
    }

    const app = await electron.launch({
      args: [APP_ENTRY],
      env: { ...process.env, AV_MON_DB_PATH: dbPath }
    })

    try {
      const page = await app.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)

      // Navigate to floor
      await page.locator('button').filter({ hasText: 'EMEA' }).click()
      await page.locator('button').filter({ hasText: 'London HQ' }).click()
      await page.locator('button').filter({ hasText: 'Ground Floor' }).click()

      // Should see Map View toggle button
      await expect(page.locator('button').filter({ hasText: /Map View/i })).toBeVisible()
    } finally {
      await app.close()
    }
  })

  test('switching to map view shows SVG canvas with room areas', async () => {
    if (!fs.existsSync(APP_ENTRY)) {
      test.skip()
      return
    }

    const app = await electron.launch({
      args: [APP_ENTRY],
      env: { ...process.env, AV_MON_DB_PATH: dbPath }
    })

    try {
      const page = await app.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)

      await page.locator('button').filter({ hasText: 'EMEA' }).click()
      await page.locator('button').filter({ hasText: 'London HQ' }).click()
      await page.locator('button').filter({ hasText: 'Ground Floor' }).click()
      await page.locator('button').filter({ hasText: /Map View/i }).click()

      // SVG canvas should be visible
      await expect(page.locator('svg')).toBeVisible()

      // Both room areas should render as SVG rects
      const rects = page.locator('svg rect')
      await expect(rects.first()).toBeVisible()
    } finally {
      await app.close()
    }
  })

  test('floor without map path shows list view only', async () => {
    if (!fs.existsSync(APP_ENTRY)) {
      test.skip()
      return
    }

    // Create a DB without floor map
    const noMapDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-nomap-'))
    const noMapDbPath = path.join(noMapDbDir, 'database.db')
    seedFloorMapDb(noMapDbPath) // no map path

    const app = await electron.launch({
      args: [APP_ENTRY],
      env: { ...process.env, AV_MON_DB_PATH: noMapDbPath }
    })

    try {
      const page = await app.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)

      await page.locator('button').filter({ hasText: 'EMEA' }).click()
      await page.locator('button').filter({ hasText: 'London HQ' }).click()
      await page.locator('button').filter({ hasText: 'Ground Floor' }).click()

      // No Map View toggle when no floor plan
      await expect(page.locator('button').filter({ hasText: /Map View/i })).not.toBeVisible()
    } finally {
      await app.close()
      try { fs.rmSync(noMapDbDir, { recursive: true }) } catch { /* ignore */ }
    }
  })
})
