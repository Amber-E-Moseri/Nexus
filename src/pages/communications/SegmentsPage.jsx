import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useWindowWidth } from '../../hooks/useWindowWidth'
import { supabase } from '../../lib/supabase'
import SegmentBuilderAdvanced from '../../features/communications/components/SegmentBuilderAdvanced'
import { Eye, Edit2, Trash2 } from 'lucide-react'

const PRIMARY = '#4C2A92'
const BORDER  = '#EDE8DC'
const TEXT    = '#2D2A22'
const MUTED   = '#9E9488'
const BG      = '#F4F1EA'

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(14,14,30,0.45)', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 600, background: '#FFFFFF', borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 64px rgba(14,14,30,0.22)' }}>
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

export default function SegmentsPage() {
  const navigate   = useNavigate()
  const { profile } = useAuth()
  const windowWidth = useWindowWidth()
  const isMobile = windowWidth <= 768
  const [segments, setSegments]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [allData, setAllData]     = useState({ depts: [], roster: [], users: [] })
  const [dataLoaded, setDataLoaded] = useState(false)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [deleting, setDeleting]   = useState(null)
  const [saving, setSaving]       = useState(false)
  const [previewSegment, setPreviewSegment] = useState(null)
  const [previewRecipients, setPreviewRecipients] = useState([])
  const [previewLoading, setPreviewLoading] = useState(false)
  // form state for create/edit modal
  const [segName, setSegName]         = useState('')
  const [segDesc, setSegDesc]         = useState('')
  const [segConditions, setSegConditions] = useState([])
  const [segCount, setSegCount]       = useState(0)

  async function loadSegments() {
    setLoading(true)
    const { data } = await supabase
      .from('communication_segments')
      .select('id, name, description, filters, estimated_count, created_at')
      .order('created_at', { ascending: false })
    setSegments(data ?? [])
    setLoading(false)
  }

  async function loadAllData() {
    if (dataLoaded) return
    const [deptsRes, rosterRes, usersRes] = await Promise.all([
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('expected_attendees').select('id, full_name, email, subgroup, leadership_category').eq('active', true).not('email', 'is', null),
      supabase.from('users').select('id, name, email, role, department_id').order('name'),
    ])
    setAllData({ depts: deptsRes.data ?? [], roster: rosterRes.data ?? [], users: usersRes.data ?? [] })
    setDataLoaded(true)
  }

  useEffect(() => { loadSegments() }, [])

  async function openCreate() {
    await loadAllData()
    setEditing(null)
    setSegName('')
    setSegDesc('')
    setSegConditions([])
    setSegCount(0)
    setShowBuilder(true)
  }

  async function openEdit(segment) {
    await loadAllData()
    setEditing(segment)
    setSegName(segment.name ?? '')
    setSegDesc(segment.description ?? '')
    setSegConditions(segment.filters?.conditions ?? segment.filters ?? [])
    setSegCount(segment.estimated_count ?? 0)
    setShowBuilder(true)
  }

  async function handleSave() {
    if (!segName.trim()) return
    setSaving(true)
    const payload = {
      name: segName.trim(),
      description: segDesc.trim() || null,
      filters: { conditions: segConditions },
      estimated_count: segCount,
      created_by: profile?.id ?? null,
    }
    if (editing?.id) {
      await supabase.from('communication_segments').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('communication_segments').insert(payload)
    }
    setSaving(false)
    setShowBuilder(false)
    await loadSegments()
  }

  async function handleDelete(segment) {
    if (!window.confirm(`Delete segment "${segment.name}"?`)) return
    setDeleting(segment.id)
    await supabase.from('communication_segments').delete().eq('id', segment.id)
    await loadSegments()
    setDeleting(null)
  }

  async function handleRecalculate(segment) {
    // Re-fetch and update estimated_count (simplified: just reload)
    await loadSegments()
  }

  async function handlePreviewRecipients(segment) {
    setPreviewSegment(segment)
    setPreviewLoading(true)
    setPreviewRecipients([])

    // For now, just show the estimated count and load all profiles
    // In a real scenario, you'd resolve the segment filters against profiles
    const { data } = await supabase.from('profiles').select('id, full_name, email').order('full_name')
    setPreviewRecipients(data ?? [])
    setPreviewLoading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 24px 0', background: '#FFFFFF', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button type="button" onClick={() => navigate('/communications')} style={{ border: 'none', background: 'none', color: MUTED, cursor: 'pointer', fontSize: 13, padding: 0 }}>
            {'<-'} Communications
          </button>
          <span style={{ color: '#D8D3C9' }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Segments</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Saved Segments</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>Reusable recipient groups for campaigns.</p>
          </div>
          <button type="button" onClick={openCreate} style={{ border: 'none', background: PRIMARY, color: '#FFFFFF', borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            + New Segment
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px', background: BG }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: MUTED, fontSize: 13 }}>Loading...</div>
        ) : segments.length === 0 ? (
          <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 16, padding: '36px 24px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
            No segments yet. Create one to start targeting recipients.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {segments.map((seg) => (
              <div key={seg.id} style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 14, padding: isMobile ? 12 : '16px 18px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 12 : 14, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 800, color: TEXT }}>{seg.name}</div>
                  {seg.description ? <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{seg.description}</div> : null}
                  <div style={{ fontSize: 12, color: '#9E9488', marginTop: 4 }}>
                    ~{seg.estimated_count ?? 0} recipients
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
                  <button type="button" onClick={() => handlePreviewRecipients(seg)} style={{ flex: isMobile ? '1 1 calc(50% - 3px)' : 'initial', border: `1px solid ${BORDER}`, background: '#FFFFFF', color: PRIMARY, borderRadius: 8, padding: isMobile ? '6px 8px' : '6px 12px', fontSize: isMobile ? 11 : 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Eye size={isMobile ? 12 : 14} /> Preview
                  </button>
                  <button type="button" onClick={() => openEdit(seg)} style={{ flex: isMobile ? '1 1 calc(50% - 3px)' : 'initial', border: `1px solid ${BORDER}`, background: '#FFFFFF', color: PRIMARY, borderRadius: 8, padding: isMobile ? '6px 8px' : '6px 12px', fontSize: isMobile ? 11 : 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Edit2 size={isMobile ? 12 : 14} /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(seg)}
                    disabled={deleting === seg.id}
                    style={{ flex: isMobile ? '1 1 calc(50% - 3px)' : 'initial', border: `1px solid ${BORDER}`, background: '#FFFFFF', color: '#C94830', borderRadius: 8, padding: isMobile ? '6px 8px' : '6px 12px', fontSize: isMobile ? 11 : 12, fontWeight: 700, cursor: deleting === seg.id ? 'not-allowed' : 'pointer', opacity: deleting === seg.id ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                  >
                    <Trash2 size={isMobile ? 12 : 14} /> {deleting === seg.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showBuilder ? (
        <Modal title={editing ? `Edit: ${editing.name}` : 'New Segment'} onClose={() => setShowBuilder(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: TEXT }}>
              Segment name
              <input
                value={segName}
                onChange={(e) => setSegName(e.target.value)}
                placeholder="e.g. Subgroup Leaders"
                style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: TEXT }}>
              Description (optional)
              <input
                value={segDesc}
                onChange={(e) => setSegDesc(e.target.value)}
                placeholder="What is this segment for?"
                style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
              />
            </label>
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
              <SegmentBuilderAdvanced
                segment={{ filters: segConditions }}
                allData={allData}
                onChange={setSegConditions}
                onEstimate={setSegCount}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
              <button type="button" onClick={() => setShowBuilder(false)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: MUTED, borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !segName.trim()}
                style={{ border: 'none', background: PRIMARY, color: '#FFFFFF', borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: saving || !segName.trim() ? 'not-allowed' : 'pointer', opacity: saving || !segName.trim() ? 0.6 : 1 }}
              >
                {saving ? 'Saving...' : editing ? 'Update segment' : 'Save segment'}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {previewSegment ? (
        <Modal title={`${previewRecipients.length} recipients match this segment`} wide onClose={() => setPreviewSegment(null)}>
          {previewLoading ? (
            <div style={{ textAlign: 'center', padding: 24, color: MUTED, fontSize: 13 }}>Loading recipients...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: MUTED }}>
                {previewRecipients.length} recipients will receive a campaign using this segment.
              </div>
              <div style={{ overflowY: 'auto', maxHeight: 400 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: MUTED }}>Name</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: MUTED }}>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRecipients.map((r) => (
                      <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                        <td style={{ padding: '10px 12px', color: TEXT }}>{r.full_name || '—'}</td>
                        <td style={{ padding: '10px 12px', color: TEXT }}>{r.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>
      ) : null}
    </div>
  )
}
