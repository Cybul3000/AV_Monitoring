import { ipcMain, dialog } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { getDb } from '../db/database'
import type {
  LogQueryRequest,
  LogQueryResponse,
  LogDownloadRequest,
  LogDownloadResponse,
  LogEvent,
  LogSeverity
} from '@shared/ipc-types'

export function registerLogHandlers(): void {
  ipcMain.handle('log:query', (_event, req: LogQueryRequest): LogQueryResponse => {
    const db = getDb()

    const conditions: string[] = []
    const params: unknown[] = []

    if (req?.deviceId) {
      conditions.push('device_id = ?')
      params.push(req.deviceId)
    }
    if (req?.roomId) {
      conditions.push('room_id = ?')
      params.push(req.roomId)
    }
    if (req?.severity) {
      conditions.push('severity = ?')
      params.push(req.severity)
    }
    if (req?.since) {
      conditions.push('occurred_at >= ?')
      params.push(req.since)
    } else {
      conditions.push("occurred_at >= datetime('now', '-1 day')")
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = req?.limit ?? 500
    const sql = `SELECT id, device_id, room_id, severity, message, occurred_at FROM events ${where} ORDER BY occurred_at DESC LIMIT ?`
    params.push(limit)

    const rows = db.prepare(sql).all(...params) as Array<{
      id: string
      device_id: string | null
      room_id: string | null
      severity: string
      message: string
      occurred_at: string
    }>

    return {
      events: rows.map(r => ({
        id: r.id,
        deviceId: r.device_id,
        roomId: r.room_id,
        severity: r.severity as LogSeverity,
        message: r.message,
        occurredAt: r.occurred_at
      }))
    }
  })

  ipcMain.handle(
    'log:download',
    async (_event, req: LogDownloadRequest): Promise<LogDownloadResponse> => {
      const db = getDb()
      const rows = db
        .prepare(
          `SELECT id, device_id, room_id, severity, message, occurred_at FROM events ORDER BY occurred_at DESC`
        )
        .all() as Array<{
          id: string
          device_id: string | null
          room_id: string | null
          severity: string
          message: string
          occurred_at: string
        }>

      const format = req?.format ?? 'json'
      let content: string
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const defaultName = `av-monitoring-logs-${ts}.${format}`

      if (format === 'csv') {
        const header = 'id,deviceId,roomId,severity,message,occurredAt'
        const csvRows = rows.map(
          r =>
            `"${r.id}","${r.device_id ?? ''}","${r.room_id ?? ''}","${r.severity}","${r.message.replace(/"/g, '""')}","${r.occurred_at}"`
        )
        content = [header, ...csvRows].join('\n')
      } else {
        const events: LogEvent[] = rows.map(r => ({
          id: r.id,
          deviceId: r.device_id,
          roomId: r.room_id,
          severity: r.severity as LogSeverity,
          message: r.message,
          occurredAt: r.occurred_at
        }))
        content = JSON.stringify({ exportedAt: new Date().toISOString(), events }, null, 2)
      }

      let filePath = req?.savePath
      if (!filePath) {
        const result = await dialog.showSaveDialog({
          defaultPath: join(app.getPath('downloads'), defaultName),
          filters:
            format === 'csv'
              ? [{ name: 'CSV', extensions: ['csv'] }]
              : [{ name: 'JSON', extensions: ['json'] }]
        })
        if (result.canceled || !result.filePath) {
          return { success: false, error: 'Save cancelled' }
        }
        filePath = result.filePath
      }

      writeFileSync(filePath, content, 'utf-8')
      return { success: true, filePath, rowCount: rows.length }
    }
  )
}
