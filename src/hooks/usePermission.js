import { useEffect, useState } from 'react'
import { hasPermission } from '../lib/permissions/api'
import { useAuth } from './useAuth'

export function usePermission(permission) {
  const { user } = useAuth()
  const [hasAccess, setHasAccess] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkPermission = async () => {
      if (!user?.id || !permission) {
        setHasAccess(false)
        setLoading(false)
        return
      }

      try {
        const result = await hasPermission(user.id, permission)
        setHasAccess(result)
      } catch (err) {
        console.error('Failed to check permission:', err)
        setHasAccess(false)
      } finally {
        setLoading(false)
      }
    }

    checkPermission()
  }, [user?.id, permission])

  return { hasAccess, loading }
}
