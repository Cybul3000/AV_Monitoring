export interface FaultEntry {
  description: string
  severity?: string
  code?: number
}

export interface ChannelState {
  index: number
  level: number | null    // dB
  mute: boolean | null
}

export interface BlockState {
  instanceTag: string
  label: string
  blockType: 'level' | 'dialer'
  channels?: ChannelState[]
  callState?: 'IDLE' | 'ACTIVE' | 'FAULT' | null
  privacyMute?: boolean | null
  isCritical?: boolean
}

export interface TesiraState {
  deviceId: string
  deviceModel: string | null
  firmwareVersion: string | null
  serialNumber: string | null
  hostname: string | null
  activeFaults: FaultEntry[]
  blocks: BlockState[]
  presets: Array<{ name: string; label: string }>
  transportType: 'ssh' | 'telnet'
  connected: boolean
}

export function createEmptyState(deviceId: string, transportType: 'ssh' | 'telnet'): TesiraState {
  return {
    deviceId,
    deviceModel: null,
    firmwareVersion: null,
    serialNumber: null,
    hostname: null,
    activeFaults: [],
    blocks: [],
    presets: [],
    transportType,
    connected: false
  }
}

/**
 * Aggregate TesiraState into a single LED status value.
 *
 * Rules (evaluated in priority order):
 *   GREY  — never connected (connected=false AND deviceModel=null)
 *   RED   — currently disconnected (connected=false and was previously seen)
 *   RED   — any fault with severity matching 'critical' (case-insensitive)
 *   AMBER — any non-critical fault present
 *   AMBER — any level block marked isCritical has a channel with mute=true
 *   AMBER — any dialer block in FAULT callState
 *   GREEN — all normal
 */
export function aggregateStatus(state: TesiraState): 'GREEN' | 'AMBER' | 'RED' | 'GREY' {
  // Never connected
  if (!state.connected && state.deviceModel === null) {
    return 'GREY'
  }

  // Disconnected (was connected before)
  if (!state.connected) {
    return 'RED'
  }

  // Critical fault severity
  const hasCriticalFault = state.activeFaults.some(
    f => f.severity?.toLowerCase() === 'critical'
  )
  if (hasCriticalFault) {
    return 'RED'
  }

  // Any non-critical fault
  if (state.activeFaults.length > 0) {
    return 'AMBER'
  }

  // Critical block channels muted
  const criticalChannelMuted = state.blocks.some(
    block =>
      block.isCritical &&
      block.blockType === 'level' &&
      block.channels?.some(ch => ch.mute === true)
  )
  if (criticalChannelMuted) {
    return 'AMBER'
  }

  // Dialer in FAULT
  const dialerFault = state.blocks.some(
    block => block.blockType === 'dialer' && block.callState === 'FAULT'
  )
  if (dialerFault) {
    return 'AMBER'
  }

  return 'GREEN'
}
