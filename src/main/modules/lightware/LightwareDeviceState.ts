export interface PortState {
  portId: string           // 'I1', 'I2', 'O1', 'O2', etc.
  direction: 'input' | 'output'
  label: string
  signalLocked: boolean | null   // null = unknown
  connectedSource: string | null // 'I3', '0' (disconnected), or null
}

export interface LightwareState {
  deviceId: string
  productName: string | null
  firmwareVersion: string | null
  serialNumber: string | null
  deviceFamily: 'MX2' | 'MMX' | 'unknown'
  ports: Map<string, PortState>
  presets: Array<{ index: number; name: string }>
  temperature: number | null   // °C
  fanStatus: string | null     // 'OK', 'FAULT', or null
  /** Active USB host source for H1 (e.g. 'U1', 'U2'). Empty string = no source connected. null = unknown. */
  usbHostSource: string | null
  connected: boolean
  /** True once the transport has successfully emitted 'connected' at least once */
  hasEverConnected: boolean
}

export function createEmptyState(deviceId: string): LightwareState {
  return {
    deviceId,
    productName: null,
    firmwareVersion: null,
    serialNumber: null,
    deviceFamily: 'unknown',
    ports: new Map(),
    presets: [],
    temperature: null,
    fanStatus: null,
    usbHostSource: null,
    connected: false,
    hasEverConnected: false,
  }
}

export function aggregateStatus(state: LightwareState): 'GREEN' | 'AMBER' | 'RED' | 'GREY' {
  // Never successfully connected → GREY
  if (!state.hasEverConnected) {
    return 'GREY'
  }

  // Was connected before but is not now → RED
  if (!state.connected) {
    return 'RED'
  }

  // Hardware fault check (AMBER)
  if (state.fanStatus === 'FAULT') {
    return 'AMBER'
  }
  // Temperature warning: treat > 70°C as a warning threshold
  if (state.temperature !== null && state.temperature > 70) {
    return 'AMBER'
  }

  // Check input ports for signal lock
  const inputPorts = Array.from(state.ports.values()).filter(p => p.direction === 'input')
  if (inputPorts.length > 0) {
    const anyUnlocked = inputPorts.some(p => p.signalLocked === false)
    if (anyUnlocked) {
      return 'AMBER'
    }
  }

  return 'GREEN'
}
