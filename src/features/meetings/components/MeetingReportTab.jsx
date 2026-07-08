import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, Files, LayoutGrid, Link2, Mail, Printer, RotateCcw, Users, TrendingDown } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../../../context/ToastContext'
import AbsenceBatchConfirmModal from '../../../components/meetings/AbsenceBatchConfirmModal'
import { exportReportToGoogleDrive, checkGoogleDriveAuth } from '../lib/google-drive-service'
import AttendanceTrendsView from './AttendanceTrendsView'

const PRINT_STYLES = `
@media print {
  @page {
    margin: 0.55in 0.6in 0.7in 0.6in;
    size: A4 portrait;
  }
  /* Un-clip shell overflow so content flows across pages */
  html, body {
    height: auto !important;
    overflow: visible !important;
    background: white !important;
    margin: 0 !important;
    padding: 0 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  /* Hide sidebar (<aside>), topbar (<header>), and all other shell chrome */
  body * { visibility: hidden !important; }
  /* Show only the print-report subtree */
  #print-report,
  #print-report * { visibility: visible !important; }
  /* Overlay at top-left so content spans multiple pages unclipped */
  #print-report {
    display: block !important;
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    color: #2C2C2A !important;
    font-family: Helvetica, Arial, sans-serif !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  #print-report * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    box-shadow: none !important;
  }
  .print-section {
    page-break-inside: avoid;
    break-inside: avoid;
    margin-top: 18px;
  }
  .print-section-header {
    page-break-after: avoid;
    break-after: avoid;
  }
  .print-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .print-table-row {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .print-page-break {
    page-break-before: always;
    break-before: page;
  }
  .print-no-break {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .print-doc {
    padding-bottom: 44px;
  }
  .print-footer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    font-size: 10px;
    color: #5B5B59;
    border-top: 1px solid #D8D4C8;
    background: white;
  }
  .print-page-number::after {
    content: counter(page);
  }
  .print-gridlines {
    background-image:
      linear-gradient(to right, rgba(44,44,42,0.08) 1px, transparent 1px);
    background-size: 20% 100%;
  }
}
#print-report { display: none; }
`

function normalizeNameKey(name) {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').trim()
}

function isNamedSubgroup(subgroup) {
  return typeof subgroup === 'string' && subgroup.trim() !== '' && subgroup.trim() !== 'Unassigned'
}

function displaySubgroup(subgroup) {
  return isNamedSubgroup(subgroup) ? subgroup.trim() : null
}

function formatSubgroupValue(subgroup) {
  return displaySubgroup(subgroup) ?? '-'
}

const NEW_LEADERS_TAB = '__new_leaders__'

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (err) {
    // Clipboard API failed, will fall back to textarea method
  }

  // Fallback for older browsers or if clipboard API fails
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return success
  } catch (err) {
    // Copy fallback failed - silently return false
    return false
  }
}

const SKIP_COLS = new Set(['group name', 'group', 'subgroup', 'meeting name'])
const EXACT_NAME_COLS = ['full name', 'name', 'person', 'contact name', 'contact']

function findNameColumn(headers) {
  const lc = headers.map((h) => h.toLowerCase().trim())
  for (const exact of EXACT_NAME_COLS) {
    const i = lc.indexOf(exact)
    if (i !== -1) return headers[i]
  }
  for (let i = 0; i < lc.length; i++) {
    if (!SKIP_COLS.has(lc[i]) && lc[i].includes('name')) return headers[i]
  }
  return null
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

function splitCSVRows(text) {
  const rows = []
  let currentRow = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentRow += '""'
        i++
      } else {
        inQuotes = !inQuotes
      }
      currentRow += char
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (currentRow.trim()) {
        rows.push(currentRow)
      }
      currentRow = ''
      if (char === '\r' && nextChar === '\n') {
        i++
      }
    } else {
      currentRow += char
    }
  }

  if (currentRow.trim()) {
    rows.push(currentRow)
  }

  return rows
}

function parseCSVText(text) {
  const lines = splitCSVRows(text)
  if (lines.length < 2) return { names: [], error: 'CSV has no data rows.' }
  const headers = splitCSVLine(lines[0]).map((h) => h.replace(/^"|"$/g, '').trim())
  const nameCol = findNameColumn(headers)
  if (!nameCol) {
    return {
      names: [],
      error: 'No name column found. Expected a column called "Full Name", "Name", "Person", "Contact Name", or "Contact".',
    }
  }
  const colIdx = headers.indexOf(nameCol)
  const names = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i])
    const raw = (cells[colIdx] ?? '').replace(/^"|"$/g, '').trim()
    if (raw) names.push(raw)
  }
  return { names, error: null }
}

async function buildReport(label, rosterRows, attendedNames, subgroupFilter) {
  const attendedMap = new Map()
  for (const name of attendedNames) attendedMap.set(normalizeNameKey(name), name)

  const rosterIds = rosterRows.map((row) => row.id).filter(Boolean)
  let aliases = []
  if (rosterIds.length > 0) {
    const { data } = await supabase
      .from('expected_attendee_aliases')
      .select('expected_attendee_id, alias_match_key')
      .in('expected_attendee_id', rosterIds)
    aliases = data ?? []
  }

  const aliasMap = new Map()
  aliases.forEach((alias) => {
    if (alias.alias_match_key) aliasMap.set(alias.alias_match_key, alias.expected_attendee_id)
  })

  const expectedMap = new Map()
  const directMatchKeys = new Set()
  for (const row of rosterRows) {
    const key = normalizeNameKey(row.match_key ?? row.full_name)
    expectedMap.set(key, row)
    directMatchKeys.add(key)
  }

  const aliasMatchedIds = new Set()
  const matchedAttendedKeys = new Set()
  for (const attendedKey of attendedMap.keys()) {
    if (directMatchKeys.has(attendedKey)) matchedAttendedKeys.add(attendedKey)
    const aliasMatchId = aliasMap.get(attendedKey)
    if (aliasMatchId) {
      aliasMatchedIds.add(aliasMatchId)
      matchedAttendedKeys.add(attendedKey)
    }
  }

  const present = []
  const absent = []
  for (const [key, row] of expectedMap) {
    const isPresent = attendedMap.has(key) || aliasMatchedIds.has(row.id)
    const person = {
      id: row.id,
      name: row.full_name,
      subgroup: displaySubgroup(row.subgroup),
      leadership_category: row.leadership_category?.trim() || '',
    }
    if (isPresent) present.push(person)
    else absent.push(person)
  }

  const unexpected = []
  for (const [key, name] of attendedMap) {
    if (!matchedAttendedKeys.has(key)) unexpected.push({ name, subgroup: null })
  }

  present.sort((a, b) => a.name.localeCompare(b.name))
  absent.sort((a, b) => a.name.localeCompare(b.name))
  unexpected.sort((a, b) => a.name.localeCompare(b.name))

  const expectedCount = rosterRows.length
  const attendedCount = attendedNames.length
  const reachPct = expectedCount > 0 ? present.length / expectedCount : 0
  const subgroupNames = [...new Set(
    rosterRows
      .map((row) => displaySubgroup(row.subgroup))
      .filter(Boolean),
  )].sort()

  const bySubgroup = Object.fromEntries(
    subgroupNames.map((subgroup) => {
      const expected = rosterRows
        .filter((row) => displaySubgroup(row.subgroup) === subgroup)
        .map((row) => ({
          id: row.id,
          name: row.full_name,
          subgroup,
          leadership_category: row.leadership_category?.trim() || '',
        }))
      const subgroupPresent = present.filter((person) => person.subgroup === subgroup)
      const subgroupAbsent = absent.filter((person) => person.subgroup === subgroup)
      const subgroupExpectedCount = expected.length
      const subgroupReachPct = subgroupExpectedCount > 0 ? subgroupPresent.length / subgroupExpectedCount : 0

      return [subgroup, {
        expected,
        present: subgroupPresent,
        absent: subgroupAbsent,
        visitors: [],
        reachPct: subgroupReachPct,
      }]
    }),
  )

  return {
    label,
    subgroupFilter,
    expectedCount,
    attendedCount,
    absentCount: absent.length,
    unexpectedCount: unexpected.length,
    reachPct,
    present,
    absent,
    unexpected,
    bySubgroup,
    subgroups: subgroupNames,
    visitors: unexpected.map((person) => person.name),
  }
}

function getReachDotColor(pct) {
  const p = pct * 100
  if (p >= 80) return '#2D8653'
  if (p >= 65) return '#2D8653'
  if (p >= 50) return '#E8A020'
  if (p >= 35) return '#D17A1C'
  return '#C94830'
}

function buildSubgroupStats(report) {
  const groups = new Map()
  const ensureGroup = (subgroup) => {
    if (!isNamedSubgroup(subgroup)) return null
    const key = subgroup.trim()
    if (!groups.has(key)) groups.set(key, { subgroup: key, present: [], absent: [] })
    return groups.get(key)
  }

  for (const person of report?.present ?? []) ensureGroup(person.subgroup)?.present.push(person)
  for (const person of report?.absent ?? []) ensureGroup(person.subgroup)?.absent.push(person)

  return [...groups.values()]
    .map((group) => {
      const expectedCount = group.present.length + group.absent.length
      const reachPct = expectedCount > 0 ? group.present.length / expectedCount : 0
      return {
        ...group,
        expectedCount,
        unexpectedCount: 0,
        reachPct,
      }
    })
    .sort((a, b) => a.subgroup.localeCompare(b.subgroup))
}

function filterReportForSubgroup(report, subgroup) {
  if (!report || !subgroup) return report
  const present = (report.present ?? []).filter((person) => person.subgroup === subgroup)
  const absent = (report.absent ?? []).filter((person) => person.subgroup === subgroup)
  const expectedCount = present.length + absent.length
  const reachPct = expectedCount > 0 ? present.length / expectedCount : 0

  return {
    ...report,
    expectedCount,
    attendedCount: present.length,
    absentCount: absent.length,
    unexpectedCount: 0,
    reachPct,
    present,
    absent,
    unexpected: [],
  }
}

function reachBand(pct) {
  const p = pct * 100
  if (p >= 80) return { bg: '#D9F2E3', fg: '#1B5E3C', border: '#A8DBC0' }
  if (p >= 65) return { bg: '#D4EEF0', fg: '#1B4E55', border: '#98CDD2' }
  if (p >= 50) return { bg: '#FFF4CC', fg: '#7A5A00', border: '#EDD88A' }
  if (p >= 35) return { bg: '#FEE8D6', fg: '#7A3210', border: '#F5C4A0' }
  return { bg: '#F8D7DA', fg: '#7A1C24', border: '#F0B0B6' }
}

function todayLabel() {
  return new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
}

