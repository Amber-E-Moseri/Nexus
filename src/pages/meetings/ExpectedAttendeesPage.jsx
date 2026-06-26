import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

const CATEGORY_LIST = [
  'Bible Study Class Teacher',
  'Cell Leader',
  'Coordinator',
  'Leader',
  'Leader in Training',
  'Leaders In Training',
  'Pastor',
  'Sub-Group Pastor',
]

const INPUT = {
  border: '1px solid #EDE8DC',
  borderRadius: 8,
  padding: '8px 11px',
  fontSize: 13,
  color: '#2D2A22',
  background: 'white',
  fontFamily: 'inherit',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const TH = {
  padding: '9px 12px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: '#9E9488',
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  whiteSpace: 'nowrap',
  background: '#F9F7F3',
  borderBottom: '1px solid #EDE8DC',
}

const TD = {
  padding: '10px 12px',
  fontSize: 13,
  color: '#2D2A22',
  verticalAlign: 'middle',
  borderBottom: '1px solid #F5F2EC',
}

function splitCSVLine(line) {
  const cells = []
  let cur = ''
  let inQ = false
  for (const c of line) {
    if (c === '"') inQ = !inQ
    else if (c === ',' && !inQ) {
      cells.push(cur.trim())
      cur = ''
    } else cur += c
  }
  cells.push(cur.trim())
  return cells
}

function parseImportCSV(text) {
  const lines = text.split(/\r?\n/)
  if (!lines.length) return { rows: [], errors: ['Empty file'] }

  const rawHeaders = splitCSVLine(lines[0]).map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase())
  const idx = {
    full_name: rawHeaders.findIndex((h) => h === 'fullname' || h === 'full name' || h === 'full_name' || h === 'name'),
    subgroup: rawHeaders.findIndex((h) => h === 'subgroup'),
    leadership_category: rawHeaders.findIndex((h) => h.includes('leadership') || h.includes('category')),
    email: rawHeaders.findIndex((h) => h === 'email'),
    active: rawHeaders.findIndex((h) => h === 'active'),
  }

  if (idx.full_name === -1) return { rows: [], errors: ['Could not find a "Full Name" or "FullName" column.'] }

  const rows = []
  const errors = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cells = splitCSVLine(line)
    const fullName = idx.full_name >= 0 ? (cells[idx.full_name] ?? '').replace(/^"|"$/g, '').trim() : ''
    if (!fullName) continue

    const activeRaw = idx.active >= 0 ? (cells[idx.active] ?? '').replace(/^"|"$/g, '').trim().toLowerCase() : 'true'
    rows.push({
      full_name: fullName,
      subgroup: idx.subgroup >= 0 ? (cells[idx.subgroup] ?? '').replace(/^"|"$/g, '').trim() : '',
      leadership_category: idx.leadership_category >= 0 ? (cells[idx.leadership_category] ?? '').replace(/^"|"$/g, '').trim() : '',
      email: idx.email >= 0 ? (cells[idx.email] ?? '').replace(/^"|"$/g, '').trim() : '',
      active: activeRaw !== 'false' && activeRaw !== '0' && activeRaw !== 'no',
    })
  }

  return { rows, errors }
}

function normalizeAliasKey(name) {
  return (name ?? '').toLowerCase().trim()
}

function isSelectableSubgroup(subgroup) {
  return typeof subgroup === 'string' && subgroup.trim() !== '' && subgroup.trim() !== 'Unassigned'
}

function displaySubgroup(subgroup) {
  return isSelectableSubgroup(subgroup) ? subgroup.trim() : null
}

function ActiveToggle({ active, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onChange}
      disabled={disabled}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        border: 'none',
        background: active ? '#4C2A92' : '#D1CBC0',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        padding: 0,
        transition: 'background .15s',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          display: 'block',
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: 'white',
          position: 'absolute',
          top: 3,
          left: active ? 19 : 3,
          transition: 'left .15s',
          boxShadow: '0 1px 3px rgba(0,0,0,.2)',
        }}
      />
    </button>
  )
}

