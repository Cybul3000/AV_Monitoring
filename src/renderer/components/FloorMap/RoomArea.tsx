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

type DragType = 'move' | 'resize'

export const RoomArea: React.FC<Props> = ({ room, ledStatus, editMode, onClick, onMove }) => {
  const initX = room.mapX ?? 5
  const initY = room.mapY ?? 5
  const initW = room.mapW ?? 8
  const initH = room.mapH ?? 6

  const [pos, setPos] = useState({ x: initX, y: initY, w: initW, h: initH })
  const posRef = useRef({ x: initX, y: initY, w: initW, h: initH })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{
    type: DragType
    startX: number; startY: number
    origX: number; origY: number; origW: number; origH: number
  } | null>(null)

  const ledColour = LED_COLOURS[ledStatus] ?? LED_COLOURS.GREY
  const HANDLE_SIZE = 2.5
  const MIN_SIZE = 6

  const toSvgPoint = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    return pt.matrixTransform(svg.getScreenCTM()!.inverse())
  }

  const startDrag = (e: React.MouseEvent<SVGElement>, type: DragType) => {
    if (!editMode) return
    e.stopPropagation()
    const svg = e.currentTarget.ownerSVGElement as SVGSVGElement
    const svgPt = toSvgPoint(svg, e.clientX, e.clientY)
    dragRef.current = {
      type, startX: svgPt.x, startY: svgPt.y,
      origX: pos.x, origY: pos.y, origW: pos.w, origH: pos.h
    }
    setDragging(true)

    const handleMouseMove = (me: MouseEvent) => {
      if (!dragRef.current) return
      const mPt = toSvgPoint(svg, me.clientX, me.clientY)
      const dx = mPt.x - dragRef.current.startX
      const dy = mPt.y - dragRef.current.startY
      const { origX, origY, origW, origH } = dragRef.current

      if (dragRef.current.type === 'move') {
        const next = {
          x: Math.max(0, Math.min(100 - posRef.current.w, origX + dx)),
          y: Math.max(0, Math.min(100 - posRef.current.h, origY + dy)),
          w: posRef.current.w,
          h: posRef.current.h
        }
        posRef.current = next
        setPos(next)
      } else {
        const next = {
          x: posRef.current.x,
          y: posRef.current.y,
          w: Math.max(MIN_SIZE, Math.min(100 - origX, origW + dx)),
          h: Math.max(MIN_SIZE, Math.min(100 - origY, origH + dy))
        }
        posRef.current = next
        setPos(next)
      }
    }

    const handleMouseUp = () => {
      setDragging(false)
      dragRef.current = null
      onMove(posRef.current.x, posRef.current.y, posRef.current.w, posRef.current.h)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  const handleBodyMouseDown = (e: React.MouseEvent<SVGRectElement>) => {
    if (!editMode) { onClick(); return }
    startDrag(e, 'move')
  }

  const { x: px, y: py, w: pw, h: ph } = pos
  const deviceCount = room.children?.length ?? 0

  return (
    <g>
      {/* Room body */}
      <rect
        x={px} y={py} width={pw} height={ph}
        fill={`${ledColour}22`}
        stroke={ledColour}
        strokeWidth={dragging ? 0.5 : 0.3}
        rx={0.5}
        style={{ cursor: editMode ? 'move' : 'pointer' }}
        onMouseDown={handleBodyMouseDown}
      />

      {/* LED dot */}
      <circle cx={px + 1.5} cy={py + 1.5} r={0.7} fill={ledColour} />

      {/* Room name — SVG text scales with zoom */}
      <text
        x={px + 2.8}
        y={py + 2.2}
        fontSize={2}
        fontWeight="600"
        fill="var(--color-text-primary)"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
        clipPath={`url(#clip-${room.id})`}
      >
        {room.name}
      </text>
      <text
        x={px + 2.8}
        y={py + 4.5}
        fontSize={1.6}
        fill="var(--color-text-muted)"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {deviceCount} device{deviceCount !== 1 ? 's' : ''}
      </text>

      {/* Clip path so label doesn't overflow the room rect */}
      <defs>
        <clipPath id={`clip-${room.id}`}>
          <rect x={px + 2.8} y={py} width={pw - 4} height={ph} />
        </clipPath>
      </defs>

      {/* Resize handle — bottom-right corner, only in edit mode */}
      {editMode && (
        <rect
          x={px + pw - HANDLE_SIZE}
          y={py + ph - HANDLE_SIZE}
          width={HANDLE_SIZE}
          height={HANDLE_SIZE}
          fill={ledColour}
          opacity={0.8}
          rx={0.3}
          style={{ cursor: 'se-resize' }}
          onMouseDown={e => startDrag(e, 'resize')}
        />
      )}
    </g>
  )
}