function timestampLabel() {
  return new Date().toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function KpiTile({ label, value, bg, bd, circle, labelColor, valueColor }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '14px 16px', background: bg, border: `1px solid ${bd}` }}>
      <div style={{ position: 'absolute', right: -18, bottom: -22, width: 72, height: 72, borderRadius: 999, background: circle }} />
      <div style={{ position: 'relative', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: labelColor }}>{label}</div>
      <div style={{ position: 'relative', fontSize: 25, fontWeight: 800, color: valueColor, marginTop: 7, lineHeight: 1 }}>{value}</div>
    </div>
  )
}

function FileZone({ file, rowCount, error, onFile }) {
  const [dragging, setDragging] = useState(false)

  function handleFile(f) {
    if (!f || !f.name.toLowerCase().endsWith('.csv')) return
    const reader = new FileReader()
    reader.onload = (e) => onFile(f, e.target.result)
    reader.readAsText(f)
  }

  return (
    <label
      className="upload-zone screen-only"
      style={{
        display: 'block',
        border: `1.5px dashed ${dragging ? '#4C2A92' : error ? '#C94830' : file ? '#2D8653' : '#D8D3C9'}`,
        borderRadius: 12,
        background: dragging ? '#F0EBFC' : 'white',
        padding: '20px 16px',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'border-color .15s, background .15s',
      }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
    >
      <input type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files[0])} />
      <div style={{ fontSize: 22, marginBottom: 6 }}>{file ? 'OK' : 'CSV'}</div>
      {file ? (
        <>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2D8653' }}>{file.name}</div>
          <div style={{ fontSize: 11.5, color: '#9E9488', marginTop: 3 }}>{rowCount} names found</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#6B6560' }}>Drop Attended List CSV or click to browse</div>
          <div style={{ fontSize: 11.5, color: '#9E9488', marginTop: 3 }}>CSV with names of who actually showed up</div>
        </>
      )}
      {error && <div style={{ marginTop: 5, fontSize: 11.5, color: '#C94830' }}>{error}</div>}
    </label>
  )
}

function PersonChip({ person, bg, color, simple }) {
  const name = typeof person === 'string' ? person : person.name
  const sub = typeof person === 'object' ? displaySubgroup(person.subgroup) : null
  const cat = typeof person === 'object' ? person.leadership_category : null

  return (
    <span style={{
      display: 'inline-flex',
      flexDirection: 'column',
      padding: simple ? '3px 10px' : '4px 10px 5px',
      borderRadius: 8,
      background: bg,
      color,
      fontSize: 12,
      fontWeight: 600,
      margin: '3px 4px 3px 0',
      verticalAlign: 'top',
    }}>
      <span>{name}</span>
      {!simple && (cat || sub) && (
        <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.72, marginTop: 1 }}>
          {[cat, sub].filter(Boolean).join(' | ')}
        </span>
      )}
    </span>
  )
}

