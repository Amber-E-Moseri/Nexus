import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { hasSpaceRole, hasGrant, SPACE_ROLES } from '../../lib/permissions.js'
import LoadingSpinner from '../ui/LoadingSpinner'

export default function ProtectedRoute({ children, roles, allowFeatureRoles, allowGrant, blockRoles }) {
  const { loading, user, profile, effectiveRole, isRecoveryMode } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-secondary)]">
        <LoadingSpinner label="Loading your workspace" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  // Recovery mode guard: only allow /reset-password while in recovery
  if (isRecoveryMode && location.pathname !== '/reset-password') {
    return <Navigate to="/reset-password" replace />
  }

  // Denylist guard: block specific roles outright (e.g. group_member from the
  // Sprints browse list / Meetings). Applied before the roles allowlist.
  if (blockRoles && blockRoles.includes(effectiveRole)) {
    return (
      <Navigate
        to="/dashboard"
        replace
        state={{ authError: 'You do not have access to that section.' }}
      />
    )
  }

  if (roles && !roles.includes(effectiveRole)) {
    // Space roles (Phase 3): 'ors'/'programs'/'media'/'dept_lead' in a route's
    // roles array are granted via space_roles rows, never via users.role — so
    // a roles array naming a space role passes for anyone holding it in any
    // space. allowFeatureRoles remains as an explicit opt-in for routes whose
    // roles array doesn't name the space role directly.
    const spaceRolePasses = roles.some(
      (r) => SPACE_ROLES.includes(r) && hasSpaceRole(profile, null, r)
    )
    const featureRolePasses = (allowFeatureRoles ?? []).some((fr) => hasSpaceRole(profile, null, fr))
    // Ad-hoc grant (user_grants) — lets a specific user pass this route's
    // roles check without changing their base role. See regional_secretary_
    // access: a pastor granted regional-secretary admin reach.
    const grantPasses = allowGrant ? hasGrant(profile, allowGrant) : false

    if (!spaceRolePasses && !featureRolePasses && !grantPasses) {
      return (
        <Navigate
          to="/dashboard"
          replace
          state={{ authError: 'You do not have access to that section.' }}
        />
      )
    }
  }

  return children ?? <Outlet />
}
