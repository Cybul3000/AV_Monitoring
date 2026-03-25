import React from 'react'
import type { HierarchyNode } from '@shared/ipc-types'

interface PortMeta {
  portId: string
  direction: 'input' | 'output'
  label: string
  signalLocked: boolean | null
  connectedSource: string | null
}

interface PresetMeta {
  index: number
  name: string
}

interface LightwareMeta {
  productName: string | null
  firmwareVersion: string | null
  serialNumber: string | null
  ports: PortMeta[]
  presets: PresetMeta[]
  temperature: number | null
  fanStatus: string | null
}

interface Props {
  device: HierarchyNode
  meta: Record<string, unknown>
  onCommand: (command: string, params?: Record<string, unknown>) => void
}

function parseMeta(meta: Record<string, unknown>): LightwareMeta {
  return {
    productName: (meta.productName as string | null) ?? null,
    firmwareVersion: (meta.firmwareVersion as string | null) ?? null,
    serialNumber: (meta.serialNumber as string | null) ?? null,
    ports: Array.isArray(meta.ports) ? (meta.ports as PortMeta[]) : [],
    presets: Array.isArray(meta.presets) ? (meta.presets as PresetMeta[]) : [],
    temperature: (meta.temperature as number | null) ?? null,
    fanStatus: (meta.fanStatus as string | null) ?? null,
  }
}

const styles = {
  panel: {
    padding: 'var(--spacing-lg)',
    color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-bg-surface)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--spacing-lg)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--spacing-sm)',
  },
  sectionTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--color-text-primary)',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: 'var(--spacing-sm)',
    marginBottom: 'var(--spacing-sm)',
  },
  identityRow: {
    display: 'flex',
    flexDirection: 'row' as const,
    gap: 'var(--spacing-lg)',
    flexWrap: 'wrap' as const,
  },
  identityItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  identityLabel: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-primary)',
    opacity: 0.6,
  },
  identityValue: {
    fontSize: 'var(--font-size-md)',
    color: 'var(--color-text-primary)',
    fontFamily: 'monospace',
  },
  portsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--spacing-md)',
  },
  portColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--spacing-sm)',
  },
  columnHeader: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    opacity: 0.8,
    marginBottom: '2px',
  },
  portRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--spacing-sm)',
    padding: 'var(--spacing-sm)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-bg-surface)',
  },
  portLabel: {
    flex: 1,
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-primary)',
  },
  portId: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-primary)',
    opacity: 0.5,
    fontFamily: 'monospace',
  },
  routingTag: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-primary)',
    opacity: 0.7,
    fontFamily: 'monospace',
    padding: '1px 6px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
  },
  presetsGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 'var(--spacing-sm)',
  },
  presetButton: {
    padding: 'var(--spacing-sm) var(--spacing-md)',
    backgroundColor: 'var(--color-bg-surface)',
    border: '1px solid var(--color-accent)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-accent)',
    fontSize: 'var(--font-size-sm)',
    cursor: 'pointer',
  },
  healthRow: {
    display: 'flex',
    gap: 'var(--spacing-lg)',
    alignItems: 'center',
  },
  healthItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--spacing-sm)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-primary)',
  },
  healthLabel: {
    opacity: 0.6,
  },
  healthValue: {
    fontFamily: 'monospace',
    fontWeight: 500,
  },
  emptyNote: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-primary)',
    opacity: 0.5,
    fontStyle: 'italic' as const,
  },
}

// Signal lock indicator dot
function SignalDot({ signalLocked }: { signalLocked: boolean | null }): React.ReactElement {
  let color: string
  let title: string

  if (signalLocked === null) {
    color = 'var(--color-grey, #888)'
    title = 'Signal status unknown'
  } else if (signalLocked) {
    color = 'var(--color-green)'
    title = 'Signal locked'
  } else {
    color = 'var(--color-red)'
    title = 'No signal'
  }

  return (
    <span
      title={title}
      style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  )
}

