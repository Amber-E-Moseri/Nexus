import { usePermission } from '../hooks/usePermission'
import LoadingSpinner from './ui/LoadingSpinner'

export function PermissionGate({ permission, children, fallback = null }) {
  const { hasAccess, loading } = usePermission(permission)

  if (loading) {
    return <LoadingSpinner label="Checking permissions" />
  }

  if (!hasAccess) {
    return fallback || (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <p className="text-sm text-yellow-800">
          You don't have permission to access this feature. Contact your administrator.
        </p>
      </div>
    )
  }

  return children
}
