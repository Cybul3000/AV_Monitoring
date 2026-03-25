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

  const label = status.vpnActive ? 'VPN: On' : 'VPN: Off'

  return (
    <span
      title={label}
      style={{
        fontSize: 'var(--font-size-xs)',
        fontWeight: 500,
        color: 'var(--color-text-secondary)',
        userSelect: 'none'
      }}
    >
      {label}
    </span>
  )
}
