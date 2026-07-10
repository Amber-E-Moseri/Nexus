import { useAuth } from './useAuth'
import { hasSpaceRole } from '../lib/permissions'

export function useCanEditCampus() {
  const { profile } = useAuth()
  return (
    profile?.role === 'super_admin'
    || profile?.role === 'regional_secretary'
    || profile?.role === 'ors'        // pre-Phase-3 base role; harmless after Phase 3
    || hasSpaceRole(profile, null, 'ors') // Phase-3 space-role grant
  )
}
