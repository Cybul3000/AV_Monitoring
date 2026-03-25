import React, { useState, useEffect } from 'react'

interface DeviceTypeField {
  key: string
  label: string
  placeholder?: string
  hint?: string
  type?: 'text' | 'number' | 'password'
  required?: boolean
  secret?: boolean
}

interface DeviceTypeEntry {
  type: string
  label: string
  port: number | null
  configFields: DeviceTypeField[]
  moduleAvailable: boolean
}

type ApiShape = {
  registryList: () => Promise<{ success: boolean; entries?: DeviceTypeEntry[]; error?: string }>
  deviceCheckHost: (host: string) => Promise<{ exists: boolean; device: { id: string; name: string; roomName: string } | null }>
}

interface Props {
  roomId: string
  onAdd: (data: {
    name: string
    deviceType: string
    host: string
    port?: number
    credentials?: Record<string, string>
    config?: Record<string, unknown>
  }) => Promise<void>
  onCancel: () => void
}

export const AddDeviceForm: React.FC<Props> = ({ onAdd, onCancel }) => {
  const [deviceTypes, setDeviceTypes] = useState<DeviceTypeEntry[]>([])
  const [selectedType, setSelectedType] = useState('')
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const api = window.api as unknown as ApiShape
        const res = await api.registryList?.()
        if (res?.success && res.entries) {
          setDeviceTypes(res.entries)
          if (res.entries.length > 0) setSelectedType(res.entries[0].type)
        }
      } catch {
        // fallback: hard-coded types list
        const fallback: DeviceTypeEntry[] = [
          { type: 'zoom-room', label: 'Zoom Room', port: null, configFields: [], moduleAvailable: true },
          { type: 'lg-display', label: 'LG Pro Display', port: 9761, configFields: [], moduleAvailable: true },
          { type: 'lightware-matrix', label: 'Lightware Matrix', port: 6107, configFields: [], moduleAvailable: true },
          { type: 'biamp-tesira', label: 'Biamp Tesira', port: 23, configFields: [], moduleAvailable: true },
          { type: 'crestron-ssh', label: 'Crestron SSH', port: 22, configFields: [], moduleAvailable: false },
          { type: 'dante-network-audio', label: 'Dante Network Audio', port: null, configFields: [], moduleAvailable: true }
        ]
        setDeviceTypes(fallback)
        setSelectedType('zoom-room')
      }
    }
    void load()
  }, [])

  const selected = deviceTypes.find(dt => dt.type === selectedType)

  // If registry provides a 'host' configField, use it instead of the generic host input
  const hostFromConfig = selected?.configFields.some(f => f.key === 'host') ?? false
  // Show port field only when the registry defines a default port (not null)
  const showPort = selected != null && selected.port !== null
  // Effective host value: from configFields state or dedicated host state
  const effectiveHost = hostFromConfig ? (fields['host'] ?? '') : host.trim()

  const handleHostBlur = async () => {
    const trimmed = effectiveHost.trim()
    if (!trimmed || hostFromConfig) { setDuplicateWarning(null); return }
    try {
      const api = window.api as unknown as ApiShape
      const res = await api.deviceCheckHost(trimmed)
      if (res.exists && res.device) {
        setDuplicateWarning(`Already used by "${res.device.name}" in ${res.device.roomName}`)
      } else {
        setDuplicateWarning(null)
      }
    } catch {
      setDuplicateWarning(null)
    }
  }

  // Host is required only when the device needs one (not optional like Dante)
  const hostRequired = !hostFromConfig
  const canSubmit = name.trim() && (hostFromConfig || host.trim()) && selectedType && selected?.moduleAvailable && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return

    setSubmitting(true)
    try {
      const secretFields: Record<string, string> = {}
      const configFields: Record<string, unknown> = {}

      selected!.configFields.forEach(f => {
        const val = fields[f.key] ?? ''
        if (f.secret) {
          secretFields[f.key] = val
        } else {
          configFields[f.key] = val
        }
      })

      await onAdd({
        name: name.trim(),
        deviceType: selectedType,
        host: hostFromConfig ? (fields['host'] ?? '') : host.trim(),
        port: port ? parseInt(port, 10) : undefined,
        credentials: Object.keys(secretFields).length ? secretFields : undefined,
        config: Object.keys(configFields).length ? configFields : undefined
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h3 style={{ marginBottom: 'var(--spacing-md)' }}>Add Device</h3>

      <label style={styles.label}>Device Type</label>
      <select
        style={styles.select}
        value={selectedType}
        onChange={e => { setSelectedType(e.target.value); setFields({}) }}
      >
        {deviceTypes.map(dt => (
          <option key={dt.type} value={dt.type} disabled={!dt.moduleAvailable}>
            {dt.label}{!dt.moduleAvailable ? ' (module pending)' : ''}
          </option>
        ))}
      </select>

      {selected && !selected.moduleAvailable && (
        <div style={styles.pendingBadge}>
          Module not yet available — device cannot be added until the {selected.label} module is installed.
        </div>
      )}

      <label style={styles.label}>Device Name</label>
      <input
        autoFocus
        style={styles.input}
        placeholder="e.g., Conference Room A Zoom"
        value={name}
        onChange={e => setName(e.target.value)}
      />

      {!hostFromConfig && (
        <>
          <label style={styles.label}>Host / IP Address{hostRequired && ' *'}</label>
          <input
            style={styles.input}
            placeholder="e.g., 10.0.6.100"
            value={host}
            onChange={e => setHost(e.target.value)}
            onBlur={() => void handleHostBlur()}
          />
          {duplicateWarning && (
            <div style={styles.warning}>Warning: {duplicateWarning}</div>
          )}
        </>
      )}

      {showPort && (
        <>
          <label style={styles.label}>Port (optional)</label>
          <input
            style={styles.input}
            placeholder="Leave blank for default"
            type="number"
            value={port}
            onChange={e => setPort(e.target.value)}
          />
        </>
      )}

      {selected?.configFields.map(f => (
        <div key={f.key}>
          <label style={styles.label}>{f.label}{f.required && ' *'}</label>
          <input
            style={styles.input}
            placeholder={f.placeholder ?? f.hint ?? f.label}
            type={f.type === 'password' || f.secret ? 'password' : f.type ?? 'text'}
            value={fields[f.key] ?? ''}
            onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
          />
          {f.hint && (
            <div style={styles.hint}>{f.hint}</div>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end', marginTop: 'var(--spacing-md)' }}>
        <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button
          style={{ ...styles.confirmBtn, opacity: canSubmit ? 1 : 0.5 }}
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
        >
          {submitting ? 'Adding…' : 'Add Device'}
        </button>
      </div>
    </div>
  )
}

const styles = {
  label: {
    display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600,
    color: 'var(--color-text-secondary)', marginBottom: '4px', marginTop: 'var(--spacing-sm)'
  },
  input: {
    width: '100%', padding: '8px 12px', background: 'var(--color-bg)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)',
    marginBottom: '2px', outline: 'none', display: 'block', boxSizing: 'border-box' as const
  },
  select: {
    width: '100%', padding: '8px 12px', background: 'var(--color-bg)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)',
    outline: 'none', display: 'block', boxSizing: 'border-box' as const
  },
  pendingBadge: {
    marginTop: 'var(--spacing-xs)', padding: 'var(--spacing-xs) var(--spacing-sm)',
    background: 'rgba(245,158,11,0.1)', color: 'var(--color-amber)',
    border: '1px solid var(--color-amber)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--font-size-xs)'
  },
  warning: {
    fontSize: 'var(--font-size-xs)', color: 'var(--color-amber)',
    marginTop: '2px', marginBottom: 'var(--spacing-xs)'
  },
  hint: {
    fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)',
    marginTop: '3px', marginBottom: 'var(--spacing-xs)'
  },
  cancelBtn: {
    padding: '6px 14px', background: 'transparent', color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)', cursor: 'pointer'
  },
  confirmBtn: {
    padding: '6px 14px', background: 'var(--color-accent)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)',
    fontWeight: 600, cursor: 'pointer'
  }
}
