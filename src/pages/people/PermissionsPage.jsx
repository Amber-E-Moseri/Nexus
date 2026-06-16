import { useEffect, useMemo, useState } from 'react'
import PeopleLayout from './PeopleLayout'
import { supabase } from '../../lib/supabase'

function RoleBadge({ role }) {
  return (
    <span className="rounded-full bg-[var(--surface-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]">
      {(role ?? 'member').replace('_', ' ')}
    </span>
  )
}

function PermissionToggle({ checked, disabled, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={[
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        checked ? 'bg-[var(--accent)]' : 'bg-[var(--border)]',
        disabled ? 'cursor-not-allowed opacity-50' : '',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-5 w-5 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-5' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  )
}

export default function PermissionsPage() {
  const [users, setUsers] = useState([])
  const [permissions, setPermissions] = useState([])
  const [grants, setGrants] = useState([])
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState(null)

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [{ data: userRows, error: userError }, { data: permissionRows, error: permissionError }, { data: grantRows, error: grantError }] = await Promise.all([
        supabase.from('users').select('id, name, email, role, department_id, avatar_url').order('name'),
        supabase.from('available_permissions').select('*').order('area, label'),
        supabase.from('user_permissions').select('user_id, permission'),
      ])

      if (userError) throw userError
      if (permissionError) throw permissionError
      if (grantError) throw grantError

      setUsers(userRows ?? [])
      setPermissions(permissionRows ?? [])
      setGrants(grantRows ?? [])
      if (!selectedUserId && userRows?.[0]?.id) {
        setSelectedUserId(userRows[0].id)
      }
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredUsers = useMemo(() => {
    const value = search.trim().toLowerCase()
    if (!value) return users
    return users.filter((user) =>
      user.name?.toLowerCase().includes(value) ||
      user.email?.toLowerCase().includes(value),
    )
  }, [search, users])

  const selectedUser = filteredUsers.find((user) => user.id === selectedUserId) ?? users.find((user) => user.id === selectedUserId) ?? filteredUsers[0] ?? null

  useEffect(() => {
    if (!selectedUserId && filteredUsers[0]?.id) {
      setSelectedUserId(filteredUsers[0].id)
    }
  }, [filteredUsers, selectedUserId])

  const grantsByUser = useMemo(() => {
    const map = new Map()
    grants.forEach((grant) => {
      if (!map.has(grant.user_id)) map.set(grant.user_id, new Set())
      map.get(grant.user_id).add(grant.permission)
    })
    return map
  }, [grants])

  const groupedPermissions = useMemo(() => {
    return permissions.reduce((accumulator, permission) => {
      const key = permission.area
      if (!accumulator[key]) accumulator[key] = []
      accumulator[key].push(permission)
      return accumulator
    }, {})
  }, [permissions])

  async function togglePermission(userId, permissionKey, enabled) {
    const optimistic = enabled
      ? [...grants, { user_id: userId, permission: permissionKey }]
      : grants.filter((grant) => !(grant.user_id === userId && grant.permission === permissionKey))

    setGrants(optimistic)
    setSavingKey(`${userId}:${permissionKey}`)
    setError('')

    try {
      if (enabled) {
        const { error: insertError } = await supabase
          .from('user_permissions')
          .insert({ user_id: userId, permission: permissionKey })
        if (insertError) throw insertError
      } else {
        const { error: deleteError } = await supabase
          .from('user_permissions')
          .delete()
          .eq('user_id', userId)
          .eq('permission', permissionKey)
        if (deleteError) throw deleteError
      }
    } catch (nextError) {
      setError(nextError.message)
      await loadData()
    } finally {
      setSavingKey(null)
    }
  }

  const selectedGrants = selectedUser ? grantsByUser.get(selectedUser.id) ?? new Set() : new Set()

  return (
    <PeopleLayout
      title="Permissions"
      description="Grant or revoke granular access for individual users on top of their role defaults."
    >
      {error ? (
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search users"
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />

          <div className="mt-4 space-y-2">
            {loading ? (
              <div className="rounded-xl bg-[var(--surface-secondary)] px-4 py-6 text-sm text-[var(--text-secondary)]">
                Loading users…
              </div>
            ) : null}

            {!loading && filteredUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => setSelectedUserId(user.id)}
                className={[
                  'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
                  selectedUser?.id === user.id
                    ? 'border-[var(--accent)] bg-[var(--accent-light)]'
                    : 'border-[var(--border)] bg-white hover:bg-[var(--surface-secondary)]',
                ].join(' ')}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[var(--text-primary)]">{user.name}</div>
                  <div className="truncate text-xs text-[var(--text-secondary)]">{user.email}</div>
                </div>
                <RoleBadge role={user.role} />
              </button>
            ))}

            {!loading && filteredUsers.length === 0 ? (
              <div className="rounded-xl bg-[var(--surface-secondary)] px-4 py-6 text-sm text-[var(--text-secondary)]">
                No users match the current search.
              </div>
            ) : null}
          </div>
        </aside>

        <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
          {selectedUser ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">{selectedUser.name}</h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{selectedUser.email}</p>
                </div>
                <RoleBadge role={selectedUser.role} />
              </div>

              {selectedUser.role === 'super_admin' ? (
                <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                  Role already grants full access. No custom permissions are needed for Super Admins.
                </div>
              ) : null}

              {selectedUser.role !== 'super_admin' && selectedGrants.size === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                  No custom permissions — using role defaults only.
                </div>
              ) : null}

              <div className="mt-6 space-y-5">
                {Object.entries(groupedPermissions).map(([area, entries]) => (
                  <div key={area} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{area}</div>
                    <div className="mt-3 space-y-3">
                      {entries.map((permission) => {
                        const checked = selectedGrants.has(permission.key)
                        const disabled = selectedUser.role === 'super_admin'
                        return (
                          <div key={permission.key} className="flex items-start justify-between gap-4 rounded-xl bg-white px-4 py-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-[var(--text-primary)]">{permission.label}</div>
                              <div className="mt-1 text-xs text-[var(--text-secondary)]">{permission.description}</div>
                              <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{permission.key}</div>
                            </div>
                            <PermissionToggle
                              checked={checked}
                              disabled={disabled || savingKey === `${selectedUser.id}:${permission.key}`}
                              onChange={() => togglePermission(selectedUser.id, permission.key, !checked)}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-2xl bg-[var(--surface-secondary)] px-4 py-6 text-sm text-[var(--text-secondary)]">
              Select a user to manage permissions.
            </div>
          )}
        </section>
      </div>
    </PeopleLayout>
  )
}
