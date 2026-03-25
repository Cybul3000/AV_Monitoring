import { networkInterfaces } from 'os'
import { execSync } from 'child_process'
import type { NetworkStatus } from '@shared/ipc-types'

const MEETING_ROOM_SSID = 'MeetingRoom'
// VPN interface name prefixes — more reliable than IP range matching
// macOS: utun (IKEv2/WireGuard/L2TP), ppp (L2TP/PPTP)
// Linux/Windows: tun, tap, ppp
const VPN_IFACE_PREFIXES = ['utun', 'tun', 'tap', 'ppp']

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
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue
    const lname = name.toLowerCase()
    const isVpnIface = VPN_IFACE_PREFIXES.some(prefix => lname.startsWith(prefix))
    if (isVpnIface && addrs.some(a => a.family === 'IPv4' && !a.internal)) {
      return true
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
