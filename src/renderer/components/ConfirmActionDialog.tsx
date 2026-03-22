import React from 'react'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmActionDialog: React.FC<Props> = ({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel
}) => {
  return (
    <div
      role="dialog"
      aria-modal
      aria-labelledby="confirm-dialog-title"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        zIndex: 9999
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--spacing-xl)',
          maxWidth: 400,
          width: '90%',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        <h2
          id="confirm-dialog-title"
          style={{
            fontSize: 'var(--font-size-lg)',
            fontWeight: 700,
            marginBottom: 'var(--spacing-md)',
            color: danger ? 'var(--color-danger)' : 'var(--color-text-primary)'
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontSize: 'var(--font-size-md)',
            color: 'var(--color-text-secondary)',
            marginBottom: 'var(--spacing-xl)',
            lineHeight: 1.5
          }}
        >
          {message}
        </p>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--font-size-sm)',
              cursor: 'pointer'
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: danger ? 'var(--color-danger)' : 'var(--color-accent)',
              color: '#fff',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
