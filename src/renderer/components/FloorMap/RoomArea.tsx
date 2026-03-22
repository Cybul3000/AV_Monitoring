import React, { useRef, useState } from 'react'
import type { HierarchyNode } from '@shared/ipc-types'

const LED_COLOURS: Record<string, string> = {
  GREEN: '#22c55e',
  AMBER: '#f59e0b',
  RED: '#ef4444',
  GREY: '#6b7280'
}

interface Props {
  room: HierarchyNode
  ledStatus: string
  editMode: boolean
  onClick: () => void
  onMove: (x: number, y: number, w: number, h: number) => void
}

export const RoomArea: React.FC<Props> = ({ room, ledStatus, editMode, onClick, onMove }) => {
  const x = room.mapX ?? 10
  const y = room.mapY ?? 10
  const w = room.mapW ?? 20
  const h = room.mapH ?? 15

  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [pos, setPos] = useState({ x, y, w, h })

  const ledColour = LED_COLOURS[ledStatus] ?? LED_COLOURS.GREY

  const handleMouseDown = (e: React.MouseEvent<SVGRectElement>) => {
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
    setDragging(true)

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current) return
      const mPt = svg.createSVGPoint()
      mPt.x = me.clientX
      mPt.y = me.clientY
      const mSvg = mPt.matrixTransform(svg.getScreenCTM()!.inverse())
      const dx = mSvg.x - dragRef.current.startX
      const dy = mSvg.y - dragRef.current.startY
      setPos(p => ({
        ...p,
        x: Math.max(0, Math.min(100 - p.w, dragRef.current!.origX + dx)),
        y: Math.max(0, Math.min(100 - p.h, dragRef.current!.origY + dy))
      }))
    }

    const onUp = () => {
      setDragging(false)
      dragRef.current = null
      setPos(p => {
        onMove(p.x, p.y, p.w, p.h)
        return p
      })
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const { x: px, y: py, w: pw, h: ph } = pos

  return (
    <g>
      <rect
        x={px}
        y={py}
        width={pw}
        height={ph}
        fill={`${ledColour}22`}
        stroke={ledColour}
        strokeWidth={dragging ? 0.5 : 0.3}
        rx={0.5}
        style={{ cursor: editMode ? 'move' : 'pointer' }}
        onMouseDown={handleMouseDown}
      />
      {/* LED indicator dot */}
      <circle cx={px + 1.5} cy={py + 1.5} r={0.8} fill={ledColour} />
      {/* Room label */}
      <foreignObject x={px + 0.5} y={py + 2.5} width={pw - 1} height={ph - 3} style={{ overflow: 'hidden' }}>
        <div
          style={{
            fontSize: '2px',
            color: 'var(--color-text-primary)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            padding: '0.2px 0.3px'
          }}
        >
          {room.name}
        </div>
        <div style={{ fontSize: '1.5px', color: 'var(--color-text-muted)', padding: '0.1px 0.3px' }}>
          {room.children?.length ?? 0} device{room.children?.length !== 1 ? 's' : ''}
        </div>
      </foreignObject>
    </g>
  )
}
