import React, { useState } from 'react'
import { LEDIndicator } from '../components/LEDIndicator'
import { FloorMap } from '../components/FloorMap/FloorMap'
import { useHierarchy } from '../hooks/useHierarchy'
import { useDeviceStatus } from '../hooks/useDeviceStatus'
import type { HierarchyNode } from '@shared/ipc-types'

interface Props {
  regionId: string
  officeId: string
  floorId: string
  onNavigate: (type: string, id: string, name: string) => void
}

export const FloorView: React.FC<Props> = ({ regionId, officeId, floorId, onNavigate }) => {
  const { roots, update } = useHierarchy()
  const { getRoomLED } = useDeviceStatus()
  const [showAdd, setShowAdd] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')

  const floor = roots
    .find(r => r.id === regionId)
    ?.children?.find(o => o.id === officeId)
    ?.children?.find(f => f.id === floorId)

  if (!floor) return <div style={styles.center}><span>Floor not found</span></div>

  const rooms = floor.children ?? []
  const hasFloorMap = !!floor.floorMapPath

  const handleUploadFloorMap = async () => {
    const filePath = await (window.api as unknown as { selectFile: () => Promise<string | null> }).selectFile?.()
    if (!filePath) return
    await update({ action: 'update', type: 'floor', id: floorId, data: { name: floor.name, level: floor.level, floorMapPath: filePath } })
  }

  const handleAddRoom = async () => {
    if (!newRoomName.trim()) return
    await update({ action: 'create', type: 'room', parentId: floorId, data: { name: newRoomName.trim() } })
    setNewRoomName('')
    setShowAdd(false)
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 style={styles.title}>{floor.name}</h2>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
          {hasFloorMap ? (
            <button
              style={{ ...styles.toggleBtn, background: viewMode === 'map' ? 'var(--color-accent)' : 'transparent' }}
              onClick={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}
            >
              {viewMode === 'map' ? 'List View' : 'Map View'}
            </button>
          ) : (
            <button style={styles.toggleBtn} onClick={() => void handleUploadFloorMap()}>
              Upload Floor Plan
            </button>
          )}
          <button style={styles.addBtn} onClick={() => setShowAdd(true)}>+ Add Room</button>
        </div>
      </header>

      {viewMode === 'map' && hasFloorMap ? (
        <FloorMap
          floor={floor}
          rooms={rooms}
          getRoomLED={getRoomLED}
          onRoomClick={(roomId, roomName) => onNavigate('room', roomId, roomName)}
          onUpdate={update}
        />
      ) : rooms.length === 0 ? (
        <div style={styles.empty}>
          {!hasFloorMap && (
            <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-md)' }}>
              No floor map uploaded. Upload a floor plan to enable map view.
            </p>
          )}
          <p style={{ color: 'var(--color-text-muted)' }}>No rooms configured on this floor.</p>
        </div>
      ) : (
        <div style={styles.list}>
          {rooms.map(room => (
            <RoomRow
              key={room.id}
              room={room}
              ledStatus={getRoomLED(room.id)}
              onClick={() => onNavigate('room', room.id, room.name)}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <div style={styles.overlay} onClick={() => setShowAdd(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 'var(--spacing-md)' }}>Add Room</h3>
            <input autoFocus style={styles.input} placeholder="Room name"
              value={newRoomName} onChange={e => setNewRoomName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleAddRoom(); if (e.key === 'Escape') setShowAdd(false) }} />
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end' }}>
              <button style={styles.cancelBtn} onClick={() => setShowAdd(false)}>Cancel</button>
              <button style={styles.confirmBtn} onClick={() => void handleAddRoom()}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const RoomRow: React.FC<{ room: HierarchyNode; ledStatus: string; onClick: () => void }> = ({ room, ledStatus, onClick }) => (
  <button onClick={onClick} style={styles.row}>
    <LEDIndicator status={ledStatus as 'GREEN' | 'AMBER' | 'RED' | 'GREY'} size="md" />
    <div style={{ flex: 1, fontWeight: 600 }}>{room.name}</div>
    <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
      {room.children?.length ?? 0} device{room.children?.length !== 1 ? 's' : ''} ›
    </span>
  </button>
)

const styles = {
  container: { padding: 'var(--spacing-xl)', height: '100%', overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-xl)', flexShrink: 0 },
  title: { fontSize: 'var(--font-size-xl)', fontWeight: 700 },
  list: { display: 'flex', flexDirection: 'column' as const, gap: 'var(--spacing-sm)' },
  empty: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', height: 200, gap: 'var(--spacing-sm)' },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' },
  row: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', padding: 'var(--spacing-md)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left' as const },
  addBtn: { padding: '8px 16px', background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' },
  toggleBtn: { padding: '6px 14px', background: 'transparent', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
  cancelBtn: { padding: '6px 14px', background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
  confirmBtn: { padding: '6px 14px', background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' },
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  modal: { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-xl)', width: 360 },
  input: { width: '100%', padding: '8px 12px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-md)', marginBottom: 'var(--spacing-sm)', outline: 'none', display: 'block' }
}
