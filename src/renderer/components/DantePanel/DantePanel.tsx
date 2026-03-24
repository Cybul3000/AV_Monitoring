// DantePanel.tsx — Top-level Dante Network Audio panel
import React, { useState } from 'react'
import { useDanteState } from './useDanteState'
import { DanteDeviceCard } from './DanteDeviceCard'
import type { DanteDeviceSnapshot } from '@shared/ipc-types'

// ── Component ──────────────────────────────────────────────────────────────────

export const DantePanel: React.FC = () => {
  const { devices, loading, error, rescan } = useDanteState()
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)

  const handleCardClick = (device: DanteDeviceSnapshot) => {
    setSelectedDeviceId(prev => prev === device.id ? null : device.id)
  }

  return (
    <div style={styles.container}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={styles.header}>
        <h3 style={styles.title}>Dante Network Audio</h3>
        <button
          style={styles.rescanBtn}
          onClick={rescan}
          disabled={loading}
        >
          {loading ? 'Scanning…' : 'Rescan'}
        </button>
      </div>

      {/* ── Loading spinner ──────────────────────────────────────────────── */}
      {loading && (
        <div style={styles.centerRow}>
          <span style={styles.loadingText}>Scanning for Dante devices…</span>
        </div>
      )}

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {!loading && error && (
        <div style={styles.errorBanner}>
          <span>Error: {error}</span>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!loading && !error && devices.length === 0 && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>
            No Dante devices found — check mDNS is not blocked on this network.
          </p>
        </div>
      )}

      {/* ── Device list ──────────────────────────────────────────────────── */}
      {!loading && devices.length > 0 && (
        <div style={styles.deviceList}>
          {devices.map(device => (
            <DanteDeviceCard
              key={device.id}
              device={device}
              allDevices={devices}
              selected={device.id === selectedDeviceId}
              onClick={() => handleCardClick(device)}
            />
          ))}
        </div>
      )}

      {/* ── Selected device detail ───────────────────────────────────────── */}
      {selectedDeviceId && (() => {
        const selected = devices.find(d => d.id === selectedDeviceId)
        if (!selected) return null
        return <DanteDeviceDetail device={selected} />
      })()}
    </div>
  )
}

// ── DanteDeviceDetail ──────────────────────────────────────────────────────────

interface DetailProps {
  device: DanteDeviceSnapshot
}

const DanteDeviceDetail: React.FC<DetailProps> = ({ device }) => (
  <div style={styles.detailPanel}>
    <h4 style={styles.detailTitle}>{device.danteName}</h4>
    <div style={styles.infoGrid}>
      <FieldRow label="IP Address"   value={device.ipAddress} />
      <FieldRow label="MAC Address"  value={device.macAddress ?? '—'} />
      <FieldRow label="Model"        value={device.model ?? '—'} />
      <FieldRow label="Display Name" value={device.displayName ?? '—'} />
      <FieldRow label="Sample Rate"  value={device.sampleRate ? `${device.sampleRate / 1000} kHz` : '—'} />
      <FieldRow label="Encoding"     value={device.encoding ? `${device.encoding}-bit` : '—'} />
      <FieldRow label="TX Channels"  value={String(device.txChannelCount)} />
      <FieldRow label="RX Channels"  value={String(device.rxChannelCount)} />
      <FieldRow label="Status"       value={device.ledStatus} />
      <FieldRow label="ARC Port"     value="—" />
    </div>
  </div>
)

interface FieldRowProps {
  label: string
  value: string
}

const FieldRow: React.FC<FieldRowProps> = ({ label, value }) => (
  <>
    <span style={styles.fieldLabel}>{label}</span>
    <span style={styles.fieldValue}>{value}</span>
  </>
)

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display:        'flex',
    flexDirection:  'column',
    gap:            '12px',
    padding:        '0',
  },
  header: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   '4px',
  },
  title: {
    margin:     0,
    fontSize:   '15px',
    fontWeight: 600,
    color:      'var(--color-text-strong, #111827)',
  },
  rescanBtn: {
    padding:         '4px 12px',
    fontSize:        '12px',
    fontWeight:      500,
    border:          '1px solid var(--color-border, #e5e7eb)',
    borderRadius:    '6px',
    backgroundColor: 'var(--color-bg-surface, #fff)',
    color:           'var(--color-text-primary, #111827)',
    cursor:          'pointer',
  },
  centerRow: {
    display:        'flex',
    justifyContent: 'center',
    padding:        '24px 0',
  },
  loadingText: {
    fontSize:  '13px',
    color:     'var(--color-text-muted, #6b7280)',
    fontStyle: 'italic',
  },
  errorBanner: {
    padding:         '10px 14px',
    backgroundColor: 'rgba(239,68,68,0.1)',
    border:          '1px solid var(--color-red, #ef4444)',
    borderRadius:    '6px',
    fontSize:        '13px',
    color:           'var(--color-red, #ef4444)',
  },
  emptyState: {
    padding:    '32px 0',
    textAlign:  'center',
  },
  emptyText: {
    margin:   0,
    fontSize: '13px',
    color:    'var(--color-text-muted, #6b7280)',
  },
  deviceList: {
    display:        'flex',
    flexDirection:  'column',
    gap:            '8px',
  },
  detailPanel: {
    marginTop:       '8px',
    padding:         '16px',
    backgroundColor: 'var(--color-bg-surface, #ffffff)',
    border:          '1px solid var(--color-border, #e5e7eb)',
    borderRadius:    '8px',
  },
  detailTitle: {
    margin:       '0 0 12px 0',
    fontSize:     '14px',
    fontWeight:   600,
    color:        'var(--color-text-strong, #111827)',
  },
  infoGrid: {
    display:             'grid',
    gridTemplateColumns: '120px 1fr',
    gap:                 '4px 8px',
    fontSize:            '13px',
  },
  fieldLabel: {
    color:      'var(--color-text-muted, #6b7280)',
    fontWeight: 500,
  },
  fieldValue: {
    color:      'var(--color-text-primary, #111827)',
    fontFamily: 'monospace',
  },
}
