import type { DeviceModule, DeviceConfig, DeviceStatus, CommandResult } from '../_base/DeviceModule'
import { loadDeviceCredentials } from '../../platform/credentials'

interface ZoomTokenCache {
  accessToken: string
  expiresAt: number
}

interface ConnectedDevice {
  deviceId: string
  config: DeviceConfig
  tokenCache: ZoomTokenCache | null
}

export class ZoomModule implements DeviceModule {
  readonly type = 'zoom-room'
  readonly label = 'Zoom Rooms Controller'
  readonly supportedActions = ['reboot', 'openWebUI']

  private _devices = new Map<string, ConnectedDevice>()

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async connect(deviceId: string, config: DeviceConfig): Promise<void> {
    this._devices.set(deviceId, { deviceId, config, tokenCache: null })
    // Eagerly fetch token to validate credentials on connect
    await this._getAccessToken(deviceId)
  }

  async disconnect(deviceId: string): Promise<void> {
    this._devices.delete(deviceId)
  }

  // ── Ping / health ──────────────────────────────────────────────────────────

  async ping(deviceId: string): Promise<DeviceStatus> {
    const device = this._getDevice(deviceId)
    try {
      const token = await this._getAccessToken(deviceId)
      const rooms = await this._zoomApiGet<ZoomRoomsListResponse>(
        `/rooms?type=ZoomRoom&page_size=1`,
        token
      )

      // A successful API call means the Zoom account is reachable
      // Check if the specific room is healthy
      const accountId = device.config.options?.accountId as string | undefined
      if (!accountId) {
        return { deviceId, status: 'AMBER', lastSeen: new Date().toISOString(), meta: { reason: 'No accountId configured' } }
      }

      const status = rooms.total_records > 0 ? 'GREEN' : 'AMBER'
      return {
        deviceId,
        status,
        lastSeen: new Date().toISOString(),
        meta: { totalRooms: rooms.total_records }
      }
    } catch (err) {
      return {
        deviceId,
        status: 'RED',
        lastSeen: null,
        meta: { error: String(err) }
      }
    }
  }

  // ── Config download / restore ──────────────────────────────────────────────

  async downloadConfig(deviceId: string): Promise<Record<string, unknown>> {
    const token = await this._getAccessToken(deviceId)

    // Fetch room list
    const rooms = await this._zoomApiGet<ZoomRoomsListResponse>('/rooms?type=ZoomRoom&page_size=100', token)

    // Fetch settings for each room
    const roomConfigs: Record<string, unknown>[] = []
    for (const room of rooms.rooms ?? []) {
      try {
        const settings = await this._zoomApiGet<Record<string, unknown>>(
          `/rooms/${room.id}/settings`,
          token
        )
        roomConfigs.push({ roomId: room.id, roomName: room.name, settings })
      } catch {
        // Non-fatal: include room with error note
        roomConfigs.push({ roomId: room.id, roomName: room.name, error: 'Failed to fetch settings' })
      }
    }

    return {
      schemaVersion: 1,
      accountRooms: rooms.total_records,
      rooms: roomConfigs
    }
  }

  async restoreConfig(deviceId: string, config: Record<string, unknown>): Promise<void> {
    const token = await this._getAccessToken(deviceId)
    const rooms = (config.rooms as Array<{ roomId: string; settings: Record<string, unknown> }>) ?? []

    for (const room of rooms) {
      if (!room.settings) continue
      await this._zoomApiPatch(`/rooms/${room.roomId}/settings`, token, room.settings)
    }
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  async sendCommand(
    deviceId: string,
    command: string,
    params?: Record<string, unknown>
  ): Promise<CommandResult> {
    switch (command) {
      case 'reboot':
        return this._rebootRoom(deviceId, params?.roomId as string | undefined)
      case 'openWebUI':
        // Handled by device-handlers.ts via shell.openExternal; this is a fallback
        return { success: true, output: 'WebUI opened via shell' }
      default:
        return { success: false, error: `Unknown command: ${command}` }
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _getDevice(deviceId: string): ConnectedDevice {
    const device = this._devices.get(deviceId)
    if (!device) throw new Error(`Device ${deviceId} not connected`)
    return device
  }

  private async _getAccessToken(deviceId: string): Promise<string> {
    const device = this._getDevice(deviceId)

    if (device.tokenCache && Date.now() < device.tokenCache.expiresAt - 60_000) {
      return device.tokenCache.accessToken
    }

    const creds = await loadDeviceCredentials('zoom-room', deviceId, [
      'clientId',
      'clientSecret',
      'accountId'
    ])

    const { clientId, clientSecret, accountId } = creds
    if (!clientId || !clientSecret || !accountId) {
      throw new Error('Missing Zoom OAuth credentials (clientId, clientSecret, accountId)')
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const response = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    if (!response.ok) {
      throw new Error(`Zoom OAuth failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as { access_token: string; expires_in: number }
    device.tokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000
    }
    return data.access_token
  }

  private async _zoomApiGet<T>(path: string, token: string): Promise<T> {
    const response = await fetch(`https://api.zoom.us/v2${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    if (!response.ok) {
      throw new Error(`Zoom API GET ${path} failed: ${response.status}`)
    }
    return response.json() as Promise<T>
  }

  private async _zoomApiPatch(
    path: string,
    token: string,
    body: Record<string, unknown>
  ): Promise<void> {
    const response = await fetch(`https://api.zoom.us/v2${path}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    if (!response.ok && response.status !== 204) {
      throw new Error(`Zoom API PATCH ${path} failed: ${response.status}`)
    }
  }

  private async _rebootRoom(deviceId: string, roomId?: string): Promise<CommandResult> {
    if (!roomId) return { success: false, error: 'roomId required for reboot' }
    try {
      const token = await this._getAccessToken(deviceId)
      await this._zoomApiPatch(`/rooms/${roomId}`, token, { basic_settings: { room_system_reboot: true } })
      return { success: true, output: `Reboot command sent to room ${roomId}` }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }
}

// ── Zoom API response types ───────────────────────────────────────────────────

interface ZoomRoomsListResponse {
  total_records: number
  rooms?: Array<{ id: string; name: string; status: string }>
}
