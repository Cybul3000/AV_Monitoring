import { ipcMain, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { getDb } from '../db/database'
import { getModule, getRegistryEntries, isModuleAvailable } from '../modules/index'
import { computeFullHierarchyLEDs } from '../services/StatusAggregator'
import { alertRulesService } from '../services/AlertRulesService'
import { getPreference } from '../preferences'
import { shell } from 'electron'
import type {
  DeviceCommandRequest,
  DeviceCommandResponse,
  DeviceStatusBroadcast,
  LEDStatus
} from '@shared/ipc-types'

type PollingTimer = NodeJS.Timeout

const _timers = new Map<string, PollingTimer>()
let _win: BrowserWindow | null = null

// ── Registration ──────────────────────────────────────────────────────────────

export function registerDeviceHandlers(win: BrowserWindow): void {
  _win = win

  ipcMain.handle(
    'device:command',
    async (_event, req: DeviceCommandRequest): Promise<DeviceCommandResponse> => {
      if (!req?.deviceId || !req?.command) {
        return { success: false, error: 'Invalid payload' }
      }
      return executeCommand(req)
    }
  )

  ipcMain.handle('device:ping', async (_event, payload: { deviceId: string }) => {
    if (!payload?.deviceId) return { success: false, error: 'Invalid payload' }
    return pingDevice(payload.deviceId)
  })

  ipcMain.handle('registry:list', () => {
    try {
      const entries = getRegistryEntries().map(e => ({
        type: e.type,
        label: e.label,
        configFields: e.configFields,
        moduleAvailable: isModuleAvailable(e.type)
      }))
      return { success: true, entries }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}

// ── Polling lifecycle ─────────────────────────────────────────────────────────

export function startPolling(win: BrowserWindow): void {
  _win = win
  const db = getDb()
  const devices = db.prepare('SELECT id, device_type, poll_interval FROM devices').all() as Array<{
    id: string
    device_type: string
    poll_interval: number
  }>

  for (const device of devices) {
    scheduleDevice(device.id, device.device_type, device.poll_interval)
  }
}

export function stopPolling(): void {
  for (const timer of _timers.values()) {
    clearInterval(timer)
  }
  _timers.clear()
}

export function scheduleDevice(deviceId: string, _deviceType: string, intervalMs: number): void {
  if (_timers.has(deviceId)) {
    clearInterval(_timers.get(deviceId)!)
  }
  // Immediate first poll
  void pollDevice(deviceId)

  const timer = setInterval(() => void pollDevice(deviceId), intervalMs)
  _timers.set(deviceId, timer)
}

export function unscheduleDevice(deviceId: string): void {
  const timer = _timers.get(deviceId)
  if (timer) {
    clearInterval(timer)
    _timers.delete(deviceId)
  }
}

// ── Poll single device ────────────────────────────────────────────────────────

async function pollDevice(deviceId: string): Promise<void> {
  const db = getDb()
  const row = db
    .prepare('SELECT device_type, status, host, port FROM devices WHERE id = ?')
    .get(deviceId) as { device_type: string; status: LEDStatus; host: string; port: number | null } | undefined

  if (!row) {
    unscheduleDevice(deviceId)
    return
  }

  const module = getModule(row.device_type)
  let newStatus: LEDStatus = 'GREY'
  let lastSeen: string | null = null

  if (!module) {
    newStatus = 'GREY'
  } else {
    try {
      const result = await module.ping(deviceId)
      newStatus = result.status
      lastSeen = result.lastSeen ?? new Date().toISOString()
    } catch {
      // Count consecutive failures
      const failRow = db
        .prepare(
          `SELECT COUNT(*) as cnt FROM events WHERE device_id = ? AND severity IN ('ERROR','CRITICAL') AND occurred_at > datetime('now', '-5 minutes')`
        )
        .get(deviceId) as { cnt: number }

      const threshold = getPreference('pref:consecutiveFailuresBeforeRed') as number ?? 3
      newStatus = failRow.cnt >= threshold ? 'RED' : 'AMBER'
    }
  }

  // Alert gate: if the new status is AMBER or RED, check whether this
  // device type's 'reachable' status point has alerting enabled.
  // If not alertable, retain the current (pre-poll) status.
  if ((newStatus === 'AMBER' || newStatus === 'RED') &&
      !alertRulesService.isAlertable(row.device_type, 'reachable')) {
    newStatus = row.status
  }

  const now = new Date().toISOString()

  // Update device record
  db.prepare(
    `UPDATE devices SET status = ?, last_seen = ?, updated_at = ? WHERE id = ?`
  ).run(newStatus, lastSeen, now, deviceId)

  // Log status change
  if (newStatus !== row.status) {
    db.prepare(
      `INSERT INTO events (id, device_id, severity, message, occurred_at) VALUES (?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      deviceId,
      newStatus === 'RED' || newStatus === 'GREY' ? 'ERROR' : 'INFO',
      `Device status changed: ${row.status} → ${newStatus}`,
      now
    )
  }

  broadcastStatus()
}

// ── Broadcast full hierarchy status ──────────────────────────────────────────

export function broadcastStatus(): void {
  if (!_win || _win.isDestroyed()) return
  const db = getDb()

  const devices = db
    .prepare('SELECT id, room_id, status FROM devices')
    .all() as Array<{ id: string; room_id: string; status: string }>

  const rooms = db
    .prepare('SELECT id, floor_id FROM rooms')
    .all() as Array<{ id: string; floor_id: string }>

  const floors = db
    .prepare('SELECT id, office_id FROM floors')
    .all() as Array<{ id: string; office_id: string }>

  const offices = db
    .prepare('SELECT id, region_id FROM offices')
    .all() as Array<{ id: string; region_id: string }>

  const hierarchy = computeFullHierarchyLEDs(
    devices.map(d => ({ id: d.id, room_id: d.room_id, status: d.status as LEDStatus })),
    rooms,
    floors,
    offices
  )

  // Update aggregated LED columns in DB
  for (const [roomId, status] of Object.entries(hierarchy.rooms)) {
    db.prepare('UPDATE rooms SET led_status = ? WHERE id = ?').run(status, roomId)
  }
  for (const [floorId, status] of Object.entries(hierarchy.floors)) {
    db.prepare('UPDATE floors SET led_status = ? WHERE id = ?').run(status, floorId)
  }
  for (const [officeId, status] of Object.entries(hierarchy.offices)) {
    db.prepare('UPDATE offices SET led_status = ? WHERE id = ?').run(status, officeId)
  }
  for (const [regionId, status] of Object.entries(hierarchy.regions)) {
    db.prepare('UPDATE regions SET led_status = ? WHERE id = ?').run(status, regionId)
  }

  const statuses = devices.map(d => ({
    deviceId: d.id,
    status: d.status as LEDStatus,
    lastSeen: (
      db
        .prepare('SELECT last_seen FROM devices WHERE id = ?')
        .get(d.id) as { last_seen: string | null }
    ).last_seen
  }))

  const broadcast: DeviceStatusBroadcast = {
    timestamp: new Date().toISOString(),
    statuses,
    hierarchy
  }

  _win.webContents.send('device:status:all', broadcast)
}

// ── ping single device ────────────────────────────────────────────────────────

async function pingDevice(deviceId: string) {
  const db = getDb()
  const row = db
    .prepare('SELECT device_type FROM devices WHERE id = ?')
    .get(deviceId) as { device_type: string } | undefined

  if (!row) return { success: false, error: 'Device not found' }

  const module = getModule(row.device_type)
  if (!module) return { success: false, error: 'Module not available' }

  try {
    const status = await module.ping(deviceId)
    return { success: true, ...status }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ── Command execution ─────────────────────────────────────────────────────────

async function executeCommand(req: DeviceCommandRequest): Promise<DeviceCommandResponse> {
  const db = getDb()
  const now = new Date().toISOString()
  const operatorId = process.env.USER ?? process.env.USERNAME ?? 'unknown'

  const row = db
    .prepare('SELECT device_type FROM devices WHERE id = ?')
    .get(req.deviceId) as { device_type: string } | undefined

  if (!row) return { success: false, error: 'Device not found' }

  // Special built-in: Open WebUI
  if (req.command === 'openWebUI') {
    const device = db
      .prepare('SELECT web_ui_url FROM devices WHERE id = ?')
      .get(req.deviceId) as { web_ui_url: string | null } | undefined

    if (!device?.web_ui_url) {
      return { success: false, error: 'No WebUI URL configured for this device' }
    }
    shell.openExternal(device.web_ui_url)

    db.prepare(
      `INSERT INTO events (id, device_id, severity, message, operator, occurred_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), req.deviceId, 'INFO', `Opened WebUI: ${device.web_ui_url}`, operatorId, now)

    return { success: true }
  }

  const module = getModule(row.device_type)
  if (!module) return { success: false, error: 'Module not available for this device type' }

  try {
    const result = await module.sendCommand(req.deviceId, req.command, req.params)

    db.prepare(
      `INSERT INTO events (id, device_id, severity, message, operator, occurred_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      req.deviceId,
      result.success ? 'INFO' : 'ERROR',
      `Command '${req.command}': ${result.success ? 'success' : result.error ?? 'failed'}`,
      operatorId,
      now
    )

    // If reboot: set status to AMBER (pending recovery)
    if (req.command === 'reboot' && result.success) {
      db.prepare('UPDATE devices SET status = ?, updated_at = ? WHERE id = ?').run(
        'AMBER',
        now,
        req.deviceId
      )
      broadcastStatus()
    }

    return result
  } catch (err) {
    const message = String(err)
    db.prepare(
      `INSERT INTO events (id, device_id, severity, message, operator, occurred_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), req.deviceId, 'ERROR', `Command '${req.command}' threw: ${message}`, operatorId, now)
    return { success: false, error: message }
  }
}
