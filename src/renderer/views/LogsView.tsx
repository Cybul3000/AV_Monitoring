import React, { useState, useEffect, useCallback } from 'react'

type Severity = 'INFO' | 'WARN' | 'ERROR'

interface LogEvent {
  id: number
  deviceId?: string
  roomId?: string
  severity: Severity
  message: string
  timestamp: string
  source?: string
}

type ApiShape = {
  logQuery: (req: {
    deviceId?: string
    roomId?: string
    severity?: Severity
    since?: string
    limit?: number
  }) => Promise<{ success: boolean; events?: LogEvent[]; error?: string }>
  logDownload: (req: { format: 'json' | 'csv' }) => Promise<{ success: boolean; error?: string }>
}

const SEVERITY_OPTIONS: Array<{ value: Severity | ''; label: string }> = [
  { value: '', label: 'All Levels' },
  { value: 'ERROR', label: 'Error' },
  { value: 'WARN', label: 'Warning' },
  { value: 'INFO', label: 'Info' }
]

const LIMIT_OPTIONS = [50, 100, 250, 500]

export const LogsView: React.FC = () => {
  const [events, setEvents] = useState<LogEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [severity, setSeverity] = useState<Severity | ''>('')
  const [limit, setLimit] = useState(100)
  const [downloading, setDownloading] = useState(false)

  const api = () => (window.api as unknown as ApiShape)

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api().logQuery({
        severity: severity || undefined,
        limit
      })
      if (res.success && res.events) {
        setEvents(res.events)
      }
    } finally {
      setLoading(false)
    }
  }, [severity, limit])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])

  const handleDownload = async (format: 'json' | 'csv') => {
    setDownloading(true)
    try {
      await api().logDownload({ format })
    } finally {
      setDownloading(false)
    }
  }

  const severityStyle = (s: Severity) => {
    switch (s) {
      case 'ERROR': return { color: 'var(--color-red)', background: 'rgba(239,68,68,0.1)' }
      case 'WARN': return { color: 'var(--color-amber)', background: 'rgba(245,158,11,0.1)' }
      default: return { color: 'var(--color-text-muted)', background: 'rgba(107,114,128,0.1)' }
    }
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 style={styles.title}>Event Logs</h2>
        <div style={styles.actions}>
          <button style={styles.downloadBtn} onClick={() => void handleDownload('csv')} disabled={downloading}>
            Download CSV
          </button>
          <button style={styles.downloadBtn} onClick={() => void handleDownload('json')} disabled={downloading}>
            Download JSON
          </button>
        </div>
      </header>

      <div style={styles.filters}>
        <select
          style={styles.select}
          value={severity}
          onChange={e => setSeverity(e.target.value as Severity | '')}
        >
          {SEVERITY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          style={styles.select}
          value={limit}
          onChange={e => setLimit(Number(e.target.value))}
        >
          {LIMIT_OPTIONS.map(n => (
            <option key={n} value={n}>Show {n}</option>
          ))}
        </select>
        <button style={styles.refreshBtn} onClick={() => void loadLogs()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <span style={styles.count}>{events.length} events</span>
      </div>

      {events.length === 0 && !loading ? (
        <div style={styles.empty}>
          <p style={{ color: 'var(--color-text-muted)' }}>No events found matching the current filter.</p>
        </div>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Timestamp</th>
                <th style={styles.th}>Level</th>
                <th style={styles.th}>Source</th>
                <th style={styles.th}>Message</th>
              </tr>
            </thead>
            <tbody>
              {events.map(event => (
                <tr key={event.id} style={styles.tr}>
                  <td style={{ ...styles.td, fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)', whiteSpace: 'nowrap' }}>
                    {new Date(event.timestamp).toLocaleString()}
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      ...severityStyle(event.severity),
                      padding: '1px 6px', borderRadius: 'var(--radius-sm)',
                      fontSize: 'var(--font-size-xs)', fontWeight: 600
                    }}>
                      {event.severity}
                    </span>
                  </td>
                  <td style={{ ...styles.td, fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    {event.source ?? event.deviceId ?? '—'}
                  </td>
                  <td style={{ ...styles.td, fontSize: 'var(--font-size-sm)' }}>
                    {event.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: { padding: 'var(--spacing-xl)', height: '100%', overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-lg)', flexShrink: 0 },
  title: { fontSize: 'var(--font-size-xl)', fontWeight: 700, margin: 0 },
  actions: { display: 'flex', gap: 'var(--spacing-sm)' },
  downloadBtn: {
    padding: '6px 14px', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)', cursor: 'pointer'
  },
  filters: { display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center', marginBottom: 'var(--spacing-md)', flexShrink: 0 },
  select: {
    padding: '6px 10px', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)', cursor: 'pointer', outline: 'none'
  },
  refreshBtn: {
    padding: '6px 14px', background: 'transparent', color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)', cursor: 'pointer'
  },
  count: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginLeft: 'auto' },
  empty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tableWrapper: { flex: 1, overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 'var(--font-size-sm)' },
  th: {
    padding: 'var(--spacing-xs) var(--spacing-sm)', textAlign: 'left' as const,
    fontWeight: 600, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)',
    borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' as const,
    background: 'var(--color-bg)', position: 'sticky' as const, top: 0
  },
  td: {
    padding: 'var(--spacing-xs) var(--spacing-sm)',
    borderBottom: '1px solid var(--color-border)',
    verticalAlign: 'top' as const
  },
  tr: {}
}
