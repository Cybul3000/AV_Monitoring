#!/usr/bin/env node
/**
 * db:schema — Dumps the current SQLite schema to stdout.
 * Usage: node scripts/db-schema.mjs [db-path]
 *
 * If no path is provided, uses AV_MON_DB_PATH env or the default app-data location.
 */

import Database from 'better-sqlite3'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const dbPath = process.argv[2]
  ?? process.env.AV_MON_DB_PATH
  ?? path.join(os.homedir(), 'Library', 'Application Support', 'av-monitoring', 'database.db')

let db
try {
  db = new Database(dbPath, { readonly: true })
} catch (err) {
  // Try relative path from project root
  const altPath = path.resolve(__dirname, '../av-monitoring/database.db')
  try {
    db = new Database(altPath, { readonly: true })
  } catch {
    console.error(`Cannot open database at: ${dbPath}`)
    console.error('Run the app at least once to create the database, or set AV_MON_DB_PATH.')
    process.exit(1)
  }
}

try {
  const rows = db.prepare(
    "SELECT name, type, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type DESC, name ASC"
  ).all()

  console.log('-- AV Monitoring Database Schema')
  console.log(`-- Generated: ${new Date().toISOString()}`)
  console.log(`-- Database: ${dbPath}`)
  console.log('')

  for (const row of rows) {
    console.log(`-- ${row.type.toUpperCase()}: ${row.name}`)
    console.log(row.sql + ';')
    console.log('')
  }

  // Also show schema version
  try {
    const version = db.prepare('SELECT version FROM schema_version').get()
    console.log(`-- Schema version: ${version?.version ?? 'unknown'}`)
  } catch {
    // schema_version table may not exist in older DBs
  }
} finally {
  db.close()
}
