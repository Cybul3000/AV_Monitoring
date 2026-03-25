import React, { useState, useRef, useEffect } from 'react'
import type { SSHSessionState } from '@shared/ipc-types'
import { useSSHSession } from './useSSHSession'
import { SSHCommandButtons } from './SSHCommandButtons'

interface Props {
  deviceId: string
  deviceName: string
  deviceType: 'CP4' | 'VC4' | string
}

// ── Confirm dialog for destructive actions ────────────────────────────────────

interface ConfirmState {
  title: string
  message: string
  confirmLabel: string
  danger: boolean
  onConfirm: (extraInput?: string) => void
  showInput?: boolean
  inputLabel?: string
  inputPlaceholder?: string
}

// ── Status badge color ────────────────────────────────────────────────────────

function stateColor(state: SSHSessionState): string {
  switch (state) {
    case 'READY':      return 'var(--color-green)'
    case 'BUSY':       return 'var(--color-amber)'
    case 'CONNECTING': return 'var(--color-amber)'
    case 'ERROR':      return 'var(--color-red)'
    case 'CLOSED':
    default:           return 'var(--color-text-secondary, #888)'
  }
}

function stateLabel(state: SSHSessionState): string {
  switch (state) {
    case 'READY':      return 'Ready'
    case 'BUSY':       return 'Busy...'
    case 'CONNECTING': return 'Connecting...'
    case 'ERROR':      return 'Error'
    case 'CLOSED':
    default:           return 'Closed'
  }
}

// ── SSHWorkspace ──────────────────────────────────────────────────────────────

