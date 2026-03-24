import React, { useState, useEffect, useRef } from 'react'
import { ConfirmActionDialog } from '../components/ConfirmActionDialog'

// Local API shape matching what the preload exposes
type ApiShape = {
  preferencesGet: (req: { key: string }) => Promise<{ value: unknown }>
  preferencesSet: (req: { key: string; value: unknown }) => Promise<{ success: boolean }>
  settingsExport: (req: { savePath?: string }) => Promise<{ success: boolean; filePath?: string; error?: string }>
  settingsImport: (req: { filePath: string }) => Promise<{ success: boolean; rulesApplied?: number; prefsApplied?: number; error?: string }>
  zoomSaveCredentials: (payload: { clientId: string; clientSecret: string; accountId: string }) => Promise<{ success: boolean; error?: string }>
}

function api(): ApiShape {
  return window.api as unknown as ApiShape
}

interface Toast {
  ok: boolean
  message: string
}

export const SettingsView: React.FC = () => {
  // ── Monitoring Settings ──────────────────────────────────────────────────
  const [pollInterval, setPollInterval] = useState<number>(30)
  const [pollError, setPollError] = useState<string | null>(null)

  const [failuresBeforeRed, setFailuresBeforeRed] = useState<number>(3)
  const [failuresError, setFailuresError] = useState<string | null>(null)

  const [tooltipsEnabled, setTooltipsEnabled] = useState<boolean>(true)

  // ── Zoom API Credentials ──────────────────────────────────────────────────
  const [zoomAccountId, setZoomAccountId] = useState('')
  const [zoomClientId, setZoomClientId] = useState('')
  const [zoomClientSecret, setZoomClientSecret] = useState('')
  const [zoomCredsSaved, setZoomCredsSaved] = useState(false)
  const [zoomCredsError, setZoomCredsError] = useState<string | null>(null)

  // ── Settings Backup ───────────────────────────────────────────────────────
  const [exportToast, setExportToast] = useState<Toast | null>(null)
  const [importToast, setImportToast] = useState<Toast | null>(null)
  const [pendingImportPath, setPendingImportPath] = useState<string | null>(null)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Load preferences on mount ─────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [pollRes, failRes, tooltipRes] = await Promise.all([
          api().preferencesGet({ key: 'pref:pollIntervalDefault' }),
          api().preferencesGet({ key: 'pref:consecutiveFailuresBeforeRed' }),
          api().preferencesGet({ key: 'pref:tooltipsEnabled' })
        ])
        if (typeof pollRes.value === 'number') {
          setPollInterval(Math.round((pollRes.value as number) / 1000))
        }
        if (typeof failRes.value === 'number') {
          setFailuresBeforeRed(failRes.value as number)
        }
        if (typeof tooltipRes.value === 'boolean') {
          setTooltipsEnabled(tooltipRes.value as boolean)
        }
      } catch {
        // ignore load errors
      }
    }
    void load()
  }, [])

  // ── Monitoring handlers ───────────────────────────────────────────────────

  const handlePollIntervalChange = (raw: string) => {
    const n = parseInt(raw, 10)
    setPollInterval(isNaN(n) ? 0 : n)
    if (isNaN(n) || n < 10 || n > 300) {
      setPollError('Must be between 10 and 300 seconds')
    } else {
      setPollError(null)
      void api().preferencesSet({ key: 'pref:pollIntervalDefault', value: n * 1000 })
    }
  }

  const handleFailuresChange = (raw: string) => {
    const n = parseInt(raw, 10)
    setFailuresBeforeRed(isNaN(n) ? 0 : n)
    if (isNaN(n) || n < 1 || n > 10) {
      setFailuresError('Must be between 1 and 10')
    } else {
      setFailuresError(null)
      void api().preferencesSet({ key: 'pref:consecutiveFailuresBeforeRed', value: n })
    }
  }

  const handleTooltipsToggle = (checked: boolean) => {
    setTooltipsEnabled(checked)
    void api().preferencesSet({ key: 'pref:tooltipsEnabled', value: checked })
  }

  // ── Zoom credential handler ───────────────────────────────────────────────

  const handleSaveZoomCredentials = async () => {
    setZoomCredsError(null)
    setZoomCredsSaved(false)
    if (!zoomAccountId.trim() || !zoomClientId.trim() || !zoomClientSecret.trim()) {
      setZoomCredsError('All three fields are required')
      return
    }
    try {
      const res = await api().zoomSaveCredentials({
        clientId: zoomClientId.trim(),
        clientSecret: zoomClientSecret.trim(),
        accountId: zoomAccountId.trim()
      })
      if (res.success) {
        setZoomCredsSaved(true)
        setTimeout(() => setZoomCredsSaved(false), 3000)
      } else {
        setZoomCredsError(res.error ?? 'Save failed')
      }
    } catch (err) {
      setZoomCredsError(String(err))
    }
  }

  // ── Export handler ────────────────────────────────────────────────────────

  const handleExport = async () => {
    setExportToast(null)
    try {
      const res = await api().settingsExport({})
      if (res.success) {
        setExportToast({ ok: true, message: `Settings exported to ${res.filePath ?? 'file'}` })
      } else {
        setExportToast({ ok: false, message: res.error ?? 'Export failed' })
      }
    } catch (err) {
      setExportToast({ ok: false, message: String(err) })
    }
  }

  // ── Import handlers ───────────────────────────────────────────────────────

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset the input so the same file can be re-selected
    e.target.value = ''
    setPendingImportPath(file.path)
    setShowImportConfirm(true)
  }

  const handleImportConfirm = async () => {
    setShowImportConfirm(false)
    if (!pendingImportPath) return
    setImportToast(null)
    try {
      const res = await api().settingsImport({ filePath: pendingImportPath })
      if (res.success) {
        setImportToast({
          ok: true,
          message: `Applied ${res.rulesApplied ?? 0} rules, ${res.prefsApplied ?? 0} preferences`
        })
      } else {
        setImportToast({ ok: false, message: res.error ?? 'Import failed' })
      }
    } catch (err) {
      setImportToast({ ok: false, message: String(err) })
    }
    setPendingImportPath(null)
  }

  const handleImportCancel = () => {
    setShowImportConfirm(false)
    setPendingImportPath(null)
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 style={styles.title}>Settings</h2>
      </header>

      {/* ── Monitoring Settings ── */}
      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Monitoring Settings</h3>

        <div style={styles.fieldRow}>
          <label style={styles.label} htmlFor="poll-interval">
            Polling Interval (seconds)
          </label>
          <div style={styles.inputGroup}>
            <input
              id="poll-interval"
              type="number"
              min={10}
              max={300}
              style={{ ...styles.input, ...(pollError ? styles.inputError : {}) }}
              value={pollInterval}
              onChange={e => handlePollIntervalChange(e.target.value)}
            />
            {pollError && <span style={styles.errorMsg}>{pollError}</span>}
          </div>
        </div>

        <div style={styles.fieldRow}>
          <label style={styles.label} htmlFor="failures-before-red">
            Failures Before RED
          </label>
          <div style={styles.inputGroup}>
            <input
              id="failures-before-red"
              type="number"
              min={1}
              max={10}
              style={{ ...styles.input, ...(failuresError ? styles.inputError : {}) }}
              value={failuresBeforeRed}
              onChange={e => handleFailuresChange(e.target.value)}
            />
            {failuresError && <span style={styles.errorMsg}>{failuresError}</span>}
          </div>
        </div>

        <div style={styles.fieldRow}>
          <label style={styles.label} htmlFor="tooltips-enabled">
            Tooltips Enabled
          </label>
          <input
            id="tooltips-enabled"
            type="checkbox"
            checked={tooltipsEnabled}
            onChange={e => handleTooltipsToggle(e.target.checked)}
            style={{ width: 18, height: 18, cursor: 'pointer' }}
          />
        </div>
      </section>

      {/* ── Zoom API Credentials ── */}
      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Zoom API Credentials</h3>
        <p style={styles.description}>
          Server-to-Server OAuth credentials for importing Zoom Rooms and running speaker tests.
          These are stored securely in your OS keychain.
        </p>

        <div style={styles.fieldRow}>
          <label style={styles.label} htmlFor="zoom-account-id">Account ID</label>
          <input
            id="zoom-account-id"
            type="text"
            style={styles.input}
            value={zoomAccountId}
            onChange={e => setZoomAccountId(e.target.value)}
            placeholder="Account ID"
            autoComplete="off"
          />
        </div>

        <div style={styles.fieldRow}>
          <label style={styles.label} htmlFor="zoom-client-id">Client ID</label>
          <input
            id="zoom-client-id"
            type="text"
            style={styles.input}
            value={zoomClientId}
            onChange={e => setZoomClientId(e.target.value)}
            placeholder="Client ID"
            autoComplete="off"
          />
        </div>

        <div style={styles.fieldRow}>
          <label style={styles.label} htmlFor="zoom-client-secret">Client Secret</label>
          <input
            id="zoom-client-secret"
            type="password"
            style={styles.input}
            value={zoomClientSecret}
            onChange={e => setZoomClientSecret(e.target.value)}
            placeholder="Client Secret"
            autoComplete="new-password"
          />
        </div>

        {zoomCredsError && (
          <div style={{ ...styles.toast, background: 'rgba(239,68,68,0.1)', color: 'var(--color-red)', border: '1px solid var(--color-red)', marginBottom: 'var(--spacing-sm)' }}>
            {zoomCredsError}
          </div>
        )}

        <button style={styles.primaryBtn} onClick={() => void handleSaveZoomCredentials()}>
          {zoomCredsSaved ? 'Saved ✓' : 'Save Credentials'}
        </button>
      </section>

      {/* ── Settings Backup ── */}
      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Settings Backup</h3>
        <p style={styles.description}>
          Export all alert rules and preferences to a JSON file, or restore from a previously exported file.
        </p>

        <div style={styles.buttonRow}>
          <button style={styles.primaryBtn} onClick={() => void handleExport()}>
            Export Settings
          </button>

          <button
            style={styles.secondaryBtn}
            onClick={() => fileInputRef.current?.click()}
          >
            Import Settings
          </button>

          {/* Hidden file input — .path is available in Electron renderer */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleFileSelected}
          />
        </div>

        {exportToast && (
          <div style={{
            ...styles.toast,
            background: exportToast.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: exportToast.ok ? 'var(--color-green)' : 'var(--color-red)',
            border: `1px solid ${exportToast.ok ? 'var(--color-green)' : 'var(--color-red)'}`
          }}>
            {exportToast.message}
          </div>
        )}

        {importToast && (
          <div style={{
            ...styles.toast,
            background: importToast.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: importToast.ok ? 'var(--color-green)' : 'var(--color-red)',
            border: `1px solid ${importToast.ok ? 'var(--color-green)' : 'var(--color-red)'}`
          }}>
            {importToast.ok ? `✓ ${importToast.message}` : importToast.message}
          </div>
        )}
      </section>

      {showImportConfirm && (
        <ConfirmActionDialog
          title="Import Settings"
          message="This will overwrite all current alert rules and preferences. Continue?"
          confirmLabel="Import"
          danger
          onConfirm={() => void handleImportConfirm()}
          onCancel={handleImportCancel}
        />
      )}
    </div>
  )
}

