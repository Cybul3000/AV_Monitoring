import React from 'react'
import type { SSHSessionState } from '@shared/ipc-types'

interface Props {
  sessionState: SSHSessionState
  onCommand: (command: string) => void
  onPROGRESet: () => void
  onREBOOT: () => void
  onFORCEDREBOOT: () => void
}

export const SSHCommandButtons: React.FC<Props> = ({
  sessionState,
  onCommand,
  onPROGRESet,
  onREBOOT,
  onFORCEDREBOOT
}) => {
  const isReady = sessionState === 'READY'

  const btnBase: React.CSSProperties = {
    padding: '6px 12px',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)',
    fontFamily: 'var(--font-mono)',
    cursor: isReady ? 'pointer' : 'not-allowed',
    opacity: isReady ? 1 : 0.45,
    transition: 'opacity 0.15s'
  }

  const readonlyBtn: React.CSSProperties = {
    ...btnBase,
    background: 'var(--color-bg-elevated, #2a2a2a)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)'
  }

  const warnBtn: React.CSSProperties = {
    ...btnBase,
    background: 'rgba(245,158,11,0.15)',
    color: 'var(--color-amber)',
    border: '1px solid var(--color-amber)'
  }

  const dangerBtn: React.CSSProperties = {
    ...btnBase,
    background: 'rgba(239,68,68,0.15)',
    color: 'var(--color-red)',
    border: '1px solid var(--color-red)'
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 'var(--spacing-sm)',
      marginBottom: 'var(--spacing-md)'
    }}>
      {/* Read-only commands */}
      <button
        style={readonlyBtn}
        disabled={!isReady}
        onClick={() => onCommand('INFO')}
      >
        INFO
      </button>
      <button
        style={readonlyBtn}
        disabled={!isReady}
        onClick={() => onCommand('IPCONFIG')}
      >
        IPCONFIG
      </button>
      <button
        style={readonlyBtn}
        disabled={!isReady}
        onClick={() => onCommand('IPTable')}
      >
        IPTable
      </button>
      <button
        style={readonlyBtn}
        disabled={!isReady}
        onClick={() => onCommand('ERRlog')}
      >
        ERRlog
      </button>
      <button
        style={readonlyBtn}
        disabled={!isReady}
        onClick={() => onCommand('SYSTEMREADY')}
      >
        SYSTEMREADY
      </button>

      {/* Destructive / confirm-required commands */}
      <button
        style={warnBtn}
        disabled={!isReady}
        onClick={onPROGRESet}
      >
        PROGRESet
      </button>
      <button
        style={warnBtn}
        disabled={!isReady}
        onClick={onREBOOT}
      >
        REBOOT
      </button>
      <button
        style={dangerBtn}
        disabled={!isReady}
        onClick={onFORCEDREBOOT}
      >
        FORCEDREBOOT
      </button>
    </div>
  )
}
