import { useState, useEffect, useCallback } from 'react'
import type { HierarchyNode, HierarchyUpdateRequest, HierarchyUpdateResponse } from '@shared/ipc-types'

type ApiShape = {
  hierarchyGet: () => Promise<{ roots: HierarchyNode[] }>
  hierarchyUpdate: (req: HierarchyUpdateRequest) => Promise<HierarchyUpdateResponse>
  onDeviceStatusAll: (cb: (payload: unknown) => void) => () => void
}

export function useHierarchy() {
  const [roots, setRoots] = useState<HierarchyNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    ;(window.api as unknown as ApiShape)
      .hierarchyGet()
      .then(res => {
        setRoots(res.roots)
        setError(null)
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()

    // Refresh hierarchy LED states on every status broadcast
    const unsub = (window.api as unknown as ApiShape).onDeviceStatusAll(() => {
      // Re-fetch the full tree to get updated ledStatus on all nodes
      ;(window.api as unknown as ApiShape)
        .hierarchyGet()
        .then(res => setRoots(res.roots))
        .catch(console.error)
    })

    return unsub
  }, [refresh])

  const update = useCallback(
    async (req: HierarchyUpdateRequest): Promise<HierarchyUpdateResponse> => {
      const res = await (window.api as unknown as ApiShape).hierarchyUpdate(req)
      if (res.success) refresh()
      return res
    },
    [refresh]
  )

  return { roots, loading, error, refresh, update }
}
