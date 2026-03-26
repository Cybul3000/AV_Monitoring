import { ipcMain, dialog } from 'electron'
import { randomUUID } from 'crypto'
import { getDb } from '../db/database'
import { onDeviceCreated } from '../modules/index'
import { connectDevice, disconnectDevice, scheduleDevice, unscheduleDevice } from './device-handlers'
import type {
  HierarchyNode,
  HierarchyResponse,
  HierarchyUpdateRequest,
  HierarchyUpdateResponse,
  LEDStatus
} from '@shared/ipc-types'

export function registerHierarchyHandlers(): void {
  ipcMain.handle('hierarchy:get', (): HierarchyResponse => {
    return { roots: buildHierarchyTree() }
  })

  ipcMain.handle('dialog:selectFile', async (_event, options?: { filters?: Electron.FileFilter[] }): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: options?.filters ?? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg'] }]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('device:checkHost', (_event, { host }: { host: string }) => {
    if (!host) return { exists: false, device: null }
    const db = getDb()
    const existing = db
      .prepare(
        `SELECT d.id, d.name, r.name as roomName FROM devices d JOIN rooms r ON r.id = d.room_id WHERE d.host = ?`
      )
      .get(host) as { id: string; name: string; roomName: string } | undefined
    return { exists: !!existing, device: existing ?? null }
  })

  ipcMain.handle(
    'hierarchy:update',
    (_event, req: HierarchyUpdateRequest): HierarchyUpdateResponse => {
      if (!req?.action || !req?.type) {
        return { success: false, error: 'Invalid payload' }
      }
      try {
        return handleUpdate(req)
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )
}

// ── Hierarchy tree builder ────────────────────────────────────────────────────

function buildHierarchyTree(): HierarchyNode[] {
  const db = getDb()

  const regions = db.prepare('SELECT * FROM regions ORDER BY name').all() as DbRegion[]
  const offices = db.prepare('SELECT * FROM offices ORDER BY name').all() as DbOffice[]
  const floors = db
    .prepare('SELECT * FROM floors ORDER BY level')
    .all() as DbFloor[]
  const rooms = db.prepare('SELECT * FROM rooms ORDER BY name').all() as DbRoom[]
  const devices = db.prepare('SELECT * FROM devices ORDER BY name').all() as DbDevice[]

  return regions.map(region => ({
    id: region.id,
    name: region.name,
    type: 'region' as const,
    ledStatus: region.led_status as LEDStatus,
    children: offices
      .filter(o => o.region_id === region.id)
      .map(office => ({
        id: office.id,
        name: office.name,
        type: 'office' as const,
        city: office.city,
        ledStatus: office.led_status as LEDStatus,
        children: floors
          .filter(f => f.office_id === office.id)
          .map(floor => ({
            id: floor.id,
            name: floor.name,
            type: 'floor' as const,
            level: floor.level,
            floorMapPath: floor.floor_map_path ?? undefined,
            ledStatus: floor.led_status as LEDStatus,
            children: rooms
              .filter(r => r.floor_id === floor.id)
              .map(room => ({
                id: room.id,
                name: room.name,
                type: 'room' as const,
                mapX: room.map_x ?? undefined,
                mapY: room.map_y ?? undefined,
                mapW: room.map_w ?? undefined,
                mapH: room.map_h ?? undefined,
                ledStatus: room.led_status as LEDStatus,
                children: devices
                  .filter(d => d.room_id === room.id)
                  .map(device => ({
                    id: device.id,
                    name: device.name,
                    type: 'device' as const,
                    deviceType: device.device_type,
                    host: device.host,
                    port: device.port ?? undefined,
                    webUiUrl: device.web_ui_url ?? undefined,
                    mapX: device.map_x ?? undefined,
                    mapY: device.map_y ?? undefined,
                    lastSeen: device.last_seen ?? undefined,
                    pollInterval: device.poll_interval,
                    ledStatus: device.status as LEDStatus
                  }))
              }))
          }))
      }))
  }))
}

// ── Update handler ────────────────────────────────────────────────────────────

function handleUpdate(req: HierarchyUpdateRequest): HierarchyUpdateResponse {
  const db = getDb()
  const now = new Date().toISOString()

  if (req.action === 'create') {
    const id = randomUUID()
    switch (req.type) {
      case 'region': {
        const d = req.data ?? {}
        db.prepare(
          `INSERT INTO regions (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`
        ).run(id, d.name, now, now)
        return { success: true, id }
      }
      case 'office': {
        const d = req.data ?? {}
        db.prepare(
          `INSERT INTO offices (id, region_id, name, city, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(id, req.parentId, d.name, d.city ?? '', now, now)
        return { success: true, id }
      }
      case 'floor': {
        const d = req.data ?? {}
        db.prepare(
          `INSERT INTO floors (id, office_id, level, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(id, req.parentId, d.level ?? 0, d.name, now, now)
        return { success: true, id }
      }
      case 'room': {
        const d = req.data ?? {}
        db.prepare(
          `INSERT INTO rooms (id, floor_id, name, map_x, map_y, map_w, map_h, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          req.parentId,
          d.name,
          d.mapX ?? null,
          d.mapY ?? null,
          d.mapW ?? null,
          d.mapH ?? null,
          now,
          now
        )
        return { success: true, id }
      }
      case 'device': {
        const d = req.data ?? {}
        // Check for duplicate IP across all rooms
        const duplicate = db
          .prepare(`SELECT d.id, d.name, r.name as room_name FROM devices d JOIN rooms r ON r.id = d.room_id WHERE d.host = ?`)
          .get(d.host) as { id: string; name: string; room_name: string } | undefined
        if (duplicate) {
          return { success: false, error: `Host ${d.host} is already used by "${duplicate.name}" in ${duplicate.room_name}` }
        }
        const optionsJson = d.config ? JSON.stringify(d.config) : null
        db.prepare(
          `INSERT INTO devices (id, room_id, device_type, name, host, port, web_ui_url, poll_interval, map_x, map_y, options_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          req.parentId,
          d.deviceType,
          d.name,
          d.host,
          d.port ?? null,
          d.webUiUrl ?? null,
          d.pollInterval ?? 30000,
          d.mapX ?? null,
          d.mapY ?? null,
          optionsJson,
          now,
          now
        )
        // Seed default alert rules for the newly created device type
        onDeviceCreated(d.deviceType as string)
        // Connect the module and start polling for the new device
        const deviceOptions = d.config as Record<string, unknown> | undefined
        void connectDevice(id, d.deviceType as string, d.host as string, (d.port as number | undefined) ?? null, deviceOptions)
        scheduleDevice(id, d.deviceType as string, (d.pollInterval as number | undefined) ?? 30000)
        return { success: true, id }
      }
    }
  }

  if (req.action === 'update') {
    if (!req.id) return { success: false, error: 'id required for update' }
    const d = req.data ?? {}
    switch (req.type) {
      case 'region':
        db.prepare(`UPDATE regions SET name = ?, updated_at = ? WHERE id = ?`).run(
          d.name,
          now,
          req.id
        )
        break
      case 'office':
        db.prepare(`UPDATE offices SET name = ?, city = ?, updated_at = ? WHERE id = ?`).run(
          d.name,
          d.city,
          now,
          req.id
        )
        break
      case 'floor':
        db.prepare(
          `UPDATE floors SET name = ?, level = ?, floor_map_path = ?, updated_at = ? WHERE id = ?`
        ).run(d.name, d.level, d.floorMapPath ?? null, now, req.id)
        break
      case 'room':
        db.prepare(
          `UPDATE rooms SET name = ?, map_x = ?, map_y = ?, map_w = ?, map_h = ?, updated_at = ? WHERE id = ?`
        ).run(
          d.name,
          d.mapX ?? null,
          d.mapY ?? null,
          d.mapW ?? null,
          d.mapH ?? null,
          now,
          req.id
        )
        break
      case 'device':
        db.prepare(
          `UPDATE devices SET name = ?, host = ?, port = ?, web_ui_url = ?, poll_interval = ?, map_x = ?, map_y = ?, updated_at = ? WHERE id = ?`
        ).run(
          d.name,
          d.host,
          d.port ?? null,
          d.webUiUrl ?? null,
          d.pollInterval ?? 30000,
          d.mapX ?? null,
          d.mapY ?? null,
          now,
          req.id
        )
        break
    }
    return { success: true, id: req.id }
  }

  if (req.action === 'delete') {
    if (!req.id) return { success: false, error: 'id required for delete' }
    switch (req.type) {
      case 'region':
        db.prepare('DELETE FROM regions WHERE id = ?').run(req.id)
        break
      case 'office':
        db.prepare('DELETE FROM offices WHERE id = ?').run(req.id)
        break
      case 'floor':
        db.prepare('DELETE FROM floors WHERE id = ?').run(req.id)
        break
      case 'room':
        db.prepare('DELETE FROM rooms WHERE id = ?').run(req.id)
        break
      case 'device': {
        const devRow = db.prepare('SELECT device_type FROM devices WHERE id = ?').get(req.id) as { device_type: string } | undefined
        db.prepare('DELETE FROM devices WHERE id = ?').run(req.id)
        if (devRow) {
          unscheduleDevice(req.id)
          void disconnectDevice(req.id, devRow.device_type)
        }
        break
      }
    }
    return { success: true }
  }

  return { success: false, error: 'Unknown action' }
}

// ── DB row types ──────────────────────────────────────────────────────────────

interface DbRegion { id: string; name: string; led_status: string }
interface DbOffice { id: string; region_id: string; name: string; city: string; led_status: string }
interface DbFloor { id: string; office_id: string; level: number; name: string; floor_map_path: string | null; led_status: string }
interface DbRoom { id: string; floor_id: string; name: string; map_x: number | null; map_y: number | null; map_w: number | null; map_h: number | null; led_status: string }
interface DbDevice { id: string; room_id: string; device_type: string; name: string; host: string; port: number | null; web_ui_url: string | null; status: string; last_seen: string | null; poll_interval: number; map_x: number | null; map_y: number | null; options_json: string | null }
