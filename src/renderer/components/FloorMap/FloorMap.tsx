import React, { useRef, useState, useCallback } from 'react'
import { RoomArea } from './RoomArea'
import type { HierarchyNode, HierarchyUpdateRequest } from '@shared/ipc-types'

interface Props {
  floor: HierarchyNode
  rooms: HierarchyNode[]
  getRoomLED: (roomId: string) => string
  onRoomClick: (roomId: string, roomName: string) => void
  onUpdate: (req: HierarchyUpdateRequest) => Promise<unknown>
}

export const FloorMap: React.FC<Props> = ({ floor, rooms, getRoomLED, onRoomClick, onUpdate }) => {
  const [editMode, setEditMode] = useState(false)
  const [imageError, setImageError] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleUpload = useCallback(async () => {
    try {
      const filePath = await (window.api as unknown as { selectFile: () => Promise<string | null> }).selectFile?.()
      if (!filePath) return
      await onUpdate({ action: 'update', type: 'floor', id: floor.id, data: { floorMapPath: filePath } })
    } catch {
      // selectFile not available in all contexts
    }
  }, [floor.id, onUpdate])

  const handleRoomMove = useCallback(
    async (roomId: string, x: number, y: number, w: number, h: number) => {
      await onUpdate({ action: 'update', type: 'room', id: roomId, data: { mapX: x, mapY: y, mapW: w, mapH: h } })
    },
    [onUpdate]
  )

  const mapSrc = floor.floorMapPath

  return (
    <div style={styles.wrapper}>
      <div style={styles.toolbar}>
        <button
          style={{ ...styles.btn, background: editMode ? 'var(--color-accent)' : 'transparent' }}
          onClick={() => setEditMode(e => !e)}
        >
          {editMode ? 'Done Editing' : 'Edit Layout'}
        </button>
        <button style={styles.btn} onClick={handleUpload}>
          {mapSrc ? 'Replace Floor Plan' : 'Upload Floor Plan'}
        </button>
        {editMode && (
          <span style={styles.hint}>Drag rooms to reposition · Drag edges to resize</span>
        )}
      </div>

      <div ref={containerRef} style={styles.canvas}>
        {mapSrc && !imageError ? (
          <img
            src={`file://${mapSrc}`}
            alt="Floor plan"
            style={styles.floorImage}
            onError={() => setImageError(true)}
          />
        ) : (
          <div style={styles.imagePlaceholder}>
            {imageError ? 'Floor plan image not found' : 'No floor plan uploaded'}
          </div>
        )}

        <svg style={styles.svg} viewBox="0 0 100 100" preserveAspectRatio="none">
          {rooms.map(room => (
            <RoomArea
              key={room.id}
              room={room}
              ledStatus={getRoomLED(room.id)}
              editMode={editMode}
              onClick={() => onRoomClick(room.id, room.name)}
              onMove={(x, y, w, h) => void handleRoomMove(room.id, x, y, w, h)}
            />
          ))}
        </svg>
      </div>

      {rooms.length === 0 && (
        <div style={styles.emptyOverlay}>
          <p style={{ color: 'var(--color-text-muted)' }}>
            No rooms placed on this floor. Add rooms in list view, then return here to position them.
          </p>
        </div>
      )}
    </div>
  )
}

const styles = {
  wrapper: { display: 'flex', flexDirection: 'column' as const, flex: 1, gap: 'var(--spacing-sm)' },
  toolbar: {
    display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center', flexShrink: 0
  },
  btn: {
    padding: '6px 14px', color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)', cursor: 'pointer'
  },
  hint: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginLeft: 'auto' },
  canvas: {
    position: 'relative' as const, flex: 1, minHeight: 400,
    background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)', overflow: 'hidden'
  },
  floorImage: { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', objectFit: 'contain' as const, opacity: 0.6 },
  imagePlaceholder: {
    position: 'absolute' as const, inset: 0, display: 'flex', alignItems: 'center',
    justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)'
  },
  svg: { position: 'absolute' as const, inset: 0, width: '100%', height: '100%' },
  emptyOverlay: {
    position: 'absolute' as const, inset: 0, display: 'flex', alignItems: 'center',
    justifyContent: 'center', pointerEvents: 'none' as const
  }
}
