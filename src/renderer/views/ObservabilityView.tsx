import React, { useState, useEffect } from 'react'

type ApiShape = {
  preferencesGet: (req: { key: string }) => Promise<{ value: unknown }>
  preferencesSet: (req: { key: string; value: unknown }) => Promise<void>
  otelGenerateConfig: (req: { savePath?: string }) => Promise<{ success: boolean; yaml?: string; filePath?: string; error?: string }>
}

export const ObservabilityView: React.FC = () => {
  const [newRelicKey, setNewRelicKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [yamlPreview, setYamlPreview] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null)

  const api = () => (window.api as unknown as ApiShape)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api().preferencesGet({ key: 'pref:otelNewRelicKey' })
        if (res.value && typeof res.value === 'string') {
          setNewRelicKey(res.value)
        }
      } catch {
        // ignore
      }
    }
    void load()
  }, [])

  const handleSaveKey = async () => {
    try {
      await api().preferencesSet({ key: 'pref:otelNewRelicKey', value: newRelicKey })
      setKeySaved(true)
      setTimeout(() => setKeySaved(false), 2000)
    } catch {
      // ignore
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setSaveResult(null)
    try {
      const res = await api().otelGenerateConfig({})
      if (res.success && res.yaml) {
        setYamlPreview(res.yaml)
      } else {
        setSaveResult({ ok: false, message: res.error ?? 'Generation failed' })
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async () => {
    setGenerating(true)
    try {
      const res = await api().otelGenerateConfig({ savePath: 'dialog' })
      if (res.success) {
        setSaveResult({ ok: true, message: `Saved to ${res.filePath ?? 'selected location'}` })
      } else {
        setSaveResult({ ok: false, message: res.error ?? 'Save failed' })
      }
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 style={styles.title}>Observability</h2>
      </header>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>New Relic Integration</h3>
        <p style={styles.description}>
          Configure your New Relic license key to enable OTel metric export. The key is stored securely in preferences and embedded in the generated collector configuration.
        </p>
        <div style={styles.keyRow}>
          <input
            style={styles.input}
            type="password"
            placeholder="New Relic license key (40 chars)"
            value={newRelicKey}
            onChange={e => setNewRelicKey(e.target.value)}
          />
          <button style={styles.saveBtn} onClick={() => void handleSaveKey()}>
            {keySaved ? 'Saved ✓' : 'Save Key'}
          </button>
        </div>
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>OTel Collector Configuration</h3>
        <p style={styles.description}>
          Generate an OpenTelemetry Collector configuration file for all active device types. The YAML is pre-configured to export metrics to New Relic's OTLP endpoint.
        </p>
        <div style={styles.buttonRow}>
          <button style={styles.generateBtn} onClick={() => void handleGenerate()} disabled={generating}>
            {generating ? 'Generating…' : 'Preview Config'}
          </button>
          <button style={styles.downloadBtn} onClick={() => void handleDownload()} disabled={generating}>
            Download YAML
          </button>
        </div>

        {saveResult && (
          <div style={{
            ...styles.toast,
            background: saveResult.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: saveResult.ok ? 'var(--color-green)' : 'var(--color-red)',
            border: `1px solid ${saveResult.ok ? 'var(--color-green)' : 'var(--color-red)'}`
          }}>
            {saveResult.message}
          </div>
        )}

        {yamlPreview && (
          <div style={styles.previewWrapper}>
            <div style={styles.previewHeader}>
              <span style={styles.previewLabel}>YAML Preview</span>
              <button
                style={styles.copyBtn}
                onClick={() => void navigator.clipboard.writeText(yamlPreview)}
              >
                Copy
              </button>
            </div>
            <pre style={styles.pre}>{yamlPreview}</pre>
          </div>
        )}
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>About</h3>
        <p style={styles.description}>
          The generated configuration uses the OpenTelemetry Collector with a custom receiver per device type. Metrics are exported to New Relic via OTLP/HTTP. For more information, see the New Relic OTel documentation.
        </p>
        <div style={styles.infoGrid}>
          <span style={styles.infoLabel}>OTLP Endpoint</span>
          <code style={styles.infoValue}>https://otlp.nr-data.net:4318/v1/metrics</code>
          <span style={styles.infoLabel}>Protocol</span>
          <code style={styles.infoValue}>OTLP/HTTP (gRPC fallback port 4317)</code>
          <span style={styles.infoLabel}>Scrape Interval</span>
          <code style={styles.infoValue}>30s (configurable in YAML)</code>
        </div>
      </section>
    </div>
  )
}

const styles = {
  container: { padding: 'var(--spacing-xl)', height: '100%', overflowY: 'auto' as const },
  header: { marginBottom: 'var(--spacing-xl)' },
  title: { fontSize: 'var(--font-size-xl)', fontWeight: 700, margin: 0 },
  section: { marginBottom: 'var(--spacing-xl)' },
  sectionTitle: { fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--spacing-sm)', color: 'var(--color-text-secondary)' },
  description: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-md)', lineHeight: 1.5 },
  keyRow: { display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center', maxWidth: 480 },
  input: {
    flex: 1, padding: '8px 12px', background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)', outline: 'none',
    fontFamily: 'var(--font-mono)'
  },
  saveBtn: {
    padding: '8px 16px', background: 'var(--color-accent)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)',
    fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const
  },
  buttonRow: { display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' },
  generateBtn: {
    padding: '8px 16px', background: 'var(--color-accent)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)',
    fontWeight: 600, cursor: 'pointer'
  },
  downloadBtn: {
    padding: '8px 16px', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)', cursor: 'pointer'
  },
  toast: {
    padding: 'var(--spacing-xs) var(--spacing-sm)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-md)'
  },
  previewWrapper: {
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden'
  },
  previewHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'var(--spacing-xs) var(--spacing-sm)',
    background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--color-border)'
  },
  previewLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)' },
  copyBtn: {
    padding: '2px 8px', background: 'transparent', color: 'var(--color-text-muted)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--font-size-xs)', cursor: 'pointer'
  },
  pre: {
    margin: 0, padding: 'var(--spacing-md)', background: 'var(--color-bg)',
    fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-primary)', overflow: 'auto', maxHeight: 400,
    lineHeight: 1.6
  },
  infoGrid: {
    display: 'grid', gridTemplateColumns: '160px 1fr',
    gap: 'var(--spacing-xs) var(--spacing-md)',
    fontSize: 'var(--font-size-sm)'
  },
  infoLabel: { color: 'var(--color-text-muted)', fontWeight: 600 },
  infoValue: { fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)' }
}
