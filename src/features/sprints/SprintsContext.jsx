import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { getMySprints } from './lib/sprints'

export const SprintsContext = createContext(null)

export function SprintsProvider({ children }) {
  const { user } = useAuth()
  const [sprints, setSprints] = useState([])
  const [loading, setLoading] = useState(true)

  const loadSprints = useCallback(async () => {
    if (!user) {
      setSprints([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const data = await getMySprints()
      setSprints(data)
    } catch (err) {
      console.error('Failed to load sprints:', err)
      setSprints([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadSprints()
  }, [loadSprints])

  const activeSprints = sprints.filter((sprint) => sprint.status === 'active')
  const planningSprints = sprints.filter((sprint) => sprint.status === 'planning')

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
