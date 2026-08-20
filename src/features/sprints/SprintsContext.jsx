import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { getActiveSprintsForSidebar } from './lib/sprints'

export const SprintsContext = createContext(null)

export function SprintsProvider({ children }) {
  const { user } = useAuth()
  const [sidebarSprints, setSidebarSprints] = useState([])
  const [loading, setLoading] = useState(true)

  const loadSprints = useCallback(async () => {
    if (!user) {
      setSidebarSprints([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const activeSidebarSprints = await getActiveSprintsForSidebar(user.id)
      setSidebarSprints(activeSidebarSprints)
    } catch (err) {
      console.error('Failed to load sprints:', err)
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
    activeSprints,
    planningSprints,
    loading,
    reload: loadSprints,
  }), [activeSprints, planningSprints, loading, loadSprints])

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
