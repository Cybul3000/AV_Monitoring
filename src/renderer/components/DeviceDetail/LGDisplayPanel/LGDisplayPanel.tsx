import React, { useState } from 'react'
import type { HierarchyNode } from '@shared/ipc-types'

// Input sources the UI exposes for switching
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

interface Props {
  device: HierarchyNode
  meta: Record<string, unknown>
  onCommand: (command: string, params?: Record<string, unknown>) => void
}

export const LGDisplayPanel: React.FC<Props> = ({ device: _device, meta, onCommand }) => {
  const [inputDropdownOpen, setInputDropdownOpen] = useState(false)

  const power       = meta.power       as 'on' | 'off' | null | undefined
  const input       = meta.input       as string | null | undefined
  const screenMute  = meta.screenMute  as boolean | null | undefined
  const volumeMute  = meta.volumeMute  as boolean | null | undefined
  const volume      = meta.volume      as number | null | undefined
  const connected   = meta.connected   as boolean | undefined

  // ── Badge colours ──────────────────────────────────────────────────────────

  const powerColor =
    power === 'on'  ? 'var(--color-green)'  :
    power === 'off' ? 'var(--color-red)'    :
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

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSetInput = (code: string) => {
    onCommand('setInput', { inputCode: code })
    setInputDropdownOpen(false)
  }

  const handleVolumeUp   = () => onCommand('volumeUp')
  const handleVolumeDown = () => onCommand('volumeDown')

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={styles.root}>

      {/* Connection status banner */}
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
              onClick={() => onCommand('powerOn')}
              disabled={power === 'on'}
              title="Power On"
            >
              On
            </button>
            <button
              style={{ ...styles.btn, ...styles.btnDanger }}
              onClick={() => onCommand('powerOff')}
              disabled={power === 'off'}
              title="Power Off"
            >
              Off
            </button>
          </div>
        </div>
      </section>

      {/* ── Input Source ── */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>Input Source</div>
        <div style={styles.row}>
          <span style={styles.valueLabel}>
            {input ?? 'Unknown'}
          </span>
          <div style={{ position: 'relative' }}>
            <button
              style={{ ...styles.btn, ...styles.btnSecondary }}
              onClick={() => setInputDropdownOpen(o => !o)}
            >
              Switch input
            </button>
            {inputDropdownOpen && (
              <div style={styles.dropdown}>
                {INPUT_OPTIONS.map(opt => (
                  <button
                    key={opt.code}
                    style={{
                      ...styles.dropdownItem,
                      fontWeight: input === opt.label ? 600 : 400
                    }}
                    onClick={() => handleSetInput(opt.code)}
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
            {screenMute === null || screenMute === undefined ? 'Unknown' : screenMute ? 'On' : 'Off'}
          </span>
          <div style={styles.btnGroup}>
            <button
              style={{ ...styles.btn, ...styles.btnWarning }}
              onClick={() => onCommand('screenMuteOn')}
              disabled={screenMute === true}
              title="Enable Screen Mute"
            >
              Mute On
            </button>
            <button
              style={{ ...styles.btn, ...styles.btnSecondary }}
              onClick={() => onCommand('screenMuteOff')}
              disabled={screenMute === false}
              title="Disable Screen Mute"
            >
              Mute Off
            </button>
          </div>
        </div>
      </section>

      {/* ── Volume Mute ── */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>Volume Mute</div>
        <div style={styles.row}>
          <span style={{ ...styles.badge, color: volumeMuteColor, borderColor: volumeMuteColor }}>
            {volumeMute === null || volumeMute === undefined ? 'Unknown' : volumeMute ? 'On' : 'Off'}
          </span>
          <div style={styles.btnGroup}>
            <button
              style={{ ...styles.btn, ...styles.btnWarning }}
              onClick={() => onCommand('volumeMuteOn')}
              disabled={volumeMute === true}
              title="Enable Volume Mute"
            >
              Mute On
            </button>
            <button
              style={{ ...styles.btn, ...styles.btnSecondary }}
              onClick={() => onCommand('volumeMuteOff')}
              disabled={volumeMute === false}
              title="Disable Volume Mute"
            >
              Mute Off
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
              onClick={handleVolumeDown}
              title="Volume Down 10"
            >
              −10
            </button>
            <button
              style={{ ...styles.btn, ...styles.btnSecondary, minWidth: 40 }}
              onClick={handleVolumeUp}
              title="Volume Up 10"
            >
              +10
            </button>
          </div>
        </div>
        {/* Visual volume bar */}
        {volume !== null && volume !== undefined && (
          <div style={styles.volumeBarTrack}>
            <div
              style={{
                ...styles.volumeBarFill,
                width: `${volume}%`
              }}
            />
          </div>
        )}
      </section>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

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
    // disabled state handled via opacity via CSS-in-JS workaround — we use
    // the disabled attribute on the button itself for accessibility
  } as React.CSSProperties,
  btnPrimary: {
    background: 'var(--color-accent)',
    color: '#fff'
  } as React.CSSProperties,
  btnDanger: {
    background: 'var(--color-red)',
    color: '#fff'
  } as React.CSSProperties,
  btnWarning: {
    background: 'var(--color-amber)',
    color: '#000'
  } as React.CSSProperties,
  btnSecondary: {
    background: 'transparent',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)'
  } as React.CSSProperties,
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
