import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, existsSync, mkdirSync } from 'fs'

let _db: Database.Database | null = null

function getDbPath(): string {
  const dbDir =
    process.env.AV_MON_DB_PATH ?? join(app.getPath('userData'), 'av-monitoring')
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true })
  return join(dbDir, 'database.db')
}

function getMigrationsDir(): string {
  if (!app.isPackaged) {
    return join(process.cwd(), 'src/main/db/migrations')
  }
  return join(__dirname, 'migrations')
}

export function initDatabase(): Database.Database {
  if (_db) return _db

  const dbPath = getDbPath()
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  applyMigrations(db)

  _db = db
  return db
}

function applyMigrations(db: Database.Database): void {
  // Ensure schema_version table exists so we can check current version
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
  `)

  const versionRow = db
    .prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1')
    .get() as { version: number } | undefined

  const currentVersion = versionRow?.version ?? 0
  const migrationsDir = getMigrationsDir()

  const migrationFiles = [
    { version: 1, file: '001_initial.sql' },
    { version: 2, file: '002_alert_rules.sql' },
    { version: 3, file: '003_zoom_location.sql' },
    { version: 4, file: '004_biamp_configs.sql' },
    { version: 5, file: '005_dante.sql' },
    { version: 6, file: '006_alert_expected_value.sql' },
    { version: 7, file: '007_device_options.sql' }
  ]

  for (const migration of migrationFiles) {
    if (migration.version > currentVersion) {
      const filePath = join(migrationsDir, migration.file)
      if (!existsSync(filePath)) {
        throw new Error(`Migration file not found: ${filePath}`)
      }
      const sql = readFileSync(filePath, 'utf-8')
      db.exec(sql)

      // Update version — migration SQL already inserts into schema_version,
      // but if re-applied we upsert to be safe
      db.prepare('DELETE FROM schema_version').run()
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version)
    }
  }
}

export function getDb(): Database.Database {
  if (!_db) throw new Error('Database not initialised — call initDatabase() first')
  return _db
}

export function closeDatabase(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}
