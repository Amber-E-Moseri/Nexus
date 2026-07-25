import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useToast } from '../../context/ToastContext'

const inputStyle = {
  width: '100%',
  fontSize: 13.5,
  padding: '9px 11px',
  border: '1px solid var(--border-1)',
  borderRadius: 8,
  outline: 'none',
  background: 'var(--surface-card)',
  color: 'var(--ink-1)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--ink-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 6,
}

const fieldStyle = { marginBottom: 16 }

export default function OrgChartEntryEditForm({ kind, entry, onSave, onCancel }) {
  const { showToast } = useToast()
  const [title, setTitle] = useState(entry.title ?? '')
  const [sub, setSub] = useState(entry.sub ?? '')
  const [code, setCode] = useState(entry.code ?? '')
  const [label, setLabel] = useState(entry.label ?? '')
  const [flowCaption, setFlowCaption] = useState(entry.flowCaption ?? entry.flow_caption ?? '')
  const [details, setDetails] = useState(entry.details?.length ? entry.details : [''])
  const [isSaving, setIsSaving] = useState(false)

  function updateDetail(idx, value) {
    setDetails((current) => current.map((d, i) => (i === idx ? value : d)))
  }
  function addDetail() {
    setDetails((current) => [...current, ''])
  }
  function removeDetail(idx) {
    setDetails((current) => current.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setIsSaving(true)
    const cleanedDetails = details.map((d) => d.trim()).filter(Boolean)
    try {
      if (kind === 'node') {
        await onSave({ title: title.trim(), sub: sub.trim(), code: code.trim(), flow_caption: flowCaption.trim(), details: cleanedDetails })
      } else {
        await onSave({ label: label.trim(), details: cleanedDetails })
      }
      showToast('Saved', { tone: 'success' })
    } catch (err) {
      showToast(err.message || 'Failed to save — try again', { tone: 'error' })
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {kind === 'node' ? (
        <>
          <div style={fieldStyle}>
            <label style={labelStyle}>Code</label>
            <input style={inputStyle} value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Title</label>
            <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Subtitle</label>
            <input style={inputStyle} value={sub} onChange={(e) => setSub(e.target.value)} />
          </div>
          {entry.flow ? (
            <div style={fieldStyle}>
              <label style={labelStyle}>Flow Caption</label>
              <input style={inputStyle} value={flowCaption} onChange={(e) => setFlowCaption(e.target.value)} />
            </div>
          ) : null}
        </>
      ) : (
        <div style={fieldStyle}>
          <label style={labelStyle}>Label</label>
          <input style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
      )}

      <div style={fieldStyle}>
        <label style={labelStyle}>Details</label>
        {details.map((d, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <textarea
              value={d}
              onChange={(e) => updateDetail(idx, e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', flex: 1 }}
            />
            <button
              type="button"
              onClick={() => removeDetail(idx)}
              aria-label="Remove paragraph"
              style={{ background: 'var(--bg-app)', border: '1px solid var(--border-1)', borderRadius: 8, color: 'var(--ink-3)', cursor: 'pointer', width: 32, height: 32, flexShrink: 0 }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addDetail}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--purple-700)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0' }}
        >
          <Plus size={14} /> Add paragraph
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button
          type="submit"
          disabled={isSaving}
          style={{
            flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
            background: 'var(--purple-700)', color: '#fff', cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.6 : 1,
          }}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          style={{
            flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border-1)', fontSize: 13, fontWeight: 700,
            background: 'var(--surface-card)', color: 'var(--ink-1)', cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.6 : 1,
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
