import React, { useState, useRef } from 'react'
import { useHierarchy } from '../hooks/useHierarchy'
import { AddDeviceForm } from '../components/AddDeviceForm'
import type { ZoomImportRequest, ZoomImportResponse } from '@shared/ipc-types'

interface Props {
  onNavigate: (type: string, id: string, name: string) => void
}

interface DeviceTypeEntry {
  type: string
  label: string
  description?: string
  moduleAvailable: boolean
}

type ApiShape = {
  zoomImportRooms: (req: ZoomImportRequest) => Promise<ZoomImportResponse>
  hierarchyUpdate: (req: import('@shared/ipc-types').HierarchyUpdateRequest) => Promise<import('@shared/ipc-types').HierarchyUpdateResponse>
}

export const ConfigView: React.FC<Props> = ({ onNavigate }) => {
  const { roots, update } = useHierarchy()
  const [addingToRoom, setAddingToRoom] = useState<{ roomId: string; roomName: string } | null>(null)
  const [selectedOfficeId, setSelectedOfficeId] = useState<string | null>(null)
  const [zoomLocationId, setZoomLocationId] = useState('')
  const [importResult, setImportResult] = useState<ZoomImportResponse | null>(null)
  const [importing, setImporting] = useState(false)
  const zoomDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Flatten all offices from hierarchy
  const allOffices: Array<{ id: string; name: string; region: string; zoomLocationId?: string }> = []
  roots.forEach(region => {
    region.children?.forEach(office => {
      allOffices.push({
        id: office.id,
        name: office.name,
        region: region.name
      })
    })
  })

  const selectedOffice = selectedOfficeId ? allOffices.find(o => o.id === selectedOfficeId) ?? null : null

  const handleOfficeSelect = (officeId: string) => {
    setSelectedOfficeId(officeId)
    setZoomLocationId('')
    setImportResult(null)
  }

  const handleZoomLocationIdChange = (value: string) => {
    setZoomLocationId(value)
    if (zoomDebounceRef.current) clearTimeout(zoomDebounceRef.current)
    if (!selectedOfficeId) return
    zoomDebounceRef.current = setTimeout(() => {
      void update({
        action: 'update',
        type: 'office',
        id: selectedOfficeId,
        data: { zoomLocationId: value }
      })
    }, 600)
  }

  const handleImportZoomRooms = async () => {
    if (!selectedOfficeId || !zoomLocationId.trim()) return
    setImporting(true)
    setImportResult(null)
    try {
      const res = await (window.api as unknown as ApiShape).zoomImportRooms({
        officeId: selectedOfficeId,
        zoomLocationId: zoomLocationId.trim()
      })
      setImportResult(res)
    } catch (err) {
      setImportResult({ success: false, created: 0, skipped: 0, errors: [String(err)] })
    } finally {
      setImporting(false)
    }
  }

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
        <h3 style={styles.sectionTitle}>Import Zoom Rooms</h3>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-sm)' }}>
          Configure Zoom API credentials in Settings before importing.
        </p>

        {allOffices.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            No offices configured. Add a region and office in the hierarchy first.
          </p>
        ) : (
          <>
            <div style={{ marginBottom: 'var(--spacing-sm)' }}>
              <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                Select Office
              </label>
              <select
                style={styles.select}
                value={selectedOfficeId ?? ''}
                onChange={e => handleOfficeSelect(e.target.value)}
              >
                <option value="">— choose an office —</option>
                {allOffices.map(o => (
                  <option key={o.id} value={o.id}>{o.region} › {o.name}</option>
                ))}
              </select>
            </div>

            {selectedOffice && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                <div>
                  <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                    Zoom Location ID
                  </label>
                  <input
                    style={styles.textInput}
                    type="text"
                    placeholder="e.g. abc123XYZ"
                    value={zoomLocationId}
                    onChange={e => handleZoomLocationIdChange(e.target.value)}
                  />
                </div>
                <div>
                  <button
                    style={{
                      ...styles.addBtn,
                      opacity: (!zoomLocationId.trim() || importing) ? 0.5 : 1,
                      cursor: (!zoomLocationId.trim() || importing) ? 'not-allowed' : 'pointer'
                    }}
                    disabled={!zoomLocationId.trim() || importing}
                    onClick={() => void handleImportZoomRooms()}
                  >
                    {importing ? 'Importing…' : 'Import Zoom Rooms'}
                  </button>
                </div>

                {importResult && (
                  <div style={{
                    padding: 'var(--spacing-xs) var(--spacing-sm)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--font-size-xs)',
                    background: importResult.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    color: importResult.success ? 'var(--color-green)' : 'var(--color-red)',
                    border: `1px solid ${importResult.success ? 'var(--color-green)' : 'var(--color-red)'}`
                  }}>
                    {importResult.success
                      ? `Created: ${importResult.created} | Skipped: ${importResult.skipped}`
                      : importResult.errors.join('; ')
                    }
                  </div>
                )}
              </div>
            )}
          </>
        )}
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
  select: {
    padding: '8px 12px', background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)',
    outline: 'none', minWidth: 260
  },
  textInput: {
    padding: '8px 12px', background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)',
    outline: 'none', width: 260
  },
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
