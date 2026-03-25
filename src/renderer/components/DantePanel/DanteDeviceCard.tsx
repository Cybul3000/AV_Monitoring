// DanteDeviceCard.tsx — Card showing Dante device info with LED status badge
import React from 'react'
import type { DanteDeviceSnapshot } from '@shared/ipc-types'

interface Props {
  device: DanteDeviceSnapshot
  allDevices: DanteDeviceSnapshot[]
  selected?: boolean
  onClick?: () => void
}

// ── LED badge helpers ──────────────────────────────────────────────────────────

function ledColor(status: DanteDeviceSnapshot['ledStatus']): string {
  switch (status) {
    case 'GREEN':  return '#22c55e'
    case 'AMBER':  return '#f59e0b'
    case 'RED':    return '#ef4444'
    case 'GREY':
    default:       return '#6b7280'
  }
}

function formatSampleRate(sampleRate: number | null): string {
  if (sampleRate === null) return 'Unknown'
  if (sampleRate >= 1000) return `${(sampleRate / 1000).toFixed(1)} kHz`
  return `${sampleRate} Hz`
}

// ── Component ──────────────────────────────────────────────────────────────────

export const DanteDeviceCard: React.FC<Props> = ({ device, allDevices, selected = false, onClick }) => {
  // Check if another device shares the same danteName — show MAC suffix if so
  const hasDuplicate = allDevices.some(
    d => d.id !== device.id && d.danteName === device.danteName
  )

  const displayName = hasDuplicate && device.macAddress
    ? `${device.danteName} (${device.macAddress})`
    : device.danteName

  const color = ledColor(device.ledStatus)

  return (
    <button
      style={{
        ...styles.card,
        borderColor: selected ? 'var(--color-accent, #3b82f6)' : 'var(--color-border, #e5e7eb)',
        backgroundColor: selected ? 'var(--color-bg-elevated, #f0f9ff)' : 'var(--color-bg-surface, #ffffff)',
      }}
      onClick={onClick}
    >
      {/* LED badge */}
      <div style={{ ...styles.ledBadge, backgroundColor: color }} title={device.ledStatus} />

      <div style={styles.content}>
        <div style={styles.nameLine}>
          <span style={styles.deviceName}>{displayName}</span>
          {device.model && <span style={styles.modelTag}>{device.model}</span>}
        </div>

        <div style={styles.metaLine}>
          <span style={styles.metaItem}>{device.ipAddress}</span>
          <span style={styles.metaSep}>·</span>
          <span style={styles.metaItem}>{formatSampleRate(device.sampleRate)}</span>
          <span style={styles.metaSep}>·</span>
          <span style={styles.metaItem}>{device.txChannelCount} TX / {device.rxChannelCount} RX</span>
        </div>
      </div>
    </button>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  card: {
    display:        'flex',
    alignItems:     'center',
    gap:            '12px',
    padding:        '12px 16px',
    border:         '1px solid',
    borderRadius:   '8px',
    cursor:         'pointer',
    textAlign:      'left',
    width:          '100%',
    background:     'none',
    transition:     'border-color 0.15s, background-color 0.15s',
  },
  ledBadge: {
    flexShrink:   0,
    width:        '12px',
    height:       '12px',
    borderRadius: '50%',
  },
  content: {
    flex:           1,
    minWidth:       0,
  },
  nameLine: {
    display:        'flex',
    alignItems:     'center',
    gap:            '8px',
    marginBottom:   '4px',
  },
  deviceName: {
    fontWeight:     600,
    fontSize:       '14px',
    color:          'var(--color-text-primary, #111827)',
    overflow:       'hidden',
    textOverflow:   'ellipsis',
    whiteSpace:     'nowrap',
  },
  modelTag: {
    fontSize:        '11px',
    fontFamily:      'monospace',
    color:           'var(--color-text-muted, #6b7280)',
    backgroundColor: 'var(--color-code-bg, #f3f4f6)',
    padding:         '1px 6px',
    borderRadius:    '4px',
    flexShrink:      0,
  },
  metaLine: {
    display:    'flex',
    alignItems: 'center',
    gap:        '4px',
    fontSize:   '12px',
    color:      'var(--color-text-muted, #6b7280)',
  },
  metaItem: {
    fontFamily: 'monospace',
  },
  metaSep: {
    color: 'var(--color-border, #e5e7eb)',
  },
}
