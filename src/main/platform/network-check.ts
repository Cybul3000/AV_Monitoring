import { networkInterfaces } from 'os'
import { execSync } from 'child_process'
import type { NetworkStatus } from '@shared/ipc-types'

const MEETING_ROOM_SSID = 'MeetingRoom'
// VPN range: 10.x.6.0/23 — matches 10.*.6.0–10.*.7.255
const VPN_REGEX = /^10\.\d+\.[67]\./

export function checkNetworkStatus(): NetworkStatus {
  return {
    vpnActive: isVpnActive(),
    ssidMatch: isMeetingRoomWifi(),
    currentSsid: getCurrentSsid(),
    timestamp: new Date().toISOString()
  }
}

function isVpnActive(): boolean {
  const ifaces = networkInterfaces()
  for (const iface of Object.values(ifaces)) {
    if (!iface) continue
    for (const addr of iface) {
      if (addr.family === 'IPv4' && VPN_REGEX.test(addr.address)) {
        return true
      }
    }
  }
  return false
}

function getCurrentSsid(): string | null {
  try {
    if (process.platform === 'darwin') {
      // macOS: use airport utility
      const result = execSync(
        '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I',
        { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }
      ).toString()
      const match = result.match(/\s+SSID:\s+(.+)/)
      return match ? match[1].trim() : null
    } else if (process.platform === 'win32') {
      // Windows: use netsh
      const result = execSync('netsh wlan show interfaces', {
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'ignore']
      }).toString()
      const match = result.match(/\s+SSID\s*:\s+(.+)/)
      return match ? match[1].trim() : null
    }
  } catch {
    // SSID detection is best-effort; swallow errors
  }
  return null
}

function isMeetingRoomWifi(): boolean {
  return getCurrentSsid() === MEETING_ROOM_SSID
}
