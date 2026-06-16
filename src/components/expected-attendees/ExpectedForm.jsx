import { useEffect, useState } from 'react'

const LEADERSHIP_SUGGESTIONS = [
  'Bible Study Class Teacher',
  'Cell Leader',
  'Coordinator',
  'Leader',
  'Leader in Training',
  'Leaders In Training',
  'Pastor',
  'Sub-Group Pastor',
]

const FIELD = {
  border: '1px solid #E9E4F5',
  borderRadius: 8,
  padding: '8px 11px',
  fontSize: 13,
  color: '#171327',
  background: 'white',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  outline: 'none',
}

export default function ExpectedForm({ initial, subgroupOptions, onSave, onCancel, saving }) {
  const [fields, setFields] = useState({
    subgroup: '',
    first_name: '',
    last_name: '',
    leadership_category: '',
    active: true,
    ...initial,
  })

  useEffect(() => {
    if (initial) setFields({ subgroup: '', first_name: '', last_name: '', leadership_category: '', active: true, ...initial })
  }, [initial?.id])

  function set(key, value) {
    setFields((f) => ({ ...f, [key]: value }))
  }

  const previewFullName = `${fields.first_name.trim()} ${fields.last_name.trim()}`.trim()
  const previewMatchKey = previewFullName.toLowerCase()

  function handleSubmit(e) {
    e.preventDefault()
    if (!fields.first_name.trim() || !fields.last_name.trim()) return
    onSave(fields)
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#6E6885', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            First Name <span style={{ color: '#DC2626' }}>*</span>
          </label>
          <input
            style={FIELD}
            value={fields.first_name}
            onChange={(e) => set('first_name', e.target.value)}
            placeholder="Jane"
            required
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#6E6885', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Last Name <span style={{ color: '#DC2626' }}>*</span>
          </label>
          <input
            style={FIELD}
            value={fields.last_name}
            onChange={(e) => set('last_name', e.target.value)}
            placeholder="Smith"
            required
          />
        </div>
      </div>

      {previewFullName && (
        <div style={{ background: '#F7F5FB', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#6E6885', display: 'flex', gap: 16 }}>
          <span><strong style={{ color: '#171327' }}>Full name:</strong> {previewFullName}</span>
          <span><strong style={{ color: '#171327' }}>Match key:</strong> {previewMatchKey}</span>
        </div>
      )}

      <div>
        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#6E6885', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Subgroup
        </label>
        <input
          style={FIELD}
          list="subgroup-options"
          value={fields.subgroup}
          onChange={(e) => set('subgroup', e.target.value)}
          placeholder="e.g. Central East Subgroup A"
        />
        <datalist id="subgroup-options">
          {(subgroupOptions ?? []).map((s) => <option key={s} value={s} />)}
        </datalist>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#6E6885', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Leadership Category
        </label>
        <input
          style={FIELD}
          list="category-options"
          value={fields.leadership_category}
          onChange={(e) => set('leadership_category', e.target.value)}
          placeholder="e.g. Cell Leader"
        />
        <datalist id="category-options">
          {LEADERSHIP_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
        </datalist>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
        <span
          onClick={() => set('active', !fields.active)}
          style={{
            width: 36, height: 20, borderRadius: 10,
            background: fields.active ? '#4C2A92' : '#D1CBC0',
            position: 'relative', cursor: 'pointer', flexShrink: 0,
            transition: 'background .15s', display: 'inline-block',
          }}
        >
          <span style={{
            display: 'block', width: 14, height: 14, borderRadius: '50%',
            background: 'white', position: 'absolute', top: 3,
            left: fields.active ? 19 : 3, transition: 'left .15s',
            boxShadow: '0 1px 3px rgba(0,0,0,.2)',
          }} />
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#171327' }}>Active</span>
      </label>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{ border: '1px solid #E9E4F5', background: 'white', color: '#6E6885', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !fields.first_name.trim() || !fields.last_name.trim()}
          style={{
            border: 'none', background: '#4C2A92', color: 'white',
            borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
