import React, { useState } from 'react'
import { LEDIndicator } from '../components/LEDIndicator'
import { useHierarchy } from '../hooks/useHierarchy'
import { useDeviceStatus } from '../hooks/useDeviceStatus'
import type { HierarchyNode } from '@shared/ipc-types'

interface Props {
  onNavigate: (type: string, id: string, name: string) => void
}

export const GlobalDashboard: React.FC<Props> = ({ onNavigate }) => {
  const { roots, loading, error, update } = useHierarchy()
  const { getRegionLED } = useDeviceStatus()
  const [showAddRegion, setShowAddRegion] = useState(false)
  const [newRegionName, setNewRegionName] = useState('')

  const handleAddRegion = async () => {
    if (!newRegionName.trim()) return
    await update({ action: 'create', type: 'region', data: { name: newRegionName.trim() } })
    setNewRegionName('')
    setShowAddRegion(false)
  }

  if (loading) {
    return (
      <div style={styles.center}>
        <span style={{ color: 'var(--color-text-muted)' }}>Loading…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.center}>
        <span style={{ color: 'var(--color-red)' }}>Error: {error}</span>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Global Dashboard</h1>
        <button style={styles.addBtn} onClick={() => setShowAddRegion(true)}>
          + Add Region
        </button>
      </header>

      {roots.length === 0 ? (
        <div style={styles.empty}>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-md)' }}>
            No regions configured yet.
          </p>
          <button style={styles.addBtn} onClick={() => setShowAddRegion(true)}>
            Add your first region
          </button>
        </div>
      ) : (
        <div style={styles.grid}>
          {roots.map(region => (
            <RegionCard
              key={region.id}
              region={region}
              ledStatus={getRegionLED(region.id)}
              onClick={() => onNavigate('region', region.id, region.name)}
            />
          ))}
        </div>
      )}

      {showAddRegion && (
        <div style={styles.overlay} onClick={() => setShowAddRegion(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 'var(--spacing-md)' }}>Add Region</h3>
            <input
              autoFocus
              style={styles.input}
              placeholder="Region name (e.g., EMEA, APAC)"
              value={newRegionName}
              onChange={e => setNewRegionName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void handleAddRegion()
                if (e.key === 'Escape') setShowAddRegion(false)
              }}
            />
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end' }}>
              <button style={styles.cancelBtn} onClick={() => setShowAddRegion(false)}>Cancel</button>
              <button style={styles.confirmBtn} onClick={() => void handleAddRegion()}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const RegionCard: React.FC<{
  region: HierarchyNode
  ledStatus: ReturnType<typeof useDeviceStatus>['getRegionLED'] extends (...args: unknown[]) => infer R ? R : never
  onClick: () => void
}> = ({ region, ledStatus, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 'var(--spacing-sm)',
      padding: 'var(--spacing-lg)',
      background: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      cursor: 'pointer',
      textAlign: 'left',
      transition: 'border-color var(--transition-fast), background var(--transition-fast)',
      minWidth: 180
    }}
    onMouseEnter={e => {
      ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-accent)'
    }}
    onMouseLeave={e => {
      ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border)'
    }}
  >
    <LEDIndicator status={ledStatus} size="lg" />
    <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
      {region.name}
    </span>
    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
      {region.children?.length ?? 0} office{region.children?.length !== 1 ? 's' : ''}
    </span>
  </button>
)

const styles = {
  container: {
    padding: 'var(--spacing-xl)',
    height: '100%',
    overflowY: 'auto' as const
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--spacing-xl)'
  },
  title: {
    fontSize: 'var(--font-size-2xl)',
    fontWeight: 700
  },
  grid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 'var(--spacing-md)'
  },
  empty: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: 300
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%'
  },
  addBtn: {
    padding: '8px 16px',
    background: 'var(--color-accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    cursor: 'pointer'
  },
  cancelBtn: {
    padding: '6px 14px',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)',
    cursor: 'pointer'
  },
  confirmBtn: {
    padding: '6px 14px',
    background: 'var(--color-accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    cursor: 'pointer'
  },
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999
  },
  modal: {
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--spacing-xl)',
    width: 360
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-primary)',
    fontSize: 'var(--font-size-md)',
    marginBottom: 'var(--spacing-md)',
    outline: 'none'
  }
}
