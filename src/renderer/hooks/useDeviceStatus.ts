import { useState, useEffect } from 'react'
import type { DeviceStatusBroadcast, LEDStatus } from '@shared/ipc-types'

type ApiShape = {
  onDeviceStatusAll: (cb: (payload: DeviceStatusBroadcast) => void) => () => void
}

export function useDeviceStatus() {
  const [broadcast, setBroadcast] = useState<DeviceStatusBroadcast | null>(null)

  useEffect(() => {
    const unsub = (window.api as unknown as ApiShape).onDeviceStatusAll(payload => {
      setBroadcast(payload)
    })
    return unsub
  }, [])

  function getDeviceStatus(deviceId: string): LEDStatus {
    const entry = broadcast?.statuses.find(s => s.deviceId === deviceId)
    return entry?.status ?? 'GREY'
  }

  function getDeviceMeta(deviceId: string): Record<string, unknown> {
    const entry = broadcast?.statuses.find(s => s.deviceId === deviceId)
    return entry?.meta ?? {}
  }

  function getRoomLED(roomId: string): LEDStatus {
    return broadcast?.hierarchy.rooms[roomId] ?? 'GREY'
  }

  function getFloorLED(floorId: string): LEDStatus {
    return broadcast?.hierarchy.floors[floorId] ?? 'GREY'
  }

  function getOfficeLED(officeId: string): LEDStatus {
    return broadcast?.hierarchy.offices[officeId] ?? 'GREY'
  }

  function getRegionLED(regionId: string): LEDStatus {
    return broadcast?.hierarchy.regions[regionId] ?? 'GREY'
  }

  return {
    broadcast,
    getDeviceStatus,
    getDeviceMeta,
    getRoomLED,
    getFloorLED,
    getOfficeLED,
    getRegionLED
  }
}
