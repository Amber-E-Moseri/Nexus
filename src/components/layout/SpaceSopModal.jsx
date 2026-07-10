import { BookOpen, ExternalLink, FileText, Globe, Link2, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { FONT_BODY, FONT_HEADING } from '../../lib/fonts'

const FILE_TYPE_OPTIONS = [
  { value: 'pdf',  label: 'PDF',      Icon: FileText },
  { value: 'doc',  label: 'Doc',      Icon: BookOpen },
  { value: 'html', label: 'HTML',     Icon: Globe },
  { value: 'link', label: 'Link',     Icon: Link2 },
]

export function sopIcon(fileType, size = 13) {
  const opt = FILE_TYPE_OPTIONS.find((o) => o.value === fileType)
  const Icon = opt?.Icon ?? Link2
  const color =
    fileType === 'pdf'  ? '#E05252' :
    fileType === 'doc'  ? '#2F6FEB' :
    fileType === 'html' ? '#159A78' :
    '#7A6F5E'
  return <Icon size={size} style={{ color, flexShrink: 0 }} />
}

const OVERLAY_STYLE = {
  position: 'fixed', inset: 0, zIndex: 200,
  background: 'rgba(28,22,16,0.36)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 24,
}

const MODAL_STYLE = {
  background: '#FFFFFF',
  borderRadius: 16,
  boxShadow: '0 20px 60px rgba(28,22,16,0.22)',
  width: '100%',
  maxWidth: 520,
  fontFamily: FONT_BODY,
  maxHeight: '85vh',
  display: 'flex',
  flexDirection: 'column',
}

const INPUT_STYLE = {
  width: '100%',
  border: '1px solid #D9D1C3',
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: 13,
  fontFamily: FONT_BODY,
  background: '#FAFAF8',
  boxSizing: 'border-box',
}

const BTN_PRIMARY = {
  background: '#4C2A92',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: FONT_BODY,
}

const BTN_GHOST = {
  background: 'transparent',
  color: '#7A6F5E',
  border: '1px solid #D9D1C3',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 12.5,
  cursor: 'pointer',
  fontFamily: FONT_BODY,
}

function emptyForm() {
  return { title: '', url: '', file_type: 'link' }
}

export default function SpaceSopModal({ spaceId, spaceName, onClose, userId }) {
  const [sops, setSops] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm())
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const titleRef = useRef(null)

  useEffect(() => {
    loadSops()
  }, [spaceId])

  useEffect(() => {
    if (editingId !== null) titleRef.current?.focus()
  }, [editingId])

  async function loadSops() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('space_sops')
      .select('*')
      .eq('space_id', spaceId)
      .order('sort_order')
    if (!err) setSops(data ?? [])
    setLoading(false)
  }

  function startAdd() {
    setEditingId('new')
    setForm(emptyForm())
    setError(null)
  }

  function startEdit(sop) {
    setEditingId(sop.id)
    setForm({ title: sop.title, url: sop.url, file_type: sop.file_type })
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(emptyForm())
    setError(null)
  }

  async function handleSave() {
    const title = form.title.trim()
    const url = form.url.trim()
    if (!title || !url) { setError('Title and URL are required.'); return }
    setSaving(true)
    setError(null)
    try {
      if (editingId === 'new') {
        const nextOrder = sops.length > 0 ? Math.max(...sops.map((s) => s.sort_order)) + 1 : 0
        const { error: err } = await supabase.from('space_sops').insert({
          space_id: spaceId,
          title,
          url,
          file_type: form.file_type,
          sort_order: nextOrder,
          created_by: userId,
        })
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('space_sops')
          .update({ title, url, file_type: form.file_type })
          .eq('id', editingId)
        if (err) throw err
      }
      setEditingId(null)
      setForm(emptyForm())
      await loadSops()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(sop) {
    if (!window.confirm(`Remove "${sop.title}" from SOPs?`)) return
    await supabase.from('space_sops').delete().eq('id', sop.id)
    await loadSops()
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div style={OVERLAY_STYLE} onMouseDown={handleOverlayClick}>
      <div style={MODAL_STYLE} role="dialog" aria-modal="true" aria-label={`SOPs — ${spaceName}`}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <BookOpen size={17} style={{ color: '#4C2A92', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1C1610', fontFamily: FONT_HEADING }}>
              SOPs
            </div>
            <div style={{ fontSize: 11, color: '#7A6F5E', marginTop: 1 }}>{spaceName}</div>
          </div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#7A6F5E', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 6 }}>
            <X size={16} />
          </button>
        </div>

        {/* SOP list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 8px' }}>
          {loading ? (
            <div style={{ color: '#B0A696', fontSize: 12, padding: '8px 0' }}>Loading…</div>
          ) : sops.length === 0 && editingId !== 'new' ? (
            <div style={{ color: '#B0A696', fontSize: 12, padding: '8px 0', fontStyle: 'italic' }}>
              No SOPs yet. Add one below.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sops.map((sop) => (
                <div key={sop.id}>
                  {editingId === sop.id ? (
                    <SopForm
                      form={form}
                      setForm={setForm}
                      onSave={handleSave}
                      onCancel={cancelEdit}
                      saving={saving}
                      error={error}
                      titleRef={titleRef}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid #EDE8DC', background: '#FAFAF8' }}>
                      {sopIcon(sop.file_type)}
                      <a
                        href={sop.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ flex: 1, fontSize: 13, color: '#1C1610', textDecoration: 'none', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {sop.title}
                      </a>
                      <ExternalLink size={12} style={{ color: '#B0A696', flexShrink: 0 }} />
                      <button type="button" onClick={() => startEdit(sop)} style={{ border: 'none', background: 'none', color: '#7A6F5E', cursor: 'pointer', fontSize: 11, padding: '2px 6px', borderRadius: 5 }}>Edit</button>
                      <button type="button" onClick={() => handleDelete(sop)} style={{ border: 'none', background: 'none', color: '#C0392B', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 5 }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add form */}
          {editingId === 'new' ? (
            <div style={{ marginTop: 10 }}>
              <SopForm
                form={form}
                setForm={setForm}
                onSave={handleSave}
                onCancel={cancelEdit}
                saving={saving}
                error={error}
                titleRef={titleRef}
              />
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px 20px', borderTop: '1px solid #EDE8DC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {editingId ? (
            <div />
          ) : (
            <button type="button" onClick={startAdd} style={{ ...BTN_GHOST, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={13} />
              Add SOP
            </button>
          )}
          <button type="button" onClick={onClose} style={BTN_PRIMARY}>Done</button>
        </div>
      </div>
    </div>
  )
}

function SopForm({ form, setForm, onSave, onCancel, saving, error, titleRef }) {
  return (
    <div style={{ border: '1.5px solid #C5B8F0', borderRadius: 10, padding: 14, background: '#F9F7FE' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          ref={titleRef}
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Title (e.g. Onboarding SOP)"
          style={{ ...INPUT_STYLE, flex: 1 }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSave() } if (e.key === 'Escape') onCancel() }}
        />
        <select
          value={form.file_type}
          onChange={(e) => setForm((f) => ({ ...f, file_type: e.target.value }))}
          style={{ ...INPUT_STYLE, width: 90, flex: 'none' }}
        >
          {FILE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <input
        value={form.url}
        onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
        placeholder="URL (https://…)"
        style={{ ...INPUT_STYLE, marginBottom: 10 }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSave() } if (e.key === 'Escape') onCancel() }}
      />
      {error ? <div style={{ fontSize: 11.5, color: '#C0392B', marginBottom: 8 }}>{error}</div> : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onSave} disabled={saving} style={{ ...BTN_PRIMARY, fontSize: 12 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} style={{ ...BTN_GHOST, fontSize: 12 }}>Cancel</button>
      </div>
    </div>
  )
}
