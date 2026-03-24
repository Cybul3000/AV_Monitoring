import React from 'react'

export interface BreadcrumbSegment {
  label: string
  type: string
  id: string | null
}

interface Props {
  segments: BreadcrumbSegment[]
  onNavigate: (index: number) => void
}

export const Breadcrumb: React.FC<Props> = ({ segments, onNavigate }) => {
  return (
    <nav
      aria-label="Hierarchy breadcrumb"
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', flexWrap: 'wrap' }}
    >
      {segments.map((seg, idx) => {
        const isLast = idx === segments.length - 1
        return (
          <React.Fragment key={seg.id ?? idx}>
            {isLast ? (
              <span
                style={{
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-primary)',
                  fontWeight: 600
                }}
              >
                {seg.label}
              </span>
            ) : (
              <button
                onClick={() => onNavigate(idx)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '2px 4px',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-accent)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer'
                }}
              >
                {seg.label}
              </button>
            )}
            {!isLast && (
              <span
                style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}
                aria-hidden
              >
                /
              </span>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
