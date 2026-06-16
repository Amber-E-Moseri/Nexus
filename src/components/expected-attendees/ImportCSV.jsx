import { useState } from 'react'

function parseActive(val) {
  if (val === null || val === undefined || val === '') return true
  const s = String(val).toLowerCase().trim()
  if (s === 'false' || s === '0' || s === 'no') return false
  return true
}

function parseCSVImport(text) {
  const lines = text.split(/\r?\n/)
  if (!lines.length) return { rows: [], errors: ['Empty file'] }

  const rawHeaders = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase())
  const colIdx = {
    subgroup: rawHeaders.findIndex((h) => h === 'subgroup'),
    first_name: rawHeaders.findIndex((h) => h === 'first name' || h === 'first_name'),
    last_name: rawHeaders.findIndex((h) => h === 'last name' || h === 'last_name'),
    leadership_category: rawHeaders.findIndex((h) => h.includes('leadership') || h.includes('category')),
    active: rawHeaders.findIndex((h) => h === 'active'),
  }

  const missingRequired = []
  if (colIdx.first_name === -1) missingRequired.push('"First Name"')
  if (colIdx.last_name === -1) missingRequired.push('"Last Name"')
  if (missingRequired.length) return { rows: [], errors: [`Missing required columns: ${missingRequired.join(', ')}`] }

  const rows = []
  const errors = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    const cells = splitCSVLine(line)
    const firstName = colIdx.first_name >= 0 ? (cells[colIdx.first_name] ?? '').trim() : ''
    const lastName = colIdx.last_name >= 0 ? (cells[colIdx.last_name] ?? '').trim() : ''

    if (!firstName && !lastName) continue

    if (!firstName || !lastName) {
      errors.push(`Row ${i + 1}: missing ${!firstName ? 'First Name' : 'Last Name'} — skipped`)
      continue
    }

    rows.push({
      subgroup: colIdx.subgroup >= 0 ? (cells[colIdx.subgroup] ?? '').trim() : '',
      first_name: firstName,
      last_name: lastName,
      leadership_category: colIdx.leadership_category >= 0 ? (cells[colIdx.leadership_category] ?? '').trim() : '',
      active: parseActive(colIdx.active >= 0 ? cells[colIdx.active] : undefined),
    })
  }

  return { rows, errors }
}

function splitCSVLine(line) {
  const cells = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQ = !inQ
    } else if (c === ',' && !inQ) {
      cells.push(cur.trim())
      cur = ''
    } else {
      cur += c
    }
  }
  cells.push(cur.trim())
  return cells
}

export default function ImportCSV({ onImport, onClose }) {
  const [preview, setPreview] = useState(null)
  const [parseErrors, setParseErrors] = useState([])
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(null)
  const [dragging, setDragging] = useState(false)

  function handleFile(file) {
    if (!file || !file.name.toLowerCase().endsWith('.csv')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const { rows, errors } = parseCSVImport(e.target.result)
      setPreview(rows)
      setParseErrors(errors)
      setImportError(null)
    }
    reader.readAsText(file)
  }

  async function handleConfirm() {
    if (!preview || !preview.length) return
    setImporting(true)
    setImportError(null)
    try {
      await onImport(preview)
      onClose()
    } catch (err) {
      setImportError(err.message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#171327', marginBottom: 4 }}>Import Expected Attendees</div>
        <div style={{ fontSize: 12, color: '#6E6885' }}>
          CSV format: <code style={{ background: '#F7F5FB', padding: '1px 5px', borderRadius: 4 }}>Subgroup, First Name, Last Name, Leadership Category, Active</code>
        </div>
      </div>

      {!preview ? (
        <label
          style={{
            display: 'block',
            border: `1.5px dashed ${dragging ? '#4C2A92' : '#C4BDE0'}`,
            borderRadius: 12,
            background: dragging ? '#EEE8FF' : '#F7F5FB',
            padding: '28px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'border-color .15s, background .15s',
          }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
        >
          <input type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files[0])} />
          <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#4C2A92' }}>Drop CSV file or click to browse</div>
          <div style={{ fontSize: 11.5, color: '#6E6885', marginTop: 4 }}>Existing records will be updated by match_key</div>
        </label>
      ) : (
        <>
          {parseErrors.length > 0 && (
            <div style={{ background: '#FCEBEB', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#DC2626' }}>
              <strong>Warnings ({parseErrors.length}):</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {parseErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          <div style={{ fontSize: 12, color: '#6E6885' }}>
            <strong style={{ color: '#171327' }}>{preview.length}</strong> rows ready to import
          </div>

          <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #E9E4F5', borderRadius: 10, fontSize: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F7F5FB', position: 'sticky', top: 0 }}>
                  {['Subgroup', 'First Name', 'Last Name', 'Category', 'Active'].map((h) => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, color: '#6E6885', borderBottom: '1px solid #E9E4F5', whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #F2EEF8' }}>
                    <td style={{ padding: '6px 10px', color: '#6E6885' }}>{r.subgroup || '—'}</td>
                    <td style={{ padding: '6px 10px', color: '#171327' }}>{r.first_name}</td>
                    <td style={{ padding: '6px 10px', color: '#171327' }}>{r.last_name}</td>
                    <td style={{ padding: '6px 10px', color: '#6E6885' }}>{r.leadership_category || '—'}</td>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: r.active ? '#E7F7EC' : '#F2EEE6', color: r.active ? '#16A34A' : '#7A6F5E' }}>
                        {r.active ? 'Yes' : 'No'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {importError && (
            <div style={{ background: '#FCEBEB', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626' }}>
              {importError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => { setPreview(null); setParseErrors([]) }}
              style={{ border: '1px solid #E9E4F5', background: 'white', color: '#6E6885', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Choose different file
            </button>
            <button type="button" onClick={onClose}
              style={{ border: '1px solid #E9E4F5', background: 'white', color: '#6E6885', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="button" onClick={handleConfirm} disabled={importing || !preview.length}
              style={{ border: 'none', background: '#4C2A92', color: 'white', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1 }}>
              {importing ? 'Importing…' : `Import ${preview.length} rows`}
            </button>
          </div>
        </>
      )}

      {!preview && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}
            style={{ border: '1px solid #E9E4F5', background: 'white', color: '#6E6885', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
