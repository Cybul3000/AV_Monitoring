import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { AlertRule, AlertRulesGetResponse, AlertRuleSetRequest, HierarchyNode } from '@shared/ipc-types'
import { useDeviceStatus } from '../hooks/useDeviceStatus'

type ApiShape = {
  alertGetRules: (req?: { deviceType?: string }) => Promise<AlertRulesGetResponse>
  alertSetRule: (req: AlertRuleSetRequest) => Promise<{ success: boolean; error?: string }>
  hierarchyGet: () => Promise<{ roots: HierarchyNode[] }>
}

function getApi(): ApiShape {
  return window.api as unknown as ApiShape
}

/** Flatten all device nodes from the hierarchy tree */
function flattenDevices(nodes: HierarchyNode[]): HierarchyNode[] {
  const result: HierarchyNode[] = []
  for (const node of nodes) {
    if (node.type === 'device') result.push(node)
    if (node.children) result.push(...flattenDevices(node.children))
  }
  return result
}

export const AlertSettingsView: React.FC = () => {
  const [rules, setRules] = useState<AlertRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null) // key = `${deviceType}/${statusPoint}`
  const [allDevices, setAllDevices] = useState<HierarchyNode[]>([])
  const { getDeviceMeta } = useDeviceStatus()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rulesRes, hierarchyRes] = await Promise.all([
        getApi().alertGetRules(),
        getApi().hierarchyGet()
      ])
      setRules(rulesRes.rules)
      setAllDevices(flattenDevices(hierarchyRes.roots))
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Returns live-discovered options for a status point based on current device meta,
   * falling back to the static options from the module definition.
   * Currently handles: lightware-matrix / hdmi_input_signal → actual input port IDs + labels.
   */
  const getDiscoveredOptions = useMemo(() => {
    return (deviceType: string, statusPoint: string, staticOptions: string[]): string[] => {
      if (deviceType === 'lightware-matrix' && statusPoint === 'hdmi_input_signal') {
        const devicesOfType = allDevices.filter(d => d.deviceType === deviceType)
        const discovered = new Map<string, string>() // portId → label

        for (const device of devicesOfType) {
          const meta = getDeviceMeta(device.id)
          const ports = meta.ports as Array<{ portId: string; direction: string; label: string }> | undefined
          if (ports) {
            for (const port of ports) {
              if (port.direction === 'input' && !discovered.has(port.portId)) {
                // Use "I1 — Laptop HDMI" format if label differs from portId
                const label = port.label && port.label !== port.portId
                  ? `${port.portId} — ${port.label}`
                  : port.portId
                discovered.set(port.portId, label)
              }
            }
          }
        }

        if (discovered.size > 0) {
          // Return portId values (what gets stored as expectedValue), display label shown in option text
          return Array.from(discovered.keys()).sort()
        }
      }
      return staticOptions
    }
  }, [allDevices, getDeviceMeta])

  const handleToggle = async (rule: AlertRule) => {
    const key = `${rule.deviceType}/${rule.statusPoint}`
    setSaving(key)
    try {
      await getApi().alertSetRule({
        deviceType: rule.deviceType,
        statusPoint: rule.statusPoint,
        alertEnabled: !rule.alertEnabled,
        expectedValue: rule.expectedValue
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

  const handleExpectedValue = async (rule: AlertRule, value: string) => {
    const key = `${rule.deviceType}/${rule.statusPoint}`
    setSaving(key)
    try {
      const newValue = value || null
      await getApi().alertSetRule({
        deviceType: rule.deviceType,
        statusPoint: rule.statusPoint,
        alertEnabled: rule.alertEnabled,
        expectedValue: newValue
      })
      setRules(prev =>
        prev.map(r =>
          r.deviceType === rule.deviceType && r.statusPoint === rule.statusPoint
            ? { ...r, expectedValue: newValue }
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
              const hasValueSelector = rule.options !== undefined
              const liveOptions = hasValueSelector
                ? getDiscoveredOptions(rule.deviceType, rule.statusPoint, rule.options ?? [])
                : []
              return (
                <div key={rule.statusPoint} style={styles.ruleRow}>
                  <div style={styles.ruleInfo}>
                    <span style={styles.ruleLabel}>{rule.statusPoint}</span>
                    {hasValueSelector && (
                      <div style={styles.expectedValueRow}>
                        <span style={styles.expectedLabel}>Expected:</span>
                        {liveOptions.length > 0 ? (
                          <select
                            style={styles.select}
                            value={rule.expectedValue ?? ''}
                            disabled={isSaving}
                            onChange={e => void handleExpectedValue(rule, e.target.value)}
                          >
                            <option value="">— any —</option>
                            {liveOptions.map(opt => {
                              // opt may be plain portId; build display label from discovered meta
                              const devicesOfType = allDevices.filter(d => d.deviceType === rule.deviceType)
                              let displayLabel = opt
                              for (const dev of devicesOfType) {
                                const meta = getDeviceMeta(dev.id)
                                const ports = meta.ports as Array<{ portId: string; direction: string; label: string }> | undefined
                                const port = ports?.find(p => p.portId === opt)
                                if (port?.label && port.label !== opt) {
                                  displayLabel = `${opt} — ${port.label}`
                                  break
                                }
                              }
                              return <option key={opt} value={opt}>{displayLabel}</option>
                            })}
                          </select>
                        ) : (
                          <input
                            type="text"
                            style={styles.textInput}
                            placeholder="not yet discovered"
                            value={rule.expectedValue ?? ''}
                            disabled={isSaving}
                            onChange={e => void handleExpectedValue(rule, e.target.value)}
                          />
                        )}
                      </div>
                    )}
                  </div>
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
    background: 'var(--color-bg, #141414)',
    gap: 16
  },
  ruleInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    flex: 1
  },
  ruleLabel: {
    fontSize: '0.875rem',
    fontFamily: 'var(--font-mono, monospace)'
  },
  expectedValueRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  expectedLabel: {
    fontSize: '0.75rem',
    color: 'var(--color-text-muted, #888)'
  },
  select: {
    padding: '3px 8px',
    background: 'var(--color-bg-surface, #1e1e1e)',
    border: '1px solid var(--color-border, #333)',
    borderRadius: 4,
    color: 'var(--color-text-primary, #fff)',
    fontSize: '0.8125rem',
    cursor: 'pointer'
  },
  textInput: {
    padding: '3px 8px',
    background: 'var(--color-bg-surface, #1e1e1e)',
    border: '1px solid var(--color-border, #333)',
    borderRadius: 4,
    color: 'var(--color-text-primary, #fff)',
    fontSize: '0.8125rem',
    width: 180
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
