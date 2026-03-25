import React, { useState, useEffect } from 'react'
import type { HierarchyNode } from '@shared/ipc-types'

const INPUT_OPTIONS: Array<{ label: string; code: string }> = [
  { label: 'DTV',         code: '00' },
  { label: 'AV',          code: '10' },
  { label: 'Component',   code: '20' },
  { label: 'HDMI 1',      code: '40' },
  { label: 'HDMI 2',      code: '41' },
  { label: 'HDMI 3',      code: '42' },
  { label: 'HDMI 4',      code: '90' },
  { label: 'DisplayPort', code: '60' }
]

interface OptimisticState {
  power?: 'on' | 'off' | null
  input?: string | null
  screenMute?: boolean | null
  volumeMute?: boolean | null
  volume?: number | null
}

interface Props {
  device: HierarchyNode
  meta: Record<string, unknown>
  onCommand: (command: string, params?: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
}

export const LGDisplayPanel: React.FC<Props> = ({ device: _device, meta, onCommand }) => {
  const [inputDropdownOpen, setInputDropdownOpen] = useState(false)
  const [optimistic, setOptimistic] = useState<OptimisticState>({})
  const [pendingCommand, setPendingCommand] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ message: string; ok: boolean } | null>(null)

  // Clear optimistic state when real poll data arrives
  useEffect(() => {
    setOptimistic({})
  }, [meta.power, meta.input, meta.screenMute, meta.volumeMute, meta.volume])

  // Resolved values — optimistic overrides polled meta until next poll
  const power      = (optimistic.power      !== undefined ? optimistic.power      : meta.power)      as 'on' | 'off' | null | undefined
  const input      = (optimistic.input      !== undefined ? optimistic.input      : meta.input)      as string | null | undefined
  const screenMute = (optimistic.screenMute !== undefined ? optimistic.screenMute : meta.screenMute) as boolean | null | undefined
  const volumeMute = (optimistic.volumeMute !== undefined ? optimistic.volumeMute : meta.volumeMute) as boolean | null | undefined
  const volume     = (optimistic.volume     !== undefined ? optimistic.volume     : meta.volume)     as number | null | undefined
  const connected  = meta.connected as boolean | undefined

  const handleCommand = async (command: string, params?: Record<string, unknown>) => {
    // Apply optimistic update immediately
    switch (command) {
      case 'powerOn':       setOptimistic(o => ({ ...o, power: 'on' })); break
      case 'powerOff':      setOptimistic(o => ({ ...o, power: 'off' })); break
      case 'screenMuteOn':  setOptimistic(o => ({ ...o, screenMute: true })); break
      case 'screenMuteOff': setOptimistic(o => ({ ...o, screenMute: false })); break
      case 'volumeMuteOn':  setOptimistic(o => ({ ...o, volumeMute: true })); break
      case 'volumeMuteOff': setOptimistic(o => ({ ...o, volumeMute: false })); break
      case 'setInput': {
        const opt = INPUT_OPTIONS.find(o => o.code === (params?.inputCode as string))
        if (opt) setOptimistic(o => ({ ...o, input: opt.label }))
        break
      }
      case 'volumeUp': {
        const curr = (optimistic.volume !== undefined ? optimistic.volume : (meta.volume as number | null)) ?? 0
        setOptimistic(o => ({ ...o, volume: Math.min(100, curr + 10) }))
        break
      }
      case 'volumeDown': {
        const curr = (optimistic.volume !== undefined ? optimistic.volume : (meta.volume as number | null)) ?? 0
        setOptimistic(o => ({ ...o, volume: Math.max(0, curr - 10) }))
        break
      }
    }

    setPendingCommand(command)
    try {
      const res = await onCommand(command, params)
      setFeedback({ message: res.success ? 'Done' : (res.error ?? 'Failed'), ok: res.success })
      if (!res.success) setOptimistic({}) // revert on failure
    } catch {
      setFeedback({ message: 'Command failed', ok: false })
      setOptimistic({})
    } finally {
      setPendingCommand(null)
      setTimeout(() => setFeedback(null), 2500)
    }
  }

  // ── Badge colours ──────────────────────────────────────────────────────────

