import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Breadcrumb } from './components/Breadcrumb'
import { NetworkBadge } from './components/NetworkBadge'
import { GlobalDashboard } from './views/GlobalDashboard'
import { RegionView } from './views/RegionView'
import { OfficeView } from './views/OfficeView'
import { FloorView } from './views/FloorView'
import { RoomView } from './views/RoomView'
import { ConfigView } from './views/ConfigView'
import { LogsView } from './views/LogsView'
import { ObservabilityView } from './views/ObservabilityView'
import { SettingsView } from './views/SettingsView'
import { AlertSettingsView } from './views/AlertSettingsView'

type ViewType = 'dashboard' | 'region' | 'office' | 'floor' | 'room' | 'config' | 'logs' | 'observability' | 'settings' | 'alert-settings'

interface NavEntry {
  type: ViewType
  id?: string
  name?: string
  regionId?: string
  officeId?: string
  floorId?: string
  roomId?: string
}

type ApiShape = {
  preferencesGet: (req: { key: string }) => Promise<{ value: unknown }>
  preferencesSet: (req: { key: string; value: unknown }) => Promise<void>
}

const NAV_TABS: Array<{ id: ViewType; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'config', label: 'Configuration' },
  { id: 'logs', label: 'Logs' },
  { id: 'observability', label: 'Observability' },
  { id: 'alert-settings', label: 'Alert Settings' },
  { id: 'settings', label: 'Settings' }
]

