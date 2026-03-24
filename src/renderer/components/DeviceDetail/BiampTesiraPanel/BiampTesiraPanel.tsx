import React from 'react'
import type { HierarchyNode } from '@shared/ipc-types'

// ── Types mirroring TesiraDeviceState ─────────────────────────────────────────

interface FaultEntry {
  description: string
  severity?: string
  code?: number
}

interface ChannelState {
  index: number
  level: number | null
  mute: boolean | null
}

interface BlockState {
  instanceTag: string
  label: string
  blockType: 'level' | 'dialer'
  channels?: ChannelState[]
  callState?: 'IDLE' | 'ACTIVE' | 'FAULT' | null
  privacyMute?: boolean | null
  isCritical?: boolean
}

interface BiampMeta {
  deviceModel?: string | null
  firmwareVersion?: string | null
  serialNumber?: string | null
  hostname?: string | null
  activeFaults?: FaultEntry[]
  blocks?: BlockState[]
  presets?: Array<{ name: string; label: string }>
  transportType?: 'ssh' | 'telnet'
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  device: HierarchyNode
  meta: Record<string, unknown>
  onCommand: (command: string, params?: Record<string, unknown>) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function asMeta(raw: Record<string, unknown>): BiampMeta {
  return raw as BiampMeta
}

function callStateBadgeStyle(callState: 'IDLE' | 'ACTIVE' | 'FAULT' | null | undefined): React.CSSProperties {
  if (callState === 'ACTIVE') return { ...styles.badge, backgroundColor: 'var(--color-green, #22c55e)', color: '#fff' }
  if (callState === 'FAULT')  return { ...styles.badge, backgroundColor: 'var(--color-red, #ef4444)',   color: '#fff' }
  return { ...styles.badge, backgroundColor: 'var(--color-grey, #6b7280)', color: '#fff' }
}

function severityBadgeStyle(severity?: string): React.CSSProperties {
  const sev = severity?.toLowerCase()
  if (sev === 'critical') return { ...styles.badge, backgroundColor: 'var(--color-red, #ef4444)',    color: '#fff' }
  if (sev === 'warning')  return { ...styles.badge, backgroundColor: 'var(--color-amber, #f59e0b)',  color: '#fff' }
  return                         { ...styles.badge, backgroundColor: 'var(--color-grey, #6b7280)',   color: '#fff' }
}

// ── Component ─────────────────────────────────────────────────────────────────

export const BiampTesiraPanel: React.FC<Props> = ({ device, meta, onCommand }) => {
  const m = asMeta(meta)

  const blocks   = m.blocks        ?? []
  const faults   = m.activeFaults  ?? []
  const presets  = m.presets       ?? []

  const levelBlocks  = blocks.filter(b => b.blockType === 'level')
  const dialerBlocks = blocks.filter(b => b.blockType === 'dialer')

  return (
    <div style={styles.container}>
      {/* ── Device identity ──────────────────────────────────────────────── */}
      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Device Information</h3>
        <div style={styles.identityGrid}>
          <IdentityRow label="Model"    value={m.deviceModel     ?? '—'} />
          <IdentityRow label="Firmware" value={m.firmwareVersion ?? '—'} />
          <IdentityRow label="Serial"   value={m.serialNumber    ?? '—'} />
          <IdentityRow label="Hostname" value={m.hostname        ?? device.host ?? '—'} />
          <IdentityRow label="Transport" value={m.transportType  ?? '—'} />
        </div>
      </section>

      {/* ── Active faults ────────────────────────────────────────────────── */}
      {faults.length > 0 && (
        <section style={styles.section}>
          <h3 style={{ ...styles.sectionTitle, color: 'var(--color-red, #ef4444)' }}>
            Active Faults ({faults.length})
          </h3>
          <ul style={styles.faultList}>
            {faults.map((fault, i) => (
              <li key={i} style={styles.faultItem}>
                <span style={styles.faultDescription}>{fault.description}</span>
                {fault.severity && (
                  <span style={severityBadgeStyle(fault.severity)}>{fault.severity}</span>
                )}
                {fault.code !== undefined && (
                  <span style={styles.faultCode}>#{fault.code}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Level control blocks ─────────────────────────────────────────── */}
      {levelBlocks.length > 0 && (
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>Audio Level Blocks</h3>
          {levelBlocks.map(block => (
            <LevelBlockPanel
              key={block.instanceTag}
              block={block}
              onCommand={onCommand}
            />
          ))}
        </section>
      )}

      {/* ── Dialer blocks ────────────────────────────────────────────────── */}
      {dialerBlocks.length > 0 && (
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>Dialer Blocks</h3>
          {dialerBlocks.map(block => (
            <DialerBlockPanel key={block.instanceTag} block={block} />
          ))}
        </section>
      )}

      {/* ── Presets ──────────────────────────────────────────────────────── */}
      {presets.length > 0 && (
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>Presets</h3>
          <div style={styles.presetsGrid}>
            {presets.map(preset => (
              <button
                key={preset.name}
                style={styles.presetButton}
                onClick={() => onCommand('recallPreset', { name: preset.name })}
              >
                {preset.label || preset.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {blocks.length === 0 && presets.length === 0 && faults.length === 0 && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>No blocks or presets configured for this device.</p>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface IdentityRowProps {
  label: string
  value: string
}

const IdentityRow: React.FC<IdentityRowProps> = ({ label, value }) => (
  <div style={styles.identityRow}>
    <span style={styles.identityLabel}>{label}</span>
    <span style={styles.identityValue}>{value}</span>
  </div>
)

interface LevelBlockPanelProps {
  block: BlockState
  onCommand: (command: string, params?: Record<string, unknown>) => void
}

const LevelBlockPanel: React.FC<LevelBlockPanelProps> = ({ block, onCommand }) => {
  const channels = block.channels ?? []

  return (
    <div style={styles.blockCard}>
      <div style={styles.blockHeader}>
        <span style={styles.blockLabel}>{block.label}</span>
        {block.isCritical && (
          <span style={{ ...styles.badge, backgroundColor: 'var(--color-amber, #f59e0b)', color: '#fff' }}>
            Critical
          </span>
        )}
        <span style={styles.instanceTagLabel}>{block.instanceTag}</span>
      </div>
      {channels.map(ch => (
        <div key={ch.index} style={styles.channelRow}>
          <span style={styles.channelLabel}>Ch {ch.index}</span>
          <span style={styles.levelValue}>
            {ch.level !== null ? `${ch.level.toFixed(1)} dB` : '—'}
          </span>
          <span style={{
            ...styles.muteIndicator,
            backgroundColor: ch.mute ? 'var(--color-red, #ef4444)' : 'var(--color-grey, #6b7280)'
          }}>
            {ch.mute ? 'MUTED' : 'LIVE'}
          </span>
          <button
            style={styles.controlButton}
            onClick={() => onCommand('setMute', {
              instanceTag: block.instanceTag,
              channel: ch.index,
              mute: !ch.mute
            })}
          >
            {ch.mute ? 'Unmute' : 'Mute'}
          </button>
          <button
            style={styles.controlButton}
            onClick={() => onCommand('setLevel', {
              instanceTag: block.instanceTag,
              channel: ch.index,
              levelDb: (ch.level ?? 0) + 3
            })}
          >
            +3 dB
          </button>
          <button
            style={styles.controlButton}
            onClick={() => onCommand('setLevel', {
              instanceTag: block.instanceTag,
              channel: ch.index,
              levelDb: (ch.level ?? 0) - 3
            })}
          >
            -3 dB
          </button>
        </div>
      ))}
      {channels.length === 0 && (
        <p style={styles.emptyText}>No channel data available.</p>
      )}
    </div>
  )
}

interface DialerBlockPanelProps {
  block: BlockState
}

const DialerBlockPanel: React.FC<DialerBlockPanelProps> = ({ block }) => (
  <div style={styles.blockCard}>
    <div style={styles.blockHeader}>
      <span style={styles.blockLabel}>{block.label}</span>
      <span style={styles.instanceTagLabel}>{block.instanceTag}</span>
    </div>
    <div style={styles.dialerRow}>
      <span style={styles.channelLabel}>Call State</span>
      <span style={callStateBadgeStyle(block.callState)}>
        {block.callState ?? 'UNKNOWN'}
      </span>
      {block.privacyMute !== null && block.privacyMute !== undefined && (
        <span style={styles.channelLabel}>
          Privacy Mute: <strong>{block.privacyMute ? 'ON' : 'OFF'}</strong>
        </span>
      )}
    </div>
  </div>
)

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display:      'flex',
    flexDirection: 'column',
    gap:          '16px',
    padding:      '16px',
    fontFamily:   'var(--font-family, system-ui, sans-serif)',
    fontSize:     '14px',
    color:        'var(--color-text, #1f2937)'
  },
  section: {
    backgroundColor: 'var(--color-surface, #ffffff)',
    border:          '1px solid var(--color-border, #e5e7eb)',
    borderRadius:    '8px',
    padding:         '16px'
  },
  sectionTitle: {
    margin:        '0 0 12px 0',
    fontSize:      '15px',
    fontWeight:    600,
    color:         'var(--color-text-strong, #111827)'
  },
  identityGrid: {
    display:             'grid',
    gridTemplateColumns: '140px 1fr',
    gap:                 '6px 8px'
  },
  identityRow: {
    display:        'contents'
  },
  identityLabel: {
    color:      'var(--color-text-muted, #6b7280)',
    fontWeight: 500
  },
  identityValue: {
    color:        'var(--color-text, #1f2937)',
    wordBreak:    'break-all'
  },
  faultList: {
    listStyle: 'none',
    margin:    0,
    padding:   0,
    display:   'flex',
    flexDirection: 'column',
    gap:       '6px'
  },
  faultItem: {
    display:        'flex',
    alignItems:     'center',
    gap:            '8px',
    padding:        '6px 8px',
    backgroundColor: 'var(--color-error-bg, #fef2f2)',
    borderRadius:   '4px'
  },
  faultDescription: {
    flex:  1,
    color: 'var(--color-error-text, #991b1b)'
  },
  faultCode: {
    fontSize:  '12px',
    color:     'var(--color-text-muted, #6b7280)',
    fontFamily: 'monospace'
  },
  blockCard: {
    border:          '1px solid var(--color-border-subtle, #f3f4f6)',
    borderRadius:    '6px',
    padding:         '12px',
    marginBottom:    '8px',
    backgroundColor: 'var(--color-surface-subtle, #f9fafb)'
  },
  blockHeader: {
    display:        'flex',
    alignItems:     'center',
    gap:            '8px',
    marginBottom:   '10px'
  },
  blockLabel: {
    fontWeight: 600,
    color:      'var(--color-text-strong, #111827)',
    flex:       1
  },
  instanceTagLabel: {
    fontSize:   '12px',
    fontFamily: 'monospace',
    color:      'var(--color-text-muted, #6b7280)',
    backgroundColor: 'var(--color-code-bg, #f3f4f6)',
    padding:    '2px 6px',
    borderRadius: '3px'
  },
  channelRow: {
    display:     'flex',
    alignItems:  'center',
    gap:         '8px',
    padding:     '4px 0',
    borderTop:   '1px solid var(--color-border-subtle, #f3f4f6)'
  },
  dialerRow: {
    display:     'flex',
    alignItems:  'center',
    gap:         '12px'
  },
  channelLabel: {
    minWidth:   '40px',
    color:      'var(--color-text-muted, #6b7280)',
    fontSize:   '13px'
  },
  levelValue: {
    minWidth:   '72px',
    fontFamily: 'monospace',
    fontSize:   '13px',
    color:      'var(--color-text, #1f2937)'
  },
  muteIndicator: {
    padding:      '2px 8px',
    borderRadius: '12px',
    fontSize:     '11px',
    fontWeight:   700,
    color:        '#fff',
    letterSpacing: '0.5px'
  },
  controlButton: {
    padding:         '3px 10px',
    border:          '1px solid var(--color-border, #e5e7eb)',
    borderRadius:    '4px',
    backgroundColor: 'var(--color-surface, #ffffff)',
    color:           'var(--color-text, #1f2937)',
    cursor:          'pointer',
    fontSize:        '12px',
    fontWeight:      500
  },
  presetsGrid: {
    display:  'flex',
    flexWrap: 'wrap',
    gap:      '8px'
  },
  presetButton: {
    padding:         '6px 16px',
    border:          '1px solid var(--color-border, #e5e7eb)',
    borderRadius:    '6px',
    backgroundColor: 'var(--color-surface, #ffffff)',
    color:           'var(--color-text, #1f2937)',
    cursor:          'pointer',
    fontSize:        '13px',
    fontWeight:      500,
    transition:      'background-color 0.15s'
  },
  badge: {
    display:      'inline-flex',
    alignItems:   'center',
    padding:      '2px 8px',
    borderRadius: '12px',
    fontSize:     '11px',
    fontWeight:   600
  },
  emptyState: {
    padding:    '32px 16px',
    textAlign:  'center'
  },
  emptyText: {
    color:  'var(--color-text-muted, #6b7280)',
    margin: 0
  }
}