export const SSHWorkspace: React.FC<Props> = ({ deviceId, deviceName, deviceType }) => {
  const { sessionState, output, error, openSession, closeSession, sendCommand } = useSSHSession(deviceId)
  const [freeInput, setFreeInput] = useState('')
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [confirmInput, setConfirmInput] = useState('')
  const outputRef = useRef<HTMLDivElement>(null)

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  const handleSend = async () => {
    const cmd = freeInput.trim()
    if (!cmd) return
    setFreeInput('')
    await sendCommand(cmd)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void handleSend()
  }

  const askConfirm = (state: ConfirmState) => {
    setConfirmInput('')
    setConfirm(state)
  }

  const handlePROGRESet = () => {
    askConfirm({
      title: 'PROGRESet — Confirm',
      message: 'Enter the program slot number to reset, then confirm.',
      confirmLabel: 'PROGRESet',
      danger: false,
      showInput: true,
      inputLabel: 'Slot number',
      inputPlaceholder: '1',
      onConfirm: (slot?: string) => {
        const slotStr = (slot ?? '').trim()
        if (!slotStr) return
        void sendCommand(`PROGRESet ${slotStr}`)
      }
    })
  }

  const handleREBOOT = () => {
    askConfirm({
      title: 'REBOOT — Confirm',
      message: 'Are you sure you want to reboot this Crestron device? This may disrupt ongoing meetings.',
      confirmLabel: 'REBOOT',
      danger: true,
      onConfirm: () => void sendCommand('REBOOT')
    })
  }

  const handleFORCEDREBOOT = () => {
    askConfirm({
      title: 'FORCEDREBOOT — Confirm',
      message: 'FORCEDREBOOT will immediately restart the device without any graceful shutdown. This will disrupt all active sessions.',
      confirmLabel: 'FORCEDREBOOT',
      danger: true,
      onConfirm: () => void sendCommand('FORCEDREBOOT')
    })
  }

  const isBusy = sessionState === 'BUSY' || sessionState === 'CONNECTING'
  const isActive = sessionState === 'READY' || sessionState === 'BUSY'

  return (
    <div style={{
      background: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--spacing-sm) var(--spacing-md)',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-bg-elevated, #1e1e1e)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
            SSH — {deviceName}
          </span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            ({deviceType})
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
          {isBusy && (
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-amber)' }}>●</span>
          )}
          <span style={{
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
            color: stateColor(sessionState),
            padding: '2px 8px',
            borderRadius: 'var(--radius-md)',
            border: `1px solid ${stateColor(sessionState)}`,
            background: `${stateColor(sessionState)}22`
          }}>
            {stateLabel(sessionState)}
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: 'var(--spacing-md)' }}>

        {/* CLOSED state — connect prompt */}
        {sessionState === 'CLOSED' && (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-lg) 0' }}>
            <p style={{
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--font-size-sm)',
              marginBottom: 'var(--spacing-md)'
            }}>
              No active SSH session
            </p>
            <button
              style={{
                padding: '10px 24px',
                background: 'var(--color-accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-md)',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              onClick={() => void openSession()}
            >
              Open SSH Session
            </button>
          </div>
        )}

        {/* CONNECTING state — spinner */}
        {sessionState === 'CONNECTING' && (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-lg) 0' }}>
            <p style={{ color: 'var(--color-amber)', fontSize: 'var(--font-size-sm)' }}>
              Connecting to {deviceName}...
            </p>
          </div>
        )}

        {/* ERROR state */}
        {sessionState === 'ERROR' && (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-lg) 0' }}>
            <p style={{
              color: 'var(--color-red)',
              fontSize: 'var(--font-size-sm)',
              marginBottom: 'var(--spacing-md)'
            }}>
              {error ?? 'Connection error'}
            </p>
            <button
              style={{
                padding: '8px 20px',
                background: 'var(--color-accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-sm)',
                cursor: 'pointer'
              }}
              onClick={() => void openSession()}
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* READY / BUSY — full workspace */}
        {isActive && (
          <>
            {/* Command buttons */}
            <SSHCommandButtons
              sessionState={sessionState}
              onCommand={(cmd) => void sendCommand(cmd)}
              onPROGRESet={handlePROGRESet}
              onREBOOT={handleREBOOT}
              onFORCEDREBOOT={handleFORCEDREBOOT}
            />

            {/* Free text input */}
            <div style={{
              display: 'flex',
              gap: 'var(--spacing-sm)',
              marginBottom: 'var(--spacing-md)'
            }}>
              <input
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  background: 'var(--color-bg, #111)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-size-sm)',
                  outline: 'none'
                }}
                value={freeInput}
                placeholder="Enter command..."
                disabled={sessionState !== 'READY'}
                onChange={e => setFreeInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                style={{
                  padding: '6px 14px',
                  background: 'var(--color-accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-sm)',
                  cursor: sessionState === 'READY' ? 'pointer' : 'not-allowed',
                  opacity: sessionState === 'READY' ? 1 : 0.45
                }}
                disabled={sessionState !== 'READY'}
                onClick={() => void handleSend()}
              >
                Send
              </button>
            </div>

            {/* Disconnect button */}
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
              <button
                style={{
                  padding: '6px 14px',
                  background: 'transparent',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-sm)',
                  cursor: 'pointer'
                }}
                onClick={() => void closeSession()}
              >
                Disconnect
              </button>
            </div>
          </>
        )}

        {/* Output terminal — always visible when there's output */}
        {(isActive || output) && (
          <div
            ref={outputRef}
            style={{
              height: 280,
              overflowY: 'auto',
              background: 'var(--color-bg, #0d0d0d)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-sm)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-sm)',
              color: '#d4d4d4',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              lineHeight: 1.5
            }}
          >
            {output || <span style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>Waiting for output...</span>}
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      {confirm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'var(--color-bg-surface)',
            border: `1px solid ${confirm.danger ? 'var(--color-red)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--spacing-xl)',
            width: 400,
            maxWidth: '90vw'
          }}>
            <h4 style={{
              marginBottom: 'var(--spacing-md)',
              color: confirm.danger ? 'var(--color-red)' : 'var(--color-text-primary)'
            }}>
              {confirm.title}
            </h4>
            <p style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              marginBottom: 'var(--spacing-md)'
            }}>
              {confirm.message}
            </p>
            {confirm.showInput && (
              <input
                autoFocus
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-primary)',
                  fontSize: 'var(--font-size-sm)',
                  marginBottom: 'var(--spacing-md)',
                  outline: 'none',
                  display: 'block'
                }}
                placeholder={confirm.inputPlaceholder ?? ''}
                value={confirmInput}
                onChange={e => setConfirmInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    confirm.onConfirm(confirmInput)
                    setConfirm(null)
                  }
                }}
              />
            )}
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end' }}>
              <button
                style={{
                  padding: '6px 14px',
                  background: 'transparent',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-sm)',
                  cursor: 'pointer'
                }}
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                style={{
                  padding: '6px 14px',
                  background: confirm.danger ? 'var(--color-red)' : 'var(--color-accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                onClick={() => {
                  confirm.onConfirm(confirmInput || undefined)
                  setConfirm(null)
                }}
              >
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
