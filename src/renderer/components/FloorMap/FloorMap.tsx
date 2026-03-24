import React, { useRef, useState, useCallback, useEffect } from 'react'
import { RoomArea } from './RoomArea'
import type { HierarchyNode, HierarchyUpdateRequest } from '@shared/ipc-types'

interface Props {
  floor: HierarchyNode
  rooms: HierarchyNode[]
  getRoomLED: (roomId: string) => string
  onRoomClick: (roomId: string, roomName: string) => void
  onUpdate: (req: HierarchyUpdateRequest) => Promise<unknown>
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25
// Base canvas width in px at zoom=1; height is derived from image aspect ratio
const BASE_WIDTH = 1000

export const FloorMap: React.FC<Props> = ({ floor, rooms, getRoomLED, onRoomClick, onUpdate }) => {
  const [editMode, setEditMode] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [zoom, setZoom] = useState(1)
  // Natural image aspect ratio (height / width). Defaults to 9/16 until image loads.
  const [aspectRatio, setAspectRatio] = useState(9 / 16)
  const viewportRef = useRef<HTMLDivElement>(null)

  const handleUpload = useCallback(async () => {
    try {
      const filePath = await (window.api as unknown as { selectFile: () => Promise<string | null> }).selectFile?.()
      if (!filePath) return
      await onUpdate({ action: 'update', type: 'floor', id: floor.id, data: { name: floor.name, level: floor.level, floorMapPath: filePath } })
      setImageError(false)
    } catch {
      // selectFile not available in all contexts
    }
  }, [floor.id, floor.name, floor.level, onUpdate])

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (img.naturalWidth > 0) {
      setAspectRatio(img.naturalHeight / img.naturalWidth)
    }
  }, [])

  const handleRoomMove = useCallback(
    async (roomId: string, roomName: string, x: number, y: number, w: number, h: number) => {
      await onUpdate({ action: 'update', type: 'room', id: roomId, data: { name: roomName, mapX: x, mapY: y, mapW: w, mapH: h } })
    },
    [onUpdate]
  )

  const clampZoom = (z: number) =>
    Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, parseFloat(z.toFixed(2))))

  const zoomIn = () => setZoom(z => clampZoom(z + ZOOM_STEP))
  const zoomOut = () => setZoom(z => clampZoom(z - ZOOM_STEP))
  const zoomReset = () => setZoom(1)

  // Pinch-to-zoom (trackpad: wheel + ctrlKey on macOS/Windows)
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom(z => clampZoom(z - e.deltaY * 0.005))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const mapSrc = floor.floorMapPath
  const canvasW = BASE_WIDTH * zoom
  const canvasH = BASE_WIDTH * aspectRatio * zoom

  return (
    <div style={styles.wrapper}>
      <div style={styles.toolbar}>
        <button
          style={{ ...styles.btn, background: editMode ? 'var(--color-accent)' : 'transparent', color: editMode ? '#fff' : 'var(--color-text-primary)' }}
          onClick={() => setEditMode(e => !e)}
        >
          {editMode ? 'Done Editing' : 'Edit Layout'}
        </button>
        <button style={styles.btn} onClick={handleUpload}>
          {mapSrc ? 'Replace Floor Plan' : 'Upload Floor Plan'}
        </button>

        <div style={styles.zoomControls}>
          <button style={styles.zoomBtn} onClick={zoomOut} disabled={zoom <= MIN_ZOOM} title="Zoom out">−</button>
          <button style={{ ...styles.zoomBtn, ...styles.zoomLabel }} onClick={zoomReset} title="Reset zoom">
            {Math.round(zoom * 100)}%
          </button>
          <button style={styles.zoomBtn} onClick={zoomIn} disabled={zoom >= MAX_ZOOM} title="Zoom in">+</button>
        </div>

        {editMode && (
          <span style={styles.hint}>Drag to move · Drag corner to resize</span>
        )}
      </div>

      {/* Scrollable viewport */}
      <div ref={viewportRef} style={styles.viewport}>
        {/* Canvas sized to the image's natural aspect ratio × zoom */}
        <div style={{ position: 'relative', width: canvasW, height: canvasH, flexShrink: 0 }}>
          {mapSrc && !imageError ? (
            <img
              src={`local-file://${mapSrc}`}
              alt="Floor plan"
              style={styles.floorImage}
              onLoad={handleImageLoad}
              onError={() => setImageError(true)}
            />
          ) : (
            <div style={styles.imagePlaceholder}>
              {imageError ? 'Floor plan image not found' : 'No floor plan uploaded'}
            </div>
          )}

          {/* SVG fills the same canvas exactly — no aspect ratio mismatch */}
          <svg style={styles.svg} viewBox="0 0 100 100" preserveAspectRatio="none">
            {rooms.map(room => (
              <RoomArea
                key={room.id}
                room={room}
                ledStatus={getRoomLED(room.id)}
                editMode={editMode}
                onClick={() => onRoomClick(room.id, room.name)}
                onMove={(x, y, w, h) => void handleRoomMove(room.id, room.name, x, y, w, h)}
              />
            ))}
          </svg>
        </div>
      </div>

      {rooms.length === 0 && !mapSrc && (
        <div style={styles.emptyHint}>
          <p style={{ color: 'var(--color-text-muted)' }}>
            Add rooms in list view, then return here to position them on the floor plan.
          </p>
        </div>
      )}
    </div>
  )
}

const styles = {
  wrapper: { display: 'flex', flexDirection: 'column' as const, flex: 1, gap: 'var(--spacing-sm)', minHeight: 0 },
  toolbar: { display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center', flexShrink: 0 },
  btn: {
    padding: '6px 14px', background: 'transparent', color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)', cursor: 'pointer'
  },
  zoomControls: {
    display: 'flex', alignItems: 'center',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden',
    marginLeft: 'auto'
  },
  zoomBtn: {
    padding: '5px 10px', background: 'transparent', color: 'var(--color-text-primary)',
    border: 'none', fontSize: 'var(--font-size-md)', cursor: 'pointer', lineHeight: 1
  },
  zoomLabel: {
    minWidth: 52, textAlign: 'center' as const, fontSize: 'var(--font-size-xs)',
    borderLeft: '1px solid var(--color-border)', borderRight: '1px solid var(--color-border)',
    color: 'var(--color-text-secondary)', cursor: 'pointer'
  },
  hint: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' },
  viewport: {
    flex: 1, overflow: 'auto', minHeight: 0,
    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-md)'
  },
  floorImage: { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', objectFit: 'fill' as const, opacity: 0.7 },
  imagePlaceholder: {
    position: 'absolute' as const, inset: 0, display: 'flex', alignItems: 'center',
    justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)'
  },
  svg: { position: 'absolute' as const, inset: 0, width: '100%', height: '100%' },
  emptyHint: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'var(--spacing-md)', pointerEvents: 'none' as const
  }
}
