import { useEffect, useMemo, useState } from 'react'
import { Mail, Filter, AlertCircle, Check, X } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase'
import { buildChronicAbsenceData, fetchRecentReports, getChronicAbsenceColor } from '../lib/chronic-absence'
import EmailCustomizerModal from './EmailCustomizerModal'
import SendLogModal from './SendLogModal'

const STATS_STYLE = {
  display: 'flex',
  gap: 16,
  padding: '16px 0',
  marginBottom: 16,
  flexWrap: 'wrap',
}

const STAT_PILL = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '12px 16px',
  background: '#F9F7F3',
  border: '1px solid #EDE8DC',
  borderRadius: 8,
  minWidth: 120,
}

const STAT_LABEL = {
  fontSize: 11,
  color: '#9E9488',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
}

const STAT_VALUE = {
  fontSize: 18,
  fontWeight: 700,
  color: '#2D2A22',
}

const ACTION_BAR = {
  position: 'sticky',
  bottom: 0,
  left: 0,
  right: 0,
  padding: '12px 16px',
  background: '#4C2A92',
  color: 'white',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  justifyContent: 'space-between',
  zIndex: 10,
  boxShadow: '0 -2px 8px rgba(0,0,0,0.1)',
}

const BUTTON = {
  padding: '8px 16px',
  borderRadius: 6,
  border: 'none',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.12s',
}

const PRIMARY_BUTTON = {
  ...BUTTON,
  background: 'white',
  color: '#4C2A92',
}

const TABLE_WRAPPER = {
  overflowX: 'auto',
  borderRadius: 8,
  border: '1px solid #EDE8DC',
  marginTop: 16,
}

const TABLE = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
}

const TH = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: '#9E9488',
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  background: '#F9F7F3',
  borderBottom: '1px solid #EDE8DC',
  whiteSpace: 'nowrap',
  position: 'sticky',
  top: 0,
  zIndex: 5,
}

const TD = {
  padding: '11px 12px',
  borderBottom: '1px solid #F5F2EC',
  verticalAlign: 'middle',
}

const CHECKBOX = {
  width: 18,
  height: 18,
  cursor: 'pointer',
  accentColor: '#4C2A92',
}

const ROW_ACCENT = {
  display: 'block',
  width: 3,
  height: '100%',
  position: 'absolute',
  left: 0,
  top: 0,
}

function LoadingState() {
  return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#9E9488', fontSize: 13 }}>
      Loading attendance trends...
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#9E9488', fontSize: 13 }}>
      <AlertCircle style={{ width: 32, height: 32, margin: '0 auto 12px', opacity: 0.5 }} />
      <p>No chronic absences detected in the last 5 meetings</p>
      <p style={{ fontSize: 12, marginTop: 8 }}>People with 3+ absences will appear here</p>
    </div>
  )
}

function formatDate(date) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

