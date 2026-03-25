import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'
import Database from 'better-sqlite3'

const MIGRATION_PATH = path.resolve(__dirname, '../../src/main/db/migrations/001_initial.sql')
const APP_ENTRY = path.resolve(__dirname, '../../dist/main/index.js')

function seedZoomDb(dbPath: string) {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(fs.readFileSync(MIGRATION_PATH, 'utf-8'))

  db.prepare("INSERT INTO regions (id, name) VALUES ('r1', 'EMEA')").run()
  db.prepare("INSERT INTO offices (id, region_id, name, city) VALUES ('o1', 'r1', 'London HQ', 'London')").run()
  db.prepare("INSERT INTO floors (id, office_id, name, level) VALUES ('f1', 'o1', 'Ground Floor', 1)").run()
  db.prepare("INSERT INTO rooms (id, floor_id, name) VALUES ('rm1', 'f1', 'Boardroom')").run()
  db.prepare("INSERT INTO devices (id, room_id, name, device_type, host, status) VALUES ('d1', 'rm1', 'Zoom Boardroom', 'zoom-room', '10.0.0.1', 'GREEN')").run()
  db.close()
}

test.describe('Zoom config round-trip', () => {
  let dbDir: string
  let dbPath: string

  test.beforeAll(() => {
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-zoom-e2e-'))
    dbPath = path.join(dbDir, 'database.db')
    seedZoomDb(dbPath)
  })

  test.afterAll(() => {
    try { fs.rmSync(dbDir, { recursive: true }) } catch { /* ignore */ }
  })

  test('device detail panel shows Config section for zoom-room', async () => {
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

      // Navigate to room
      await page.locator('button').filter({ hasText: 'EMEA' }).click()
      await page.locator('button').filter({ hasText: 'London HQ' }).click()
      await page.locator('button').filter({ hasText: 'Ground Floor' }).click()
      await page.locator('button').filter({ hasText: 'Boardroom' }).click()

      // Click on device to expand detail panel
      await page.locator('button').filter({ hasText: 'Zoom Boardroom' }).click()

      // Config panel should be visible for zoom-room devices
      await expect(page.locator('text=Configuration').or(page.locator('text=Download Config'))).toBeVisible({ timeout: 5000 })
    } finally {
      await app.close()
    }
  })

  test('Download Config button is present and clickable', async () => {
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
      await page.locator('button').filter({ hasText: 'Boardroom' }).click()
      await page.locator('button').filter({ hasText: 'Zoom Boardroom' }).click()

      const downloadBtn = page.locator('button').filter({ hasText: /Download Config/i })
      await expect(downloadBtn).toBeVisible({ timeout: 5000 })
      await expect(downloadBtn).toBeEnabled()
    } finally {
      await app.close()
    }
  })
})
