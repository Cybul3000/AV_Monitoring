import React, { useState, useEffect, useCallback } from 'react'
import type { AlertRule, AlertRulesGetResponse, AlertRuleSetRequest } from '@shared/ipc-types'

type ApiShape = {
  alertGetRules: (req?: { deviceType?: string }) => Promise<AlertRulesGetResponse>
  alertSetRule: (req: AlertRuleSetRequest) => Promise<{ success: boolean; error?: string }>
}

function getApi(): ApiShape {
  return window.api as unknown as ApiShape
}

export const AlertSettingsView: React.FC = () => {
  const [rules, setRules] = useState<AlertRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null) // key = `${deviceType}/${statusPoint}`

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getApi().alertGetRules()
      setRules(res.rules)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleToggle = async (rule: AlertRule) => {
    const key = `${rule.deviceType}/${rule.statusPoint}`
    setSaving(key)
    try {
      await getApi().alertSetRule({
        deviceType: rule.deviceType,
        statusPoint: rule.statusPoint,
        alertEnabled: !rule.alertEnabled
      })
      setRules(prev =>
        prev.map(r =>
          r.deviceType === rule.deviceType && r.statusPoint === rule.statusPoint
            ? { ...r, alertEnabled: !r.alertEnabled }
            : r
        )
      )
    } catch (err) {
      setError(`Failed to save: ${String(err)}`)
    } finally {
      setSaving(null)
    }
  }

  // Group rules by deviceType
  const grouped = rules.reduce<Record<string, AlertRule[]>>((acc, rule) => {
    if (!acc[rule.deviceType]) acc[rule.deviceType] = []
    acc[rule.deviceType].push(rule)
    return acc
  }, {})

  if (loading) {
    return <div style={styles.container}><p style={styles.muted}>Loading alert rules...</p></div>
  }

  if (error) {
    return (
      <div style={styles.container}>
        <p style={styles.errorText}>{error}</p>
        <button style={styles.btn} onClick={() => void load()}>Retry</button>
      </div>
    )
  }

  if (Object.keys(grouped).length === 0) {
    return (
      <div style={styles.container}>
        <h2 style={styles.heading}>Alert Settings</h2>
        <p style={styles.muted}>No alert rules configured. Add devices to the hierarchy to seed defaults.</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Alert Settings</h2>
      <p style={styles.description}>
        Control which status points trigger LED alerts. Disabled points are still monitored but will not change the device LED to AMBER or RED.
      </p>
      {Object.entries(grouped).map(([deviceType, deviceRules]) => (
        <div key={deviceType} style={styles.group}>
          <h3 style={styles.groupHeading}>{deviceType}</h3>
          <div style={styles.ruleList}>
            {deviceRules.map(rule => {
              const key = `${rule.deviceType}/${rule.statusPoint}`
              const isSaving = saving === key
              return (
                <div key={rule.statusPoint} style={styles.ruleRow}>
                  <span style={styles.ruleLabel}>{rule.statusPoint}</span>
                  <label style={styles.toggleLabel}>
                    <input
                      type="checkbox"
                      checked={rule.alertEnabled}
                      disabled={isSaving}
                      onChange={() => void handleToggle(rule)}
                      style={styles.checkbox}
                    />
                    <span style={{ color: rule.alertEnabled ? 'var(--color-green, #4caf50)' : 'var(--color-text-muted, #888)' }}>
                      {rule.alertEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
    maxWidth: 720,
    margin: '0 auto',
    color: 'var(--color-text-primary, #fff)'
  },
  heading: {
    fontSize: '1.25rem',
    fontWeight: 700,
    marginBottom: 8
  },
  description: {
    fontSize: '0.875rem',
    color: 'var(--color-text-muted, #888)',
    marginBottom: 24
  },
  group: {
    marginBottom: 24,
    border: '1px solid var(--color-border, #333)',
    borderRadius: 8,
    overflow: 'hidden'
  },
  groupHeading: {
    fontSize: '0.875rem',
    fontWeight: 600,
    padding: '10px 16px',
    background: 'var(--color-bg-surface, #1e1e1e)',
    margin: 0,
    borderBottom: '1px solid var(--color-border, #333)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--color-text-secondary, #ccc)'
  },
  ruleList: {
    display: 'flex',
    flexDirection: 'column'
  },
  ruleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--color-border, #333)',
    background: 'var(--color-bg, #141414)'
  },
  ruleLabel: {
    fontSize: '0.875rem',
    fontFamily: 'var(--font-mono, monospace)'
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    fontSize: '0.875rem'
  },
  checkbox: {
    width: 16,
    height: 16,
    cursor: 'pointer'
  },
  muted: {
    color: 'var(--color-text-muted, #888)',
    fontSize: '0.875rem'
  },
  errorText: {
    color: 'var(--color-red, #f44336)',
    fontSize: '0.875rem',
    marginBottom: 12
  },
  btn: {
    padding: '6px 14px',
    background: 'var(--color-accent, #4a9eff)',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: '0.875rem'
  }
}
