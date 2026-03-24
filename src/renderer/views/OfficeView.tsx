import React, { useState } from 'react'
import { LEDIndicator } from '../components/LEDIndicator'
import { useHierarchy } from '../hooks/useHierarchy'
import { useDeviceStatus } from '../hooks/useDeviceStatus'
import type { HierarchyNode } from '@shared/ipc-types'

interface Props {
  regionId: string
  officeId: string
  onNavigate: (type: string, id: string, name: string) => void
}

export const OfficeView: React.FC<Props> = ({ regionId, officeId, onNavigate }) => {
  const { roots, update } = useHierarchy()
  const { getFloorLED } = useDeviceStatus()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', level: '' })

  const office = roots.find(r => r.id === regionId)?.children?.find(o => o.id === officeId)
  if (!office) return <div style={styles.center}><span>Office not found</span></div>

  const floors = office.children ?? []

  const handleAdd = async () => {
    if (!form.name.trim()) return
    const level = parseInt(form.level, 10) || floors.length + 1
    await update({ action: 'create', type: 'floor', parentId: officeId, data: { name: form.name.trim(), level } })
    setForm({ name: '', level: '' })
    setShowAdd(false)
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 style={styles.title}>{office.name}</h2>
        <button style={styles.addBtn} onClick={() => setShowAdd(true)}>+ Add Floor</button>
      </header>

      {floors.length === 0 ? (
        <div style={styles.empty}>
          <p style={{ color: 'var(--color-text-muted)' }}>No floors configured for this office.</p>
        </div>
      ) : (
        <div style={styles.list}>
          {[...floors].sort((a, b) => (a.level ?? 0) - (b.level ?? 0)).map(floor => (
            <FloorRow
              key={floor.id}
              floor={floor}
              ledStatus={getFloorLED(floor.id)}
              onClick={() => onNavigate('floor', floor.id, floor.name)}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <div style={styles.overlay} onClick={() => setShowAdd(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 'var(--spacing-md)' }}>Add Floor</h3>
            <input autoFocus style={styles.input} placeholder="Floor name (e.g., Ground Floor)"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <input style={styles.input} placeholder="Level number (e.g., 1, 2, -1 for basement)"
              type="number" value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') void handleAdd() }} />
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end' }}>
              <button style={styles.cancelBtn} onClick={() => setShowAdd(false)}>Cancel</button>
              <button style={styles.confirmBtn} onClick={() => void handleAdd()}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const FloorRow: React.FC<{ floor: HierarchyNode; ledStatus: string; onClick: () => void }> = ({
  floor, ledStatus, onClick
}) => (
  <button onClick={onClick} style={styles.row}>
    <LEDIndicator status={ledStatus as 'GREEN' | 'AMBER' | 'RED' | 'GREY'} size="md" />
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 600 }}>{floor.name}</div>
      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
        Level {floor.level ?? '?'}
        {floor.floorMapPath ? ' · Floor map uploaded' : ''}
      </div>
    </div>
    <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
      {floor.children?.length ?? 0} room{floor.children?.length !== 1 ? 's' : ''} ›
    </span>
  </button>
)

const styles = {
  container: { padding: 'var(--spacing-xl)', height: '100%', overflowY: 'auto' as const },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-xl)' },
  title: { fontSize: 'var(--font-size-xl)', fontWeight: 700 },
  list: { display: 'flex', flexDirection: 'column' as const, gap: 'var(--spacing-sm)' },
  empty: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' },
  row: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', padding: 'var(--spacing-md)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left' as const },
  addBtn: { padding: '8px 16px', background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { padding: '6px 14px', background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
  confirmBtn: { padding: '6px 14px', background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' },
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  modal: { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-xl)', width: 360 },
  input: { width: '100%', padding: '8px 12px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-md)', marginBottom: 'var(--spacing-sm)', outline: 'none', display: 'block' }
}
