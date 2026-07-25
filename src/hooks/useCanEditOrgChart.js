import { useAuth } from './useAuth'

export function useCanEditOrgChart() {
  const { profile } = useAuth()
  return profile?.role === 'super_admin' || profile?.role === 'regional_secretary'
}
