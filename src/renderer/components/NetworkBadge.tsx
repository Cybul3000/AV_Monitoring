import React, { useEffect, useState } from 'react'
import type { NetworkStatus } from '@shared/ipc-types'

declare global {
  interface Window {
    api: Record<string, (...args: unknown[]) => unknown>
  }
}

export const NetworkBadge: React.FC = () => {
  const [status, setStatus] = useState<NetworkStatus | null>(null)

  useEffect(() => {
    // Fetch initial status
    ;(window.api.networkGet as () => Promise<NetworkStatus>)().then(setStatus).catch(console.error)

    // Subscribe to push updates
    const unsub = (window.api.onNetworkStatus as (cb: (s: NetworkStatus) => void) => () => void)(
      setStatus
    )
    return unsub
  }, [])

  if (!status) return null

  const active = status.vpnActive || status.ssidMatch
  const label = status.vpnActive
    ? 'VPN'
    : status.ssidMatch
      ? 'MeetingRoom WiFi'
      : status.currentSsid
        ? `WiFi: ${status.currentSsid}`
        : 'No LAN'

  return (
    <span
      title={`Network: ${label} — ${active ? 'LAN accessible' : 'LAN may be unreachable'}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--spacing-xs)',
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 600,
        background: active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
        color: active ? 'var(--color-green)' : 'var(--color-red)',
        border: `1px solid ${active ? 'var(--color-green)' : 'var(--color-red)'}`,
        userSelect: 'none'
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: active ? 'var(--color-green)' : 'var(--color-red)',
          flexShrink: 0
        }}
      />
      {label}
    </span>
  )
}
