import React, { useState } from 'react'
import { useHierarchy } from '../hooks/useHierarchy'
import { AddDeviceForm } from '../components/AddDeviceForm'

interface Props {
  onNavigate: (type: string, id: string, name: string) => void
}

interface DeviceTypeEntry {
  type: string
  label: string
  description?: string
  moduleAvailable: boolean
}

export const ConfigView: React.FC<Props> = ({ onNavigate }) => {
  const { roots, update } = useHierarchy()
  const [addingToRoom, setAddingToRoom] = useState<{ roomId: string; roomName: string } | null>(null)

  const deviceTypes: DeviceTypeEntry[] = [
    { type: 'zoom-room', label: 'Zoom Room', description: 'Zoom Rooms hardware via Zoom REST API', moduleAvailable: true },
    { type: 'crestron-ssh', label: 'Crestron SSH', description: 'Crestron processors via SSH', moduleAvailable: false },
    { type: 'biamp-tesira', label: 'Biamp Tesira', description: 'Biamp Tesira DSP via TTP/SSH', moduleAvailable: false },
    { type: 'lightware-matrix', label: 'Lightware Matrix', description: 'Lightware video matrix via LW3', moduleAvailable: false },
    { type: 'lg-display', label: 'LG Pro Display', description: 'LG commercial displays', moduleAvailable: false },
    { type: 'dante-audio', label: 'Dante Audio', description: 'Dante network audio devices', moduleAvailable: false }
  ]

  const allRooms: Array<{ room: { id: string; name: string }; floor: string; office: string; region: string }> = []
  roots.forEach(region => {
    region.children?.forEach(office => {
      office.children?.forEach(floor => {
        floor.children?.forEach(room => {
          allRooms.push({ room: { id: room.id, name: room.name }, floor: floor.name, office: office.name, region: region.name })
        })
      })
    })
  })

  const handleAdd = async (data: {
    name: string
    deviceType: string
    host: string
    port?: number
    credentials?: Record<string, string>
    config?: Record<string, unknown>
  }) => {
    if (!addingToRoom) return
    await update({
      action: 'create', type: 'device', parentId: addingToRoom.roomId,
      data: {
        name: data.name, deviceType: data.deviceType,
        host: data.host, port: data.port
      }
    })
    setAddingToRoom(null)
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 style={styles.title}>Device Configuration</h2>
      </header>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Device Types</h3>
        <div style={styles.typeGrid}>
          {deviceTypes.map(dt => (
            <div key={dt.type} style={styles.typeCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-xs)' }}>
                <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{dt.label}</span>
                <span style={{
                  fontSize: 'var(--font-size-xs)', padding: '1px 6px',
                  borderRadius: 'var(--radius-sm)',
                  background: dt.moduleAvailable ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)',
                  color: dt.moduleAvailable ? 'var(--color-green)' : 'var(--color-text-muted)'
                }}>
                  {dt.moduleAvailable ? 'Available' : 'Pending module'}
                </span>
              </div>
              {dt.description && (
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
                  {dt.description}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Add Device to Room</h3>
        {allRooms.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            No rooms configured. Navigate to a region to create the hierarchy first.
          </p>
        ) : (
          <div style={styles.roomList}>
            {allRooms.map(({ room, floor, office, region }) => (
              <div key={room.id} style={styles.roomRow}>
                <div style={styles.roomPath}>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                    {region} › {office} › {floor}
                  </span>
                  <span style={{ fontWeight: 600 }}>{room.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                  <button
                    style={styles.navBtn}
                    onClick={() => onNavigate('room', room.id, room.name)}
                  >
                    View
                  </button>
                  <button
                    style={styles.addBtn}
                    onClick={() => setAddingToRoom({ roomId: room.id, roomName: room.name })}
                  >
                    + Add Device
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {addingToRoom && (
        <div style={styles.overlay} onClick={() => setAddingToRoom(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <AddDeviceForm
              roomId={addingToRoom.roomId}
              onAdd={handleAdd}
              onCancel={() => setAddingToRoom(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: { padding: 'var(--spacing-xl)', height: '100%', overflowY: 'auto' as const },
  header: { marginBottom: 'var(--spacing-xl)' },
  title: { fontSize: 'var(--font-size-xl)', fontWeight: 700, margin: 0 },
  section: { marginBottom: 'var(--spacing-xl)' },
  sectionTitle: { fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--spacing-md)', color: 'var(--color-text-secondary)' },
  typeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--spacing-sm)' },
  typeCard: {
    padding: 'var(--spacing-md)', background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)'
  },
  roomList: { display: 'flex', flexDirection: 'column' as const, gap: 'var(--spacing-xs)' },
  roomRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'var(--spacing-sm) var(--spacing-md)',
    background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)'
  },
  roomPath: { display: 'flex', flexDirection: 'column' as const, gap: '2px' },
  navBtn: {
    padding: '4px 10px', background: 'transparent', color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--font-size-xs)', cursor: 'pointer'
  },
  addBtn: {
    padding: '4px 10px', background: 'var(--color-accent)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)',
    fontWeight: 600, cursor: 'pointer'
  },
  overlay: {
    position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
  },
  modal: {
    background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-xl)', width: 460,
    maxHeight: '80vh', overflowY: 'auto' as const
  }
}