const styles = {
  container: { padding: 'var(--spacing-xl)', height: '100%', overflowY: 'auto' as const },
  header: { marginBottom: 'var(--spacing-xl)' },
  title: { fontSize: 'var(--font-size-xl)', fontWeight: 700, margin: 0 },
  section: { marginBottom: 'var(--spacing-xl)', maxWidth: 560 },
  sectionTitle: {
    fontSize: 'var(--font-size-md)', fontWeight: 600,
    marginBottom: 'var(--spacing-md)', color: 'var(--color-text-secondary)'
  },
  description: {
    fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)',
    marginBottom: 'var(--spacing-md)', lineHeight: 1.5
  },
  fieldRow: {
    display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-md)',
    marginBottom: 'var(--spacing-md)'
  },
  label: {
    minWidth: 200, fontSize: 'var(--font-size-sm)', fontWeight: 500,
    color: 'var(--color-text-secondary)', paddingTop: 8
  },
  inputGroup: { display: 'flex', flexDirection: 'column' as const, gap: 4, flex: 1 },
  input: {
    width: '100%', padding: '8px 12px', background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)',
    outline: 'none', boxSizing: 'border-box' as const
  },
  inputError: { borderColor: 'var(--color-red)' },
  errorMsg: { fontSize: 'var(--font-size-xs)', color: 'var(--color-red)' },
  buttonRow: { display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' },
  primaryBtn: {
    padding: '8px 16px', background: 'var(--color-accent)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)',
    fontWeight: 600, cursor: 'pointer'
  },
  secondaryBtn: {
    padding: '8px 16px', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)', cursor: 'pointer'
  },
  toast: {
    padding: 'var(--spacing-xs) var(--spacing-sm)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-sm)'
  }
}