  const powerColor =
    power === 'on'  ? 'var(--color-green)' :
    power === 'off' ? 'var(--color-red)'   :
    'var(--color-text-muted)'

  const powerLabel =
    power === 'on'  ? 'On'  :
    power === 'off' ? 'Off' :
    'Unknown'

  const screenMuteColor =
    screenMute === true  ? 'var(--color-amber)' :
    screenMute === false ? 'var(--color-green)' :
    'var(--color-text-muted)'

  const volumeMuteColor =
    volumeMute === true  ? 'var(--color-amber)' :
    volumeMute === false ? 'var(--color-green)' :
    'var(--color-text-muted)'

  const busy = (cmd: string) => pendingCommand === cmd

  return (
    <div style={styles.root}>

      {connected === false && (
        <div style={styles.banner}>
          Device unreachable — attempting to reconnect
        </div>
      )}

      {/* ── Power ── */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>Power</div>
        <div style={styles.row}>
          <span style={{ ...styles.badge, color: powerColor, borderColor: powerColor }}>
            {powerLabel}
          </span>
          <div style={styles.btnGroup}>
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              onClick={() => void handleCommand('powerOn')}
              disabled={power === 'on' || pendingCommand !== null}
            >
              {busy('powerOn') ? '…' : 'On'}
            </button>
            <button
              style={{ ...styles.btn, ...styles.btnDanger }}
              onClick={() => void handleCommand('powerOff')}
              disabled={power === 'off' || pendingCommand !== null}
            >
              {busy('powerOff') ? '…' : 'Off'}
            </button>
          </div>
        </div>
      </section>

      {/* ── Input Source ── */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>Input Source</div>
        <div style={styles.row}>
          <span style={styles.valueLabel}>{input ?? 'Unknown'}</span>
          <div style={{ position: 'relative' }}>
            <button
              style={{ ...styles.btn, ...styles.btnSecondary }}
              onClick={() => setInputDropdownOpen(o => !o)}
              disabled={pendingCommand !== null}
            >
              Switch input
            </button>
            {inputDropdownOpen && (
              <div style={styles.dropdown}>
                {INPUT_OPTIONS.map(opt => (
                  <button
                    key={opt.code}
                    style={{ ...styles.dropdownItem, fontWeight: input === opt.label ? 600 : 400 }}
                    onClick={() => { void handleCommand('setInput', { inputCode: opt.code }); setInputDropdownOpen(false) }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Screen Mute ── */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>Screen Mute</div>
        <div style={styles.row}>
          <span style={{ ...styles.badge, color: screenMuteColor, borderColor: screenMuteColor }}>
            {screenMute == null ? 'Unknown' : screenMute ? 'On' : 'Off'}
          </span>
          <div style={styles.btnGroup}>
            <button
              style={{ ...styles.btn, ...styles.btnWarning }}
              onClick={() => void handleCommand('screenMuteOn')}
              disabled={screenMute === true || pendingCommand !== null}
            >
              {busy('screenMuteOn') ? '…' : 'Mute On'}
            </button>
            <button
              style={{ ...styles.btn, ...styles.btnSecondary }}
              onClick={() => void handleCommand('screenMuteOff')}
              disabled={screenMute === false || pendingCommand !== null}
            >
              {busy('screenMuteOff') ? '…' : 'Mute Off'}
            </button>
          </div>
        </div>
      </section>

      {/* ── Volume Mute ── */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>Volume Mute</div>
        <div style={styles.row}>
          <span style={{ ...styles.badge, color: volumeMuteColor, borderColor: volumeMuteColor }}>
            {volumeMute == null ? 'Unknown' : volumeMute ? 'On' : 'Off'}
          </span>
          <div style={styles.btnGroup}>
            <button
              style={{ ...styles.btn, ...styles.btnWarning }}
              onClick={() => void handleCommand('volumeMuteOn')}
              disabled={volumeMute === true || pendingCommand !== null}
            >
              {busy('volumeMuteOn') ? '…' : 'Mute On'}
            </button>
            <button
              style={{ ...styles.btn, ...styles.btnSecondary }}
              onClick={() => void handleCommand('volumeMuteOff')}
              disabled={volumeMute === false || pendingCommand !== null}
            >
              {busy('volumeMuteOff') ? '…' : 'Mute Off'}
            </button>
          </div>
        </div>
      </section>

      {/* ── Volume Level ── */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>Volume</div>
        <div style={styles.row}>
          <span style={styles.volumeDisplay}>
            {volume !== null && volume !== undefined ? volume : '—'}
          </span>
          <div style={styles.btnGroup}>
            <button
              style={{ ...styles.btn, ...styles.btnSecondary, minWidth: 40 }}
              onClick={() => void handleCommand('volumeDown')}
              disabled={pendingCommand !== null}
            >
              {busy('volumeDown') ? '…' : '−10'}
            </button>
            <button
              style={{ ...styles.btn, ...styles.btnSecondary, minWidth: 40 }}
              onClick={() => void handleCommand('volumeUp')}
              disabled={pendingCommand !== null}
            >
              {busy('volumeUp') ? '…' : '+10'}
            </button>
          </div>
        </div>
        {volume !== null && volume !== undefined && (
          <div style={styles.volumeBarTrack}>
            <div style={{ ...styles.volumeBarFill, width: `${volume}%` }} />
          </div>
        )}
      </section>

      {/* ── Inline feedback — always reserved to prevent layout shift ── */}
      <div style={{
        ...styles.feedbackBar,
        visibility: feedback ? 'visible' : 'hidden',
        background: feedback?.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
        color: feedback?.ok ? 'var(--color-green)' : 'var(--color-red)',
        borderColor: feedback?.ok ? 'var(--color-green)' : 'var(--color-red)',
      }}>
        {feedback?.message ?? '\u00A0'}
      </div>
    </div>
  )
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--spacing-md)',
    padding: 'var(--spacing-md)',
    background: 'var(--color-bg-surface)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)'
  },
  banner: {
    padding: 'var(--spacing-sm) var(--spacing-md)',
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid var(--color-red)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-red)'
  },
  feedbackBar: {
    padding: '6px var(--spacing-md)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid transparent',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 500,
    textAlign: 'center' as const,
  },
  section: {
    padding: 'var(--spacing-sm) 0',
    borderBottom: '1px solid var(--color-border)'
  },
  sectionHeader: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    marginBottom: 'var(--spacing-sm)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--spacing-md)',
    flexWrap: 'wrap' as const
  },
  badge: {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    minWidth: 60,
    textAlign: 'center' as const
  },
  valueLabel: {
    fontSize: 'var(--font-size-md)',
    color: 'var(--color-text-primary)',
    minWidth: 100
  },
  volumeDisplay: {
    fontSize: 'var(--font-size-lg, 1.125rem)',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    minWidth: 40,
    textAlign: 'center' as const
  },
  volumeBarTrack: {
    marginTop: 'var(--spacing-sm)',
    height: 6,
    background: 'var(--color-border)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden'
  },
  volumeBarFill: {
    height: '100%',
    background: 'var(--color-accent)',
    borderRadius: 'var(--radius-md)',
    transition: 'width 0.2s ease'
  },
  btnGroup: {
    display: 'flex',
    gap: 'var(--spacing-sm)'
  },
  btn: {
    padding: '5px 12px',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)',
    cursor: 'pointer',
    fontWeight: 500,
    transition: 'opacity 0.1s',
  } as React.CSSProperties,
  btnPrimary:   { background: 'var(--color-accent)', color: '#fff' } as React.CSSProperties,
  btnDanger:    { background: 'var(--color-red)',    color: '#fff' } as React.CSSProperties,
  btnWarning:   { background: 'var(--color-amber)',  color: '#000' } as React.CSSProperties,
  btnSecondary: { background: 'transparent', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' } as React.CSSProperties,
  dropdown: {
    position: 'absolute' as const,
    top: '100%',
    right: 0,
    marginTop: 4,
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    zIndex: 100,
    minWidth: 140,
    overflow: 'hidden'
  },
  dropdownItem: {
    display: 'block',
    width: '100%',
    padding: 'var(--spacing-sm) var(--spacing-md)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-primary)'
  }
}
