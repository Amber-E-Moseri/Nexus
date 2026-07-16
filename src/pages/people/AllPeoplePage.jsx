import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import {
  assignPastorMember,
  cancelInvitation,
  createInvitation,
  listDepartments,
  listInvitations,
  listPastorMembers,
  listUsers,
  removePastorMember,
  sendInvitationEmail,
  updateUserMembership,
} from '../../lib/people/api'
import { selectDepartmentUsers, selectPastorMembers } from '../../lib/people/selectors'

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  dept_lead: 'Dept Lead',
  pastor: 'Pastor',
  member: 'Member',
}

const ROLE_COLORS = {
  super_admin: { bg: '#EDE8F8', fg: '#4C2A92' },
  dept_lead:   { bg: '#FEF8E7', fg: '#C47E0A' },
  pastor:      { bg: '#EBF7F1', fg: '#2D8653' },
  member:      { bg: '#F2EEE6', fg: '#7A6F5E' },
}

const STATUS_LABELS = {
  active:             'Active',
  inactive:           'Inactive',
  archived:           'Archived',
  invited:            'Invited',
  pending_activation: 'Pending',
}

const STATUS_COLORS = {
  active:             { bg: '#EBF7F1', fg: '#2D8653', bd: '#C3E8D5' },
  inactive:           { bg: '#FEF8E7', fg: '#C47E0A', bd: '#F3DFA2' },
  archived:           { bg: '#F2EEE6', fg: '#7A6F5E', bd: '#E9E4D8' },
  invited:            { bg: '#EDE8F8', fg: '#4C2A92', bd: '#C9BDEF' },
  pending_activation: { bg: '#EDE8F8', fg: '#4C2A92', bd: '#C9BDEF' },
}

const AVATAR_PALETTE = ['#4C2A92','#C47E0A','#2D8653','#C94830','#1E40AF','#7A6F5E','#6B4BBE']

function getInitials(name = '') {
  return name.trim().split(/\s+/).slice(0,2).map(w => w[0]?.toUpperCase()).join('') || '?'
}
function avatarBg(name) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}
function fmt(v) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatusPill({ status }) {
  const c = STATUS_COLORS[status] ?? { bg: '#F2EEE6', fg: '#7A6F5E', bd: '#E9E4D8' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
      background: c.bg, color: c.fg, border: `1px solid ${c.bd}`,
    }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function RolePill({ role }) {
  const c = ROLE_COLORS[role] ?? { bg: '#F2EEE6', fg: '#7A6F5E' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
      background: c.bg, color: c.fg,
    }}>
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}

function Avatar({ name, size = 32, fontSize = 11 }) {
  return (
    <span style={{
      width: size, height: size, flexShrink: 0, borderRadius: 999,
      background: avatarBg(name || '?'), color: '#fff',
      fontSize, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {getInitials(name)}
    </span>
  )
}

function KpiTile({ label, value, bg, bd, circle, labelColor, valueColor }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '14px 16px', background: bg, border: `1px solid ${bd}` }}>
      <div style={{ position: 'absolute', right: -18, bottom: -22, width: 72, height: 72, borderRadius: 999, background: circle }} />
      <div style={{ position: 'relative', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: labelColor }}>{label}</div>
      <div style={{ position: 'relative', fontSize: 25, fontWeight: 800, color: valueColor, marginTop: 7, lineHeight: 1 }}>{value}</div>
    </div>
  )
}

function FilterChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? '#4C2A92' : '#E9E4D8'}`,
        background: active ? '#4C2A92' : '#fff',
        color: active ? '#fff' : '#7A6F5E',
        borderRadius: 999, padding: '4px 13px',
        fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

// ── USERS TAB ────────────────────────────────────────────────────
function UsersTab({ users, departments, pastorMembers, role, profile, onReload }) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [openMenuId, setOpenMenuId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const scopedUsers = useMemo(() => {
    if (role === 'dept_lead') return selectDepartmentUsers(users, profile?.department_id)
    if (role === 'pastor') return selectPastorMembers(users, pastorMembers, profile?.id)
    return users
  }, [users, pastorMembers, role, profile])

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return scopedUsers
    return scopedUsers.filter(u => u.status === statusFilter)
  }, [scopedUsers, statusFilter])

  const departmentById = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments])
  const pastorByMemberId = useMemo(() => {
    const map = new Map()
    pastorMembers.forEach(a => map.set(a.member_id, a.pastor_id))
    return map
  }, [pastorMembers])
  const userById = useMemo(() => new Map(users.map(u => [u.id, u])), [users])

  const counts = useMemo(() => ({
    total:    scopedUsers.length,
    active:   scopedUsers.filter(u => u.status === 'active').length,
    pending:  scopedUsers.filter(u => ['invited','pending_activation'].includes(u.status)).length,
    inactive: scopedUsers.filter(u => u.status === 'inactive').length,
  }), [scopedUsers])

  const canManage = (u) => {
    if (!u) return false
    if (role === 'super_admin') return u.id !== profile?.id
    if (role === 'dept_lead') return u.role === 'member' && u.department_id === profile?.department_id
    return false
  }

  async function setStatus(userId, status) {
    setSaving(true); setError('')
    try {
      await updateUserMembership({ userId, status, reason: `Status changed to ${status}` })
      await onReload()
    } catch (e) { setError(e.message) }
    finally { setSaving(false); setOpenMenuId(null) }
  }

  async function setRole(userId, newRole) {
    setSaving(true); setError('')
    try {
      await updateUserMembership({ userId, role: newRole, reason: `Role changed to ${newRole}` })
      await onReload()
    } catch (e) { setError(e.message) }
    finally { setSaving(false); setOpenMenuId(null) }
  }

  return (
    <div>
      {error ? (
        <div style={{ background: '#FEF0ED', border: '1px solid #F9C4B8', borderRadius: 10, padding: '9px 14px', marginBottom: 14, fontSize: 12.5, color: '#C94830' }}>{error}</div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 16 }}>
        <KpiTile label="Total Members" value={counts.total}   bg="#FBF8F2" bd="#EDE8DC" circle="rgba(76,42,146,.08)"   labelColor="#B0A696" valueColor="#1C1610" />
        <KpiTile label="Active"        value={counts.active}  bg="#EBF7F1" bd="#C3E8D5" circle="rgba(45,134,83,.12)"   labelColor="#2D8653" valueColor="#1C1610" />
        <KpiTile label="Pending"       value={counts.pending} bg="#EDE8F8" bd="#C9BDEF" circle="rgba(76,42,146,.10)"   labelColor="#4C2A92" valueColor="#1C1610" />
        <KpiTile label="Inactive"      value={counts.inactive} bg="#FEF8E7" bd="#F3DFA2" circle="rgba(196,126,10,.10)" labelColor="#C47E0A" valueColor="#1C1610" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#7A6F5E' }}>{filtered.length} {filtered.length === 1 ? 'person' : 'people'}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['all','active','pending_activation','inactive'].map(f => (
            <FilterChip key={f} label={f === 'all' ? 'All' : f === 'pending_activation' ? 'Pending' : f.charAt(0).toUpperCase() + f.slice(1)} active={statusFilter === f} onClick={() => setStatusFilter(f)} />
          ))}
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E9E4D8', borderRadius: 14, boxShadow: '0 1px 3px rgba(28,22,16,.05)', overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px 160px 96px 92px 40px', gap: 12, padding: '10px 16px', minWidth: 660, background: '#F9F7F3', borderBottom: '1px solid #E9E4D8', fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#7A6F5E' }}>
          <span>Member</span><span>Role</span><span>Department</span><span>Status</span><span>Last Active</span><span></span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: '#B0A696' }}>No members match the current filter.</div>
        ) : filtered.map(u => {
          const dept = departmentById.get(u.department_id)
          const can = canManage(u)
          return (
            <div key={u.id} style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px 160px 96px 92px 40px', gap: 12, minWidth: 660, alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid #F2EEE6' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F9F7F3'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                <Avatar name={u.name} size={32} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1C1610', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: '#7A6F5E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                </div>
              </div>
              <span><RolePill role={u.role} /></span>
              <span style={{ fontSize: 12.5, color: '#3A332A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dept?.name ?? '—'}</span>
              <span><StatusPill status={u.status} /></span>
              <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#7A6F5E' }}>{fmt(u.last_active_at)}</span>
              <span style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end' }}>
                {can ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setOpenMenuId(openMenuId === u.id ? null : u.id)}
                      disabled={saving}
                      style={{ width: 28, height: 28, border: 'none', background: 'none', borderRadius: 6, cursor: 'pointer', color: '#B0A696', fontSize: 16, lineHeight: 1, padding: 0 }}
                    >⋯</button>
                    {openMenuId === u.id ? (
                      <div style={{ position: 'absolute', top: 30, right: 0, zIndex: 8, background: '#fff', border: '1px solid #E9E4D8', borderRadius: 9, boxShadow: '0 8px 28px rgba(28,22,16,.14)', padding: 4, minWidth: 172 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9A8E7A', padding: '6px 10px 3px' }}>Change role</div>
                        {Object.entries(ROLE_LABELS).filter(([r]) => r !== 'super_admin' || role === 'super_admin').map(([r, label]) => (
                          <button key={r} type="button" onClick={() => setRole(u.id, r)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: 'none', background: 'none', borderRadius: 6, padding: '7px 10px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#1C1610', cursor: 'pointer' }}>
                            <span style={{ width: 8, height: 8, borderRadius: 999, background: ROLE_COLORS[r]?.fg ?? '#7A6F5E' }} />
                            <span style={{ flex: 1 }}>{label}</span>
                            {u.role === r ? <span style={{ color: '#2D8653', fontSize: 12 }}>✓</span> : null}
                          </button>
                        ))}
                        <div style={{ height: 1, background: '#F2EEE6', margin: '4px 0' }} />
                        {u.status !== 'active' ? (
                          <button type="button" onClick={() => setStatus(u.id, 'active')}
                            style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', borderRadius: 6, padding: '8px 10px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#2D8653', cursor: 'pointer' }}>
                            Activate user
                          </button>
                        ) : null}
                        {u.status === 'active' ? (
                          <button type="button" onClick={() => setStatus(u.id, 'inactive')}
                            style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', borderRadius: 6, padding: '8px 10px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#C94830', cursor: 'pointer' }}>
                            Deactivate user
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── INVITATIONS TAB ──────────────────────────────────────────────
function InvitationsTab({ invitations, departments, role, profile, onReload }) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [latestLink, setLatestLink] = useState('')
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', departmentId: role === 'dept_lead' ? (profile?.department_id ?? '') : '', role: 'member', assignedPastorId: '', message: '' })

  const canManage = role === 'super_admin' || role === 'dept_lead'
  const scopedDepts = role === 'dept_lead' ? departments.filter(d => d.id === profile?.department_id) : departments

  const scoped = useMemo(() => {
    const base = role === 'dept_lead' ? invitations.filter(i => i.department_id === profile?.department_id) : invitations
    return statusFilter === 'all' ? base : base.filter(i => i.status === statusFilter)
  }, [invitations, role, profile, statusFilter])

  const pending = invitations.filter(i => i.status === 'pending').length

  async function handleSend(invitationId, mode = 'resend') {
    setSaving(true); setError('')
    try {
      const res = await sendInvitationEmail(invitationId, mode)
      if (res?.activation_url) setLatestLink(res.activation_url)
      await onReload()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function handleRevoke(invitationId) {
    if (!window.confirm('Revoke this invitation?')) return
    setSaving(true); setError('')
    try {
      await cancelInvitation(invitationId)
      await onReload()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true); setError(''); setLatestLink('')
    try {
      const inv = await createInvitation(form)
      const res = await sendInvitationEmail(inv.id, 'send')
      if (res?.activation_url) setLatestLink(res.activation_url)
      setForm(f => ({ ...f, firstName: '', lastName: '', email: '', assignedPastorId: '', message: '' }))
      setShowForm(false)
      await onReload()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const inputStyle = { width: '100%', padding: '8px 11px', border: '1px solid #E9E4D8', borderRadius: 6, fontFamily: 'inherit', fontSize: 13, color: '#1C1610', outline: 'none' }
  const labelStyle = { fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#7A6F5E', marginBottom: 5, display: 'block' }

  return (
    <div>
      {error ? <div style={{ background: '#FEF0ED', border: '1px solid #F9C4B8', borderRadius: 10, padding: '9px 14px', marginBottom: 14, fontSize: 12.5, color: '#C94830' }}>{error}</div> : null}

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1C1610' }}>Pending &amp; recent invitations</div>
          <div style={{ fontSize: 12, color: '#7A6F5E', marginTop: 2 }}>{pending} pending · {invitations.length} total</div>
        </div>
        {canManage ? (
          <button type="button" onClick={() => setShowForm(f => !f)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#E8A020', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 14px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Invite Member
          </button>
        ) : null}
      </div>

      {showForm ? (
        <form onSubmit={handleCreate} style={{ background: '#fff', border: '1px solid #E9E4D8', borderRadius: 14, padding: '18px 20px', marginBottom: 16, boxShadow: '0 1px 3px rgba(28,22,16,.05)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#1C1610', marginBottom: 14 }}>New invitation</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 12 }}>
            <div><label style={labelStyle}>First name</label><input required value={form.firstName} onChange={e => setForm(f => ({...f, firstName: e.target.value}))} style={inputStyle} /></div>
            <div><label style={labelStyle}>Last name</label><input required value={form.lastName} onChange={e => setForm(f => ({...f, lastName: e.target.value}))} style={inputStyle} /></div>
            <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Email</label><input required type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} style={inputStyle} /></div>
            <div>
              <label style={labelStyle}>Department</label>
              <select required value={form.departmentId} disabled={role === 'dept_lead'} onChange={e => setForm(f => ({...f, departmentId: e.target.value}))} style={{...inputStyle, background: role === 'dept_lead' ? '#F9F7F3' : '#fff'}}>
                <option value="">Select…</option>
                {scopedDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Role</label>
              <select value={form.role} disabled={role !== 'super_admin'} onChange={e => setForm(f => ({...f, role: e.target.value}))} style={{...inputStyle, background: role !== 'super_admin' ? '#F9F7F3' : '#fff'}}>
                <option value="member">Member</option>
                {role === 'super_admin' ? <>
                  <option value="pastor">Pastor</option>
                  <option value="dept_lead">Dept Lead</option>
                  <option value="super_admin">Super Admin</option>
                </> : null}
              </select>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={labelStyle}>Optional message</label>
              <textarea value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))} rows={2} style={{...inputStyle, resize: 'none'}} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={saving} style={{ background: '#4C2A92', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 16px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Send Invitation</button>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: 'transparent', color: '#7A6F5E', border: '1px solid #E9E4D8', borderRadius: 6, padding: '9px 14px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          </div>
          {latestLink ? (
            <div style={{ marginTop: 12, background: '#F9F7F3', border: '1px solid #E9E4D8', borderRadius: 9, padding: '10px 12px', fontSize: 12, color: '#7A6F5E', wordBreak: 'break-all' }}>
              <strong style={{ color: '#1C1610' }}>Activation link:</strong> {latestLink}
            </div>
          ) : null}
        </form>
      ) : null}

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {['all','pending','accepted','expired','revoked'].map(f => (
          <FilterChip key={f} label={f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} active={statusFilter === f} onClick={() => setStatusFilter(f)} />
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E9E4D8', borderRadius: 14, boxShadow: '0 1px 3px rgba(28,22,16,.05)', overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px 180px 110px 160px', gap: 12, padding: '10px 16px', minWidth: 680, background: '#F9F7F3', borderBottom: '1px solid #E9E4D8', fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#7A6F5E' }}>
          <span>Email</span><span>Role</span><span>Department</span><span>Status</span><span></span>
        </div>
        {scoped.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: '#B0A696' }}>No invitations found.</div>
        ) : scoped.map(iv => {
          const dept = departments.find(d => d.id === iv.department_id)
          const canAct = canManage && iv.status === 'pending'
          return (
            <div key={iv.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px 180px 110px 160px', gap: 12, alignItems: 'center', padding: '11px 16px', minWidth: 680, borderBottom: '1px solid #F2EEE6' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F9F7F3'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1610', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{iv.first_name} {iv.last_name}</div>
                <div style={{ fontSize: 11, color: '#7A6F5E', marginTop: 1 }}>{iv.email} · Invited {fmt(iv.created_at)}</div>
              </div>
              <span><RolePill role={iv.role} /></span>
              <span style={{ fontSize: 12, color: '#3A332A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dept?.name ?? '—'}</span>
              <span><StatusPill status={iv.status} /></span>
              <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                {canAct ? <>
                  <button type="button" disabled={saving} onClick={() => handleSend(iv.id, 'resend')}
                    style={{ border: '1px solid #E9E4D8', background: '#fff', color: '#4C2A92', borderRadius: 5, padding: '4px 9px', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    Resend
                  </button>
                  <button type="button" disabled={saving} onClick={() => handleRevoke(iv.id)}
                    style={{ border: '1px solid #F9C4B8', background: '#FEF0ED', color: '#C94830', borderRadius: 5, padding: '4px 9px', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    Revoke
                  </button>
                </> : null}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── PASTORAL TAB ─────────────────────────────────────────────────
function PastoralTab({ users, departments, pastorMembers, role, profile, onReload }) {
  const [openPickerId, setOpenPickerId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const scopedUsers = useMemo(() => {
    if (role === 'dept_lead') return selectDepartmentUsers(users, profile?.department_id)
    if (role === 'pastor') {
      const members = selectPastorMembers(users, pastorMembers, profile?.id)
      return [...members, users.find(u => u.id === profile?.id)].filter(Boolean)
    }
    return users
  }, [users, pastorMembers, role, profile])

  const userById = useMemo(() => new Map(users.map(u => [u.id, u])), [users])
  const departmentById = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments])

  const pastors = scopedUsers.filter(u => u.role === 'pastor')
  const allMembers = scopedUsers.filter(u => u.role === 'member')

  const pastorCards = useMemo(() => {
    return pastors.map(pastor => {
      const myAssignments = pastorMembers.filter(a => a.pastor_id === pastor.id)
      const members = myAssignments.map(a => userById.get(a.member_id)).filter(Boolean)
      const assignedIds = new Set(members.map(m => m.id))
      const pickOptions = allMembers.filter(m => !assignedIds.has(m.id))
      return { pastor, members, pickOptions }
    })
  }, [pastors, allMembers, pastorMembers, userById])

  async function handleAssign(pastorId, memberId) {
    setSaving(true); setError('')
    try {
      await assignPastorMember(pastorId, memberId)
      await onReload()
    } catch (e) { setError(e.message) }
    finally { setSaving(false); setOpenPickerId(null) }
  }

  async function handleRemove(pastorId, memberId) {
    setSaving(true); setError('')
    try {
      await removePastorMember(pastorId, memberId)
      await onReload()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div>
      {error ? <div style={{ background: '#FEF0ED', border: '1px solid #F9C4B8', borderRadius: 10, padding: '9px 14px', marginBottom: 14, fontSize: 12.5, color: '#C94830' }}>{error}</div> : null}
      <div style={{ fontSize: 13, color: '#7A6F5E', marginBottom: 14 }}>Pastors and the members under their shepherding care.</div>
      {pastorCards.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E9E4D8', borderRadius: 14, padding: '48px 16px', textAlign: 'center', fontSize: 13, color: '#B0A696' }}>No pastors found in scope.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 13 }}>
          {pastorCards.map(({ pastor, members, pickOptions }) => (
            <div key={pastor.id} style={{ position: 'relative', background: '#fff', border: '1px solid #E9E4D8', borderRadius: 14, boxShadow: '0 1px 3px rgba(28,22,16,.05)', padding: '15px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 13 }}>
                <Avatar name={pastor.name} size={38} fontSize={12} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1C1610' }}>{pastor.name}</div>
                  <div style={{ fontSize: 11.5, color: '#7A6F5E' }}>Pastor · {departmentById.get(pastor.department_id)?.name ?? '—'}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: '#EDE8F8', color: '#4C2A92' }}>{members.length}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
                {members.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#B0A696', padding: '6px 0' }}>No members assigned yet.</div>
                ) : members.map(mb => (
                  <div key={mb.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: '#F9F7F3', border: '1px solid #F2EEE6', borderRadius: 9 }}>
                    <Avatar name={mb.name} size={26} fontSize={9.5} />
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: '#1C1610' }}>{mb.name}</span>
                    {(role === 'super_admin' || role === 'dept_lead') ? (
                      <button type="button" disabled={saving} onClick={() => handleRemove(pastor.id, mb.id)}
                        style={{ width: 20, height: 20, border: 'none', background: 'none', color: '#B0A696', cursor: 'pointer', fontSize: 12, lineHeight: 1, borderRadius: 999 }}>✕</button>
                    ) : null}
                  </div>
                ))}
              </div>

              {(role === 'super_admin' || role === 'dept_lead') ? (
                <>
                  <button type="button" onClick={() => setOpenPickerId(openPickerId === pastor.id ? null : pastor.id)}
                    style={{ width: '100%', border: '1px dashed #E0D9CB', background: 'transparent', borderRadius: 9, padding: 8, fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#9A8E7A', cursor: 'pointer' }}>
                    + Assign member
                  </button>
                  {openPickerId === pastor.id && pickOptions.length > 0 ? (
                    <div style={{ position: 'absolute', left: 16, right: 16, bottom: 54, zIndex: 7, background: '#fff', border: '1px solid #E9E4D8', borderRadius: 10, boxShadow: '0 8px 28px rgba(28,22,16,.16)', padding: 5, maxHeight: 220, overflowY: 'auto' }}>
                      {pickOptions.map(opt => (
                        <button key={opt.id} type="button" disabled={saving} onClick={() => handleAssign(pastor.id, opt.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', border: 'none', background: 'none', borderRadius: 7, padding: '7px 8px', cursor: 'pointer', fontFamily: 'inherit' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F9F7F3'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}>
                          <Avatar name={opt.name} size={24} fontSize={9} />
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1C1610' }}>{opt.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : openPickerId === pastor.id && pickOptions.length === 0 ? (
                    <div style={{ position: 'absolute', left: 16, right: 16, bottom: 54, zIndex: 7, background: '#fff', border: '1px solid #E9E4D8', borderRadius: 10, boxShadow: '0 8px 28px rgba(28,22,16,.16)', padding: '12px 14px', fontSize: 12, color: '#B0A696' }}>
                      All available members are already assigned.
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────────
export default function AllPeoplePage() {
  const { profile, role } = useAuth()
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [pastorMembers, setPastorMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const canSeeInvitations = role === 'super_admin' || role === 'dept_lead'
  const canSeePastoral = role === 'super_admin' || role === 'dept_lead' || role === 'pastor'

  const tabs = [
    { id: 'users',      label: 'Users' },
    ...(canSeeInvitations ? [{ id: 'invitations', label: 'Invitations' }] : []),
    ...(canSeePastoral   ? [{ id: 'pastoral',    label: 'Pastoral' }] : []),
  ]

  const [activeTab, setActiveTab] = useState('users')

  const loadData = async () => {
    setLoading(true); setError('')
    try {
      const [nextUsers, nextDepts, nextPastorMembers, nextInvitations] = await Promise.all([
        listUsers(),
        listDepartments(),
        listPastorMembers(),
        listInvitations().catch(() => []),
      ])
      setUsers(nextUsers)
      setDepartments(nextDepts)
      setPastorMembers(nextPastorMembers)
      setInvitations(nextInvitations)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [])

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: '#1C1610' }}>All People</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#7A6F5E' }}>Manage members, roles, invitations, and pastoral care across the organization.</p>
        </div>
      </div>

      {error ? (
        <div style={{ background: '#FEF0ED', border: '1px solid #F9C4B8', borderRadius: 10, padding: '9px 14px', marginBottom: 14, fontSize: 12.5, color: '#C94830' }}>{error}</div>
      ) : null}

      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #E9E4D8', marginBottom: 20 }}>
        {tabs.map(tab => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                border: 'none', background: 'none', padding: '9px 16px',
                fontFamily: 'inherit', fontSize: 13,
                fontWeight: active ? 700 : 500,
                color: active ? '#1C1610' : '#7A6F5E',
                borderBottom: `2px solid ${active ? '#4C2A92' : 'transparent'}`,
                cursor: 'pointer', marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ padding: '48px 16px', textAlign: 'center', fontSize: 13, color: '#B0A696' }}>Loading…</div>
      ) : (
        <>
          {activeTab === 'users' ? (
            <UsersTab users={users} departments={departments} pastorMembers={pastorMembers} role={role} profile={profile} onReload={loadData} />
          ) : null}
          {activeTab === 'invitations' && canSeeInvitations ? (
            <InvitationsTab invitations={invitations} departments={departments} role={role} profile={profile} onReload={loadData} />
          ) : null}
          {activeTab === 'pastoral' && canSeePastoral ? (
            <PastoralTab users={users} departments={departments} pastorMembers={pastorMembers} role={role} profile={profile} onReload={loadData} />
          ) : null}
        </>
      )}
    </div>
  )
}
