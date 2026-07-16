import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useWindowWidth } from '../../hooks/useWindowWidth'
import { supabase } from '../../lib/supabase'
import { FONT_HEADING } from '../../lib/fonts'

const PRIMARY = 'var(--purple-700)'
const BORDER  = 'var(--border-1)'
const TEXT    = 'var(--ink-1)'
const MUTED   = 'var(--ink-3)'
const BG      = 'var(--surface-sub)'
const SURFACE = '#FFFFFF'

function Modal({ title, wide, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(14,14,30,0.45)', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: wide ? 800 : 560, background: '#FFFFFF', borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 64px rgba(14,14,30,0.22)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>{title}</div>
          <button type="button" onClick={onClose} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: MUTED, borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>
            Close
          </button>
        </div>
        <div style={{ padding: 20, maxHeight: '80vh', overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function TagManagementPanel() {
  const { profile } = useAuth()
  const [tags, setTags] = useState([])
  const [personTags, setPersonTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#4C2A92')
  const [editingTag, setEditingTag] = useState(null)
  const [addMemberTagId, setAddMemberTagId] = useState(null)
  const [addEmail, setAddEmail] = useState('')
  const [addName, setAddName] = useState('')

  async function load() {
    setLoading(true)
    const [tagsRes, ptRes] = await Promise.all([
      supabase.from('communication_tags').select('id, name, color, created_at').order('name'),
      supabase.from('communication_person_tags').select('id, tag_id, email, person_name'),
    ])
    setTags(tagsRes.data ?? [])
    setPersonTags(ptRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCreateTag() {
    if (!newTagName.trim()) return
    await supabase.from('communication_tags').insert({ name: newTagName.trim(), color: newTagColor, created_by: profile?.id })
    setNewTagName('')
    setNewTagColor('#4C2A92')
    await load()
  }

  async function handleDeleteTag(id) {
    await supabase.from('communication_tags').delete().eq('id', id)
    await load()
  }

  async function handleAddMember() {
    if (!addEmail.trim() || !addMemberTagId) return
    await supabase.from('communication_person_tags').insert({ tag_id: addMemberTagId, email: addEmail.trim().toLowerCase(), person_name: addName.trim() || null })
    setAddEmail('')
    setAddName('')
    await load()
  }

  async function handleRemoveMember(ptId) {
    await supabase.from('communication_person_tags').delete().eq('id', ptId)
    await load()
  }

  if (loading) return <div style={{ padding: 24, color: MUTED, fontSize: 13 }}>Loading...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', marginBottom: 4 }}>New tag</label>
          <input value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="e.g. Youth, Choir, Ushers" style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' }} />
        </div>
        <input type="color" value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)} style={{ width: 36, height: 36, border: `1px solid ${BORDER}`, borderRadius: 8, cursor: 'pointer', padding: 2 }} />
        <button type="button" onClick={handleCreateTag} disabled={!newTagName.trim()} style={{ border: 'none', background: PRIMARY, color: '#FFFFFF', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: newTagName.trim() ? 1 : 0.5 }}>
          Create Tag
        </button>
      </div>

      {tags.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: MUTED, fontSize: 13 }}>No tags yet. Create one above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tags.map((tag) => {
            const members = personTags.filter((pt) => pt.tag_id === tag.id)
            const isAdding = addMemberTagId === tag.id
            return (
              <div key={tag.id} style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${BORDER}` }}>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: TEXT, flex: 1 }}>{tag.name}</span>
                  <span style={{ fontSize: 12, color: MUTED }}>{members.length} member{members.length !== 1 ? 's' : ''}</span>
                  <button type="button" onClick={() => setAddMemberTagId(isAdding ? null : tag.id)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: PRIMARY, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    {isAdding ? 'Cancel' : '+ Add'}
                  </button>
                  <button type="button" onClick={() => handleDeleteTag(tag.id)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: 'var(--coral-dark, #C94830)', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    Delete
                  </button>
                </div>
                {isAdding ? (
                  <div style={{ display: 'flex', gap: 8, padding: '10px 16px', background: BG, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Name" style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, outline: 'none', flex: 1, minWidth: 120 }} />
                    <input value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="Email" style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, outline: 'none', flex: 1, minWidth: 160 }} />
                    <button type="button" onClick={handleAddMember} disabled={!addEmail.trim()} style={{ border: 'none', background: PRIMARY, color: '#FFFFFF', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: addEmail.trim() ? 1 : 0.5 }}>
                      Add
                    </button>
                  </div>
                ) : null}
                {members.length > 0 ? (
                  <div style={{ padding: '6px 16px 10px' }}>
                    {members.map((pt) => (
                      <div key={pt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13, color: TEXT }}>
                        <span style={{ flex: 1 }}>{pt.person_name ?? pt.email}</span>
                        <span style={{ fontSize: 12, color: MUTED }}>{pt.email}</span>
                        <button type="button" onClick={() => handleRemoveMember(pt.id)} style={{ border: 'none', background: 'none', color: 'var(--coral-dark, #C94830)', fontSize: 14, cursor: 'pointer', padding: '2px 6px' }}>×</button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SubGroupManagementPanel() {
  const { profile } = useAuth()
  const [subGroups, setSubGroups] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6B7280')
  const [addMemberSgId, setAddMemberSgId] = useState(null)
  const [addEmail, setAddEmail] = useState('')
  const [addName, setAddName] = useState('')

  async function load() {
    setLoading(true)
    const [sgRes, memRes] = await Promise.all([
      supabase.from('communication_sub_groups').select('id, name, description, color, created_at').order('name'),
      supabase.from('communication_sub_group_members').select('id, sub_group_id, email, person_name'),
    ])
    setSubGroups(sgRes.data ?? [])
    setMembers(memRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    await supabase.from('communication_sub_groups').insert({ name: newName.trim(), color: newColor, created_by: profile?.id })
    setNewName('')
    setNewColor('#6B7280')
    await load()
  }

  async function handleDelete(id) {
    await supabase.from('communication_sub_groups').delete().eq('id', id)
    await load()
  }

  async function handleAddMember() {
    if (!addEmail.trim() || !addMemberSgId) return
    await supabase.from('communication_sub_group_members').insert({ sub_group_id: addMemberSgId, email: addEmail.trim().toLowerCase(), person_name: addName.trim() || null })
    setAddEmail('')
    setAddName('')
    await load()
  }

  async function handleRemoveMember(memId) {
    await supabase.from('communication_sub_group_members').delete().eq('id', memId)
    await load()
  }

  if (loading) return <div style={{ padding: 24, color: MUTED, fontSize: 13 }}>Loading...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', marginBottom: 4 }}>New sub-group</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Central East, Youth Group" style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' }} />
        </div>
        <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} style={{ width: 36, height: 36, border: `1px solid ${BORDER}`, borderRadius: 8, cursor: 'pointer', padding: 2 }} />
        <button type="button" onClick={handleCreate} disabled={!newName.trim()} style={{ border: 'none', background: PRIMARY, color: '#FFFFFF', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: newName.trim() ? 1 : 0.5 }}>
          Create Sub-group
        </button>
      </div>

      {subGroups.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: MUTED, fontSize: 13 }}>No sub-groups yet. Create one above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {subGroups.map((sg) => {
            const sgMembers = members.filter((m) => m.sub_group_id === sg.id)
            const isAdding = addMemberSgId === sg.id
            return (
              <div key={sg.id} style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${BORDER}` }}>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: sg.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: TEXT, flex: 1 }}>{sg.name}</span>
                  <span style={{ fontSize: 12, color: MUTED }}>{sgMembers.length} member{sgMembers.length !== 1 ? 's' : ''}</span>
                  <button type="button" onClick={() => setAddMemberSgId(isAdding ? null : sg.id)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: PRIMARY, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    {isAdding ? 'Cancel' : '+ Add'}
                  </button>
                  <button type="button" onClick={() => handleDelete(sg.id)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: 'var(--coral-dark, #C94830)', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    Delete
                  </button>
                </div>
                {isAdding ? (
                  <div style={{ display: 'flex', gap: 8, padding: '10px 16px', background: BG, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Name" style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, outline: 'none', flex: 1, minWidth: 120 }} />
                    <input value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="Email" style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, outline: 'none', flex: 1, minWidth: 160 }} />
                    <button type="button" onClick={handleAddMember} disabled={!addEmail.trim()} style={{ border: 'none', background: PRIMARY, color: '#FFFFFF', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: addEmail.trim() ? 1 : 0.5 }}>
                      Add
                    </button>
                  </div>
                ) : null}
                {sgMembers.length > 0 ? (
                  <div style={{ padding: '6px 16px 10px' }}>
                    {sgMembers.map((m) => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13, color: TEXT }}>
                        <span style={{ flex: 1 }}>{m.person_name ?? m.email}</span>
                        <span style={{ fontSize: 12, color: MUTED }}>{m.email}</span>
                        <button type="button" onClick={() => handleRemoveMember(m.id)} style={{ border: 'none', background: 'none', color: 'var(--coral-dark, #C94830)', fontSize: 14, cursor: 'pointer', padding: '2px 6px' }}>×</button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LeadershipRolesPanel() {
  const { profile } = useAuth()
  const [roles, setRoles] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#E8A020')
  const [addMemberRoleId, setAddMemberRoleId] = useState(null)
  const [addEmail, setAddEmail] = useState('')
  const [addName, setAddName] = useState('')

  async function load() {
    setLoading(true)
    const [rolesRes, memRes] = await Promise.all([
      supabase.from('communication_leadership_roles').select('id, name, description, color, created_at').order('name'),
      supabase.from('communication_leadership_role_members').select('id, leadership_role_id, email, person_name'),
    ])
    setRoles(rolesRes.data ?? [])
    setMembers(memRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    await supabase.from('communication_leadership_roles').insert({ name: newName.trim(), color: newColor, created_by: profile?.id })
    setNewName('')
    setNewColor('#E8A020')
    await load()
  }

  async function handleDelete(id) {
    await supabase.from('communication_leadership_roles').delete().eq('id', id)
    await load()
  }

  async function handleAddMember() {
    if (!addEmail.trim() || !addMemberRoleId) return
    await supabase.from('communication_leadership_role_members').insert({ leadership_role_id: addMemberRoleId, email: addEmail.trim().toLowerCase(), person_name: addName.trim() || null })
    setAddEmail('')
    setAddName('')
    await load()
  }

  async function handleRemoveMember(memId) {
    await supabase.from('communication_leadership_role_members').delete().eq('id', memId)
    await load()
  }

  if (loading) return <div style={{ padding: 24, color: MUTED, fontSize: 13 }}>Loading...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', marginBottom: 4 }}>New leadership responsibility</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Cell Leader, Deacon, Usher Lead" style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' }} />
        </div>
        <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} style={{ width: 36, height: 36, border: `1px solid ${BORDER}`, borderRadius: 8, cursor: 'pointer', padding: 2 }} />
        <button type="button" onClick={handleCreate} disabled={!newName.trim()} style={{ border: 'none', background: PRIMARY, color: '#FFFFFF', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: newName.trim() ? 1 : 0.5 }}>
          Create Role
        </button>
      </div>

      {roles.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: MUTED, fontSize: 13 }}>No leadership responsibilities yet. Create one above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {roles.map((role) => {
            const roleMembers = members.filter((m) => m.leadership_role_id === role.id)
            const isAdding = addMemberRoleId === role.id
            return (
              <div key={role.id} style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${BORDER}` }}>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: role.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: TEXT, flex: 1 }}>{role.name}</span>
                  <span style={{ fontSize: 12, color: MUTED }}>{roleMembers.length} member{roleMembers.length !== 1 ? 's' : ''}</span>
                  <button type="button" onClick={() => setAddMemberRoleId(isAdding ? null : role.id)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: PRIMARY, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    {isAdding ? 'Cancel' : '+ Add'}
                  </button>
                  <button type="button" onClick={() => handleDelete(role.id)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: 'var(--coral-dark, #C94830)', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    Delete
                  </button>
                </div>
                {isAdding ? (
                  <div style={{ display: 'flex', gap: 8, padding: '10px 16px', background: BG, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Name" style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, outline: 'none', flex: 1, minWidth: 120 }} />
                    <input value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="Email" style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, outline: 'none', flex: 1, minWidth: 160 }} />
                    <button type="button" onClick={handleAddMember} disabled={!addEmail.trim()} style={{ border: 'none', background: PRIMARY, color: '#FFFFFF', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: addEmail.trim() ? 1 : 0.5 }}>
                      Add
                    </button>
                  </div>
                ) : null}
                {roleMembers.length > 0 ? (
                  <div style={{ padding: '6px 16px 10px' }}>
                    {roleMembers.map((m) => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13, color: TEXT }}>
                        <span style={{ flex: 1 }}>{m.person_name ?? m.email}</span>
                        <span style={{ fontSize: 12, color: MUTED }}>{m.email}</span>
                        <button type="button" onClick={() => handleRemoveMember(m.id)} style={{ border: 'none', background: 'none', color: 'var(--coral-dark, #C94830)', fontSize: 14, cursor: 'pointer', padding: '2px 6px' }}>×</button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function RecipientsPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const windowWidth = useWindowWidth()
  const isMobile = windowWidth <= 768
  const [tab, setTab] = useState('all') // 'all' | 'suppressed' | 'tags' | 'subgroups' | 'leadership'
  const [profiles, setProfiles] = useState([])
  const [suppressedRows, setSuppressedRows] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterSubscribed, setFilterSubscribed] = useState('')
  const [selectedRows, setSelectedRows] = useState(new Set())
  const [selectAll, setSelectAll] = useState(false)
  const RECIPIENT_WINDOW = 100
  const [visibleCount, setVisibleCount] = useState(RECIPIENT_WINDOW)

  async function loadData() {
    setLoading(true)
    // "profiles" doesn't exist on this schema (the real table is "users"),
    // and communication_unsubscribes is keyed by email — not profile_id — and
    // carries its own full_name/email/unsubscribed_at directly, so no join
    // back to users is needed for the suppressed list.
    const [profilesRes, deptsRes, suppressedRes] = await Promise.all([
      supabase.from('users').select('id, email, full_name:name, department_id, role').order('name'),
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('communication_unsubscribes').select('id, email, full_name, reason, unsubscribed_at').order('unsubscribed_at', { ascending: false }),
    ])
    setProfiles(profilesRes.data ?? [])
    setDepartments(deptsRes.data ?? [])
    setSuppressedRows(suppressedRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // communication_unsubscribes is keyed by email, not a user id
  const suppressedEmails = useMemo(() => new Set(suppressedRows.map((r) => r.email)), [suppressedRows])

  // Filter profiles for "All Members" tab
  const filteredProfiles = useMemo(() => {
    let result = profiles

    // Filter by subscription status
    if (filterSubscribed === 'subscribed') {
      result = result.filter((p) => !suppressedEmails.has(p.email))
    } else if (filterSubscribed === 'suppressed') {
      result = result.filter((p) => suppressedEmails.has(p.email))
    }

    // Filter by department
    if (filterDept) {
      result = result.filter((p) => p.department_id === filterDept)
    }

    // Filter by search text
    if (searchText.trim()) {
      const query = searchText.toLowerCase()
      result = result.filter((p) =>
        (p.full_name?.toLowerCase().includes(query)) ||
        (p.email?.toLowerCase().includes(query))
      )
    }

    return result
  }, [profiles, suppressedEmails, filterDept, filterSubscribed, searchText])

  const visibleProfiles = useMemo(
    () => filteredProfiles.slice(0, visibleCount),
    [filteredProfiles, visibleCount],
  )

  // Changing any filter resets the window
  useEffect(() => {
    setVisibleCount(RECIPIENT_WINDOW)
  }, [filterDept, filterSubscribed, searchText, tab])

  // communication_unsubscribes is keyed by email, not a user id — takes the
  // whole profile so it can write email/full_name together.
  async function handleSuppress(profile) {
    await supabase.from('communication_unsubscribes').insert({
      email: profile.email,
      full_name: profile.full_name,
      reason: 'manual_admin',
    })
    await loadData()
  }

  async function handleReactivate(email) {
    await supabase.from('communication_unsubscribes').delete().eq('email', email)
    await loadData()
  }

  async function handleSuppressSelected() {
    const toSuppress = profiles.filter((p) => selectedRows.has(p.id))
    for (const profile of toSuppress) {
      await supabase.from('communication_unsubscribes').insert({
        email: profile.email,
        full_name: profile.full_name,
        reason: 'manual_admin',
      })
    }
    setSelectedRows(new Set())
    setSelectAll(false)
    await loadData()
  }

  async function handleReactivateSelected() {
    const emails = profiles.filter((p) => selectedRows.has(p.id)).map((p) => p.email)
    await supabase.from('communication_unsubscribes').delete().in('email', emails)
    setSelectedRows(new Set())
    setSelectAll(false)
    await loadData()
  }

  function handleSelectRow(profileId) {
    const newSelected = new Set(selectedRows)
    if (newSelected.has(profileId)) {
      newSelected.delete(profileId)
    } else {
      newSelected.add(profileId)
    }
    setSelectedRows(newSelected)
    setSelectAll(newSelected.size === filteredProfiles.length)
  }

  function handleSelectAll(checked) {
    setSelectAll(checked)
    if (checked) {
      setSelectedRows(new Set(filteredProfiles.map((p) => p.id)))
    } else {
      setSelectedRows(new Set())
    }
  }

  function handleExportSuppressed() {
    const rows = suppressedRows
    const headers = ['Email', 'Reason', 'Suppressed At']
    const reasonMap = {
      'unsubscribed': 'Unsubscribed (self)',
      'hard_bounce': 'Hard bounce',
      'manual_admin': 'Manually suppressed',
      'spam_complaint': 'Spam complaint',
    }

    const csvContent = [
      headers.join(','),
      ...rows.map((r) => [
        r.email ?? '',
        reasonMap[r.reason] ?? r.reason ?? '',
        r.unsubscribed_at ? new Date(r.unsubscribed_at).toLocaleString() : '',
      ].map((v) => `"${v.replace(/"/g, '""')}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `suppressed-recipients-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 24px 0', background: '#FFFFFF', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button type="button" onClick={() => navigate('/communications')} style={{ border: 'none', background: 'none', color: MUTED, cursor: 'pointer', fontSize: 13, padding: 0 }}>
            {'<-'} Communications
          </button>
          <span style={{ color: '#D8D3C9' }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Recipients</span>
        </div>
        <div style={{ marginBottom: 14 }}>
          <h1 style={{ fontFamily: FONT_HEADING, margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Recipients Management</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>Manage email subscribers and suppression list.</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${BORDER}`, overflowX: 'auto' }}>
          {[
            { key: 'all', label: 'All Members' },
            { key: 'tags', label: 'Tags' },
            { key: 'subgroups', label: 'Sub-groups' },
            { key: 'leadership', label: 'Leadership' },
            { key: 'suppressed', label: 'Suppressed' },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                border: 'none',
                background: 'transparent',
                padding: '12px 20px',
                fontSize: 14,
                fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? PRIMARY : MUTED,
                borderBottom: tab === t.key ? `3px solid ${PRIMARY}` : 'none',
                cursor: 'pointer',
                marginBottom: '-2px',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px', background: BG }}>
        {tab === 'tags' ? (
          <TagManagementPanel />
        ) : tab === 'subgroups' ? (
          <SubGroupManagementPanel />
        ) : tab === 'leadership' ? (
          <LeadershipRolesPanel />
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: MUTED, fontSize: 13 }}>Loading...</div>
        ) : tab === 'all' ? (
          <>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, minWidth: isMobile ? 'auto' : 200, outline: 'none', width: isMobile ? '100%' : 'auto' }}
              />
              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', flex: isMobile ? 1 : 'initial', width: isMobile ? '100%' : 'auto' }}
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <select
                value={filterSubscribed}
                onChange={(e) => setFilterSubscribed(e.target.value)}
                style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', flex: isMobile ? 1 : 'initial', width: isMobile ? '100%' : 'auto' }}
              >
                <option value="">All</option>
                <option value="subscribed">Subscribed only</option>
                <option value="suppressed">Suppressed only</option>
              </select>
            </div>

            {/* Bulk actions */}
            {selectedRows.size > 0 ? (
              <div style={{ background: '#EDE8F8', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 10 : 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: PRIMARY, textAlign: isMobile ? 'center' : 'left' }}>{selectedRows.size} selected</span>
                <div style={{ display: 'flex', gap: 8, flexDirection: isMobile ? 'column' : 'row' }}>
                  <button type="button" onClick={handleSuppressSelected} style={{ border: `1px solid ${PRIMARY}`, background: '#FFFFFF', color: PRIMARY, borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flex: isMobile ? 1 : 'initial' }}>
                    Suppress selected
                  </button>
                  <button type="button" onClick={handleReactivateSelected} style={{ border: `1px solid ${PRIMARY}`, background: PRIMARY, color: '#FFFFFF', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flex: isMobile ? 1 : 'initial' }}>
                    Reactivate selected
                  </button>
                </div>
              </div>
            ) : null}

            {/* Table / Card view */}
            {isMobile ? (
              // Mobile card-based layout
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={selectAll && filteredProfiles.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    style={{ cursor: 'pointer', width: 18, height: 18 }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>Select all</span>
                </div>
                {visibleProfiles.map((profile) => {
                  const isSelected = selectedRows.has(profile.id)
                  const isSuppressed = suppressedEmails.has(profile.email)
                  const dept = departments.find((d) => d.id === profile.department_id)

                  return (
                    <div key={profile.id} style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectRow(profile.id)}
                          style={{ cursor: 'pointer', marginTop: 2, width: 18, height: 18 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 2 }}>{profile.full_name || '—'}</div>
                          <div style={{ fontSize: 12, color: TEXT, wordBreak: 'break-word', marginBottom: 6 }}>{profile.email}</div>
                          <div style={{ fontSize: 12, color: MUTED }}>
                            {dept?.name ?? '—'} · {profile.role ?? '—'}
                          </div>
                        </div>
                        <div style={{ fontSize: 18, flexShrink: 0 }}>
                          {isSuppressed ? '🚫' : '✅'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {isSuppressed ? (
                          <button type="button" onClick={() => handleReactivate(profile.email)} style={{ flex: 1, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: '#2D8653', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            Reactivate
                          </button>
                        ) : (
                          <button type="button" onClick={() => handleSuppress(profile)} style={{ flex: 1, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: 'var(--coral-dark)', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            Suppress
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {filteredProfiles.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', color: MUTED, fontSize: 13 }}>No members found.</div>
                )}
                {filteredProfiles.length > visibleProfiles.length && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((count) => count + RECIPIENT_WINDOW)}
                    style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: TEXT, borderRadius: 8, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Show more ({visibleProfiles.length} of {filteredProfiles.length})
                  </button>
                )}
              </div>
            ) : (
              // Desktop table layout
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#FFFFFF', borderRadius: 14, overflow: 'hidden' }}>
                  <thead>
                    <tr style={{ background: BG }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.07em', borderBottom: `1px solid ${BORDER}` }}>
                        <input
                          type="checkbox"
                          checked={selectAll && filteredProfiles.length > 0}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                      </th>
                      {['Name', 'Email', 'Department', 'Role', 'Subscribed', 'Actions'].map((h) => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.07em', borderBottom: `1px solid ${BORDER}` }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProfiles.map((profile) => {
                      const isSelected = selectedRows.has(profile.id)
                      const isSuppressed = suppressedEmails.has(profile.email)
                      const dept = departments.find((d) => d.id === profile.department_id)

                      return (
                        <tr key={profile.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                          <td style={{ padding: '12px 14px' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleSelectRow(profile.id)}
                              style={{ cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '12px 14px', color: TEXT, fontSize: 13, fontWeight: 600 }}>{profile.full_name || '—'}</td>
                          <td style={{ padding: '12px 14px', color: TEXT, fontSize: 13 }}>{profile.email}</td>
                          <td style={{ padding: '12px 14px', color: MUTED, fontSize: 13 }}>{dept?.name ?? '—'}</td>
                          <td style={{ padding: '12px 14px', color: MUTED, fontSize: 13, textTransform: 'capitalize' }}>{profile.role ?? '—'}</td>
                          <td style={{ padding: '12px 14px', fontSize: 13 }}>
                            <span style={{ fontSize: 16 }}>{isSuppressed ? '🚫' : '✅'}</span>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            {isSuppressed ? (
                              <button type="button" onClick={() => handleReactivate(profile.email)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: '#2D8653', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                Reactivate
                              </button>
                            ) : (
                              <button type="button" onClick={() => handleSuppress(profile)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: 'var(--coral-dark)', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                Suppress
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {filteredProfiles.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ padding: 20, textAlign: 'center', color: MUTED, fontSize: 13 }}>No members found.</td>
                      </tr>
                  ) : null}
                    {filteredProfiles.length > visibleProfiles.length ? (
                      <tr>
                        <td colSpan={7} style={{ padding: 14, textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setVisibleCount((count) => count + RECIPIENT_WINDOW)}
                            style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: TEXT, borderRadius: 8, padding: '7px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                          >
                            Show more ({visibleProfiles.length} of {filteredProfiles.length})
                          </button>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Export button */}
            <div style={{ marginBottom: 16, textAlign: 'right' }}>
              <button type="button" onClick={handleExportSuppressed} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: PRIMARY, borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                ↓ Export as CSV
              </button>
            </div>

            {/* Suppressed table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', background: '#FFFFFF', borderRadius: 14, overflow: 'hidden' }}>
                <thead>
                  <tr style={{ background: BG }}>
                    {['Name', 'Email', 'Reason', 'Suppressed At', 'Actions'].map((h) => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.07em', borderBottom: `1px solid ${BORDER}` }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {suppressedRows.map((row) => {
                    const reasonMap = {
                      'unsubscribed': 'Unsubscribed (self)',
                      'hard_bounce': 'Hard bounce',
                      'manual_admin': 'Manually suppressed',
                      'spam_complaint': 'Spam complaint',
                    }
                    return (
                      <tr key={row.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                        <td style={{ padding: '12px 14px', color: TEXT, fontSize: 13, fontWeight: 600 }}>{row.full_name || '—'}</td>
                        <td style={{ padding: '12px 14px', color: TEXT, fontSize: 13 }}>{row.email}</td>
                        <td style={{ padding: '12px 14px', color: MUTED, fontSize: 13 }}>{reasonMap[row.reason] ?? row.reason ?? '—'}</td>
                        <td style={{ padding: '12px 14px', color: MUTED, fontSize: 13 }}>{row.unsubscribed_at ? new Date(row.unsubscribed_at).toLocaleString() : '—'}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <button type="button" onClick={() => handleReactivate(row.email)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: '#2D8653', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                            Reactivate
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {suppressedRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 20, textAlign: 'center', color: MUTED, fontSize: 13 }}>No suppressed members.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
