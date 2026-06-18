import { useState } from 'react'
import { X, AlertCircle, Check } from 'lucide-react'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateEmail(email) {
  return EMAIL_REGEX.test(email.trim())
}

function parseCSV(text) {
  const lines = text.trim().split('\n')
  if (lines.length === 0) return { headers: [], rows: [] }

  const headers = lines[0].split(',').map(h => h.trim())
  const rows = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim())
    return Object.fromEntries(headers.map((h, i) => [h, values[i] || '']))
  })

  return { headers, rows }
}

export default function CSVImporter({ templateTokenFields, onComplete }) {
  const [step, setStep] = useState('upload') // 'upload' | 'map' | 'preview' | 'importing' | 'done'
  const [file, setFile] = useState(null)
  const [rows, setRows] = useState([])
  const [columnMap, setColumnMap] = useState({})
  const [errors, setErrors] = useState([])
  const [importedRecipients, setImportedRecipients] = useState([])

  const requiredFields = ['email', 'name']
  const optionalFields = templateTokenFields?.map(f => f.key) || []
  const allFields = [...requiredFields, ...optionalFields]

  // STEP 1: Upload & Parse CSV
  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files?.[0]
    if (!uploadedFile) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target.result
        const { headers, rows: parsedRows } = parseCSV(text)

        if (parsedRows.length === 0) {
          setErrors(['No valid rows found in CSV'])
          return
        }

        setFile(uploadedFile.name)
        setRows(parsedRows)
        setColumnMap({})
        setErrors([])
        setStep('map')
      } catch (err) {
        setErrors([err.message])
      }
    }
    reader.readAsText(uploadedFile)
  }

  // STEP 2: Map CSV columns to template fields
  const csvColumns = rows.length > 0 ? Object.keys(rows[0]) : []

  const handleColumnMap = (csvCol, templateField) => {
    setColumnMap(prev => ({ ...prev, [templateField]: csvCol }))
  }

  const validateMapping = () => {
    const unmapped = requiredFields.filter(field => !columnMap[field])
    if (unmapped.length > 0) {
      setErrors([`Required fields not mapped: ${unmapped.join(', ')}`])
      return false
    }
    setErrors([])
    return true
  }

  // STEP 3: Preview mapped data
  const mappedRecipients = rows.map(row => ({
    email: row[columnMap.email]?.trim() || '',
    name: row[columnMap.name]?.trim() || '',
    custom_fields: Object.fromEntries(
      optionalFields
        .filter(field => columnMap[field])
        .map(field => [field, row[columnMap[field]]?.trim() || ''])
    )
  }))

  // Validate emails
  const validRecipients = mappedRecipients.filter(r => {
    return r.email && validateEmail(r.email) && r.name
  })

  const invalidCount = mappedRecipients.length - validRecipients.length

  // STEP 4: Import (just return data, parent handles DB)
  const handleImport = () => {
    setStep('importing')
    setTimeout(() => {
      setImportedRecipients(validRecipients)
      setStep('done')
      setTimeout(() => onComplete(validRecipients), 1500)
    }, 800)
  }

  // RENDER
  return (
    <div style={{ padding: '24px', background: '#F4F1EA', borderRadius: '8px' }}>
      {step === 'upload' && (
        <div>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>Upload Recipient List (CSV)</h3>
          <div
            style={{
              padding: '24px',
              border: '2px dashed #EDE8DC',
              borderRadius: '6px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#FFFFFF' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              id="csv-input"
            />
            <label htmlFor="csv-input" style={{ cursor: 'pointer', display: 'block' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '16px' }}>📁 Click to upload CSV</p>
              <p style={{ margin: '0', fontSize: '12px', color: MUTED }}>
                Required columns: <strong>email</strong>, <strong>name</strong><br />
                {optionalFields.length > 0 && `Optional: ${optionalFields.join(', ')}`}
              </p>
            </label>
          </div>
          {errors.length > 0 && (
            <div style={{ marginTop: '12px', background: '#fff3cd', padding: '12px', borderRadius: '4px' }}>
              {errors.map((err, idx) => (
                <p key={idx} style={{ margin: '0 0 4px 0', color: '#c94830', fontSize: '12px' }}>
                  ❌ {err}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'map' && (
        <div>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>Map Columns</h3>
          <p style={{ fontSize: '12px', color: MUTED, margin: '0 0 16px 0' }}>
            Match your CSV columns to the fields below:
          </p>

          <div style={{ background: '#ffffff', padding: '16px', borderRadius: '6px', marginBottom: '16px' }}>
            {allFields.map(field => {
              const isRequired = requiredFields.includes(field)
              return (
                <div key={field} style={{ marginBottom: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <label style={{ flex: 0, fontWeight: isRequired ? 600 : 400, minWidth: '100px', fontSize: '13px' }}>
                    {field} {isRequired && <span style={{ color: '#c94830' }}>*</span>}
                  </label>
                  <select
                    value={columnMap[field] || ''}
                    onChange={(e) => handleColumnMap(e.target.value, field)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      border: `1px solid ${columnMap[field] ? PRIMARY : BORDER}`,
                      borderRadius: '4px',
                      background: columnMap[field] ? '#F0EBE8' : '#ffffff',
                      fontSize: '13px',
                      fontFamily: 'inherit'
                    }}
                  >
                    <option value="">-- Select --</option>
                    {csvColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setStep('upload')}
              style={{
                padding: '8px 16px',
                border: `1px solid ${BORDER}`,
                background: '#ffffff',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '13px'
              }}
            >
              ← Back
            </button>
            <button
              onClick={() => validateMapping() && setStep('preview')}
              style={{
                padding: '8px 16px',
                background: PRIMARY,
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '13px'
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>Preview Recipients</h3>

          <div style={{
            display: 'flex',
            gap: '12px',
            marginBottom: '16px',
            fontSize: '13px'
          }}>
            <div style={{ flex: 1, background: '#ffffff', padding: '12px', borderRadius: '4px' }}>
              <div style={{ fontWeight: 600, color: '#28a745' }}>✓ Valid: {validRecipients.length}</div>
            </div>
            {invalidCount > 0 && (
              <div style={{ flex: 1, background: '#fff3cd', padding: '12px', borderRadius: '4px' }}>
                <div style={{ fontWeight: 600, color: '#c94830' }}>⚠ Invalid: {invalidCount}</div>
              </div>
            )}
          </div>

          <div style={{
            background: '#ffffff',
            borderRadius: '6px',
            overflow: 'auto',
            marginBottom: '16px',
            maxHeight: '300px'
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '12px'
            }}>
              <thead>
                <tr style={{ background: '#F4F1EA', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0 }}>
                  <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600, fontSize: '11px' }}>Email</th>
                  <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600, fontSize: '11px' }}>Name</th>
                  {optionalFields.map(field => (
                    <th key={field} style={{ padding: '8px', textAlign: 'left', fontWeight: 600, fontSize: '11px' }}>{field}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {validRecipients.slice(0, 10).map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <td style={{ padding: '8px' }}>{row.email}</td>
                    <td style={{ padding: '8px' }}>{row.name}</td>
                    {optionalFields.map(field => (
                      <td key={field} style={{ padding: '8px' }}>{row.custom_fields[field] || '-'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {validRecipients.length > 10 && (
            <p style={{ fontSize: '12px', color: MUTED, margin: '0 0 16px 0' }}>
              Showing 10 of {validRecipients.length} recipients...
            </p>
          )}

          {errors.length > 0 && (
            <div style={{ background: '#fff3cd', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>
              {errors.map((err, idx) => (
                <p key={idx} style={{ margin: '0 0 4px 0', color: '#c94830', fontSize: '12px' }}>❌ {err}</p>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setStep('map')}
              style={{
                padding: '8px 16px',
                border: `1px solid ${BORDER}`,
                background: '#ffffff',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '13px'
              }}
            >
              ← Back
            </button>
            <button
              onClick={handleImport}
              disabled={validRecipients.length === 0}
              style={{
                padding: '8px 16px',
                background: validRecipients.length > 0 ? PRIMARY : '#ccc',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: validRecipients.length > 0 ? 'pointer' : 'not-allowed',
                fontWeight: '500',
                fontSize: '13px'
              }}
            >
              Import {validRecipients.length} Recipients
            </button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <p style={{ fontSize: '16px', margin: '0 0 12px 0', fontWeight: 500 }}>⏳ Processing...</p>
          <div style={{
            height: '4px',
            background: '#EDE8DC',
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              background: PRIMARY,
              animation: 'pulse 1.5s infinite',
              width: '60%'
            }} />
          </div>
        </div>
      )}

      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <div style={{ fontSize: '28px', margin: '0 0 12px 0' }}>✅</div>
          <p style={{ fontSize: '16px', margin: '0 0 8px 0', fontWeight: 600 }}>Complete!</p>
          <p style={{ fontSize: '13px', color: MUTED, margin: '0' }}>
            Imported {importedRecipients.length} recipients
          </p>
        </div>
      )}
    </div>
  )
}