export default function AttendanceTrendsView({ subgroupFilter = null }) {
  const { profile } = useAuth()
  const [chronic, setChronic] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [showSendLog, setShowSendLog] = useState(false)
  const [singlePersonEmail, setSinglePersonEmail] = useState(null)

  const selectedPeople = useMemo(() => {
    return chronic.filter(p => selectedIds.has(p.id))
  }, [chronic, selectedIds])

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const reports = await fetchRecentReports(profile?.department_id, 5)
        const data = await buildChronicAbsenceData(profile?.department_id, reports, subgroupFilter)
        setChronic(data)
      } catch (err) {
        console.error('Failed to load chronic absence data:', err)
        setChronic([])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [profile?.department_id, subgroupFilter])

  function toggleSelect(id) {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  function toggleSelectAll() {
    if (selectedIds.size === chronic.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(chronic.map(p => p.id)))
    }
  }

  function openEmailForPerson(person) {
    setSinglePersonEmail(person)
    setShowEmailModal(true)
  }

  if (loading) return <LoadingState />
  if (chronic.length === 0) return <EmptyState />

  return (
    <div style={{ position: 'relative' }}>
      {/* Summary stats */}
      <div style={STATS_STYLE}>
        <div style={STAT_PILL}>
          <div style={STAT_LABEL}>Total at Risk</div>
          <div style={STAT_VALUE}>{chronic.length}</div>
        </div>
        <div style={STAT_PILL}>
          <div style={STAT_LABEL}>Recent Reports</div>
          <div style={STAT_VALUE}>5</div>
        </div>
        <div style={STAT_PILL}>
          <div style={STAT_LABEL}>Highest Absences</div>
          <div style={STAT_VALUE}>{chronic[0]?.missed ?? 0}/5</div>
        </div>
      </div>

      {/* Table */}
      <div style={TABLE_WRAPPER}>
        <table style={TABLE}>
          <thead>
            <tr style={{ background: '#F9F7F3' }}>
              <th style={{ ...TH, width: 40 }}>
                <input
                  type="checkbox"
                  style={CHECKBOX}
                  checked={selectedIds.size === chronic.length && chronic.length > 0}
                  onChange={toggleSelectAll}
                  title="Select all"
                />
              </th>
              <th style={TH}>Name</th>
              <th style={TH}>Subgroup</th>
              <th style={TH}>Leadership</th>
              <th style={TH}>Missed</th>
              <th style={TH}>Last Attended</th>
              <th style={TH}>Email</th>
              <th style={{ ...TH, width: 40 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {chronic.map(person => {
              const color = getChronicAbsenceColor(person.missed, person.total)
              return (
                <tr key={person.id} style={{ position: 'relative' }}>
                  <td style={{ ...TD, position: 'relative', paddingLeft: 12 }}>
                    <div style={{ ...ROW_ACCENT, background: color }} />
                    <input
                      type="checkbox"
                      style={CHECKBOX}
                      checked={selectedIds.has(person.id)}
                      onChange={() => toggleSelect(person.id)}
                    />
                  </td>
                  <td style={TD}>
                    <strong style={{ color: '#2D2A22' }}>{person.name}</strong>
                  </td>
                  <td style={TD}>{person.subgroup || '—'}</td>
                  <td style={TD}>{person.leadership_category || '—'}</td>
                  <td style={{ ...TD, fontWeight: 600, color }}>
                    {person.missed}/{person.total}
                  </td>
                  <td style={TD}>{formatDate(person.lastAttended)}</td>
                  <td style={{ ...TD, fontSize: 12, color: '#7A6F5E' }}>
                    {person.email || '—'}
                  </td>
                  <td style={TD}>
                    <button
                      type="button"
                      onClick={() => openEmailForPerson(person)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Send re-engagement email"
                    >
                      <Mail size={16} style={{ color: '#4C2A92' }} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Action bar */}
      {selectedIds.size > 0 && (
        <div style={ACTION_BAR}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {selectedIds.size} selected
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              style={PRIMARY_BUTTON}
              onClick={() => setShowEmailModal(true)}
            >
              ✉ Send Re-engagement Email ({selectedIds.size})
            </button>
            <button
              type="button"
              style={{ ...PRIMARY_BUTTON, background: 'rgba(255,255,255,0.2)', color: 'white' }}
              onClick={() => setShowSendLog(true)}
            >
              Log
            </button>
          </div>
        </div>
      )}

      {/* Email modals */}
      {showEmailModal && (
        <EmailCustomizerModal
          recipients={singlePersonEmail ? [singlePersonEmail] : selectedPeople}
          onClose={() => {
            setShowEmailModal(false)
            setSinglePersonEmail(null)
          }}
          onSendComplete={() => {
            setShowEmailModal(false)
            setSinglePersonEmail(null)
            setSelectedIds(new Set())
          }}
        />
      )}

      {showSendLog && (
        <SendLogModal onClose={() => setShowSendLog(false)} />
      )}
    </div>
  )
}
