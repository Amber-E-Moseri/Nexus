import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import LoadingSpinner from '../ui/LoadingSpinner'

export default function ProtectedRoute({ children, roles }) {
  const { loading, user, effectiveRole, isRecoveryMode } = useAuth()
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

  if (roles && !roles.includes(effectiveRole)) {
    return (
      <Navigate
        to="/dashboard"
        replace
        state={{ authError: 'You do not have access to that section.' }}
      />
    )
  }

  return children ?? <Outlet />
}
