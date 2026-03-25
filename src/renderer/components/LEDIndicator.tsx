import React from 'react'
import type { LEDStatus } from '@shared/ipc-types'

interface Props {
  status: LEDStatus
  size?: 'sm' | 'md' | 'lg'
  label?: string
}

const SIZE_MAP = {
  sm: 'var(--led-sm)',
  md: 'var(--led-md)',
  lg: 'var(--led-lg)'
}

const COLOR_MAP: Record<LEDStatus, string> = {
  GREEN: 'var(--color-green)',
  AMBER: 'var(--color-amber)',
  RED: 'var(--color-red)',
  GREY: 'var(--color-grey)'
}

const GLOW_MAP: Record<LEDStatus, string> = {
  GREEN: '0 0 6px var(--color-green)',
  AMBER: '0 0 6px var(--color-amber)',
  RED: '0 0 6px var(--color-red)',
  GREY: 'none'
}

export const LEDIndicator: React.FC<Props> = ({ status, size = 'md', label }) => {
  const dim = SIZE_MAP[size]
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}
      title={label ?? status}
      aria-label={`Status: ${status}`}
    >
      <span
        style={{
          display: 'inline-block',
          width: dim,
          height: dim,
          borderRadius: 'var(--radius-full)',
          backgroundColor: COLOR_MAP[status],
          boxShadow: GLOW_MAP[status],
          flexShrink: 0,
          transition: 'background-color var(--transition-base), box-shadow var(--transition-base)'
        }}
      />
      {label && (
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
          {label}
        </span>
      )}
    </span>
  )
}
