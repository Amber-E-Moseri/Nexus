import { useAuth } from './useAuth'

/**
 * Check if current user can edit campus data
 * Returns true if user is super_admin or has ors role
 * @returns {boolean}
 */
export function useCanEditCampus() {
  const { profile } = useAuth()
  return profile?.role === 'super_admin' || profile?.role === 'ors'
}