// Fan status badge
function FanBadge({ fanStatus }: { fanStatus: string | null }): React.ReactElement | null {
  if (!fanStatus) return null

  const isFault = fanStatus === 'FAULT'
  return (
    <span
      style={{
        padding: '1px 8px',
        borderRadius: 'var(--radius-md)',
        fontSize: 'var(--font-size-sm)',
        fontWeight: 600,
        backgroundColor: isFault ? 'var(--color-red)' : 'var(--color-green)',
        color: '#fff',
      }}
    >
      {fanStatus}
    </span>
  )
}

export const LightwarePanel: React.FC<Props> = ({ device, meta, onCommand }) => {
  const info = parseMeta(meta)

  const inputPorts = info.ports.filter(p => p.direction === 'input')
  const outputPorts = info.ports.filter(p => p.direction === 'output')

  // Build a map of output portId → connectedSource label
  const inputPortMap = new Map(info.ports.filter(p => p.direction === 'input').map(p => [p.portId, p.label]))

  const getSourceLabel = (connectedSource: string | null): string => {
    if (!connectedSource) return '—'
    if (connectedSource === '0') return 'Disconnected'
    return inputPortMap.get(connectedSource) ?? connectedSource
  }

  const handlePreset = (preset: PresetMeta) => {
    // MX2 uses name, MMX uses index — pass both so module can decide
    onCommand('recallPreset', { name: preset.name, index: preset.index })
  }

  return (
    <div style={styles.panel}>
      {/* Device identity */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>{device.name}</div>
        <div style={styles.identityRow}>
          <div style={styles.identityItem}>
            <span style={styles.identityLabel}>Product</span>
            <span style={styles.identityValue}>{info.productName ?? '—'}</span>
          </div>
          <div style={styles.identityItem}>
            <span style={styles.identityLabel}>Firmware</span>
            <span style={styles.identityValue}>{info.firmwareVersion ?? '—'}</span>
          </div>
          <div style={styles.identityItem}>
            <span style={styles.identityLabel}>Serial</span>
            <span style={styles.identityValue}>{info.serialNumber ?? '—'}</span>
          </div>
        </div>
      </div>

      {/* Ports grid */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Ports</div>
        {info.ports.length === 0 ? (
          <span style={styles.emptyNote}>No port data available</span>
        ) : (
          <div style={styles.portsGrid}>
            {/* Input ports */}
            <div style={styles.portColumn}>
              <div style={styles.columnHeader}>Inputs</div>
              {inputPorts.length === 0 ? (
                <span style={styles.emptyNote}>None</span>
              ) : (
                inputPorts.map(port => (
                  <div key={port.portId} style={styles.portRow}>
                    <SignalDot signalLocked={port.signalLocked} />
                    <span style={styles.portLabel}>{port.label}</span>
                    <span style={styles.portId}>{port.portId}</span>
                  </div>
                ))
              )}
            </div>

            {/* Output ports */}
            <div style={styles.portColumn}>
              <div style={styles.columnHeader}>Outputs</div>
              {outputPorts.length === 0 ? (
                <span style={styles.emptyNote}>None</span>
              ) : (
                outputPorts.map(port => (
                  <div key={port.portId} style={styles.portRow}>
                    <span style={styles.portLabel}>{port.label}</span>
                    <span style={styles.portId}>{port.portId}</span>
                    <span style={styles.routingTag} title="Connected source">
                      {getSourceLabel(port.connectedSource)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Presets */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Presets</div>
        {info.presets.length === 0 ? (
          <span style={styles.emptyNote}>No presets configured</span>
        ) : (
          <div style={styles.presetsGrid}>
            {info.presets.map(preset => (
              <button
                key={preset.index}
                style={styles.presetButton}
                onClick={() => handlePreset(preset)}
                title={`Recall preset: ${preset.name}`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Health */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Health</div>
        <div style={styles.healthRow}>
          <div style={styles.healthItem}>
            <span style={styles.healthLabel}>Temperature</span>
            <span style={styles.healthValue}>
              {info.temperature !== null ? `${info.temperature}°C` : '—'}
            </span>
          </div>
          <div style={styles.healthItem}>
            <span style={styles.healthLabel}>Fan</span>
            {info.fanStatus ? (
              <FanBadge fanStatus={info.fanStatus} />
            ) : (
              <span style={styles.healthValue}>—</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