function SubgroupPillBar({ subgroupOptions, selectedSubgroups, onToggle }) {
  return (
    <div className="screen-only subgroup-filter-bar" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#2D2A22' }}>Filter by subgroup:</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          onClick={() => onToggle(null)}
          style={{
            background: selectedSubgroups.length === 0 ? '#4C2A92' : 'white',
            color: selectedSubgroups.length === 0 ? 'white' : '#2D2A22',
            border: `1px solid ${selectedSubgroups.length === 0 ? '#4C2A92' : '#EDE8DC'}`,
            borderRadius: 999,
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          All
        </button>
        {subgroupOptions.map((subgroup) => {
          const selected = selectedSubgroups.includes(subgroup)
          return (
            <button
              key={subgroup}
              type="button"
              onClick={() => onToggle(subgroup)}
              style={{
                background: selected ? '#4C2A92' : 'white',
                color: selected ? 'white' : '#2D2A22',
                border: `1px solid ${selected ? '#4C2A92' : '#EDE8DC'}`,
                borderRadius: 999,
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {subgroup}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CategoryPillBar({ categoryOptions, selectedCategories, onToggle }) {
  if (categoryOptions.length === 0) return null
  return (
    <div className="screen-only category-filter-bar" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#2D2A22' }}>Filter by leadership category:</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          onClick={() => onToggle(null)}
          style={{
            background: selectedCategories.length === 0 ? '#4C2A92' : 'white',
            color: selectedCategories.length === 0 ? 'white' : '#2D2A22',
            border: `1px solid ${selectedCategories.length === 0 ? '#4C2A92' : '#EDE8DC'}`,
            borderRadius: 999,
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          All
        </button>
        {categoryOptions.map((category) => {
          const selected = selectedCategories.includes(category)
          return (
            <button
              key={category}
              type="button"
              onClick={() => onToggle(category)}
              style={{
                background: selected ? '#4C2A92' : 'white',
                color: selected ? 'white' : '#2D2A22',
                border: `1px solid ${selected ? '#4C2A92' : '#EDE8DC'}`,
                borderRadius: 999,
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {category}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SubgroupShareLinksPanel({ report, onClose, expandedByDefault = false }) {
  const [copiedIndex, setCopiedIndex] = useState(null)

  if (!report || !report.subgroups || report.subgroups.length === 0) return null

  const baseUrl = `${window.location.origin}/reports/${report.share_token}`
  const fullReportUrl = baseUrl

  async function copyLink(url, index) {
    const success = await copyToClipboard(url)
    if (success) {
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    }
  }

  async function copyAllLinks() {
    const links = [
      `Full Report:\n${fullReportUrl}`,
      ...report.subgroups.map((sg) => `${sg}:\n${baseUrl}?subgroup=${encodeURIComponent(sg)}`),
    ].join('\n\n')
    const success = await copyToClipboard(links)
    if (success) {
      setCopiedIndex('all')
      setTimeout(() => setCopiedIndex(null), 2000)
    }
  }

  return (
    <div style={{ background: 'white', border: '1px solid #EDE8DC', borderRadius: 12, padding: '16px', marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#2D2A22' }}>Share Report</div>
        <button
          type="button"
          onClick={copyAllLinks}
          style={{
            background: copiedIndex === 'all' ? '#2D8653' : '#4C2A92',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '7px 14px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => { if (copiedIndex !== 'all') e.target.style.background = '#5D3BA3' }}
          onMouseLeave={(e) => { if (copiedIndex !== 'all') e.target.style.background = '#4C2A92' }}
        >
          {copiedIndex === 'all' ? '✓ All Copied' : 'Copy All'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Full Report */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px', background: '#F9F7F3', borderRadius: 10, border: '1px solid #EDE8DC' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#2D2A22', marginBottom: 4 }}>Full Report</div>
            <div style={{ fontSize: 11, color: '#9E9488', wordBreak: 'break-all', fontFamily: 'monospace', background: 'white', padding: '6px', borderRadius: 4, border: '1px solid #EDE8DC' }}>
              {fullReportUrl}
            </div>
          </div>
          <button
            type="button"
            onClick={() => copyLink(fullReportUrl, 'full')}
            style={{
              background: copiedIndex === 'full' ? '#2D8653' : '#4C2A92',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              flexShrink: 0,
              whiteSpace: 'nowrap',
              transition: 'all 0.2s'
            }}
          >
            {copiedIndex === 'full' ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        {/* Flat list of subgroups */}
        {report.subgroups.map((subgroup) => {
          const linkUrl = `${baseUrl}?subgroup=${encodeURIComponent(subgroup)}`
          return (
            <div key={subgroup} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px', background: 'white', borderRadius: 10, border: '1px solid #EDE8DC' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#2D2A22', marginBottom: 4 }}>{subgroup}</div>
                <div style={{ fontSize: 11, color: '#9E9488', wordBreak: 'break-all', fontFamily: 'monospace', background: '#F9F7F3', padding: '6px', borderRadius: 4, border: '1px solid #EDE8DC' }}>
                  {linkUrl}
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyLink(linkUrl, subgroup)}
                style={{
                  background: copiedIndex === subgroup ? '#2D8653' : '#4C2A92',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s'
                }}
              >
                {copiedIndex === subgroup ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ReportModeSelector({ reportMode, onChange }) {
  const modes = [
    {
      id: 'regional',
      title: 'Regional Report',
      description: 'Full org report with per-subgroup breakdown. All subgroups in one document.',
      Icon: LayoutGrid,
    },
    {
      id: 'subgroup',
      title: 'Per-Subgroup Reports',
      description: 'Generate a separate printable report for each subgroup. Print one at a time.',
      Icon: Files,
    },
  ]

  return (
    <div className="screen-only" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
      {modes.map(({ id, title, description, Icon }) => {
        const selected = reportMode === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            style={{
              textAlign: 'left',
              border: selected ? '2px solid #4C2A92' : '1px solid #EDE8DC',
              background: selected ? '#F5F0FF' : 'white',
              borderRadius: 12,
              padding: 16,
              cursor: 'pointer',
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
            }}
          >
            <span style={{ width: 32, height: 32, borderRadius: 999, background: '#F0EBFC', color: '#4C2A92', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={16} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#2D2A22' }}>{title}</span>
              <span style={{ fontSize: 11.5, lineHeight: 1.45, color: '#9E9488' }}>{description}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function SubgroupTabBar({ subgroups, activeSubgroup, onChange }) {
  if (subgroups.length <= 1) return null
  return (
    <div className="screen-only subgroup-tab-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 2 }}>
      <button
        type="button"
        onClick={() => onChange('')}
        style={{
          border: activeSubgroup ? '1px solid #D8D3C9' : '1px solid #4C2A92',
          background: activeSubgroup ? 'white' : '#F0EBFC',
          color: activeSubgroup ? '#6B6560' : '#4C2A92',
          borderRadius: 999,
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        All
      </button>
      {subgroups.map((subgroup) => (
        <button
          key={subgroup}
          type="button"
          onClick={() => onChange(subgroup)}
          style={{
            border: activeSubgroup === subgroup ? '1px solid #4C2A92' : '1px solid #D8D3C9',
            background: activeSubgroup === subgroup ? '#F0EBFC' : 'white',
            color: activeSubgroup === subgroup ? '#4C2A92' : '#6B6560',
            borderRadius: 999,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {subgroup}
        </button>
      ))}
    </div>
  )
}

function SubgroupBreakdown({ groups }) {
  if (!groups.length) return null
  return (
    <div className="report-name-section screen-only" style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(28,22,16,.06)' }}>
      <div style={{ background: '#1E1A2E', color: '#E8E0FF', padding: '8px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        By Subgroup
      </div>
      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {groups.map((group) => {
          const reachColor = getReachDotColor(group.reachPct)
          return (
            <div key={group.subgroup} style={{ border: '1px solid #EDE8DC', borderRadius: 14, overflow: 'hidden', background: 'white' }}>
              <div style={{ background: '#1E1A2E', color: '#E8E0FF', padding: '9px 14px', fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                {group.subgroup}
              </div>
              <div style={{ padding: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <KpiTile label="Expected" value={group.expectedCount} bg="#F4F1EA" bd="#EDE8DC" circle="rgba(76,42,146,.12)" labelColor="#9E9488" valueColor="#2D2A22" />
                  <KpiTile label="Present" value={group.present.length} bg="#EEF6F1" bd="#C3E0CC" circle="rgba(45,134,83,.15)" labelColor="#2D8653" valueColor="#1B5E3C" />
                  <KpiTile label="Absent" value={group.absent.length} bg="#FEF0ED" bd="#F5C4B8" circle="rgba(201,72,48,.15)" labelColor="#C94830" valueColor="#7A1C24" />
                </div>
                <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 11px', borderRadius: 999, background: '#FAFAF7', border: '1px solid #EDE8DC' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: reachColor }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#2D2A22' }}>Reach {Math.round(group.reachPct * 100)}%</span>
                </div>
                {group.absent.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 11.5, color: '#9E9488' }}>
                    Absent: {group.absent.map((person) => person.name).join(', ')}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CategoryFilterBar({ categoryOptions, activeCategory, onChange }) {
  if (!categoryOptions.length) return null
  return (
    <div className="screen-only category-filter-bar" style={{ background: 'white', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(28,22,16,.06)' }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#2D2A22', marginBottom: 8 }}>Filter by category:</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          onClick={() => onChange(null)}
          style={{
            background: activeCategory ? 'white' : '#4C2A92',
            color: activeCategory ? '#2D2A22' : 'white',
            border: `1px solid ${activeCategory ? '#EDE8DC' : '#4C2A92'}`,
            borderRadius: 999,
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          All
        </button>
        {categoryOptions.map((category) => {
          const selected = activeCategory === category
          return (
            <button
              key={category}
              type="button"
              onClick={() => onChange(selected ? null : category)}
              style={{
                background: selected ? '#4C2A92' : 'white',
                color: selected ? 'white' : '#2D2A22',
                border: `1px solid ${selected ? '#4C2A92' : '#EDE8DC'}`,
                borderRadius: 999,
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {category}
            </button>
          )
        })}
      </div>
      {activeCategory && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: '#9E9488' }}>
          Showing: {activeCategory} only
          <button
            type="button"
            onClick={() => onChange(null)}
            style={{ marginLeft: 8, border: 'none', background: 'none', color: '#4C2A92', cursor: 'pointer', fontWeight: 700, padding: 0, fontSize: 11.5 }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}

function UnexpectedPreviewPanel({ preview, subgroupOptions, categoryOptions, onToggle, onSelectAll, onDeselectAll, onChangeField }) {
  if (!preview.length) return null
  const selectedCount = preview.filter((item) => item.selected).length
  return (
    <div className="screen-only" style={{ background: 'white', border: '1px solid #EDE8DC', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ background: '#E8A020', color: '#fff', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{preview.length} people attended who aren't in your roster</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onSelectAll} style={{ border: '1px solid rgba(255,255,255,.35)', background: 'rgba(255,255,255,.18)', color: 'white', borderRadius: 999, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
            Select all
          </button>
          <button type="button" onClick={onDeselectAll} style={{ border: '1px solid rgba(255,255,255,.35)', background: 'rgba(255,255,255,.18)', color: 'white', borderRadius: 999, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
            Deselect all
          </button>
        </div>
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {preview.map((item, index) => (
          <div key={item.name} style={{ border: '1px solid #F3DFC0', borderRadius: 12, padding: '10px 12px', background: item.selected ? 'white' : '#FEF8E7' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={item.selected}
                onChange={(e) => onToggle(index, e.target.checked)}
                style={{ accentColor: '#4C2A92', width: 16, height: 16 }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#2D2A22' }}>{item.name}</span>
            </label>
            {item.selected && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 10 }}>
                <input
                  list="unexpected-subgroups"
                  value={item.subgroup}
                  onChange={(e) => onChangeField(index, 'subgroup', e.target.value)}
                  placeholder="Subgroup"
                  style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #EDE8DC', borderRadius: 9, padding: '8px 10px', fontSize: 12.5, color: '#2D2A22', background: '#FAFAF7', outline: 'none', fontFamily: 'inherit' }}
                />
                <input
                  list="unexpected-categories"
                  value={item.leadership_category}
                  onChange={(e) => onChangeField(index, 'leadership_category', e.target.value)}
                  placeholder="Leadership Category"
                  style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #EDE8DC', borderRadius: 9, padding: '8px 10px', fontSize: 12.5, color: '#2D2A22', background: '#FAFAF7', outline: 'none', fontFamily: 'inherit' }}
                />
              </div>
            )}
          </div>
        ))}
        <div style={{ fontSize: 11.5, color: '#9E9488' }}>
          Add checked to roster before generating. {selectedCount > 0 ? `${selectedCount} selected.` : 'Nothing selected yet.'}
        </div>
        <datalist id="unexpected-subgroups">
          {subgroupOptions.map((option) => <option key={option} value={option} />)}
        </datalist>
        <datalist id="unexpected-categories">
          {categoryOptions.map((option) => <option key={option} value={option} />)}
        </datalist>
      </div>
    </div>
  )
}

function HistoryRow({ record, onView, onDelete }) {
  const band = reachBand(record.reach_pct / 100)
  const dateStr = new Date(`${record.report_date}T12:00:00`).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid #F2EEE6' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#F9F7F3' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 999, background: band.fg, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#2D2A22', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.label}</div>
        <div style={{ fontSize: 11, color: '#9E9488' }}>
          {dateStr}
          {record.subgroup_filter ? ` | ${record.subgroup_filter}` : ' | All subgroups'}
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: band.fg, background: band.bg, borderRadius: 999, padding: '2px 10px', flexShrink: 0 }}>
        {Math.round(record.reach_pct)}%
      </span>
      <button
        type="button"
        onClick={() => onView(record)}
        style={{ border: '1px solid #EDE8DC', background: 'white', color: '#4C2A92', borderRadius: 7, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
      >
        View
      </button>
      <button
        type="button"
        onClick={() => onDelete(record.id)}
        style={{ border: 'none', background: 'none', color: '#C8BFB2', fontSize: 14, cursor: 'pointer', padding: '2px 4px', lineHeight: 1, borderRadius: 6, flexShrink: 0 }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#C94830'; e.currentTarget.style.background = '#FEF0ED' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#C8BFB2'; e.currentTarget.style.background = 'none' }}
      >
        X
      </button>
    </div>
  )
}

function PrintTable({ columns, rows, empty }) {
  if (!rows.length) return <div className="print-empty">{empty}</div>
  return (
    <table className="print-table">
      <thead>
        <tr>
          {columns.map((column) => <th key={column}>{column}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function buildReportFromHistoryRecord(record, rosterRows) {
  const rosterByKey = new Map(rosterRows.map((row) => [normalizeNameKey(row.full_name), row]))
  const enrich = (name) => {
    const match = rosterByKey.get(normalizeNameKey(name))
    return {
      name,
      subgroup: displaySubgroup(match?.subgroup),
      leadership_category: match?.leadership_category?.trim() || '',
    }
  }

  const present = (record.present_names ?? []).map(enrich)
  const absent = (record.absent_names ?? []).map(enrich)
  const subgroupNames = [...new Set([...present, ...absent].map((person) => person.subgroup).filter(Boolean))].sort()
  const bySubgroup = Object.fromEntries(
    subgroupNames.map((subgroup) => {
      const subgroupPresent = present.filter((person) => person.subgroup === subgroup)
      const subgroupAbsent = absent.filter((person) => person.subgroup === subgroup)
      const subgroupExpectedCount = subgroupPresent.length + subgroupAbsent.length
      return [subgroup, {
        expected: [...subgroupPresent, ...subgroupAbsent],
        present: subgroupPresent,
        absent: subgroupAbsent,
        visitors: [],
        reachPct: subgroupExpectedCount > 0 ? subgroupPresent.length / subgroupExpectedCount : 0,
      }]
    }),
  )

  return {
    id: record.id,
    share_token: record.share_token,
    label: record.label,
    subgroupFilter: record.subgroup_filter,
    expectedCount: record.expected_count,
    attendedCount: record.attended_count,
    absentCount: record.absent_count,
    unexpectedCount: record.unexpected_count,
    reachPct: record.reach_pct / 100,
    present,
    absent,
    unexpected: (record.unexpected_names ?? []).map((name) => ({ name, subgroup: null })),
    bySubgroup,
    subgroups: subgroupNames,
    visitors: record.unexpected_names ?? [],
    fromHistory: true,
  }
}

export default function MeetingReportTab() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [roster, setRoster] = useState([])
  const [rosterLoading, setRosterLoading] = useState(true)
  const [rosterError, setRosterError] = useState(null)
  const [viewMode, setViewMode] = useState('single') // 'single' | 'trends'

  const [phase, setPhase] = useState('input')
  const [meetingLabel, setMeetingLabel] = useState('')
  const [reportMode, setReportMode] = useState('regional')
  const [selectedSubgroups, setSelectedSubgroups] = useState([])
  const [selectedCategories, setSelectedCategories] = useState([])
  const [attendedFile, setAttendedFile] = useState(null)
  const [attendedNames, setAttendedNames] = useState([])
  const [attendedRawCount, setAttendedRawCount] = useState(0)
  const [attendedError, setAttendedError] = useState(null)
  const [unexpectedPreview, setUnexpectedPreview] = useState([])

  const [report, setReport] = useState(null)
  const [activeSubgroup, setActiveSubgroup] = useState('')
  const [activeCategory, setActiveCategory] = useState(null)
  const [printingSubgroup, setPrintingSubgroup] = useState(null)
  const [restoredFromSession, setRestoredFromSession] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  const [emailSending, setEmailSending] = useState(false)
  const [emailConfirmation, setEmailConfirmation] = useState(null)
  const [emailEditor, setEmailEditor] = useState(null)
  const [showEmailEditor, setShowEmailEditor] = useState(false)
  const [exportingToDrive, setExportingToDrive] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    loadRoster()
    loadHistory()
  }, [])

  useEffect(() => {
    if (searchParams.get('report')) return
    const saved = sessionStorage.getItem('meeting_report_state')
    if (!saved) return

    try {
      const parsed = JSON.parse(saved)
      const savedAt = new Date(parsed.savedAt)
      const hoursSince = (Date.now() - savedAt) / 3600000

      if (hoursSince < 24) {
        setPhase(parsed.phase)
        setReport(parsed.report)
        setReportMode(parsed.reportMode ?? 'regional')
        setSelectedSubgroups(parsed.selectedSubgroups ?? [])
        setSelectedCategories(parsed.selectedCategories ?? [])
        setAttendedRawCount(parsed.attendedRawCount ?? 0)
        setMeetingLabel(parsed.label ?? '')
        setRestoredFromSession(true)
        return
      }

      sessionStorage.removeItem('meeting_report_state')
    } catch {
      sessionStorage.removeItem('meeting_report_state')
    }
  }, [searchParams])

  useEffect(() => {
    const reportId = searchParams.get('report')
    if (!reportId || rosterLoading) return

    let cancelled = false

    async function loadSharedReport() {
      try {
        const { data, error } = await supabase
          .from('meeting_attendance_reports')
          .select('id, share_token, label, report_date, reach_pct, expected_count, attended_count, absent_count, unexpected_count, present_names, absent_names, unexpected_names, subgroup_filter')
          .eq('id', reportId)
          .single()

        if (error || !data || cancelled) return

        const hydratedReport = buildReportFromHistoryRecord(data, roster)
        setPhase('report')
        setReport(hydratedReport)
        setReportMode('regional')
        setSelectedSubgroups([])
        setAttendedRawCount(data.attended_count ?? 0)
        setMeetingLabel(data.label ?? '')
        setActiveSubgroup('')
        setActiveCategory(null)
        setPrintingSubgroup(null)
        setRestoredFromSession(false)
        setUnexpectedPreview([])
        sessionStorage.setItem(
          'meeting_report_state',
          JSON.stringify({
            phase: 'report',
            report: hydratedReport,
            reportMode: 'regional',
            selectedSubgroups: [],
            selectedCategories: [],
            attendedRawCount: data.attended_count ?? 0,
            label: data.label ?? '',
            savedAt: new Date().toISOString(),
          }),
        )
      } catch {
        // Ignore invalid shared report links and leave the current view unchanged.
      }
    }

    loadSharedReport()
    return () => {
      cancelled = true
    }
  }, [roster, rosterLoading, searchParams])

  async function loadRoster() {
    setRosterLoading(true)
    setRosterError(null)
    const { data, error } = await supabase
      .from('expected_attendees')
      .select('id, full_name, match_key, subgroup, leadership_category, email, active')
      .eq('active', true)
      .order('subgroup')
      .order('full_name')

    if (error) {
      setRosterError(error.message)
      setRosterLoading(false)
      return []
    }

    setRoster(data ?? [])
    setRosterLoading(false)
    return data ?? []
  }

  async function loadHistory() {
    setLoadingHistory(true)
    try {
      const { data } = await supabase
        .from('meeting_attendance_reports')
        .select('id, share_token, label, report_date, reach_pct, expected_count, attended_count, absent_count, unexpected_count, present_names, absent_names, unexpected_names, subgroup_filter')
        .order('created_at', { ascending: false })
        .limit(10)
      setHistory(data ?? [])
    } catch {
      setHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }

  const subgroupOptions = useMemo(
    () => [...new Set(
      roster
        .map((r) => r.subgroup)
        .filter((s) => s && s.trim() !== '' && s !== 'Unassigned'),
    )].sort(),
    [roster],
  )

  const leadershipCategoryOptions = useMemo(
    () => [...new Set(roster.map((r) => r.leadership_category?.trim()).filter(Boolean))].sort(),
    [roster],
  )

  const filteredRoster = useMemo(() => {
    let filtered = roster
    if (selectedSubgroups.length > 0) {
      filtered = filtered.filter((row) => selectedSubgroups.includes(row.subgroup))
    }
    if (selectedCategories.length > 0) {
      filtered = filtered.filter((row) => selectedCategories.includes(row.leadership_category?.trim()))
    }
    return filtered
  }, [roster, selectedSubgroups, selectedCategories])

  const reportSubgroups = useMemo(() => {
    if (!report) return []
    return buildSubgroupStats(report).map((group) => group.subgroup)
  }, [report])

  const visibleReport = useMemo(() => filterReportForSubgroup(report, activeSubgroup), [report, activeSubgroup])

  const subgroupBreakdown = useMemo(() => {
    if (!report) return []
    const groups = buildSubgroupStats(report)
    return activeSubgroup ? groups.filter((group) => group.subgroup === activeSubgroup) : groups
  }, [report, activeSubgroup])

  const categoryOptions = useMemo(
    () => [...new Set([...(visibleReport?.present ?? []), ...(visibleReport?.absent ?? [])].map((person) => person.leadership_category?.trim()).filter(Boolean))].sort(),
    [visibleReport],
  )

  const categoryFilteredPresent = useMemo(() => {
    if (!visibleReport) return []
    if (!activeCategory) return visibleReport.present
    return visibleReport.present.filter((person) => person.leadership_category === activeCategory)
  }, [visibleReport, activeCategory])

  const categoryFilteredAbsent = useMemo(() => {
    if (!visibleReport) return []
    if (!activeCategory) return visibleReport.absent
    return visibleReport.absent.filter((person) => person.leadership_category === activeCategory)
  }, [visibleReport, activeCategory])

  useEffect(() => {
    if (activeSubgroup && !reportSubgroups.includes(activeSubgroup) && activeSubgroup !== NEW_LEADERS_TAB) setActiveSubgroup('')
  }, [activeSubgroup, reportSubgroups])

  useEffect(() => {
    if (reportMode === 'subgroup' && (!activeSubgroup || activeSubgroup === '')) {
      if (reportSubgroups.length > 0) {
        setActiveSubgroup(reportSubgroups[0])
      } else if (report?.visitors?.length > 0) {
        setActiveSubgroup(NEW_LEADERS_TAB)
      }
    }
  }, [reportMode, report, reportSubgroups, activeSubgroup])

  useEffect(() => {
    setActiveCategory(null)
  }, [activeSubgroup, report])

  useEffect(() => {
    if (!attendedNames.length || attendedError) {
      setUnexpectedPreview([])
      return
    }

    const expectedKeys = new Set(filteredRoster.map((row) => normalizeNameKey(row.match_key ?? row.full_name)))
    const uniqueAttended = new Map()
    for (const name of attendedNames) {
      const key = normalizeNameKey(name)
      if (!uniqueAttended.has(key)) uniqueAttended.set(key, name)
    }

    const preview = [...uniqueAttended.values()]
      .filter((name) => !expectedKeys.has(normalizeNameKey(name)))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        name,
        selected: false,
        subgroup: '',
        leadership_category: '',
      }))

    setUnexpectedPreview(preview)
  }, [attendedNames, attendedError, filteredRoster])

  function handleToggleSubgroup(subgroup) {
    if (!subgroup) {
      setSelectedSubgroups([])
      return
    }
    setSelectedSubgroups((prev) => {
      if (prev.length === 0) return [subgroup]
      if (prev.includes(subgroup)) return prev.filter((value) => value !== subgroup)
      return [...prev, subgroup]
    })
  }

  function handleToggleCategory(category) {
    if (!category) {
      setSelectedCategories([])
      return
    }
    setSelectedCategories((prev) => {
      if (prev.length === 0) return [category]
      if (prev.includes(category)) return prev.filter((value) => value !== category)
      return [...prev, category]
    })
  }

  function handleAttendedFile(file, text) {
    const { names, error } = parseCSVText(text)
    setAttendedFile(file)
    setAttendedNames(names)
    setAttendedRawCount(names.length)
    setAttendedError(error)
  }

  async function fetchReportRoster() {
    let query = supabase
      .from('expected_attendees')
      .select('id, full_name, match_key, subgroup, leadership_category, email, active')
      .eq('active', true)
      .order('subgroup')
      .order('full_name')

    if (selectedSubgroups.length > 0) query = query.in('subgroup', selectedSubgroups)
    return query
  }

  async function handleGenerate() {
    setRestoredFromSession(false)
    const label = meetingLabel.trim() || todayLabel()
    const subgroupFilter = selectedSubgroups.length === 0 ? null : selectedSubgroups.join(', ')
    const additions = unexpectedPreview
      .filter((item) => item.selected)
      .map((item) => ({
        full_name: item.name.trim(),
        subgroup: item.subgroup.trim(),
        leadership_category: item.leadership_category.trim(),
        active: true,
      }))

    if (additions.some((item) => !item.full_name || !item.subgroup)) {
      setSaveError('Each selected unexpected attendee needs a subgroup before generating.')
      return
    }

    setSaveError(null)

    if (additions.length > 0) {
      const { error: insertError } = await supabase
        .from('expected_attendees')
        .upsert(additions, { onConflict: 'match_key', ignoreDuplicates: true })

      if (insertError) {
        setSaveError(insertError.message)
        return
      }

      await loadRoster()
    }

    const { data: rosterRows, error: rosterFetchError } = await fetchReportRoster()
    if (rosterFetchError) {
      setSaveError(rosterFetchError.message)
      return
    }

    const result = await buildReport(label, rosterRows ?? [], attendedNames, subgroupFilter)
    setPhase('report')
    setReport(result)
    setActiveSubgroup('')
    setActiveCategory(null)
    setPrintingSubgroup(null)
    setUnexpectedPreview([])
    sessionStorage.setItem(
      'meeting_report_state',
      JSON.stringify({
        phase: 'report',
        report: result,
        reportMode,
        selectedSubgroups,
        selectedCategories,
        attendedRawCount,
        label,
        savedAt: new Date().toISOString(),
      }),
    )

    if (!restoredFromSession) {
      setSaving(true)
      try {
        const { data, error } = await supabase
          .from('meeting_attendance_reports')
          .insert({
            label: result.label,
            report_date: new Date().toISOString().slice(0, 10),
            expected_count: result.expectedCount,
            attended_count: result.attendedCount,
            absent_count: result.absentCount,
            unexpected_count: result.unexpectedCount,
            reach_pct: parseFloat((result.reachPct * 100).toFixed(2)),
            present_names: result.present.map((person) => person.name),
            absent_names: result.absent.map((person) => person.name),
            unexpected_names: result.unexpected.map((person) => person.name),
            subgroup_filter: result.subgroupFilter,
            by_subgroup: result.bySubgroup || null, // Store per-subgroup breakdown
            created_by: profile?.id ?? null,
          })
          .select('id, share_token')
          .single()
        if (error) setSaveError(error.message)
        else {
          const nextReport = { ...result, id: data.id, share_token: data.share_token }
          setReport(nextReport)
          sessionStorage.setItem(
            'meeting_report_state',
            JSON.stringify({
              phase: 'report',
              report: nextReport,
              reportMode,
              selectedSubgroups,
              selectedCategories,
              attendedRawCount,
              label,
              savedAt: new Date().toISOString(),
            }),
          )
          setSearchParams({ report: data.id })
          loadHistory()
        }
      } catch (err) {
        setSaveError(err.message)
      } finally {
        setSaving(false)
      }
    }
  }

  function handleReset() {
    sessionStorage.removeItem('meeting_report_state')
    setSearchParams({})
    setPhase('input')
    setReport(null)
    setActiveSubgroup('')
    setActiveCategory(null)
    setPrintingSubgroup(null)
    setRestoredFromSession(false)
    setMeetingLabel('')
    setReportMode('regional')
    setSelectedSubgroups([])
    setSelectedCategories([])
    setAttendedFile(null)
    setAttendedNames([])
    setAttendedRawCount(0)
    setAttendedError(null)
    setUnexpectedPreview([])
    setSaveError(null)
  }

  function handleViewHistory(record) {
    const nextReport = buildReportFromHistoryRecord(record, roster)
    setPhase('report')
    setReport(nextReport)
    setActiveSubgroup('')
    setActiveCategory(null)
    setPrintingSubgroup(null)
    setMeetingLabel(record.label ?? '')
    setReportMode('regional')
    setSelectedSubgroups([])
    setSelectedCategories([])
    setAttendedRawCount(record.attended_count ?? 0)
    setRestoredFromSession(false)
    sessionStorage.setItem(
      'meeting_report_state',
      JSON.stringify({
        phase: 'report',
        report: nextReport,
        reportMode: 'regional',
        selectedSubgroups: [],
        selectedCategories: [],
        attendedRawCount: record.attended_count ?? 0,
        label: record.label ?? '',
        savedAt: new Date().toISOString(),
      }),
    )
    setSearchParams({ report: record.id })
  }

  async function handleDeleteHistory(id) {
    await supabase.from('meeting_attendance_reports').delete().eq('id', id)
    setHistory((prev) => prev.filter((record) => record.id !== id))
  }

  function handleEmailAbsentees() {
    if (!report?.absent || report.absent.length === 0) {
      showToast('No absent members to email.', { tone: 'warning' })
      return
    }

    // Use rosterByKey Map for O(1) lookup instead of O(n²) roster.find()
    const rosterMap = new Map(roster.map((r) => [normalizeNameKey(r.full_name), r]))

    const absentWithEmails = report.absent.filter((person) => {
      const rosterMatch = rosterMap.get(normalizeNameKey(person.name))
      return rosterMatch?.email
    })

    if (absentWithEmails.length === 0) {
      showToast('No email addresses found for absent members.', { tone: 'warning' })
      return
    }

    const recipients = absentWithEmails.map((person) => {
      const rosterMatch = rosterMap.get(normalizeNameKey(person.name))
      return {
        name: person.name,
        email: rosterMatch.email,
      }
    })

    const defaultSubject = `We missed you at ${report.label}`
    const defaultBody = `Hi {{name}}, we missed you at ${report.label}. Please review the meeting attendance report.`

    setEmailEditor({
      recipients,
      subject: defaultSubject,
      body: defaultBody,
    })
    setShowEmailEditor(true)
  }

  async function handleSendCustomEmail() {
    if (!emailEditor) return

    setEmailSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('send-absence-emails', {
        body: {
          report_id: report.id,
          recipients: emailEditor.recipients,
          subject: emailEditor.subject,
          body_template: emailEditor.body,
          meeting_label: report.label,
        },
      })

      if (error) throw error

      let message = `Sent to ${data.sent} member${data.sent !== 1 ? 's' : ''}`
      if (data.skipped > 0) {
        message += `, ${data.skipped} skipped`
      }
      if (data.failed > 0) {
        message += `, ${data.failed} failed`
      }
      showToast(message, { tone: 'success' })
      setEmailEditor(null)
      setShowEmailEditor(false)
      setEmailConfirmation(null)
    } catch (err) {
      showToast(`Failed to send emails: ${err.message}`, { tone: 'error' })
    } finally {
      setEmailSending(false)
    }
  }

  async function handleExportToGoogleDrive() {
    if (!report) return

    try {
      setExportingToDrive(true)

      // Check if user has Google Drive auth, request if not
      const hasAuth = await checkGoogleDriveAuth()
      if (!hasAuth) {
        showToast('Authorizing Google Drive access...', { tone: 'info' })
        // setupGoogleDriveAuth will redirect, so we just return here
        return
      }

      // Get the report element for PDF generation
      const reportElement = document.querySelector('#print-report') || null

      // Create filename with date and report title
      const reportDate = new Date().toISOString().split('T')[0]
      const sanitizedTitle = (report.label || 'Report').replace(/[^a-z0-9-]/gi, '_')
      const fileName = `Nexus-Report-${sanitizedTitle}-${reportDate}.pdf`

      // Export to Google Drive
      const result = await exportReportToGoogleDrive(report, reportElement, fileName)

      if (result.success) {
        showToast('Report saved to Google Drive!', { tone: 'success' })
        // Report saved successfully - link available in success notification
      }
    } catch (err) {
      const errorMessage = err.message || String(err)
      if (errorMessage.includes('authorize')) {
        showToast('Please authorize Google Drive access and try again', { tone: 'warning' })
      } else {
        showToast(`Export error: ${errorMessage}`, { tone: 'error' })
      }
    } finally {
      setExportingToDrive(false)
    }
  }

  const canGenerate = !rosterLoading && !rosterError && !attendedError

  if (report && visibleReport) {
    const band = reachBand(visibleReport.reachPct)
    const pctDisplay = `${Math.round(visibleReport.reachPct * 100)}%`
    const subgroupLabel = activeSubgroup || report.subgroupFilter || 'All subgroups'
    const printedAt = timestampLabel()
    const regionalSubgroups = report.subgroups ?? subgroupBreakdown.map((group) => group.subgroup)
    const printedSubgroupData = printingSubgroup ? report.bySubgroup?.[printingSubgroup] ?? null : null
    const printSubgroupList = printingSubgroup ? [printingSubgroup] : regionalSubgroups
    const shareUrl = report.share_token ? `${window.location.origin}/reports/${report.share_token}` : ''

    return (
      <>
        <style>{PRINT_STYLES}</style>
        <div className="screen-report-root" style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', margin: '-1.5rem', background: '#F2EFF8' }}>
          <header
            className="report-header screen-only"
            style={{
              background: 'linear-gradient(135deg, #2D1B69 0%, #4C2A92 50%, #6B3FAF 100%)',
              padding: '18px 24px',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Users size={20} color="#DCE9F8" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: 'white', letterSpacing: '-0.01em' }}>BLW CAN NEXUS</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em',
                      padding: '2px 10px', borderRadius: 999,
                      border: '1px solid rgba(184,212,255,0.22)',
                      color: '#B8D4FF',
                      background: 'rgba(255,255,255,0.05)',
                    }}>
                      Meeting Report
                    </span>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      background: 'rgba(255,255,255,0.08)', color: '#F8FBFF',
                      borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 500,
                    }}>
                      <CalendarRange size={13} />
                      {report.label}
                    </span>
                    {(report.subgroupFilter || activeSubgroup) && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: 'rgba(255,255,255,0.06)', color: '#C4D8F5',
                        borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 500,
                      }}>
                        {subgroupLabel}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="report-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {report.id && report.share_token ? (
                  <button
                    type="button"
                    onClick={() => setShowShareModal(true)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      background: 'rgba(255,255,255,0.10)', color: '#DCE9F8',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    <Link2 size={13} /> {copiedLink ? 'Link Copied!' : 'Share Report'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleEmailAbsentees}
                  disabled={emailSending || !report.absent || report.absent.length === 0}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'rgba(255,255,255,0.10)', color: '#DCE9F8',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: emailSending ? 'not-allowed' : 'pointer',
                    opacity: emailSending || !report.absent || report.absent.length === 0 ? 0.5 : 1,
                  }}
                >
                  <Mail size={13} /> {emailSending ? 'Sending...' : `Email Absent (${report.absent?.length || 0})`}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: '#2D1B69', color: 'white', border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <Printer size={13} /> Print / PDF
                </button>
                <button
                  type="button"
                  onClick={handleExportToGoogleDrive}
                  disabled={exportingToDrive}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: '#2D1B69', color: 'white', border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: exportingToDrive ? 'not-allowed' : 'pointer',
                    opacity: exportingToDrive ? 0.6 : 1,
                  }}
                >
                  <Files size={13} /> {exportingToDrive ? 'Saving...' : 'Save to Drive'}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'rgba(255,255,255,0.10)', color: '#DCE9F8',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <RotateCcw size={13} /> New Report
                </button>
              </div>
            </div>
          </header>

          <main style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ maxWidth: 820, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="screen-only" style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(28,22,16,.06)' }}>
              <div style={{ background: '#1E1A2E', color: '#E8E0FF', padding: '8px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                Summary
              </div>
              <div style={{ padding: '16px' }}>
                <div className="report-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                  <KpiTile label="Expected" value={visibleReport.expectedCount} bg="#F4F1EA" bd="#EDE8DC" circle="rgba(76,42,146,.12)" labelColor="#9E9488" valueColor="#2D2A22" />
                  <KpiTile label="Attended" value={visibleReport.attendedCount} bg="#EEF6F1" bd="#C3E0CC" circle="rgba(45,134,83,.15)" labelColor="#2D8653" valueColor="#1B5E3C" />
                  <KpiTile label="Absent" value={visibleReport.absentCount} bg="#FEF0ED" bd="#F5C4B8" circle="rgba(201,72,48,.15)" labelColor="#C94830" valueColor="#7A1C24" />
                  <KpiTile label="New Leaders" value={visibleReport.unexpectedCount} bg="#FFF8EC" bd="#EDD88A" circle="rgba(232,160,32,.15)" labelColor="#E8A020" valueColor="#7A5A00" />
                </div>
                <div style={{ borderRadius: 12, border: `1px solid ${band.border}`, background: band.bg, padding: '20px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: band.fg, marginBottom: 4 }}>Reach %</div>
                  <div style={{ fontSize: 48, fontWeight: 800, color: band.fg, lineHeight: 1 }}>{pctDisplay}</div>
                  <div style={{ fontSize: 12, color: band.fg, marginTop: 6, opacity: 0.75 }}>
                    {visibleReport.present.length} of {visibleReport.expectedCount} expected members attended
                  </div>
                </div>
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="screen-only" style={{ background: 'white', borderRadius: 12, padding: '12px', display: 'flex', gap: 8, borderBottom: '1px solid #EDE8DC' }}>
              <button
                type="button"
                onClick={() => setViewMode('single')}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: viewMode === 'single' ? '2px solid #4C2A92' : '1px solid #EDE8DC',
                  background: viewMode === 'single' ? '#F0EBFC' : 'white',
                  color: viewMode === 'single' ? '#4C2A92' : '#6B6560',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
              >
                Single Meeting
              </button>
              <button
                type="button"
                onClick={() => setViewMode('trends')}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: viewMode === 'trends' ? '2px solid #4C2A92' : '1px solid #EDE8DC',
                  background: viewMode === 'trends' ? '#F0EBFC' : 'white',
                  color: viewMode === 'trends' ? '#4C2A92' : '#6B6560',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <TrendingDown size={16} />
                Attendance Trends
              </button>
            </div>

            {viewMode === 'trends' ? (
              <AttendanceTrendsView subgroupFilter={activeSubgroup || null} />
            ) : (
              <>
              {reportMode === 'regional' ? (
                <>
                  {reportSubgroups.length > 1 && (
                    <SubgroupTabBar subgroups={reportSubgroups} activeSubgroup={activeSubgroup} onChange={setActiveSubgroup} />
                  )}

                  <SubgroupBreakdown groups={subgroupBreakdown} />

                  <CategoryFilterBar categoryOptions={categoryOptions} activeCategory={activeCategory} onChange={setActiveCategory} />

                  {categoryFilteredPresent.length > 0 && (
                    <div className="report-name-section screen-only" style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(28,22,16,.06)' }}>
                      <div style={{ background: '#1E1A2E', color: '#E8E0FF', padding: '8px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Present</span>
                        <span style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '1px 9px', fontWeight: 700 }}>{categoryFilteredPresent.length}</span>
                      </div>
                      <div style={{ padding: '12px 14px' }}>
                        {categoryFilteredPresent.map((item, index) => (
                          <PersonChip key={item.name + index} person={item} bg="#EEF8F2" color="#1B5E3C" simple={report.fromHistory} />
                        ))}
                      </div>
                    </div>
                  )}

                  {categoryFilteredAbsent.length > 0 && (
                    <div className="report-name-section screen-only" style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(28,22,16,.06)' }}>
                      <div style={{ background: '#1E1A2E', color: '#E8E0FF', padding: '8px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Absent</span>
                        <span style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '1px 9px', fontWeight: 700 }}>{categoryFilteredAbsent.length}</span>
                      </div>
                      <div style={{ padding: '12px 14px' }}>
                        {categoryFilteredAbsent.map((item, index) => (
                          <PersonChip key={item.name + index} person={item} bg="#FEF0ED" color="#7A1C24" simple={report.fromHistory} />
                        ))}
                      </div>
                    </div>
                  )}

                  {visibleReport.unexpected.length > 0 && (
                    <div className="report-name-section screen-only" style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(28,22,16,.06)' }}>
                      <div style={{ background: '#1E1A2E', color: '#E8E0FF', padding: '8px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>New Leaders</span>
                        <span style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '1px 9px', fontWeight: 700 }}>{visibleReport.unexpected.length}</span>
                      </div>
                      <div style={{ padding: '12px 14px' }}>
                        {visibleReport.unexpected.map((item, index) => (
                          <PersonChip key={item.name + index} person={item.name} bg="#FFF8EC" color="#7A5A00" simple />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="screen-only subgroup-tab-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 2 }}>
                    {reportSubgroups.map((subgroup) => (
                      <button
                        key={subgroup}
                        type="button"
                        onClick={() => setActiveSubgroup(subgroup)}
                        style={{
                          border: activeSubgroup === subgroup ? '1px solid #4C2A92' : '1px solid #D8D3C9',
                          background: activeSubgroup === subgroup ? '#F0EBFC' : 'white',
                          color: activeSubgroup === subgroup ? '#4C2A92' : '#6B6560',
                          borderRadius: 999,
                          padding: '6px 12px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {subgroup}
                      </button>
                    ))}
                    {report.visitors?.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveSubgroup(NEW_LEADERS_TAB)}
                        style={{
                          border: activeSubgroup === NEW_LEADERS_TAB ? '1px solid #4C2A92' : '1px solid #D8D3C9',
                          background: activeSubgroup === NEW_LEADERS_TAB ? '#F0EBFC' : 'white',
                          color: activeSubgroup === NEW_LEADERS_TAB ? '#4C2A92' : '#6B6560',
                          borderRadius: 999,
                          padding: '6px 12px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        New Leaders ({report.visitors.length})
                      </button>
                    )}
                  </div>

                  {activeSubgroup && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 16px', background: 'white', borderRadius: 12, boxShadow: '0 1px 4px rgba(28,22,16,.06)' }}>
                      <div>
                        {activeSubgroup === NEW_LEADERS_TAB ? (
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#2D2A22' }}>New Leaders — {report.visitors?.length ?? 0} attendee{(report.visitors?.length ?? 0) !== 1 ? 's' : ''}</div>
                        ) : (
                          <>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#2D2A22' }}>{activeSubgroup}</div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6, fontSize: 12, color: '#6B6560' }}>
                              <span>Expected {subgroupBreakdown.find(g => g.subgroup === activeSubgroup)?.expectedCount ?? 0}</span>
                              <span>Present {subgroupBreakdown.find(g => g.subgroup === activeSubgroup)?.present?.length ?? 0}</span>
                              <span>Absent {subgroupBreakdown.find(g => g.subgroup === activeSubgroup)?.absent?.length ?? 0}</span>
                              <span style={{ fontWeight: 700, color: '#4C2A92' }}>{Math.round((subgroupBreakdown.find(g => g.subgroup === activeSubgroup)?.reachPct ?? 0) * 100)}%</span>
                            </div>
                          </>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => {
                            setPrintingSubgroup(activeSubgroup)
                            setTimeout(() => {
                              window.print()
                              setPrintingSubgroup(null)
                            }, 300)
                          }}
                          style={{ border: '1px solid #EDE8DC', background: 'white', color: '#4C2A92', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                        >
                          {activeSubgroup === NEW_LEADERS_TAB ? 'Print New Leaders' : 'Print This Subgroup'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPrintingSubgroup(null)
                            setTimeout(() => window.print(), 300)
                          }}
                          style={{ border: '1px solid #EDE8DC', background: 'white', color: '#4C2A92', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Print All
                        </button>
                      </div>
                    </div>
                  )}

                  {activeSubgroup === NEW_LEADERS_TAB ? (
                    <>
                      {report.visitors?.length > 0 ? (
                        <div className="report-name-section screen-only" style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(28,22,16,.06)' }}>
                          <div style={{ background: '#1E1A2E', color: '#E8E0FF', padding: '8px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>New Leaders</span>
                            <span style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '1px 9px', fontWeight: 700 }}>{report.visitors.length}</span>
                          </div>
                          <div style={{ padding: '12px 14px' }}>
                            {report.visitors.map((name, index) => (
                              <PersonChip key={name + index} person={name} bg="#FFF8EC" color="#7A5A00" simple />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#9E9488', textAlign: 'center', padding: '20px' }}>No new leaders.</div>
                      )}
                    </>
                  ) : (
                    <>
                      <CategoryFilterBar categoryOptions={categoryOptions} activeCategory={activeCategory} onChange={setActiveCategory} />

                      {categoryFilteredPresent.length > 0 ? (
                        <div className="report-name-section screen-only" style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(28,22,16,.06)' }}>
                          <div style={{ background: '#1E1A2E', color: '#E8E0FF', padding: '8px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Present</span>
                            <span style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '1px 9px', fontWeight: 700 }}>{categoryFilteredPresent.length}</span>
                          </div>
                          <div style={{ padding: '12px 14px' }}>
                            {categoryFilteredPresent.map((item, index) => (
                              <PersonChip key={item.name + index} person={item} bg="#EEF8F2" color="#1B5E3C" simple={report.fromHistory} />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#9E9488', textAlign: 'center', padding: '20px' }}>No present members.</div>
                      )}

                      {categoryFilteredAbsent.length > 0 ? (
                        <div className="report-name-section screen-only" style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(28,22,16,.06)' }}>
                          <div style={{ background: '#1E1A2E', color: '#E8E0FF', padding: '8px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Absent</span>
                            <span style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '1px 9px', fontWeight: 700 }}>{categoryFilteredAbsent.length}</span>
                          </div>
                          <div style={{ padding: '12px 14px' }}>
                            {categoryFilteredAbsent.map((item, index) => (
                              <PersonChip key={item.name + index} person={item} bg="#FEF0ED" color="#7A1C24" simple={report.fromHistory} />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#9E9488', textAlign: 'center', padding: '20px' }}>No absent members.</div>
                      )}
                    </>
                  )}
                </>
              )}

              {saveError && (
                <div className="screen-only" style={{ fontSize: 12, color: '#C94830', background: '#FEF0ED', border: '1px solid #F5C4B8', borderRadius: 10, padding: '10px 14px' }}>
                  Failed to save report: {saveError}
                </div>
              )}
              {saving && <div className="screen-only" style={{ fontSize: 12, color: '#9E9488', textAlign: 'center' }}>Saving to history...</div>}
              </>
            )}
            </div>

          </main>
        </div>

        <div id="print-report">
          <div className="print-doc" style={{ width: '100%', color: '#2C2C2A', fontFamily: 'Helvetica, Arial, sans-serif' }}>
            <div className="print-section print-no-break" style={{ marginTop: 0 }}>
              <div style={{ width: '100%', background: '#3D1A78', color: 'white', padding: '20px 22px', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '0.01em' }}>BLW CAN NEXUS</div>
                    <div style={{ fontSize: 13, marginTop: 5, opacity: 0.92 }}>
                      {printingSubgroup ? `${printingSubgroup} Attendance Report` : 'Regional Attendance Report'}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 8, color: '#E8DFFF' }}>{report.label}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-block', border: '1px solid rgba(255,255,255,0.45)', borderRadius: 999, padding: '5px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                      Internal Report
                    </div>
                    <div style={{ marginTop: 18, fontSize: 11, color: '#E8DFFF' }}>Generated {printedAt}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="print-section print-no-break" style={{ marginTop: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.9fr', gap: 16, alignItems: 'stretch' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                  {[
                    { label: 'Expected', value: printingSubgroup && printedSubgroupData ? printedSubgroupData.expected.length : visibleReport.expectedCount, accent: '#3D1A78' },
                    { label: 'Present', value: printingSubgroup && printedSubgroupData ? printedSubgroupData.present.length : visibleReport.present.length, accent: '#085041' },
                    { label: 'Absent', value: printingSubgroup && printedSubgroupData ? printedSubgroupData.absent.length : visibleReport.absent.length, accent: '#712B13' },
                    { label: 'New Leaders', value: report.visitors?.length ?? 0, accent: '#633806' },
                  ].map((tile) => (
                    <div key={tile.label} style={{ background: '#FFFFFF', border: '1px solid #DDD7C8', borderLeft: `5px solid ${tile.accent}`, borderRadius: 10, padding: '12px 12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6A675F' }}>{tile.label}</div>
                      <div style={{ marginTop: 10, fontSize: 28, lineHeight: 1, fontWeight: 700, color: '#2C2C2A' }}>{tile.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: '#FFFFFF', border: '1px solid #DDD7C8', borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                      width: 102,
                      height: 102,
                      borderRadius: '50%',
                      border: '10px solid #E6E0D2',
                      borderTopColor: band.fg,
                      borderRightColor: band.fg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <div style={{ fontSize: 31, fontWeight: 700, color: '#633806', lineHeight: 1 }}>{pctDisplay}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6A675F' }}>Attendance Reach</div>
                      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.4, color: '#2C2C2A' }}>
                        {visibleReport.present.length} of {visibleReport.expectedCount} expected members attended
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {!printingSubgroup && (
              <>
                <div className="print-section">
                  <div className="print-section-header" style={{ background: '#3D1A78', color: 'white', padding: '9px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                    Subgroup Summary
                  </div>
                  <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #DDD7C8', borderTop: 'none' }}>
                    <thead>
                      <tr>
                        {['Subgroup', 'Expected', 'Present', 'Absent', 'New Leaders', 'Attendance %'].map((heading) => (
                          <th key={heading} style={{ background: '#3D1A78', color: 'white', padding: '10px 12px', fontSize: 11.5, textAlign: heading === 'Attendance %' ? 'right' : 'left' }}>{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {subgroupBreakdown.map((group, index) => {
                        const pct = Math.round(group.reachPct * 100)
                        const tone = pct >= 50 ? '#085041' : pct >= 30 ? '#633806' : '#712B13'
                        return (
                          <tr key={group.subgroup} className="print-table-row" style={{ background: index % 2 === 0 ? '#FFFFFF' : '#F6F6F3' }}>
                            <td style={{ padding: '10px 12px', fontSize: 11.5, borderBottom: '1px solid #E6E1D6', fontWeight: 700 }}>{group.subgroup}</td>
                            <td style={{ padding: '10px 12px', fontSize: 11.5, borderBottom: '1px solid #E6E1D6' }}>{group.expectedCount}</td>
                            <td style={{ padding: '10px 12px', fontSize: 11.5, borderBottom: '1px solid #E6E1D6' }}>{group.present.length}</td>
                            <td style={{ padding: '10px 12px', fontSize: 11.5, borderBottom: '1px solid #E6E1D6' }}>{group.absent.length}</td>
                            <td style={{ padding: '10px 12px', fontSize: 11.5, borderBottom: '1px solid #E6E1D6' }}>0</td>
                            <td style={{ padding: '10px 12px', fontSize: 11.5, borderBottom: '1px solid #E6E1D6', textAlign: 'right' }}>
                              <span style={{ display: 'inline-block', minWidth: 46, textAlign: 'center', borderRadius: 999, padding: '3px 10px', color: 'white', background: tone, fontWeight: 700 }}>
                                {pct}%
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="print-section print-no-break">
                  <div className="print-section-header" style={{ color: '#3D1A78', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                    Attendance by Subgroup
                  </div>
                  <div style={{ border: '1px solid #DDD7C8', borderRadius: 12, padding: '14px 16px', background: '#FFFFFF' }}>
                    <div className="print-gridlines" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 6 }}>
                      {subgroupBreakdown.map((group) => {
                        const pct = Math.round(group.reachPct * 100)
                        const tone = pct >= 50 ? '#085041' : pct >= 30 ? '#633806' : '#712B13'
                        return (
                          <div key={group.subgroup} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 54px', gap: 12, alignItems: 'center' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#2C2C2A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.subgroup}</div>
                            <div style={{ height: 16, background: '#F1EFE8', borderRadius: 999, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: tone, borderRadius: 999 }} />
                            </div>
                            <div style={{ fontSize: 11, textAlign: 'right', fontWeight: 700, color: tone }}>{pct}%</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}

            {printingSubgroup === NEW_LEADERS_TAB ? (
              <div key="new-leaders" className="print-section">
                <div className="print-section-header" style={{ background: '#3D1A78', color: 'white', padding: '9px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                  New Leaders ({report.visitors?.length ?? 0})
                </div>
                {report.visitors?.length > 0 ? (
                  <div style={{ border: '1px solid #DDD7C8', borderTop: 'none', borderRadius: '0 0 12px 12px', background: '#FFFFFF', padding: '4px 14px 6px' }}>
                    {report.visitors.map((name, index) => (
                      <div key={name + index} style={{ padding: '10px 0', borderBottom: index < report.visitors.length - 1 ? '1px solid #ECE8DE' : 'none' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#2C2C2A' }}>{name}</div>
                        <div style={{ marginTop: 3, fontSize: 8, color: '#7B776F' }}>New leader / unmatched roster entry</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ border: '1px solid #DDD7C8', borderTop: 'none', borderRadius: '0 0 12px 12px', background: '#FFFFFF', padding: '10px 14px', fontSize: 11, color: '#8A857A' }}>
                    No new leaders.
                  </div>
                )}
              </div>
            ) : (
              printSubgroupList.map((subgroup, subgroupIndex) => {
                const subgroupData = report.bySubgroup?.[subgroup]
                if (!subgroupData) return null
                const subgroupPct = subgroupData.expected.length > 0 ? Math.round((subgroupData.present.length / subgroupData.expected.length) * 100) : 0
                const subgroupTone = subgroupPct >= 50 ? '#085041' : subgroupPct >= 30 ? '#633806' : '#712B13'
                return (
                  <div key={subgroup} className={`print-section ${!printingSubgroup && subgroupIndex > 0 ? 'print-page-break' : ''}`}>
                    <div className="print-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#3D1A78', color: 'white', borderRadius: 999, padding: '8px 16px', fontSize: 12, fontWeight: 700 }}>
                        <span>{subgroup}</span>
                      </div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '6px 12px', background: '#FFFFFF', border: `1px solid ${subgroupTone}`, color: subgroupTone, fontSize: 11, fontWeight: 700 }}>
                        {subgroupPct}% Attendance
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
                      {[
                        { title: `Present (${subgroupData.present.length})`, people: subgroupData.present, tone: '#085041', bg: '#FBFDFC' },
                        { title: `Absent (${subgroupData.absent.length})`, people: subgroupData.absent, tone: '#712B13', bg: '#FFFDFC' },
                      ].map((column) => (
                        <div key={column.title} style={{ background: column.bg, border: '1px solid #DDD7C8', borderRadius: 12, overflow: 'hidden' }}>
                          <div style={{ padding: '10px 14px', borderBottom: '1px solid #E6E1D6', color: column.tone, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                            {column.title}
                          </div>
                          <div style={{ padding: '4px 14px 6px' }}>
                            {column.people.length === 0 ? (
                              <div style={{ padding: '10px 0', fontSize: 11, color: '#8A857A' }}>No members listed.</div>
                            ) : column.people.map((person, index) => (
                              <div key={person.name + index} style={{ padding: '10px 0', borderBottom: index < column.people.length - 1 ? '1px solid #ECE8DE' : 'none' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#2C2C2A' }}>{person.name}</div>
                                <div style={{ marginTop: 3, fontSize: 8, color: '#7B776F' }}>{person.leadership_category || 'No role listed'}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {printingSubgroup && report.visitors?.length > 0 && (
                      <div className="print-no-break" style={{ marginTop: 14, border: '1px solid #DDD7C8', borderRadius: 12, overflow: 'hidden', background: '#FFFFFF' }}>
                        <div style={{ padding: '10px 14px', borderBottom: '1px solid #E6E1D6', color: '#633806', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                          New Leaders ({report.visitors.length})
                        </div>
                        <div style={{ padding: '4px 14px 6px' }}>
                          {report.visitors.map((name, index) => (
                            <div key={name + index} style={{ padding: '10px 0', borderBottom: index < report.visitors.length - 1 ? '1px solid #ECE8DE' : 'none' }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#2C2C2A' }}>{name}</div>
                              <div style={{ marginTop: 3, fontSize: 8, color: '#7B776F' }}>New leader / unmatched roster entry</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}

            {!printingSubgroup && report.visitors?.length > 0 && (
              <div className="print-section print-page-break">
                <div className="print-section-header" style={{ background: '#3D1A78', color: 'white', padding: '9px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                  New Leaders ({report.visitors.length})
                </div>
                <div style={{ border: '1px solid #DDD7C8', borderTop: 'none', borderRadius: '0 0 12px 12px', background: '#FFFFFF', padding: '4px 14px 6px' }}>
                  {report.visitors.map((name, index) => (
                    <div key={name + index} style={{ padding: '10px 0', borderBottom: index < report.visitors.length - 1 ? '1px solid #ECE8DE' : 'none' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#2C2C2A' }}>{name}</div>
                      <div style={{ marginTop: 3, fontSize: 8, color: '#7B776F' }}>New leader / unmatched roster entry</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="print-section print-no-break">
              <div className="print-section-header" style={{ background: '#F1EFE8', color: '#2C2C2A', padding: '10px 14px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', border: '1px solid #DDD7C8' }}>
                Report Notes
              </div>
              <div style={{ background: '#FFFFFF', padding: '12px 14px', fontSize: 11, border: '1px solid #DDD7C8', borderTop: 'none', lineHeight: 1.55 }}>
                {[
                  `Attendance CSV processed: ${attendedRawCount} records`,
                  `Matched ${printingSubgroup && printedSubgroupData ? printedSubgroupData.present.length : visibleReport.present.length} of ${printingSubgroup && printedSubgroupData ? printedSubgroupData.expected.length : visibleReport.expectedCount} expected attendees`,
                  `New Leaders: ${report.visitors?.length ?? 0}`,
                  ...(selectedSubgroups.length > 0 ? [`Filter applied: ${selectedSubgroups.join(', ')}`] : []),
                  ...(printingSubgroup ? [`Report scope: ${printingSubgroup}`] : []),
                ].map((message) => (
                  <div key={message} style={{ marginBottom: 7, color: '#2C2C2A' }}>{message}</div>
                ))}
              </div>
            </div>

            <div className="print-footer">
              <span>BLW CAN NEXUS | {report.label}</span>
              <span>Page <span className="print-page-number" /></span>
            </div>
          </div>
        </div>

        {/* Share Report Link Modal - Full Panel */}
        {showShareModal && report && (
          <>
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} onClick={() => setShowShareModal(false)} />
            <div style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              borderRadius: 12,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              zIndex: 1000,
              maxWidth: 700,
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: 0,
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Header */}
              <div style={{ padding: '20px', borderBottom: '1px solid #EDE8DC', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1C1C1C' }}>Share Report Links</h2>
                <button
                  type="button"
                  onClick={() => setShowShareModal(false)}
                  style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#9E9488', padding: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  ×
                </button>
              </div>

              {/* Content */}
              <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
                <SubgroupShareLinksPanel report={report} expandedByDefault={true} />
              </div>
            </div>
          </>
        )}
      </>
    )
  }

  const activeCount = roster.filter((row) => row.active).length

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#2D2A22' }}>Attendance Report</h2>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: '#9E9488' }}>
            Select subgroup coverage, upload the attended list, and generate.
          </p>
        </div>
        <button
          className="screen-only roster-link"
          type="button"
          onClick={() => navigate('/meetings?tab=roster')}
          style={{ flexShrink: 0, border: '1px solid #EDE8DC', background: 'white', color: '#4C2A92', borderRadius: 9, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Manage Roster ({rosterLoading ? '...' : activeCount} active)
        </button>
      </div>

      {rosterError && (
        <div style={{ fontSize: 12.5, color: '#C94830', background: '#FEF0ED', border: '1px solid #F5C4B8', borderRadius: 10, padding: '10px 14px' }}>
          Could not load roster: {rosterError}. <button type="button" onClick={loadRoster} style={{ color: '#4C2A92', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0 }}>Retry</button>
        </div>
      )}

      <div style={{ background: 'white', border: '1px solid #EDE8DC', borderRadius: 14, padding: '18px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#2D2A22', marginBottom: 6 }}>Meeting Label</label>
          <input
            type="text"
            value={meetingLabel}
            onChange={(e) => setMeetingLabel(e.target.value)}
            placeholder={`e.g. Sunday Service - ${todayLabel()}`}
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #EDE8DC', borderRadius: 9, padding: '9px 12px', fontSize: 13, color: '#2D2A22', background: '#FAFAF7', outline: 'none', fontFamily: 'inherit' }}
          />
          <div style={{ fontSize: 11, color: '#9E9488', marginTop: 4 }}>Defaults to today's date if blank.</div>
        </div>

        <ReportModeSelector reportMode={reportMode} onChange={setReportMode} />

        <SubgroupPillBar subgroupOptions={subgroupOptions} selectedSubgroups={selectedSubgroups} onToggle={handleToggleSubgroup} />

        <CategoryPillBar categoryOptions={leadershipCategoryOptions} selectedCategories={selectedCategories} onToggle={handleToggleCategory} />

        {filteredRoster.length === 0 && !rosterLoading && !rosterError && (
          <div style={{ marginTop: -6, fontSize: 11.5, color: '#E8A020' }}>
            No active people in the selected subgroup set.
              <button
                type="button"
                onClick={() => navigate('/meetings?tab=roster')}
                style={{ marginLeft: 6, color: '#4C2A92', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0, fontSize: 11.5 }}
              >
                Manage roster {'->'}
              </button>
          </div>
        )}

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#2D2A22', marginBottom: 6 }}>
            Attended List CSV <span style={{ color: '#9E9488', fontWeight: 400 }}>(optional - leave empty for absence-only report)</span>
          </div>
          <FileZone file={attendedFile} rowCount={attendedNames.length} error={attendedError} onFile={handleAttendedFile} />
        </div>

        <UnexpectedPreviewPanel
          preview={unexpectedPreview}
          subgroupOptions={subgroupOptions}
          categoryOptions={leadershipCategoryOptions}
          onToggle={(index, selected) => setUnexpectedPreview((prev) => prev.map((item, i) => i === index ? { ...item, selected } : item))}
          onSelectAll={() => setUnexpectedPreview((prev) => prev.map((item) => ({ ...item, selected: true })))}
          onDeselectAll={() => setUnexpectedPreview((prev) => prev.map((item) => ({ ...item, selected: false })))}
          onChangeField={(index, field, value) => setUnexpectedPreview((prev) => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))}
        />
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={!canGenerate}
        style={{
          background: '#4C2A92',
          color: 'white',
          border: 'none',
          borderRadius: 11,
          padding: '11px 20px',
          fontSize: 14,
          fontWeight: 700,
          cursor: canGenerate ? 'pointer' : 'not-allowed',
          opacity: canGenerate ? 1 : 0.5,
          transition: 'opacity .15s',
        }}
      >
        Generate Report
      </button>

      {!rosterLoading && filteredRoster.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #EDE8DC', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#9E9488', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
            Expected from roster - {filteredRoster.length} {selectedSubgroups.length > 0 ? 'in selected subgroups' : 'total active'}
          </div>
          <div>
            {filteredRoster.slice(0, 30).map((row) => (
              <span key={row.id} style={{ display: 'inline-block', fontSize: 11.5, color: '#2D2A22', background: '#F4F1EA', borderRadius: 6, padding: '2px 8px', margin: '2px 3px 2px 0' }}>
                {row.full_name}
              </span>
            ))}
            {filteredRoster.length > 30 && <span style={{ fontSize: 11.5, color: '#9E9488' }}>+{filteredRoster.length - 30} more</span>}
          </div>
        </div>
      )}

      {!loadingHistory && history.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #EDE8DC', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #EDE8DC' }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#9E9488' }}>Recent Reports</span>
          </div>
          {history.map((record) => (
            <HistoryRow key={record.id} record={record} onView={handleViewHistory} onDelete={handleDeleteHistory} />
          ))}
        </div>
      )}

      {/* Confirmation Modal */}
      {emailConfirmation && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1001 }} />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'white',
            borderRadius: 12,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            zIndex: 1002,
            maxWidth: 500,
            width: '90%',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#2D1B69' }}>Confirm Email Send</h3>
            <div style={{ fontSize: 14, color: '#2D2A22', lineHeight: 1.6 }}>
              <p style={{ margin: '0 0 12px 0' }}>
                You are about to send an email to <strong>{emailConfirmation.recipientCount} recipient{emailConfirmation.recipientCount !== 1 ? 's' : ''}</strong>:
              </p>
              <div style={{
                background: '#F9F7F3',
                border: '1px solid #EDE8DC',
                borderRadius: 6,
                padding: '12px',
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#9E9488', marginBottom: 4 }}>Subject:</div>
                <div style={{ fontSize: 13, color: '#2D2A22' }}>{emailConfirmation.subject}</div>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: '#9E9488', fontStyle: 'italic' }}>
                ⚠️ This action cannot be undone. All recipients will receive this email.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setEmailConfirmation(null)}
                disabled={emailSending}
                style={{
                  padding: '10px 16px',
                  borderRadius: 6,
                  border: '1px solid #EDE8DC',
                  background: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: emailSending ? 'not-allowed' : 'pointer',
                  color: '#2D2A22',
                  opacity: emailSending ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmailConfirmation(null)
                  handleSendCustomEmail()
                }}
                disabled={emailSending}
                style={{
                  padding: '10px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#4C2A92',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: emailSending ? 'not-allowed' : 'pointer',
                  opacity: emailSending ? 0.6 : 1,
                }}
              >
                {emailSending ? 'Sending...' : 'Yes, Send Email'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Email Editor Modal */}
      {showEmailEditor && emailEditor && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} onClick={() => !emailSending && setShowEmailEditor(false)} />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'white',
            borderRadius: 12,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            zIndex: 1000,
            maxWidth: 600,
            maxHeight: '85vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            width: '90%'
          }}>
            {/* Header */}
            <div style={{ padding: '20px', borderBottom: '1px solid #EDE8DC', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1C1C1C' }}>Customize Email</h2>
              <button
                type="button"
                onClick={() => setShowEmailEditor(false)}
                disabled={emailSending}
                style={{ background: 'none', border: 'none', fontSize: 24, cursor: emailSending ? 'not-allowed' : 'pointer', color: '#9E9488', padding: 0, opacity: emailSending ? 0.5 : 1 }}
              >
                ×
              </button>
            </div>

            {/* Recipients Info */}
            <div style={{ padding: '16px 20px', background: '#F9F7F3', borderBottom: '1px solid #EDE8DC', flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#9E9488', marginBottom: 8 }}>
                Sending to {emailEditor.recipients.length} recipient{emailEditor.recipients.length !== 1 ? 's' : ''}:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {emailEditor.recipients.map((r) => (
                  <span key={r.email} style={{ fontSize: 11, background: 'white', border: '1px solid #EDE8DC', borderRadius: 4, padding: '4px 8px', color: '#2D2A22' }}>
                    {r.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Email Content */}
            <div style={{ padding: '20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Subject */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#2D2A22', display: 'block', marginBottom: 6 }}>Subject:</label>
                <input
                  type="text"
                  value={emailEditor.subject}
                  onChange={(e) => setEmailEditor({ ...emailEditor, subject: e.target.value })}
                  disabled={emailSending}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 12px',
                    border: '1px solid #EDE8DC',
                    borderRadius: 6,
                    fontSize: 13,
                    fontFamily: 'inherit',
                    color: '#2D2A22',
                    opacity: emailSending ? 0.6 : 1,
                  }}
                />
              </div>

              {/* Body */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#2D2A22', marginBottom: 6 }}>Message:</label>
                <textarea
                  value={emailEditor.body}
                  onChange={(e) => setEmailEditor({ ...emailEditor, body: e.target.value })}
                  disabled={emailSending}
                  style={{
                    flex: 1,
                    padding: '12px',
                    border: '1px solid #EDE8DC',
                    borderRadius: 6,
                    fontSize: 13,
                    fontFamily: 'inherit',
                    color: '#2D2A22',
                    resize: 'none',
                    opacity: emailSending ? 0.6 : 1,
                  }}
                  placeholder="Enter email message..."
                />
              </div>

              {/* Help text */}
              <div style={{ fontSize: 11, color: '#9E9488', background: '#F9F7F3', padding: '12px', borderRadius: 6 }}>
                <strong>Available variables:</strong> {{name}}, {{meeting_label}}, {{next_date}}, {{recap}}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid #EDE8DC', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setShowEmailEditor(false)}
                disabled={emailSending}
                style={{
                  padding: '10px 16px',
                  borderRadius: 6,
                  border: '1px solid #EDE8DC',
                  background: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: emailSending ? 'not-allowed' : 'pointer',
                  color: '#2D2A22',
                  opacity: emailSending ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  // Show confirmation modal before sending
                  setEmailConfirmation({
                    recipientCount: emailEditor.recipients.length,
                    subject: emailEditor.subject,
                    willProceed: false,
                  })
                }}
                disabled={emailSending || !emailEditor.subject.trim() || !emailEditor.body.trim()}
                style={{
                  padding: '10px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#4C2A92',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: emailSending ? 'not-allowed' : 'pointer',
                  opacity: emailSending || !emailEditor.subject.trim() || !emailEditor.body.trim() ? 0.6 : 1,
                }}
              >
                {emailSending ? 'Sending...' : 'Send Emails'}
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  )
}
