import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { getMySprints, getActiveSprintsForSidebar } from './lib/sprints'

export const SprintsContext = createContext(null)

export function SprintsProvider({ children }) {
  const { user } = useAuth()
  const [sprints, setSprints] = useState([])
  const [sidebarSprints, setSidebarSprints] = useState([])
  const [loading, setLoading] = useState(true)

  const loadSprints = useCallback(async () => {
    if (!user) {
      setSprints([])
      setSidebarSprints([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const [allSprints, activeSidebarSprints] = await Promise.all([
        getMySprints(),
        getActiveSprintsForSidebar(user.id),
      ])
      setSprints(allSprints)
      setSidebarSprints(activeSidebarSprints)
    } catch (err) {
      console.error('Failed to load sprints:', err)
      setSprints([])
      setSidebarSprints([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadSprints()
  }, [loadSprints])

  // Memoize sprint filtering so these arrays have stable references
  const { activeSprints, planningSprints } = useMemo(() => ({
    activeSprints: sidebarSprints.filter((sprint) => sprint.status === 'active'),
    planningSprints: sidebarSprints.filter((sprint) => sprint.status === 'planning'),
  }), [sidebarSprints])

  const value = useMemo(() => ({
    sprints,
    activeSprints,
    planningSprints,
    loading,
    reload: loadSprints,
  }), [sprints, activeSprints, planningSprints, loading, loadSprints])

  return (
    <SprintsContext.Provider value={value}>
      {children}
    </SprintsContext.Provider>
  )
}

export function useSprints() {
  const ctx = useContext(SprintsContext)
  if (!ctx) throw new Error('useSprints must be inside SprintsProvider')
  return ctx
}