export const App: React.FC = () => {
  const [stack, setStack] = useState<NavEntry[]>([{ type: 'dashboard' }])
  const [activeTab, setActiveTab] = useState<ViewType>('dashboard')

  // Preserves the last hierarchy position so Dashboard tab returns to where the
  // user was (region / office / floor / room) rather than resetting to global view.
  const hierarchyStackRef = useRef<NavEntry[]>([{ type: 'dashboard' }])

  const current = stack[stack.length - 1]

  // Restore last hierarchy path from preferences
  useEffect(() => {
    const restore = async () => {
      try {
        const api = window.api as unknown as ApiShape
        const res = await api.preferencesGet({ key: 'pref:lastHierarchyPath' })
        if (res.value && typeof res.value === 'string') {
          try {
            const saved = JSON.parse(res.value) as NavEntry[]
            if (Array.isArray(saved) && saved.length > 0) {
              setStack(saved)
              hierarchyStackRef.current = saved
              setActiveTab(saved[saved.length - 1].type)
            }
          } catch {
            // ignore malformed saved path
          }
        }
      } catch {
        // preferences not available
      }
    }
    void restore()
  }, [])

  const persistPath = useCallback((newStack: NavEntry[]) => {
    try {
      const api = window.api as unknown as ApiShape
      void api.preferencesSet({ key: 'pref:lastHierarchyPath', value: JSON.stringify(newStack) })
    } catch {
      // ignore
    }
  }, [])

  const navigate = useCallback((type: string, id: string, name: string) => {
    setStack(prev => {
      const top = prev[prev.length - 1]
      let next: NavEntry

      switch (type) {
        case 'region':
          next = { type: 'region', id, name, regionId: id }
          break
        case 'office':
          next = { type: 'office', id, name, regionId: top.regionId, officeId: id }
          break
        case 'floor':
          next = { type: 'floor', id, name, regionId: top.regionId, officeId: top.officeId, floorId: id }
          break
        case 'room':
          next = {
            type: 'room', id, name,
            regionId: top.regionId, officeId: top.officeId, floorId: top.floorId, roomId: id
          }
          break
        default:
          next = { type: type as ViewType, id, name }
      }

      const newStack = [...prev, next]
      hierarchyStackRef.current = newStack
      persistPath(newStack)
      setActiveTab(next.type)
      return newStack
    })
  }, [persistPath])

  const back = useCallback(() => {
    setStack(prev => {
      if (prev.length <= 1) return prev
      const newStack = prev.slice(0, -1)
      hierarchyStackRef.current = newStack
      persistPath(newStack)
      setActiveTab(newStack[newStack.length - 1].type)
      return newStack
    })
  }, [persistPath])

  const navigateToIndex = useCallback((index: number) => {
    setStack(prev => {
      const newStack = prev.slice(0, index + 1)
      hierarchyStackRef.current = newStack
      persistPath(newStack)
      setActiveTab(newStack[newStack.length - 1].type)
      return newStack
    })
  }, [persistPath])

  const handleTabClick = (tab: ViewType) => {
    if (tab === 'dashboard') {
      // Restore last hierarchy position rather than resetting to global view
      const restored = hierarchyStackRef.current
      setStack(restored)
      setActiveTab(restored[restored.length - 1].type)
    } else if (['config', 'logs', 'observability', 'alert-settings', 'settings'].includes(tab)) {
      // Save hierarchy position before leaving, then switch to the non-hierarchy tab
      const newStack: NavEntry[] = [{ type: tab }]
      setStack(newStack)
      setActiveTab(tab)
    }
  }

  const breadcrumbSegments = stack.map(entry => entry.name ?? entry.type)

  const renderView = () => {
    switch (current.type) {
      case 'region':
        return (
          <RegionView
            regionId={current.regionId!}
            onNavigate={navigate}
          />
        )
      case 'office':
        return (
          <OfficeView
            regionId={current.regionId!}
            officeId={current.officeId!}
            onNavigate={navigate}
          />
        )
      case 'floor':
        return (
          <FloorView
            regionId={current.regionId!}
            officeId={current.officeId!}
            floorId={current.floorId!}
            onNavigate={navigate}
          />
        )
      case 'room':
        return (
          <RoomView
            regionId={current.regionId!}
            officeId={current.officeId!}
            floorId={current.floorId!}
            roomId={current.roomId!}
            onNavigate={navigate}
            onBack={back}
          />
        )
      case 'config':
        return <ConfigView onNavigate={navigate} />
      case 'logs':
        return <LogsView />
      case 'observability':
        return <ObservabilityView />
      case 'alert-settings':
        return <AlertSettingsView />
      case 'settings':
        return <SettingsView />
      default:
        return <GlobalDashboard onNavigate={navigate} />
    }
  }

  const isHierarchyView = ['region', 'office', 'floor', 'room'].includes(current.type)

  return (
    <div style={styles.root}>
      <div style={styles.titleBar}>
        <span style={styles.appName}>AV Monitoring</span>
        <NetworkBadge />
      </div>

      <div style={styles.navBar}>
        {NAV_TABS.map(tab => (
          <button
            key={tab.id}
            style={{
              ...styles.navTab,
              borderBottom: (activeTab === tab.id || (tab.id === 'dashboard' && isHierarchyView && activeTab !== 'config' && activeTab !== 'logs' && activeTab !== 'observability' && activeTab !== 'alert-settings' && activeTab !== 'settings'))
                ? '2px solid var(--color-accent)'
                : '2px solid transparent',
              color: (activeTab === tab.id)
                ? 'var(--color-text-primary)'
                : 'var(--color-text-muted)'
            }}
            onClick={() => handleTabClick(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isHierarchyView && (
        <div style={styles.breadcrumbBar}>
          <button style={styles.backBtn} onClick={back} disabled={stack.length <= 1}>
            ‹ Back
          </button>
          <Breadcrumb segments={breadcrumbSegments} onNavigate={navigateToIndex} />
        </div>
      )}

      <main style={styles.main}>
        {renderView()}
      </main>
    </div>
  )
}

const styles = {
  root: {
    display: 'flex', flexDirection: 'column' as const, height: '100vh',
    background: 'var(--color-bg)', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-sans)'
  },
  titleBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    paddingLeft: (window as unknown as { platform?: string }).platform === 'darwin' ? 80 : 'var(--spacing-lg)',
    paddingRight: 'var(--spacing-lg)',
    height: 40, background: 'var(--color-bg-surface)',
    borderBottom: '1px solid var(--color-border)', flexShrink: 0,
    WebkitAppRegion: 'drag' as unknown as undefined
  },
  appName: { fontSize: 'var(--font-size-sm)', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-text-secondary)' },
  navBar: {
    display: 'flex', gap: 0, padding: '0 var(--spacing-lg)',
    background: 'var(--color-bg-surface)', borderBottom: '1px solid var(--color-border)',
    flexShrink: 0
  },
  navTab: {
    padding: '10px 16px', background: 'none', border: 'none',
    fontSize: 'var(--font-size-sm)', fontWeight: 500, cursor: 'pointer',
    transition: 'color var(--transition-fast)'
  },
  breadcrumbBar: {
    display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)',
    padding: '6px var(--spacing-lg)',
    background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)',
    flexShrink: 0
  },
  backBtn: {
    padding: '3px 10px', background: 'transparent', color: 'var(--color-text-muted)',
    border: 'none', fontSize: 'var(--font-size-sm)', cursor: 'pointer'
  },
  main: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' as const }
}
