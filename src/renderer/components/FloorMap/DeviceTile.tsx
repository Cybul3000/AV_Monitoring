import React, { useRef, useState } from 'react'
import type { HierarchyNode } from '@shared/ipc-types'

const LED_COLOURS: Record<string, string> = {
  GREEN: '#22c55e',
  AMBER: '#f59e0b',
  RED: '#ef4444',
  GREY: '#6b7280'
}

interface Props {
  device: HierarchyNode
  status: string
  editMode: boolean
  onClick: () => void
  onMove: (x: number, y: number) => void
}

export const DeviceTile: React.FC<Props> = ({ device, status, editMode, onClick, onMove }) => {
  const x = device.mapX ?? 0
  const y = device.mapY ?? 0
  const size = 4

  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const [pos, setPos] = useState({ x, y })

  const ledColour = LED_COLOURS[status] ?? LED_COLOURS.GREY

  const handleMouseDown = (e: React.MouseEvent<SVGGElement>) => {
    if (!editMode) {
      onClick()
      return
    }
    e.stopPropagation()
    const svg = (e.currentTarget.ownerSVGElement as SVGSVGElement)
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    dragRef.current = { startX: svgPt.x, startY: svgPt.y, origX: pos.x, origY: pos.y }

    const handleMove = (me: MouseEvent) => {
      if (!dragRef.current) return
      const mPt = svg.createSVGPoint()
      mPt.x = me.clientX
      mPt.y = me.clientY
      const mSvg = mPt.matrixTransform(svg.getScreenCTM()!.inverse())
      const dx = mSvg.x - dragRef.current.startX
      const dy = mSvg.y - dragRef.current.startY
      setPos({
        x: Math.max(0, dragRef.current.origX + dx),
        y: Math.max(0, dragRef.current.origY + dy)
      })
    }

    const handleUp = () => {
      dragRef.current = null
      setPos(p => {
        onMove(p.x, p.y)
        return p
      })
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  return (
    <g
      transform={`translate(${pos.x}, ${pos.y})`}
      style={{ cursor: editMode ? 'move' : 'pointer' }}
      onMouseDown={handleMouseDown}
    >
      <rect
        x={0}
        y={0}
        width={size}
        height={size}
        fill="var(--color-bg-surface)"
        stroke={ledColour}
        strokeWidth={0.2}
        rx={0.3}
      />
      <circle cx={size / 2} cy={0.8} r={0.5} fill={ledColour} />
      <foreignObject x={0.2} y={1.5} width={size - 0.4} height={size - 1.8} style={{ overflow: 'hidden' }}>
        <div style={{
          fontSize: '1.4px', color: 'var(--color-text-primary)', fontWeight: 600,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center'
        }}>
          {device.name}
        </div>
        <div style={{
          fontSize: '1.2px', color: 'var(--color-text-muted)', textAlign: 'center',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          {device.deviceType}
        </div>
      </foreignObject>
    </g>
  )
}
