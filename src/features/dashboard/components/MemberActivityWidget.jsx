import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { supabase } from '../../../lib/supabase'

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  dept_lead: 'Dept Lead',
  pastor: 'Pastor',
  member: 'Member',
}

function activityColor(lastActiveAt) {
  if (!lastActiveAt) return '#C0BAB0'
  const hours = (Date.now() - new Date(lastActiveAt).getTime()) / 3_600_000
  if (hours <= 24) return '#2D8653'
  if (hours <= 168) return '#E8A020'
  return '#C0BAB0'
}

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

export default function MemberActivityWidget({ role, userId, departmentId }) {
  // Shared query cache (BLW-05)
  const { data: members = [], isPending: loading } = useQuery({
    queryKey: ['member-activity', role, userId, departmentId ?? null],
    enabled: role !== 'member',
    queryFn: async () => {
      let query = supabase
        .from('users')
        .select('id, name, avatar_url, role, last_active_at, department_id')
        .order('last_active_at', { ascending: false, nullsFirst: false })
        .limit(20)

      if (role === 'dept_lead' && departmentId) {
        query = query.eq('department_id', departmentId)
      } else if (role === 'pastor') {
        const { data: flockRows } = await supabase
          .from('pastor_members')
          .select('member_id')
          .eq('pastor_id', userId)
        const ids = (flockRows ?? []).map(r => r.member_id)
        if (ids.length === 0) return []
        query = query.in('id', ids)
      }

      const { data } = await query
      return data ?? []
    },
  })

  // SCOPING FIX: member — org-wide activity widget should not be visible to members
  if (role === 'member') {
    return <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>Activity data is for admins only</div>
  }

  const MAX = 8
  const visible = members.slice(0, MAX)
  const extra = members.length - MAX

  if (loading) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading…</div>
  if (members.length === 0) return (
    <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>No activity data yet</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {visible.map(member => (
        <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', background: '#EDE8F8',
              color: '#4C2A92', fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {initials(member.name)}
            </div>
            <div style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 8, height: 8, borderRadius: '50%',
              background: activityColor(member.last_active_at),
              border: '1.5px solid #fff',
            }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#2D2A22', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {member.name}
            </div>
            <div style={{ fontSize: 10.5, color: '#9E9488' }}>
              {ROLE_LABELS[member.role] ?? member.role}
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#9E9488', flexShrink: 0 }}>
            {member.last_active_at
              ? formatDistanceToNow(parseISO(member.last_active_at), { addSuffix: true })
              : 'Never'}
          </div>
        </div>
      ))}
      {extra > 0 && (
        <div style={{ fontSize: 11.5, color: '#9E9488', paddingTop: 2 }}>+ {extra} more members</div>
      )}
    </div>
  )
}