function RowForm({ initial, subgroupOptions, onSave, onCancel, saving, isNew }) {
  const [f, setF] = useState({
    full_name: '',
    subgroup: '',
    leadership_category: '',
    active: true,
    aliases: [],
    ...initial,
  })

  const matchKeyPreview = f.full_name.toLowerCase().trim()

  function set(key, val) {
    setF((prev) => ({ ...prev, [key]: val }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!f.full_name.trim()) return
    onSave({
      ...f,
      aliases: (f.aliases ?? [])
        .map((alias, index) => ({
          id: alias.id ?? `new-${index}`,
          alias_name: alias.alias_name?.trim() ?? '',
        }))
        .filter((alias) => alias.alias_name),
    })
  }

  return (
    <tr style={{ background: '#F4F0FC' }}>
      <td colSpan={5} style={{ padding: '12px 14px', borderBottom: '1px solid #C4B8E8' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9E9488', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Full Name <span style={{ color: '#C94830' }}>*</span>
              </label>
              <input
                style={INPUT}
                value={f.full_name}
                onChange={(e) => set('full_name', e.target.value)}
                placeholder="Jane Smith"
                required
                autoFocus={isNew}
              />
              {matchKeyPreview && (
                <div style={{ marginTop: 3, fontSize: 11, color: '#9E9488', fontFamily: 'monospace' }}>{matchKeyPreview}</div>
              )}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9E9488', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Subgroup
              </label>
              <input
                style={INPUT}
                list="sg-options"
                value={f.subgroup}
                onChange={(e) => set('subgroup', e.target.value)}
                placeholder="e.g. Central East Subgroup A"
              />
              <datalist id="sg-options">
                {(subgroupOptions ?? []).map((subgroup) => <option key={subgroup} value={subgroup} />)}
              </datalist>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9E9488', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Leadership Category
              </label>
              <input
                style={INPUT}
                list="cat-options"
                value={f.leadership_category}
                onChange={(e) => set('leadership_category', e.target.value)}
                placeholder="e.g. Cell Leader"
              />
              <datalist id="cat-options">
                {CATEGORY_LIST.map((category) => <option key={category} value={category} />)}
              </datalist>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9E9488', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Email
              </label>
              <input
                style={INPUT}
                type="email"
                value={f.email ?? ''}
                onChange={(e) => set('email', e.target.value)}
                placeholder="jane@example.com"
              />
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9E9488', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Also known as:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(f.aliases ?? []).map((alias, index) => (
                <div key={alias.id ?? index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    style={INPUT}
                    value={alias.alias_name ?? ''}
                    onChange={(e) => set('aliases', (f.aliases ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, alias_name: e.target.value } : item))}
                    placeholder="Alias name"
                  />
                  <button
                    type="button"
                    onClick={() => set('aliases', (f.aliases ?? []).filter((_, itemIndex) => itemIndex !== index))}
                    style={{ border: '1px solid #EDE8DC', background: 'white', color: '#C94830', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    X
                  </button>
                </div>
              ))}
              {!!(f.aliases ?? []).filter((alias) => alias.alias_name?.trim()).length && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(f.aliases ?? []).filter((alias) => alias.alias_name?.trim()).map((alias, index) => (
                    <span key={`${alias.id ?? 'alias'}-${index}`} style={{ display: 'inline-flex', alignItems: 'center', background: '#F4F1EA', color: '#6B6560', borderRadius: 999, padding: '3px 9px', fontSize: 11.5 }}>
                      {alias.alias_name.trim()}
                    </span>
                  ))}
                </div>
              )}
              <div>
                <button
                  type="button"
                  onClick={() => set('aliases', [...(f.aliases ?? []), { alias_name: '' }])}
                  style={{ border: '1px solid #EDE8DC', background: 'white', color: '#4C2A92', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                >
                  + Add alias
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
              <ActiveToggle active={f.active} onChange={() => set('active', !f.active)} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#2D2A22' }}>Active</span>
            </label>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={onCancel}
                style={{ border: '1px solid #EDE8DC', background: 'white', color: '#9E9488', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !f.full_name.trim()}
                style={{ border: 'none', background: '#4C2A92', color: 'white', borderRadius: 8, padding: '6px 16px', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </td>
    </tr>
  )
}

function ImportModal({ onImport, onClose, existingMatchKeys }) {
  const [preview, setPreview] = useState(null)
  const [parseErrors, setParseErrors] = useState([])
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  function handleFile(file) {
    if (!file?.name.toLowerCase().endsWith('.csv')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const { rows, errors } = parseImportCSV(e.target.result)
      setPreview(rows)
      setParseErrors(errors)
      setImportError(null)
      setImportResult(null)
    }
    reader.readAsText(file)
  }

  const newRows = useMemo(() => {
    if (!preview) return []
    return preview.filter((row) => !existingMatchKeys.has(row.full_name.toLowerCase().trim()))
  }, [preview, existingMatchKeys])

  const skipCount = preview ? preview.length - newRows.length : 0

  async function handleConfirm() {
    if (!newRows.length) return
    setImporting(true)
    setImportError(null)
    try {
      await onImport(newRows)
      setImportResult({ inserted: newRows.length, skipped: skipCount })
      setPreview(null)
    } catch (err) {
      setImportError(err.message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,30,.30)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 8px 32px rgba(28,22,16,.18)', width: '100%', maxWidth: 640, padding: '24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#2D2A22' }}>Import from CSV</div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, color: '#B0A696', cursor: 'pointer', lineHeight: 1 }}>X</button>
        </div>
        <div style={{ fontSize: 12, color: '#9E9488' }}>
          Expected columns: <code style={{ background: '#F4F1EA', padding: '1px 5px', borderRadius: 4 }}>Subgroup, FullName (or Full Name), Leadership Category, Active</code>
          <br />Rows with empty Full Name are skipped. Existing records (same match_key) are skipped.
        </div>

        {importResult ? (
          <div style={{ background: '#EEF6F1', border: '1px solid #C3E0CC', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#2D8653' }}>Import complete</div>
            <div style={{ fontSize: 13, color: '#2D8653', marginTop: 4 }}>
              {importResult.inserted} added | {importResult.skipped} skipped (already existed)
            </div>
            <button type="button" onClick={onClose} style={{ marginTop: 12, border: 'none', background: '#4C2A92', color: 'white', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Done
            </button>
          </div>
        ) : !preview ? (
          <>
            <label
              style={{ display: 'block', border: `1.5px dashed ${dragging ? '#4C2A92' : '#D8D3C9'}`, borderRadius: 12, background: dragging ? '#F0EBFC' : '#FAFAF7', padding: '32px 20px', textAlign: 'center', cursor: 'pointer', transition: 'border-color .15s, background .15s' }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
            >
              <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files[0])} />
              <div style={{ fontSize: 26, marginBottom: 8 }}>CSV</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#4C2A92' }}>Drop CSV or click to browse</div>
            </label>
            {parseErrors.map((err, index) => (
              <div key={index} style={{ fontSize: 12, color: '#C94830', background: '#FEF0ED', borderRadius: 8, padding: '8px 12px' }}>{err}</div>
            ))}
          </>
        ) : (
          <>
            {parseErrors.length > 0 && (
              <div style={{ background: '#FEF0ED', border: '1px solid #F5C4B8', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#C94830' }}>
                <strong>Warnings:</strong>
                <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                  {parseErrors.map((err, index) => <li key={index}>{err}</li>)}
                </ul>
              </div>
            )}
            <div style={{ fontSize: 13, color: '#2D2A22' }}>
              <strong>{preview.length}</strong> rows parsed | <strong style={{ color: '#2D8653' }}>{newRows.length}</strong> will be added | <strong style={{ color: '#9E9488' }}>{skipCount}</strong> already exist (skipped)
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #EDE8DC', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Full Name', 'Subgroup', 'Category', 'Active', 'Status'].map((header) => (
                      <th key={header} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, color: '#9E9488', borderBottom: '1px solid #EDE8DC', background: '#F9F7F3', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, index) => {
                    const isExisting = existingMatchKeys.has(row.full_name.toLowerCase().trim())
                    return (
                      <tr key={index} style={{ background: isExisting ? '#F9F7F3' : 'white' }}>
                        <td style={{ padding: '6px 10px', color: isExisting ? '#9E9488' : '#2D2A22', fontWeight: 600 }}>{row.full_name}</td>
                        <td style={{ padding: '6px 10px', color: '#9E9488' }}>{displaySubgroup(row.subgroup) || '-'}</td>
                        <td style={{ padding: '6px 10px', color: '#9E9488' }}>{row.leadership_category || '-'}</td>
                        <td style={{ padding: '6px 10px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: row.active ? '#EEF6F1' : '#F4F1EA', color: row.active ? '#2D8653' : '#9E9488' }}>
                            {row.active ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: isExisting ? '#9E9488' : '#2D8653' }}>
                            {isExisting ? 'Skip' : 'New'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {importError && <div style={{ fontSize: 12, color: '#C94830', background: '#FEF0ED', borderRadius: 8, padding: '8px 12px' }}>{importError}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setPreview(null)} style={{ border: '1px solid #EDE8DC', background: 'white', color: '#9E9488', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Choose different file
              </button>
              <button type="button" onClick={onClose} style={{ border: '1px solid #EDE8DC', background: 'white', color: '#9E9488', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" onClick={handleConfirm} disabled={importing || !newRows.length} style={{ border: 'none', background: '#4C2A92', color: 'white', borderRadius: 8, padding: '7px 18px', fontSize: 13, fontWeight: 700, cursor: importing || !newRows.length ? 'not-allowed' : 'pointer', opacity: importing || !newRows.length ? 0.55 : 1 }}>
                {importing ? 'Importing...' : `Import ${newRows.length} rows`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function ExpectedAttendeesPage() {
  const { profile, role } = useAuth()
  const navigate = useNavigate()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [search, setSearch] = useState('')
  const [filterSubgroup, setFilterSubgroup] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [sortCol, setSortCol] = useState('subgroup')
  const [sortDir, setSortDir] = useState('asc')

  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [showAddRow, setShowAddRow] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [globalError, setGlobalError] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('expected_attendees')
      .select('id, full_name, match_key, subgroup, leadership_category, active, created_at, aliases:expected_attendee_aliases(id, alias_name)')
      .order('subgroup')
      .order('full_name')
    if (err) setError(err.message)
    else setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const channel = supabase
      .channel('expected_attendees_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expected_attendees' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expected_attendee_aliases' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const subgroupOptions = useMemo(
    () => [...new Set(
      rows
        .map((row) => row.subgroup)
        .filter((subgroup) => subgroup && subgroup.trim() !== '' && subgroup !== 'Unassigned'),
    )].sort(),
    [rows],
  )
  const categoryOptions = useMemo(() => [...new Set(rows.map((row) => row.leadership_category).filter(Boolean))].sort(), [rows])
  const existingMatchKeys = useMemo(() => new Set(rows.map((row) => row.match_key ?? row.full_name.toLowerCase().trim())), [rows])

  const filtered = useMemo(() => {
    const query = search.toLowerCase()
    return rows.filter((row) => {
      const subgroup = row.subgroup ?? ''
      const aliasText = (row.aliases ?? []).map((alias) => alias.alias_name).join(' ').toLowerCase()
      if (activeOnly && !row.active) return false
      if (filterSubgroup && row.subgroup !== filterSubgroup) return false
      if (filterCategory && row.leadership_category !== filterCategory) return false
      if (query && !row.full_name.toLowerCase().includes(query) && !subgroup.toLowerCase().includes(query) && !aliasText.includes(query)) return false
      return true
    })
  }, [rows, search, filterSubgroup, filterCategory, activeOnly])

  function handleSortClick(col) {
    if (col === sortCol) setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
    else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      let primary
      if (sortCol === 'active') {
        primary = (b.active === a.active ? 0 : b.active ? 1 : -1) * dir
      } else {
        const av = (a[sortCol] ?? '').toLowerCase()
        const bv = (b[sortCol] ?? '').toLowerCase()
        primary = av < bv ? -dir : av > bv ? dir : 0
      }
      if (primary !== 0) return primary
      return (a.full_name ?? '').toLowerCase().localeCompare((b.full_name ?? '').toLowerCase())
    })
  }, [filtered, sortCol, sortDir])

  async function syncAliases(expectedAttendeeId, nextAliases, previousAliases = []) {
    const trimmedNext = (nextAliases ?? [])
      .map((alias) => ({ id: alias.id, alias_name: alias.alias_name?.trim() ?? '' }))
      .filter((alias) => alias.alias_name)

    const previousById = new Map((previousAliases ?? []).filter((alias) => alias.id).map((alias) => [alias.id, alias]))
    const nextIds = new Set(trimmedNext.filter((alias) => alias.id && !String(alias.id).startsWith('new-')).map((alias) => alias.id))
    const removedIds = [...previousById.keys()].filter((id) => !nextIds.has(id))

    if (removedIds.length > 0) {
      const { error } = await supabase.from('expected_attendee_aliases').delete().in('id', removedIds)
      if (error) throw new Error(error.message)
    }

    const upsertPayload = trimmedNext.map((alias) => ({
      ...(alias.id && !String(alias.id).startsWith('new-') ? { id: alias.id } : {}),
      expected_attendee_id: expectedAttendeeId,
      alias_name: alias.alias_name,
      created_by: profile?.id ?? null,
    }))

    if (upsertPayload.length > 0) {
      const { error } = await supabase.from('expected_attendee_aliases').upsert(upsertPayload)
      if (error) throw new Error(error.message)
    }
  }

  async function handleSaveNew(fields) {
    setSavingId('__new__')
    setGlobalError(null)
    try {
      const { aliases = [], ...personFields } = fields
      const { data, error: err } = await supabase
        .from('expected_attendees')
        .insert({ ...personFields, created_by: profile?.id ?? null })
        .select()
        .single()
      if (err) throw new Error(err.message)
      await syncAliases(data.id, aliases, [])
      await load()
      setShowAddRow(false)
    } catch (err) {
      setGlobalError(err.message)
    } finally {
      setSavingId(null)
    }
  }

  async function handleSaveEdit(id, fields) {
    setSavingId(id)
    setGlobalError(null)
    try {
      const previousAliases = rows.find((row) => row.id === id)?.aliases ?? []
      const { aliases = [], ...personFields } = fields
      const { error: err } = await supabase
        .from('expected_attendees')
        .update({
          full_name: personFields.full_name,
          subgroup: personFields.subgroup,
          leadership_category: personFields.leadership_category,
          active: personFields.active,
        })
        .eq('id', id)
      if (err) throw new Error(err.message)
      await syncAliases(id, aliases, previousAliases)
      await load()
      setEditingId(null)
    } catch (err) {
      setGlobalError(err.message)
    } finally {
      setSavingId(null)
    }
  }

  async function handleToggleActive(row) {
    setSavingId(row.id)
    const { error: err } = await supabase
      .from('expected_attendees')
      .update({ active: !row.active })
      .eq('id', row.id)
    if (err) setGlobalError(err.message)
    else setRows((prev) => prev.map((item) => item.id === row.id ? { ...item, active: !item.active } : item))
    setSavingId(null)
  }

  async function handleDelete(id) {
    setSavingId(id)
    const { error: err } = await supabase.from('expected_attendees').delete().eq('id', id)
    if (err) setGlobalError(err.message)
    else {
      setRows((prev) => prev.filter((row) => row.id !== id))
      setDeletingId(null)
    }
    setSavingId(null)
  }

  async function handleImport(newRows) {
    const payload = newRows.map((row) => ({ ...row, created_by: profile?.id ?? null }))
    const { error: err } = await supabase
      .from('expected_attendees')
      .upsert(payload, { onConflict: 'match_key', ignoreDuplicates: true })
    if (err) throw new Error(err.message)
    await load()
  }

  const SELECT_STYLE = {
    border: '1px solid #EDE8DC',
    borderRadius: 9,
    padding: '8px 11px',
    fontSize: 13,
    color: '#2D2A22',
    background: 'white',
    fontFamily: 'inherit',
    cursor: 'pointer',
    outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 24px 0', background: 'white', borderBottom: '1px solid #EDE8DC', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button type="button" onClick={() => navigate('/meetings')} style={{ border: 'none', background: 'none', color: '#9E9488', cursor: 'pointer', fontSize: 13, padding: 0 }}>
            {'<-'} Meetings
          </button>
          <span style={{ color: '#D8D3C9' }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#2D2A22' }}>Expected Attendees Roster</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', paddingBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#2D2A22' }}>Expected Attendees</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#9E9488' }}>
              Global roster of leaders expected at sessions | {rows.filter((row) => row.active).length} active
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setShowImport(true)} style={{ border: '1px solid #EDE8DC', background: 'white', color: '#4C2A92', borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Import CSV
            </button>
            <button type="button" onClick={() => { setShowAddRow(true); setEditingId(null); setDeletingId(null) }} style={{ border: 'none', background: '#4C2A92', color: 'white', borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              + Add Person
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 24px', background: '#F9F7F3', borderBottom: '1px solid #EDE8DC', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, subgroup, or alias..."
          style={{ ...SELECT_STYLE, minWidth: 220, flex: '1 1 220px' }}
        />
        <select value={filterSubgroup} onChange={(e) => setFilterSubgroup(e.target.value)} style={SELECT_STYLE}>
          <option value="">All subgroups</option>
          {subgroupOptions.map((subgroup) => <option key={subgroup} value={subgroup}>{subgroup}</option>)}
        </select>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={SELECT_STYLE}>
          <option value="">All categories</option>
          {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
          <ActiveToggle active={activeOnly} onChange={() => setActiveOnly((value) => !value)} />
          <span style={{ fontSize: 13, color: '#2D2A22', fontWeight: 500 }}>Active only</span>
        </label>
        <span style={{ fontSize: 12, color: '#9E9488', marginLeft: 'auto' }}>{filtered.length} shown</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {globalError && (
          <div style={{ marginBottom: 12, fontSize: 12.5, color: '#C94830', background: '#FEF0ED', border: '1px solid #F5C4B8', borderRadius: 10, padding: '10px 14px' }}>
            {globalError}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#9E9488', fontSize: 13 }}>Loading roster...</div>
        ) : error ? (
          <div style={{ padding: '24px', color: '#C94830', fontSize: 13 }}>{error}</div>
        ) : (
          <div style={{ border: '1px solid #EDE8DC', borderRadius: 14, overflow: 'hidden', background: 'white' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr>
                  {[
                    { col: 'subgroup', label: 'Subgroup' },
                    { col: 'full_name', label: 'Full Name' },
                    { col: 'leadership_category', label: 'Leadership Category' },
                    { col: 'active', label: 'Active', center: true },
                  ].map(({ col, label, center }) => {
                    const isActive = sortCol === col
                    const indicator = isActive ? (sortDir === 'asc' ? ' ^' : ' v') : null
                    return (
                      <th
                        key={col}
                        onClick={() => handleSortClick(col)}
                        style={{
                          ...TH,
                          textAlign: center ? 'center' : 'left',
                          cursor: 'pointer',
                          userSelect: 'none',
                          color: isActive ? '#4C2A92' : TH.color,
                          whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#4C2A92' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = isActive ? '#4C2A92' : TH.color }}
                      >
                        {label}
                        {isActive ? <span style={{ marginLeft: 4 }}>{indicator}</span> : <span style={{ marginLeft: 4, color: '#C8BFB2' }}>::</span>}
                      </th>
                    )
                  })}
                  <th style={{ ...TH, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {showAddRow && (
                  <RowForm
                    isNew
                    subgroupOptions={subgroupOptions}
                    onSave={handleSaveNew}
                    onCancel={() => setShowAddRow(false)}
                    saving={savingId === '__new__'}
                  />
                )}

                {filtered.length === 0 && !showAddRow && (
                  <tr>
                    <td colSpan={5} style={{ padding: '36px', textAlign: 'center', color: '#9E9488', fontSize: 13 }}>
                      No records match the current filters.
                    </td>
                  </tr>
                )}

                {sorted.map((row) => {
                  if (editingId === row.id) {
                    return (
                      <RowForm
                        key={row.id}
                        initial={row}
                        subgroupOptions={subgroupOptions}
                        onSave={(fields) => handleSaveEdit(row.id, fields)}
                        onCancel={() => setEditingId(null)}
                        saving={savingId === row.id}
                      />
                    )
                  }

                  if (deletingId === row.id) {
                    return (
                      <tr key={row.id} style={{ background: '#FEF0ED' }}>
                        <td colSpan={5} style={{ padding: '10px 14px', borderBottom: '1px solid #F5C4B8' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontSize: 13, color: '#C94830', fontWeight: 600 }}>
                              Delete <strong>{row.full_name}</strong>? This cannot be undone.
                            </span>
                            <button type="button" onClick={() => handleDelete(row.id)} disabled={savingId === row.id} style={{ border: 'none', background: '#C94830', color: 'white', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                              {savingId === row.id ? '...' : 'Delete'}
                            </button>
                            <button type="button" onClick={() => setDeletingId(null)} style={{ border: '1px solid #EDE8DC', background: 'white', color: '#9E9488', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr
                      key={row.id}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#FAFAF7' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
                    >
                      <td style={{ ...TD, color: '#9E9488', fontSize: 12 }}>{displaySubgroup(row.subgroup) || <span style={{ color: '#D8D3C9' }}>-</span>}</td>
                      <td style={TD}>
                        <div style={{ fontWeight: 600 }}>{row.full_name}</div>
                        {!!(row.aliases ?? []).length && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            <span style={{ fontSize: 11, color: '#9E9488' }}>also:</span>
                            {(row.aliases ?? []).map((alias) => (
                              <span key={alias.id} style={{ display: 'inline-flex', alignItems: 'center', background: '#F4F1EA', color: '#6B6560', borderRadius: 999, padding: '2px 7px', fontSize: 10.5 }}>
                                {alias.alias_name}
                              </span>
                            ))}
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: '#B0A696', fontFamily: 'monospace', marginTop: 2 }}>{row.match_key}</div>
                      </td>
                      <td style={{ ...TD, color: '#9E9488', fontSize: 12 }}>{row.leadership_category || <span style={{ color: '#D8D3C9' }}>-</span>}</td>
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <ActiveToggle active={row.active} onChange={() => handleToggleActive(row)} disabled={savingId === row.id} />
                      </td>
                      <td style={{ ...TD, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button type="button" title="Edit" onClick={() => { setEditingId(row.id); setDeletingId(null); setShowAddRow(false) }} style={{ border: '1px solid #EDE8DC', background: 'white', color: '#4C2A92', borderRadius: 7, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            Edit
                          </button>
                          <button type="button" title="Delete" onClick={() => { setDeletingId(row.id); setEditingId(null) }} style={{ border: '1px solid #EDE8DC', background: 'white', color: '#C94830', borderRadius: 7, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showImport && (
        <ImportModal
          onImport={handleImport}
          onClose={() => setShowImport(false)}
          existingMatchKeys={existingMatchKeys}
        />
      )}
    </div>
  )
}

function rowSorter(a, b) {
  const subgroupCompare = (a.subgroup ?? '').localeCompare(b.subgroup ?? '')
  if (subgroupCompare !== 0) return subgroupCompare
  return (a.full_name ?? '').localeCompare(b.full_name ?? '')
}
