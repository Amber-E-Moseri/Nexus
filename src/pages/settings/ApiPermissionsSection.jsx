import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import {
  getUserPermissions,
  grantPermission,
  revokePermission,
  getPermissionAuditLog,
  getUsers,
  PERMISSION_TYPES,
  getPermissionLabel,
} from '../../lib/permissions/api'
import { useAuth } from '../../hooks/useAuth'

export default function ApiPermissionsSection() {
  const { profile, role } = useAuth()
  const [selectedUser, setSelectedUser] = useState(null)
  const [userPermissions, setUserPermissions] = useState([])
  const [auditLog, setAuditLog] = useState([])
  const [users, setUsers] = useState([])
  const [searchInput, setSearchInput] = useState('')
  const [selectedPermission, setSelectedPermission] = useState('')
  const [expiresIn, setExpiresIn] = useState('never')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  // Only super admins can access this
  if (role !== 'super_admin') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-800">You don't have permission to manage API permissions.</p>
      </div>
    )
  }

  useEffect(() => {
    const searchUsers = async () => {
      if (!searchInput.trim()) {
        setUsers([])
        return
      }
      try {
        const results = await getUsers(searchInput)
        setUsers(results)
      } catch (err) {
        console.error('Failed to search users:', err)
      }
    }

    const timer = setTimeout(searchUsers, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    const loadPermissions = async () => {
      if (!selectedUser) {
        setUserPermissions([])
        return
      }
      try {
        const perms = await getUserPermissions(selectedUser.id)
        setUserPermissions(perms)
        const logs = await getPermissionAuditLog({ userId: selectedUser.id })
        setAuditLog(logs)
      } catch (err) {
        setMessage(`Error loading permissions: ${err.message}`)
      }
    }

    loadPermissions()
  }, [selectedUser])

  async function handleGrantPermission() {
    if (!selectedUser || !selectedPermission) {
      setMessage('Please select a user and permission')
      return
    }

    setSaving(true)
    setMessage('')

    try {
      const expiresAt = expiresIn === 'never' ? null : new Date(Date.now() + parseInt(expiresIn) * 24 * 60 * 60 * 1000).toISOString()
      await grantPermission(selectedUser.id, selectedPermission, expiresAt)
      setMessage(`Permission "${getPermissionLabel(selectedPermission)}" granted successfully`)
      setSelectedPermission('')
      setExpiresIn('never')

      // Reload permissions
      const perms = await getUserPermissions(selectedUser.id)
      setUserPermissions(perms)
      const logs = await getPermissionAuditLog({ userId: selectedUser.id })
      setAuditLog(logs)
    } catch (err) {
      setMessage(`Failed to grant permission: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleRevokePermission(permission) {
    if (!selectedUser) return

    setSaving(true)
    setMessage('')

    try {
      await revokePermission(selectedUser.id, permission)
      setMessage(`Permission revoked successfully`)

      // Reload permissions
      const perms = await getUserPermissions(selectedUser.id)
      setUserPermissions(perms)
      const logs = await getPermissionAuditLog({ userId: selectedUser.id })
      setAuditLog(logs)
    } catch (err) {
      setMessage(`Failed to revoke permission: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const availablePermissions = Object.entries(PERMISSION_TYPES)
    .map(([_, value]) => value)
    .filter(perm => !userPermissions.some(up => up.permission === perm))

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">API Permissions</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Grant special API permissions to team members for advanced features.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-[var(--border)] bg-white p-5">
        {/* User Search */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
            Select User
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={selectedUser ? selectedUser.name : searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value)
                if (!e.target.value) setSelectedUser(null)
              }}
              placeholder="Search users by name or email..."
              className="w-full pl-9 pr-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            {searchInput && users.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 border border-[var(--border)] rounded-lg bg-white shadow-lg z-10">
                {users.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => {
                      setSelectedUser(user)
                      setSearchInput('')
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--surface-secondary)] text-sm border-b border-[var(--border)] last:border-b-0"
                  >
                    <div className="font-medium text-[var(--text-primary)]">{user.name}</div>
                    <div className="text-xs text-[var(--text-secondary)]">{user.email}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedUser && (
          <>
            {/* Selected User Info */}
            <div className="flex items-center justify-between p-3 bg-[var(--surface-secondary)] rounded-lg">
              <div>
                <div className="font-medium text-[var(--text-primary)]">{selectedUser.name}</div>
                <div className="text-xs text-[var(--text-secondary)]">{selectedUser.email}</div>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="p-1 hover:bg-white rounded transition"
              >
                <X size={16} className="text-[var(--text-secondary)]" />
              </button>
            </div>

            {/* Grant Permission Controls */}
            {availablePermissions.length > 0 && (
              <div className="border-t border-[var(--border)] pt-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Permission to Grant
                  </label>
                  <select
                    value={selectedPermission}
                    onChange={(e) => setSelectedPermission(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  >
                    <option value="">-- Select a permission --</option>
                    {availablePermissions.map((perm) => (
                      <option key={perm} value={perm}>
                        {getPermissionLabel(perm)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Expiration
                  </label>
                  <select
                    value={expiresIn}
                    onChange={(e) => setExpiresIn(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  >
                    <option value="never">Never expires</option>
                    <option value={7}>7 days</option>
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                    <option value={365}>1 year</option>
                  </select>
                </div>

                <button
                  onClick={handleGrantPermission}
                  disabled={!selectedPermission || saving}
                  className="w-full px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-medium text-sm disabled:opacity-50 hover:opacity-90 transition"
                >
                  {saving ? 'Granting...' : 'Grant Permission'}
                </button>
              </div>
            )}

            {/* Current Permissions */}
            <div className="border-t border-[var(--border)] pt-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
                Current Permissions ({userPermissions.length})
              </h3>
              {userPermissions.length === 0 ? (
                <p className="text-xs text-[var(--text-secondary)]">No permissions granted yet.</p>
              ) : (
                <div className="space-y-2">
                  {userPermissions.map((perm) => (
                    <div
                      key={perm.id}
                      className="flex items-center justify-between p-2 bg-[var(--surface-secondary)] rounded text-sm"
                    >
                      <div>
                        <div className="font-medium text-[var(--text-primary)]">
                          {getPermissionLabel(perm.permission)}
                        </div>
                        <div className="text-xs text-[var(--text-secondary)]">
                          {perm.expires_at
                            ? `Expires: ${new Date(perm.expires_at).toLocaleDateString()}`
                            : 'No expiration'}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRevokePermission(perm.permission)}
                        disabled={saving}
                        className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200 transition disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Audit Log */}
            {auditLog.length > 0 && (
              <div className="border-t border-[var(--border)] pt-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Recent Activity</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {auditLog.slice(0, 10).map((log) => (
                    <div key={log.id} className="text-xs text-[var(--text-secondary)] p-2 bg-[var(--surface-secondary)] rounded">
                      <div className="font-medium text-[var(--text-primary)]">
                        {getPermissionLabel(log.permission)} - {log.action}
                      </div>
                      <div>{new Date(log.created_at).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.includes('Error') || message.includes('Failed')
              ? 'bg-red-50 text-red-800 border border-red-200'
              : 'bg-green-50 text-green-800 border border-green-200'
          }`}
        >
          {message}
        </div>
      )}
    </section>
  )
}
