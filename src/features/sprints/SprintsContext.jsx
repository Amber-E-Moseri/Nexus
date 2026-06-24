import { createContext, useCallback, useContext, useEffect, useState } from 'react'
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

  // For sidebar: use filtered active sprints
  const activeSprints = sidebarSprints.filter((sprint) => sprint.status === 'active')
  const planningSprints = sidebarSprints.filter((sprint) => sprint.status === 'planning')

  return (
    <SprintsContext.Provider
      value={{
        sprints,
        activeSprints,
        planningSprints,
        loading,
        reload: loadSprints,
      }}
    >
      {children}
    </SprintsContext.Provider>
  )
}

export function useSprints() {
  const ctx = useContext(SprintsContext)
  if (!ctx) throw new Error('useSprints must be inside SprintsProvider')
  return ctx
}
