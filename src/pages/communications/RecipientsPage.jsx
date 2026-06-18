import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useWindowWidth } from '../../hooks/useWindowWidth'
import { supabase } from '../../lib/supabase'

const PRIMARY = '#4C2A92'
const BORDER  = '#EDE8DC'
const TEXT    = '#2D2A22'
const MUTED   = '#9E9488'
const BG      = '#F4F1EA'
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

export default function RecipientsPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const windowWidth = useWindowWidth()
  const isMobile = windowWidth <= 768
  const [tab, setTab] = useState('all') // 'all' | 'suppressed'
  const [profiles, setProfiles] = useState([])
  const [suppressedRows, setSuppressedRows] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterSubscribed, setFilterSubscribed] = useState('')
  const [selectedRows, setSelectedRows] = useState(new Set())
  const [selectAll, setSelectAll] = useState(false)

  async function loadData() {
    setLoading(true)
    const [profilesRes, deptsRes, suppressedRes] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, department_id, role').order('full_name'),
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('communication_unsubscribes').select('id, profile_id, reason, created_at').then((res) => {
        if (!res.error && res.data) {
          return supabase.from('profiles').select('id, email, full_name').in('id', res.data.map((r) => r.profile_id)).then((profileRes) => {
            return res.data.map((sup) => ({
              ...sup,
              profile: profileRes.data?.find((p) => p.id === sup.profile_id),
            }))
          })
        }
        return Promise.resolve([])
      }),
    ])
    setProfiles(profilesRes.data ?? [])
    setDepartments(deptsRes.data ?? [])
    setSuppressedRows(await suppressedRes)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Get suppressed profile IDs
  const suppressedIds = useMemo(() => new Set(suppressedRows.map((r) => r.profile_id)), [suppressedRows])

  // Filter profiles for "All Members" tab
  const filteredProfiles = useMemo(() => {
    let result = profiles

    // Filter by subscription status
    if (filterSubscribed === 'subscribed') {
      result = result.filter((p) => !suppressedIds.has(p.id))
    } else if (filterSubscribed === 'suppressed') {
      result = result.filter((p) => suppressedIds.has(p.id))
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
  }, [profiles, suppressedIds, filterDept, filterSubscribed, searchText])

  async function handleSuppress(profileId) {
    await supabase.from('communication_unsubscribes').insert({
      profile_id: profileId,
      reason: 'manual_admin',
    })
    await loadData()
  }

  async function handleReactivate(profileId) {
    await supabase.from('communication_unsubscribes').delete().eq('profile_id', profileId)
    await loadData()
  }

  async function handleSuppressSelected() {
    const toSuppress = Array.from(selectedRows)
    for (const profileId of toSuppress) {
      await supabase.from('communication_unsubscribes').insert({
        profile_id: profileId,
        reason: 'manual_admin',
      })
    }
    setSelectedRows(new Set())
    setSelectAll(false)
    await loadData()
  }

  async function handleReactivateSelected() {
    const toReactivate = Array.from(selectedRows)
    await supabase.from('communication_unsubscribes').delete().in('profile_id', toReactivate)
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
        r.profile?.email ?? '',
        reasonMap[r.reason] ?? r.reason ?? '',
        r.created_at ? new Date(r.created_at).toLocaleString() : '',
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
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Recipients Management</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>Manage email subscribers and suppression list.</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${BORDER}` }}>
          <button
            type="button"
            onClick={() => setTab('all')}
            style={{
              border: 'none',
              background: 'transparent',
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: tab === 'all' ? 700 : 500,
              color: tab === 'all' ? PRIMARY : MUTED,
              borderBottom: tab === 'all' ? `3px solid ${PRIMARY}` : 'none',
              cursor: 'pointer',
              marginBottom: '-2px',
            }}
          >
            All Members
          </button>
          <button
            type="button"
            onClick={() => setTab('suppressed')}
            style={{
              border: 'none',
              background: 'transparent',
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: tab === 'suppressed' ? 700 : 500,
              color: tab === 'suppressed' ? PRIMARY : MUTED,
              borderBottom: tab === 'suppressed' ? `3px solid ${PRIMARY}` : 'none',
              cursor: 'pointer',
              marginBottom: '-2px',
            }}
          >
            Suppressed
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px', background: BG }}>
        {loading ? (
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
                {filteredProfiles.map((profile) => {
                  const isSelected = selectedRows.has(profile.id)
                  const isSuppressed = suppressedIds.has(profile.id)
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
                          <button type="button" onClick={() => handleReactivate(profile.id)} style={{ flex: 1, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: '#2D8653', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            Reactivate
                          </button>
                        ) : (
                          <button type="button" onClick={() => handleSuppress(profile.id)} style={{ flex: 1, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: '#C94830', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
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
                    {filteredProfiles.map((profile) => {
                      const isSelected = selectedRows.has(profile.id)
                      const isSuppressed = suppressedIds.has(profile.id)
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
                              <button type="button" onClick={() => handleReactivate(profile.id)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: '#2D8653', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                Reactivate
                              </button>
                            ) : (
                              <button type="button" onClick={() => handleSuppress(profile.id)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: '#C94830', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
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
                        <td style={{ padding: '12px 14px', color: TEXT, fontSize: 13, fontWeight: 600 }}>{row.profile?.full_name || '—'}</td>
                        <td style={{ padding: '12px 14px', color: TEXT, fontSize: 13 }}>{row.profile?.email}</td>
                        <td style={{ padding: '12px 14px', color: MUTED, fontSize: 13 }}>{reasonMap[row.reason] ?? row.reason ?? '—'}</td>
                        <td style={{ padding: '12px 14px', color: MUTED, fontSize: 13 }}>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <button type="button" onClick={() => handleReactivate(row.profile_id)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: '#2D8653', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
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
