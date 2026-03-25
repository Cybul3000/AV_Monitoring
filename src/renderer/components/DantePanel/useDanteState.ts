// useDanteState.ts — React hook for Dante device state
import { useState, useEffect, useCallback } from 'react'
import type { DanteDeviceSnapshot, DanteUpdateBroadcast } from '@shared/ipc-types'

type DanteApi = {
  scan: () => Promise<{ success: boolean; devices: DanteDeviceSnapshot[]; error?: string }>
  deviceGet: (req: { deviceId: string }) => Promise<{ success: boolean; device: DanteDeviceSnapshot | null; error?: string }>
  onUpdate: (cb: (payload: DanteUpdateBroadcast) => void) => () => void
}

function getDanteApi(): DanteApi {
  return (window as unknown as { api: { dante: DanteApi } }).api.dante
}

export interface UseDanteStateResult {
  devices: DanteDeviceSnapshot[]
  loading: boolean
  error: string | null
  rescan: () => void
}

export function useDanteState(): UseDanteStateResult {
  const [devices, setDevices] = useState<DanteDeviceSnapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const performScan = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getDanteApi().scan()
      if (result.success) {
        setDevices(result.devices)
      } else {
        setError(result.error ?? 'Scan failed')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // Subscribe to push updates and trigger initial scan on mount
  useEffect(() => {
    void performScan()

    const unsub = getDanteApi().onUpdate((payload: DanteUpdateBroadcast) => {
      setDevices(payload.devices)
    })

    return () => {
      unsub()
    }
  }, [performScan])

  const rescan = useCallback(() => {
    void performScan()
  }, [performScan])

  return { devices, loading, error, rescan }
}
