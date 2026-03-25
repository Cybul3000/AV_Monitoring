import React, { useState } from 'react'
import { usePreference } from '../hooks/usePreference'

interface Props {
  content: string
  children: React.ReactNode
  disabled?: boolean
}

export const Tooltip: React.FC<Props> = ({ content, children, disabled = false }) => {
  const [visible, setVisible] = useState(false)
  const tooltipsEnabled = usePreference('pref:tooltipsEnabled') as boolean

  if (!tooltipsEnabled || disabled) return <>{children}</>

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 8px',
            fontSize: 'var(--font-size-xs)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 1000,
            boxShadow: 'var(--shadow-md)'
          }}
        >
          {content}
        </span>
      )}
    </span>
  )
}
