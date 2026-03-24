import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { getDb } from '../db/database'
import { getAccessToken, clearCache as clearTokenCache, setSessionClientSecret, hasSessionClientSecret } from '../services/ZoomOAuthService'
import { saveZoomAppCredentials, getZoomAppCredentials } from '../platform/credentials'
import type { ZoomImportRequest, ZoomImportResponse } from '@shared/ipc-types'

interface ZoomRoom {
  room_id: string
  name: string
  status?: string
}

interface ZoomRoomsApiResponse {
  rooms?: ZoomRoom[]
  next_page_token?: string
}

/**
 * Ensure a default floor exists under the given office and return its id.
 * Creates one named "Zoom Import Floor" at level 0 if none exists.
 */
function ensureDefaultFloor(officeId: string): string {
  const db = getDb()
  const now = new Date().toISOString()

  const existing = db
    .prepare('SELECT id FROM floors WHERE office_id = ? ORDER BY level LIMIT 1')
    .get(officeId) as { id: string } | undefined

  if (existing) return existing.id

  const floorId = randomUUID()
  db.prepare(
    `INSERT INTO floors (id, office_id, level, name, created_at, updated_at)
     VALUES (?, ?, 0, 'Zoom Import Floor', ?, ?)`
  ).run(floorId, officeId, now, now)
  return floorId
}

/**
 * Create a room with the given name under floorId and return its id.
 * If a room with that name already exists under the floor, return its id.
 */
function ensureRoom(floorId: string, roomName: string): string {
  const db = getDb()
  const now = new Date().toISOString()

  const existing = db
    .prepare('SELECT id FROM rooms WHERE floor_id = ? AND name = ?')
    .get(floorId, roomName) as { id: string } | undefined

  if (existing) return existing.id

  const roomId = randomUUID()
  db.prepare(
    `INSERT INTO rooms (id, floor_id, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(roomId, floorId, roomName, now, now)
  return roomId
}

export function registerZoomHandlers(): void {
  // ── zoom:importRooms ──────────────────────────────────────────────────────

  ipcMain.handle(
    'zoom:importRooms',
    async (
      _event,
      req: ZoomImportRequest
    ): Promise<ZoomImportResponse> => {
      if (!req?.officeId || !req?.zoomLocationId) {
        return { success: false, created: 0, skipped: 0, errors: ['Invalid payload: officeId and zoomLocationId are required'] }
      }

      try {
        const token = await getAccessToken()
        const db = getDb()
        const now = new Date().toISOString()

        const url = `https://api.zoom.us/v2/rooms?location_id=${encodeURIComponent(req.zoomLocationId)}&page_size=100`
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        })

        if (!response.ok) {
          const body = await response.text()
          return {
            success: false,
            created: 0,
            skipped: 0,
            errors: [`Zoom API request failed (${response.status}): ${body}`]
          }
        }

        const data = (await response.json()) as ZoomRoomsApiResponse
        const rooms: ZoomRoom[] = data.rooms ?? []

        let created = 0
        let skipped = 0
        const errors: string[] = []

        const floorId = ensureDefaultFloor(req.officeId)

        for (const zoomRoom of rooms) {
          try {
            // Check if device with this zoom_room_id already exists
            const existing = db
              .prepare('SELECT id FROM devices WHERE zoom_room_id = ?')
              .get(zoomRoom.room_id) as { id: string } | undefined

            if (existing) {
              skipped++
              continue
            }

            // Create or reuse a room node in the hierarchy
            const roomId = ensureRoom(floorId, zoomRoom.name)

            // Insert device
            const deviceId = randomUUID()
            db.prepare(
              `INSERT INTO devices
                (id, room_id, device_type, name, host, zoom_room_id, status, created_at, updated_at)
               VALUES (?, ?, 'zoom-room', ?, '', ?, 'GREY', ?, ?)`
            ).run(deviceId, roomId, zoomRoom.name, zoomRoom.room_id, now, now)

            created++
          } catch (err) {
            errors.push(`Failed to import room "${zoomRoom.name}": ${String(err)}`)
          }
        }

        return { success: true, created, skipped, errors }
      } catch (err) {
        return {
          success: false,
          created: 0,
          skipped: 0,
          errors: [String(err)]
        }
      }
    }
  )

  // ── zoom:saveCredentials ──────────────────────────────────────────────────
  // Persists clientId + accountId; holds clientSecret in memory only.

  ipcMain.handle(
    'zoom:saveCredentials',
    async (
      _event,
      payload: { clientId: string; clientSecret: string; accountId: string }
    ): Promise<{ success: boolean; error?: string }> => {
      if (!payload?.clientId || !payload?.clientSecret || !payload?.accountId) {
        return { success: false, error: 'All three fields are required' }
      }
      try {
        await saveZoomAppCredentials(payload.clientId, payload.accountId)
        setSessionClientSecret(payload.clientSecret)
        clearTokenCache()
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // ── zoom:getCredentials ───────────────────────────────────────────────────
  // Returns saved (non-secret) fields + whether a session secret is active.

  ipcMain.handle(
    'zoom:getCredentials',
    async (): Promise<{ clientId: string; accountId: string; secretActive: boolean }> => {
      const saved = await getZoomAppCredentials()
      return {
        clientId: saved?.clientId ?? '',
        accountId: saved?.accountId ?? '',
        secretActive: hasSessionClientSecret()
      }
    }
  )
}
