# API Permissions System

The API Permissions system allows super admins to grant special permissions to team members for advanced features.

## Available Permissions

- `export_data` - Export organization data
- `manage_automations` - Create and manage automations
- `view_analytics` - Access advanced analytics
- `manage_integrations` - Configure integrations
- `manage_users` - User management and administration
- `create_teams` - Create new departments/teams
- `manage_sprints` - Sprint administration
- `manage_meetings` - Meeting management features
- `api_access` - Direct API access

## Managing Permissions

### Via Settings UI

1. Go to Settings → API Permissions (Super Admin only)
2. Search and select a user
3. Choose a permission from the dropdown
4. Set expiration date (optional)
5. Click "Grant Permission"
6. To revoke, click "Revoke" on any active permission

### Via API

```javascript
import {
  grantPermission,
  revokePermission,
  getUserPermissions,
  hasPermission,
} from './lib/permissions/api'

// Grant a permission
await grantPermission(userId, 'export_data', expiresAtDate)

// Revoke a permission
await revokePermission(userId, 'export_data')

// Get all permissions for a user
const permissions = await getUserPermissions(userId)

// Check if user has a permission
const hasAccess = await hasPermission(userId, 'export_data')
```

## Using Permissions in Components

### Method 1: usePermission Hook

```javascript
import { usePermission } from '../hooks/usePermission'

export function DataExporter() {
  const { hasAccess, loading } = usePermission('export_data')

  if (loading) return <Spinner />
  if (!hasAccess) return <div>Not authorized</div>

  return <ExportButton />
}
```

### Method 2: PermissionGate Component

```javascript
import { PermissionGate } from '../components/PermissionGate'

export function AdminFeatures() {
  return (
    <PermissionGate permission="manage_users">
      <UserManagementPanel />
    </PermissionGate>
  )
}
```

## Audit Log

All permission changes are logged in the `permission_audit_log` table, including:
- Who granted/revoked the permission
- When the action occurred
- What permission was affected
- The action type (granted, revoked, expired)

Access the audit log via:
- Settings → API Permissions → Recent Activity (for specific user)
- Database query: `SELECT * FROM permission_audit_log`

## Permissions Structure

Each permission has:
- `id` - Unique identifier
- `user_id` - The user who has the permission
- `permission` - The permission type
- `granted_by` - The admin who granted it
- `granted_at` - When it was granted
- `expires_at` - Expiration date (null = never expires)
- `metadata` - Custom JSON data

## Row-Level Security (RLS)

The permission system uses Supabase RLS policies:

- Users can view their own permissions
- Admins can view any user's permissions
- Only super admins can grant/revoke permissions
- The audit log is only viewable by super admins

## Examples

### Grant export access for 30 days

```javascript
const expiresAt = new Date()
expiresAt.setDate(expiresAt.getDate() + 30)
await grantPermission(userId, 'export_data', expiresAt.toISOString())
```

### Check permission before showing feature

```javascript
export function AnalyticsDashboard() {
  const { hasAccess } = usePermission('view_analytics')

  if (!hasAccess) {
    return <div>Analytics not available for your account</div>
  }

  return <AnalyticsPanel />
}
```

### Grant multiple permissions

```javascript
const permissions = ['export_data', 'view_analytics', 'api_access']
for (const perm of permissions) {
  await grantPermission(userId, perm)
}
```
