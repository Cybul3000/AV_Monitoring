import React, { useState } from 'react'
import { LEDIndicator } from '../components/LEDIndicator'
import { ConfirmActionDialog } from '../components/ConfirmActionDialog'
import { ConfigPanel } from '../components/ConfigPanel'
import { LGDisplayPanel } from '../components/DeviceDetail/LGDisplayPanel/LGDisplayPanel'
import { LightwarePanel } from '../components/DeviceDetail/LightwarePanel/LightwarePanel'
import { BiampTesiraPanel } from '../components/DeviceDetail/BiampTesiraPanel/BiampTesiraPanel'
import { useHierarchy } from '../hooks/useHierarchy'
import { useDeviceStatus } from '../hooks/useDeviceStatus'
import type { HierarchyNode } from '@shared/ipc-types'

type ApiShape = {
  deviceCommand: (req: { deviceId: string; command: string; params?: Record<string, unknown> }) => Promise<{ success: boolean; output?: string; error?: string }>
}

interface Props {
  regionId: string
  officeId: string
  floorId: string
  roomId: string
  onNavigate: (type: string, id: string, name: string) => void
  onBack: () => void
}

export const RoomView: React.FC<Props> = ({ regionId, officeId, floorId, roomId }) => {
  const { roots, update } = useHierarchy()
  const { getDeviceStatus, getDeviceMeta } = useDeviceStatus()
  const [pendingAction, setPendingAction] = useState<{ deviceId: string; command: string; label: string; params?: Record<string, unknown> } | null>(null)
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [showAddDevice, setShowAddDevice] = useState(false)
  const [deviceForm, setDeviceForm] = useState({ name: '', deviceType: '', host: '', port: '' })
  const [actionResult, setActionResult] = useState<{ message: string; ok: boolean } | null>(null)
  const [speakerTestResult, setSpeakerTestResult] = useState<{ message: string; ok: boolean } | null>(null)

  const room = roots
    .find(r => r.id === regionId)
    ?.children?.find(o => o.id === officeId)
    ?.children?.find(f => f.id === floorId)
    ?.children?.find(r => r.id === roomId)

  if (!room) return <div style={styles.center}><span>Room not found</span></div>

  const devices = room.children ?? []
  const selectedDevice = devices.find(d => d.id === selectedDeviceId)

  const handleAction = async (deviceId: string, command: string, params?: Record<string, unknown>) => {
    const res = await (window.api as unknown as ApiShape).deviceCommand({ deviceId, command, params })
    setActionResult({ message: res.success ? 'Action completed' : (res.error ?? 'Failed'), ok: res.success })
    setTimeout(() => setActionResult(null), 3000)
  }

  const handleSpeakerTest = async (deviceId: string, roomId?: string) => {
    const params = roomId ? { roomId } : undefined
    const res = await (window.api as unknown as ApiShape).deviceCommand({ deviceId, command: 'speakerTest', params })
    if (!res.success && res.error === 'Room in active meeting') {
      setSpeakerTestResult({ message: 'Speaker test unavailable — room is in an active meeting', ok: false })
    } else if (res.success) {
      const outcome = res.output === 'fail' ? 'fail \u2717' : 'pass \u2713'
      setSpeakerTestResult({ message: `Speaker test: ${outcome}`, ok: res.output !== 'fail' })
    } else {
      setSpeakerTestResult({ message: `Speaker test failed: ${res.error ?? 'Unknown error'}`, ok: false })
    }
    setTimeout(() => setSpeakerTestResult(null), 5000)
  }

  const handleAddDevice = async () => {
    if (!deviceForm.name || !deviceForm.deviceType || !deviceForm.host) return
    await update({
      action: 'create', type: 'device', parentId: roomId,
      data: {
        name: deviceForm.name, deviceType: deviceForm.deviceType,
        host: deviceForm.host, port: deviceForm.port ? parseInt(deviceForm.port, 10) : undefined
      }
    })
    setDeviceForm({ name: '', deviceType: '', host: '', port: '' })
    setShowAddDevice(false)
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 style={styles.title}>{room.name}</h2>
        <button style={styles.addBtn} onClick={() => setShowAddDevice(true)}>+ Add Device</button>
      </header>

      {devices.length === 0 ? (
        <div style={styles.empty}>
          <p style={{ color: 'var(--color-text-muted)' }}>No devices configured in this room.</p>
        </div>
      ) : (
        <div style={styles.layout}>
          <div style={styles.deviceList}>
            {devices.map(device => (
              <DeviceRow
                key={device.id}
                device={device}
                status={getDeviceStatus(device.id)}
                selected={device.id === selectedDeviceId}
                onClick={() => setSelectedDeviceId(device.id === selectedDeviceId ? null : device.id)}
              />
            ))}
          </div>

          {selectedDevice && (
            <div style={styles.detailPanel}>
              <h3 style={{ marginBottom: 'var(--spacing-md)', fontSize: 'var(--font-size-lg)' }}>
                {selectedDevice.name}
              </h3>
              <div style={styles.metaGrid}>
                <span style={styles.metaLabel}>Type</span>
                <span>{selectedDevice.deviceType}</span>
                <span style={styles.metaLabel}>Host</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedDevice.host}</span>
                {selectedDevice.port && <>
                  <span style={styles.metaLabel}>Port</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedDevice.port}</span>
                </>}
                <span style={styles.metaLabel}>Last seen</span>
                <span>{selectedDevice.lastSeen ? new Date(selectedDevice.lastSeen).toLocaleString() : 'Never'}</span>
              </div>

              <div style={{ marginTop: 'var(--spacing-lg)' }}>
                <h4 style={{ marginBottom: 'var(--spacing-sm)', color: 'var(--color-text-secondary)' }}>Actions</h4>
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
                  <button
                    style={styles.dangerBtn}
                    onClick={() => setPendingAction({ deviceId: selectedDevice.id, command: 'reboot', label: 'Reboot' })}
                  >
                    Reboot
                  </button>
                  {selectedDevice.webUiUrl && (
                    <button
                      style={styles.actionBtn}
                      onClick={() => void handleAction(selectedDevice.id, 'openWebUI')}
                    >
                      Open WebUI
                    </button>
                  )}
                </div>
              </div>

              {actionResult && (
                <div style={{
                  marginTop: 'var(--spacing-md)', padding: 'var(--spacing-sm) var(--spacing-md)',
                  borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)',
                  background: actionResult.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  color: actionResult.ok ? 'var(--color-green)' : 'var(--color-red)',
                  border: `1px solid ${actionResult.ok ? 'var(--color-green)' : 'var(--color-red)'}`
                }}>
                  {actionResult.message}
                </div>
              )}

              {selectedDevice.deviceType === 'zoom-room' && (
                <div style={{ marginTop: 'var(--spacing-lg)' }}>
                  <h4 style={{ marginBottom: 'var(--spacing-sm)', color: 'var(--color-text-secondary)' }}>Speaker Test</h4>
                  <button
                    style={styles.actionBtn}
                    onClick={() => setPendingAction({
                      deviceId: selectedDevice.id,
                      command: 'speakerTest',
                      label: 'Run Speaker Test'
                    })}
                  >
                    Run Speaker Test
                  </button>
                  {speakerTestResult && (
                    <div style={{
                      marginTop: 'var(--spacing-sm)', padding: 'var(--spacing-sm) var(--spacing-md)',
                      borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)',
                      background: speakerTestResult.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                      color: speakerTestResult.ok ? 'var(--color-green)' : 'var(--color-red)',
                      border: `1px solid ${speakerTestResult.ok ? 'var(--color-green)' : 'var(--color-red)'}`
                    }}>
                      {speakerTestResult.message}
                    </div>
                  )}
                  <div style={{ marginTop: 'var(--spacing-lg)' }}>
                    <ConfigPanel deviceId={selectedDevice.id} />
                  </div>
                </div>
              )}

              {selectedDevice.deviceType === 'lg-display' && (
                <div style={{ marginTop: 'var(--spacing-lg)' }}>
                  <LGDisplayPanel
                    device={selectedDevice}
                    meta={getDeviceMeta(selectedDevice.id)}
                    onCommand={(command, params) => void handleAction(selectedDevice.id, command, params)}
                  />
                </div>
              )}

              {selectedDevice.deviceType === 'lightware-matrix' && (
                <div style={{ marginTop: 'var(--spacing-lg)' }}>
                  <LightwarePanel
                    device={selectedDevice}
                    meta={getDeviceMeta(selectedDevice.id)}
                    onCommand={(command, params) => void handleAction(selectedDevice.id, command, params)}
                  />
                </div>
              )}

              {selectedDevice.deviceType === 'biamp-tesira' && (
                <div style={{ marginTop: 'var(--spacing-lg)' }}>
                  <BiampTesiraPanel
                    device={selectedDevice}
                    meta={getDeviceMeta(selectedDevice.id)}
                    onCommand={(command, params) => void handleAction(selectedDevice.id, command, params)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {pendingAction && (
        <ConfirmActionDialog
          title={`Confirm: ${pendingAction.label}`}
          message={
            pendingAction.command === 'speakerTest'
              ? 'Run speaker test on this Zoom Room?'
              : `Are you sure you want to ${pendingAction.label.toLowerCase()} this device? This action may disrupt ongoing meetings.`
          }
          confirmLabel={pendingAction.label}
          danger={pendingAction.command !== 'speakerTest'}
          onConfirm={() => {
            if (pendingAction.command === 'speakerTest') {
              void handleSpeakerTest(
                pendingAction.deviceId,
                pendingAction.params?.roomId as string | undefined
              )
            } else {
              void handleAction(pendingAction.deviceId, pendingAction.command, pendingAction.params)
            }
            setPendingAction(null)
          }}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {showAddDevice && (
        <div style={styles.overlay} onClick={() => setShowAddDevice(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 'var(--spacing-md)' }}>Add Device</h3>
            <input autoFocus style={styles.input} placeholder="Device name" value={deviceForm.name}
              onChange={e => setDeviceForm(f => ({ ...f, name: e.target.value }))} />
            <input style={styles.input} placeholder="Device type (e.g., zoom-room)" value={deviceForm.deviceType}
              onChange={e => setDeviceForm(f => ({ ...f, deviceType: e.target.value }))} />
            <input style={styles.input} placeholder="Host / IP address" value={deviceForm.host}
              onChange={e => setDeviceForm(f => ({ ...f, host: e.target.value }))} />
            <input style={styles.input} placeholder="Port (optional)" type="number" value={deviceForm.port}
              onChange={e => setDeviceForm(f => ({ ...f, port: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') void handleAddDevice() }} />
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end' }}>
              <button style={styles.cancelBtn} onClick={() => setShowAddDevice(false)}>Cancel</button>
              <button style={styles.confirmBtn} onClick={() => void handleAddDevice()}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const DeviceRow: React.FC<{
  device: HierarchyNode
  status: string
  selected: boolean
  onClick: () => void
}> = ({ device, status, selected, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)',
      padding: 'var(--spacing-md)', background: selected ? 'var(--color-bg-elevated)' : 'var(--color-bg-surface)',
      border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--color-border)'}`,
      borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left' as const, width: '100%'
    }}
  >
    <LEDIndicator status={status as 'GREEN' | 'AMBER' | 'RED' | 'GREY'} size="md" />
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 600 }}>{device.name}</div>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
        {device.deviceType} · {device.host}
      </div>
    </div>
  </button>
)

const styles = {
  container: { padding: 'var(--spacing-xl)', height: '100%', overflowY: 'auto' as const },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-xl)' },
  title: { fontSize: 'var(--font-size-xl)', fontWeight: 700 },
  layout: { display: 'flex', gap: 'var(--spacing-lg)', alignItems: 'flex-start' },
  deviceList: { display: 'flex', flexDirection: 'column' as const, gap: 'var(--spacing-sm)', flex: '0 0 280px' },
  detailPanel: { flex: 1, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)' },
  metaGrid: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: 'var(--spacing-xs) var(--spacing-md)', fontSize: 'var(--font-size-sm)' },
  metaLabel: { color: 'var(--color-text-muted)', fontWeight: 600 },
  empty: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' },
  addBtn: { padding: '8px 16px', background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' },
  actionBtn: { padding: '6px 14px', background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
  dangerBtn: { padding: '6px 14px', background: 'var(--color-danger)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
  cancelBtn: { padding: '6px 14px', background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
  confirmBtn: { padding: '6px 14px', background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' },
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  modal: { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-xl)', width: 420 },
  input: { width: '100%', padding: '8px 12px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-md)', marginBottom: 'var(--spacing-sm)', outline: 'none', display: 'block' }
}
