import { useEffect, useState } from 'react'
import { Shield, Users, Check, X } from 'lucide-react'
import { getCalendarPermissions, grantCalendarPermission, revokeCalendarPermission } from '../lib/calendar'
import { useToast } from '../../../context/ToastContext'

// Permissions management for the Ministry Calendar.
// Shows users who have explicit write access (can_manage=true) and allows
// super_admin to grant/revoke it. Programs space members get write access
// automatically via space membership — they appear here as read-only indicators.
export default function CalendarSettingsPanel({ programsMembers = [] }) {
  const { showToast } = useToast()
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)

  async function loadPermissions() {
    setLoading(true)
    try {
      const data = await getCalendarPermissions()
      setPermissions(data)
    } catch (err) {
      console.error('Failed to load calendar permissions:', err)
      showToast('Failed to load permissions', { tone: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPermissions()
  }, [])

  async function handleToggle(userId, currentlyGranted) {
    setSaving(userId)
    try {
      if (currentlyGranted) {
        await revokeCalendarPermission(userId)
        showToast('Write access revoked', { tone: 'success' })
      } else {
        await grantCalendarPermission(userId)
        showToast('Write access granted', { tone: 'success' })
      }
      await loadPermissions()
    } catch (err) {
      console.error('Failed to update permission:', err)
      showToast('Failed to update permission', { tone: 'error' })
    } finally {
      setSaving(null)
    }
  }

  const programsMemberIds = new Set(programsMembers.map((m) => m.id))

  return (
    <div style={{
      borderRadius: '12px',
      border: '1px solid var(--border)',
      backgroundColor: 'white',
      overflow: 'hidden',
      boxShadow: 'var(--card-shadow)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '16px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--surface-tertiary)'
      }}>
        <Shield size={18} style={{ color: 'var(--accent)' }} />
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Calendar Write Access
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
            Programs space members get write access automatically. Grant it to others manually below.
          </p>
        </div>
        <Users size={16} style={{ color: 'var(--text-tertiary)' }} />
      </div>

      {/* Programs members — auto-granted, read-only */}
      {programsMembers.length > 0 && (
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>
            Programs Space (Auto-Granted)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {programsMembers.map((member) => (
              <div key={member.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 10px',
                borderRadius: '8px',
                backgroundColor: 'var(--surface-tertiary)',
                fontSize: '13px'
              }}>
                <div style={{ flex: 1, fontWeight: 500, color: 'var(--text-primary)' }}>
                  {member.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{member.email}</div>
                <div style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: '#D1FAE5',
                  color: '#059669',
                  fontSize: '11px',
                  fontWeight: 600
                }}>
                  Auto
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Explicit and inherited permissions */}
      <div style={{ padding: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>
          Calendar Managers
        </div>

        {loading ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Loading...
          </div>
        ) : permissions.filter((p) => !programsMemberIds.has(p.user_id)).length === 0 ? (
          <div style={{
            padding: '16px',
            borderRadius: '8px',
            backgroundColor: 'var(--surface-tertiary)',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            fontSize: '13px'
          }}>
            No manual grants yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {permissions
              .filter((p) => !programsMemberIds.has(p.user_id))
              .map((perm) => (
                <div key={perm.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--surface-tertiary)',
                  fontSize: '13px'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                      {perm.users?.name ?? 'Unknown'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {perm.users?.email}
                    </div>
                  </div>
                  {perm.inherited ? (
                    <div
                      title="Inherited from super_admin role"
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        backgroundColor: '#DBEAFE',
                        color: '#2563EB',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      Role
                    </div>
                  ) : (
                    <button
                      onClick={() => handleToggle(perm.user_id, perm.can_manage)}
                      disabled={saving === perm.user_id}
                      title={perm.can_manage ? 'Revoke write access' : 'Grant write access'}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: saving === perm.user_id ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
                        opacity: saving === perm.user_id ? 0.6 : 1,
                        backgroundColor: perm.can_manage ? '#FEE2E2' : '#D1FAE5',
                        color: perm.can_manage ? '#DC2626' : '#059669',
                      }}
                    >
                      {perm.can_manage ? <X size={12} /> : <Check size={12} />}
                      {perm.can_manage ? 'Revoke' : 'Grant'}
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
