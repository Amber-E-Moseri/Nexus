import { useMemo } from 'react'

const TH = { padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6E6885', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap', background: '#F7F5FB', borderBottom: '1px solid #E9E4F5' }
const TD = { padding: '10px 12px', fontSize: 13, color: '#171327', verticalAlign: 'middle', borderBottom: '1px solid #F2EEF8' }

function MatchedBadge({ matched }) {
  return matched ? (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: '#E7F7EC', color: '#16A34A', border: '1px solid #BBF0CC' }}>
      ✓ Matched
    </span>
  ) : (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: '#FCEBEB', color: '#DC2626', border: '1px solid #FECACA' }}>
      ✗ Missing
    </span>
  )
}

function exportToCSV(rows) {
  const headers = ['Subgroup', 'Expected Name', 'Leadership Category', 'Matched', 'Actual Name', 'People Category', 'Demographics']
  const lines = [
    headers.join(','),
    ...rows.map((r) => [
      `"${r.subgroup ?? ''}"`,
      `"${r.expected_name ?? ''}"`,
      `"${r.leadership_category ?? ''}"`,
      r.matched ? 'Yes' : 'No',
      `"${r.actual_name ?? ''}"`,
      `"${r.people_category ?? ''}"`,
      `"${r.demographics ?? ''}"`,
    ].join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `match-report-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function MatchReportTable({ rows, filterMatch, subgroupFilter }) {
  const filtered = useMemo(() => {
    let r = rows
    if (subgroupFilter) r = r.filter((x) => x.subgroup === subgroupFilter)
    if (filterMatch === 'matched') r = r.filter((x) => x.matched)
    if (filterMatch === 'unmatched') r = r.filter((x) => !x.matched)
    return r
  }, [rows, filterMatch, subgroupFilter])

  const totalExpected = rows.length
  const matchedCount = rows.filter((r) => r.matched).length
  const unmatchedCount = totalExpected - matchedCount
  const matchPct = totalExpected > 0 ? Math.round((matchedCount / totalExpected) * 100) : 0

  if (!rows.length) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center', color: '#6E6885', fontSize: 13, border: '1px dashed #C4BDE0', borderRadius: 12, background: '#F7F5FB' }}>
        No data. Run the match report to see results.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '14px 16px', background: '#F7F5FB', border: '1px solid #E9E4F5' }}>
          <div style={{ position: 'absolute', right: -18, bottom: -22, width: 72, height: 72, borderRadius: 999, background: 'rgba(76,42,146,.10)' }} />
          <div style={{ position: 'relative', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#6E6885' }}>Total Expected</div>
          <div style={{ position: 'relative', fontSize: 25, fontWeight: 800, color: '#171327', marginTop: 7, lineHeight: 1 }}>{totalExpected}</div>
        </div>
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '14px 16px', background: '#E7F7EC', border: '1px solid #BBF0CC' }}>
          <div style={{ position: 'absolute', right: -18, bottom: -22, width: 72, height: 72, borderRadius: 999, background: 'rgba(22,163,74,.15)' }} />
          <div style={{ position: 'relative', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#16A34A' }}>Matched</div>
          <div style={{ position: 'relative', fontSize: 25, fontWeight: 800, color: '#15803D', marginTop: 7, lineHeight: 1 }}>{matchedCount} <span style={{ fontSize: 13, fontWeight: 600, color: '#16A34A' }}>{matchPct}%</span></div>
        </div>
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '14px 16px', background: '#FCEBEB', border: '1px solid #FECACA' }}>
          <div style={{ position: 'absolute', right: -18, bottom: -22, width: 72, height: 72, borderRadius: 999, background: 'rgba(220,38,38,.12)' }} />
          <div style={{ position: 'relative', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#DC2626' }}>Unmatched</div>
          <div style={{ position: 'relative', fontSize: 25, fontWeight: 800, color: '#B91C1C', marginTop: 7, lineHeight: 1 }}>{unmatchedCount}</div>
        </div>
      </div>

      {/* Export button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => exportToCSV(filtered)}
          style={{ border: '1px solid #E9E4F5', background: 'white', color: '#4C2A92', borderRadius: 9, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          ↓ Export CSV
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', border: '1px solid #E9E4F5', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
          <thead>
            <tr>
              <th style={TH}>Subgroup</th>
              <th style={TH}>Expected Name</th>
              <th style={TH}>Category</th>
              <th style={{ ...TH, textAlign: 'center' }}>Matched?</th>
              <th style={TH}>Actual Name</th>
              <th style={TH}>People Category</th>
              <th style={TH}>Demographics</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.id ?? i} style={{ background: r.matched ? 'white' : '#FFF8F8' }}>
                <td style={{ ...TD, color: '#6E6885', fontSize: 12 }}>{r.subgroup || '—'}</td>
                <td style={{ ...TD, fontWeight: 600 }}>{r.expected_name}</td>
                <td style={{ ...TD, color: '#6E6885', fontSize: 12 }}>{r.leadership_category || '—'}</td>
                <td style={{ ...TD, textAlign: 'center' }}><MatchedBadge matched={r.matched} /></td>
                <td style={{ ...TD, color: r.actual_name ? '#171327' : '#C4BDE0' }}>{r.actual_name || '—'}</td>
                <td style={{ ...TD, color: '#6E6885', fontSize: 12 }}>{r.people_category || '—'}</td>
                <td style={{ ...TD, color: '#6E6885', fontSize: 12 }}>{r.demographics || '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '28px', textAlign: 'center', color: '#6E6885', fontSize: 13 }}>No rows match the current filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
