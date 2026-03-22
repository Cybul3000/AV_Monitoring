import React, { useState, useEffect } from 'react'
import { ConfirmActionDialog } from './ConfirmActionDialog'

type ApiShape = {
  configExport: (req: { deviceId: string }) => Promise<{ success: boolean; filePath?: string; error?: string }>
  configImport: (req: { deviceId: string; filePath: string }) => Promise<{ success: boolean; error?: string }>
  configList: (req: { deviceId: string }) => Promise<{ success: boolean; configs?: ConfigEntry[]; error?: string }>
}

interface ConfigEntry {
  id: number
  version: number
  createdAt: string
  note?: string
}

interface Props {
  deviceId: string
}

export const ConfigPanel: React.FC<Props> = ({ deviceId }) => {
  const [configs, setConfigs] = useState<ConfigEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [pendingRestore, setPendingRestore] = useState<ConfigEntry | null>(null)

  const api = () => (window.api as unknown as ApiShape)

  const loadConfigs = async () => {
    const res = await api().configList({ deviceId })
    if (res.success && res.configs) setConfigs(res.configs)
  }

  useEffect(() => {
    void loadConfigs()
  }, [deviceId])

  const showMessage = (text: string, ok: boolean) => {
    setMessage({ text, ok })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleDownload = async () => {
    setLoading(true)
    try {
      const res = await api().configExport({ deviceId })
      if (res.success) {
        showMessage('Config downloaded and saved', true)
        void loadConfigs()
      } else {
        showMessage(res.error ?? 'Download failed', false)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (entry: ConfigEntry) => {
    if (!entry) return
    setLoading(true)
    try {
      const res = await api().configImport({ deviceId, filePath: String(entry.id) })
      if (res.success) {
        showMessage('Config restored successfully', true)
      } else {
        showMessage(res.error ?? 'Restore failed', false)
      }
    } finally {
      setLoading(false)
      setPendingRestore(null)
    }
  }

  return (
    <div>
      <div style={styles.header}>
        <h4 style={styles.title}>Configuration</h4>
        <button style={styles.downloadBtn} onClick={() => void handleDownload()} disabled={loading}>
          {loading ? 'Working…' : 'Download Config'}
        </button>
      </div>

      {message && (
        <div style={{
          ...styles.toast,
          background: message.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          color: message.ok ? 'var(--color-green)' : 'var(--color-red)',
          border: `1px solid ${message.ok ? 'var(--color-green)' : 'var(--color-red)'}`
        }}>
          {message.text}
        </div>
      )}

      {configs.length > 0 && (
        <div style={styles.list}>
          <div style={styles.listHeader}>Saved versions</div>
          {configs.map(entry => (
            <div key={entry.id} style={styles.row}>
              <div style={styles.rowInfo}>
                <span style={{ fontWeight: 600 }}>v{entry.version}</span>
                <span style={styles.date}>{new Date(entry.createdAt).toLocaleString()}</span>
                {entry.note && <span style={styles.note}>{entry.note}</span>}
              </div>
              <button
                style={styles.restoreBtn}
                onClick={() => setPendingRestore(entry)}
                disabled={loading}
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      )}

      {configs.length === 0 && (
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: 'var(--spacing-sm)' }}>
          No saved configurations. Download to create the first version.
        </p>
      )}

      {pendingRestore && (
        <ConfirmActionDialog
          title="Restore Configuration"
          message={`This will overwrite the device's current configuration with v${pendingRestore.version} from ${new Date(pendingRestore.createdAt).toLocaleString()}. This action may disrupt ongoing meetings.`}
          confirmLabel="Restore"
          danger
          onConfirm={() => void handleRestore(pendingRestore)}
          onCancel={() => setPendingRestore(null)}
        />
      )}
    </div>
  )
}

const styles = {
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-sm)' },
  title: { margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-secondary)' },
  downloadBtn: {
    padding: '5px 12px', background: 'var(--color-accent)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-xs)',
    fontWeight: 600, cursor: 'pointer'
  },
  toast: { padding: 'var(--spacing-xs) var(--spacing-sm)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', marginBottom: 'var(--spacing-sm)' },
  list: { display: 'flex', flexDirection: 'column' as const, gap: 'var(--spacing-xs)' },
  listHeader: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 'var(--spacing-xs)' },
  row: {
    display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)',
    padding: 'var(--spacing-xs) var(--spacing-sm)',
    background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)'
  },
  rowInfo: { flex: 1, display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'baseline', flexWrap: 'wrap' as const },
  date: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' },
  note: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontStyle: 'italic' },
  restoreBtn: {
    padding: '3px 10px', background: 'transparent', color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--font-size-xs)', cursor: 'pointer'
  }
}
