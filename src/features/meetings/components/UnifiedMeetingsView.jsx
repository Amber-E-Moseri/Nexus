import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useMeetings } from '../MeetingsContext'
import StatsCards from './StatsCards'
import DepartmentFilter from './DepartmentFilter'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import CardGalleryView from '../../../components/meetings/CardGalleryView'
import ViewToggle from '../../../components/meetings/ViewToggle'

const TYPE_CHIP_COLORS = {
  general: '#4C2A92',
  team: '#1B72E8',
  media: '#E8A020',
  department: '#16A34A',
}

function groupMeetingsByCategory(meetings) {
  const groups = {}
  meetings.forEach((meeting) => {
    const type = meeting.meeting_type || 'general'
    if (!groups[type]) groups[type] = []
    groups[type].push(meeting)
  })
  return groups
}


export default function UnifiedMeetingsView({
  isSuperAdmin = false,
  departments = [],
  selectedDeptId,
  onDeptChange,
  canManage = false,
  onStartLive,
}) {
  const navigate = useNavigate()
  const { meetings, loading } = useMeetings()
  const [activeType, setActiveType] = useState('all')
  const [viewMode, setViewMode] = useState('list')
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const isMobile = useMediaQuery('(max-width: 640px)')

  // Load KPI stats
  useEffect(() => {
    if (!selectedDeptId) return
    let active = true

    async function loadKpis() {
      setStatsLoading(true)
      try {
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        const cutoff = thirtyDaysAgo.toISOString()

        let meetingsQuery = supabase
          .from('meetings')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', cutoff)

        let actionsQuery = supabase
          .from('tasks')
          .select('id')
          .not('meeting_id', 'is', null)

        let withMinutesQuery = supabase
          .from('meetings')
          .select('id', { count: 'exact', head: true })
          .not('minutes', 'is', null)

        if (selectedDeptId !== 'all') {
          meetingsQuery = meetingsQuery.eq('department_id', selectedDeptId)
          actionsQuery = actionsQuery.eq('department_id', selectedDeptId)
          withMinutesQuery = withMinutesQuery.eq('department_id', selectedDeptId)
        }

        const [
          { count: logged30d },
          { data: actionData },
          { count: withMinutes },
          { data: depts },
        ] = await Promise.all([
          meetingsQuery,
          actionsQuery,
          withMinutesQuery,
          supabase.from('departments').select('id'),
        ])

        if (!active) return
        setStats({
          logged30d: logged30d ?? 0,
          actionItems: actionData?.length ?? 0,
          withMinutes: withMinutes ?? 0,
          departments: depts?.length ?? 0,
        })
      } catch (error) {
        console.error('Stats computation error:', error)
      } finally {
        if (active) setStatsLoading(false)
      }
    }

    loadKpis()
    return () => {
      active = false
    }
  }, [selectedDeptId])

  // Filter meetings by department and type
  const filteredByDept = useMemo(() => {
    if (selectedDeptId === 'all') return meetings
    return meetings.filter((m) => m.department_id === selectedDeptId)
  }, [meetings, selectedDeptId])

  const grouped = useMemo(() => groupMeetingsByCategory(filteredByDept), [filteredByDept])
  const allTypes = useMemo(() => Object.keys(grouped).sort(), [grouped])
  const filteredMeetings = useMemo(() => {
    if (activeType === 'all') return filteredByDept
    return grouped[activeType] || []
  }, [grouped, activeType, filteredByDept])

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: 300, alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSpinner label="Loading meetings" />
      </div>
    )
  }

  const totalCount = filteredMeetings.length

  const TYPE_ICONS = { general: '🗓', team: '👥', media: '🎬', department: '🏛' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#F7F5F0' }}>
      {/* Stats Cards Section */}
      {stats && isSuperAdmin && (
        <div style={{ padding: '16px', borderBottom: '1px solid #EDE8DC', background: '#FBF8F2', flexShrink: 0 }}>
          <StatsCards stats={stats} />
        </div>
      )}

      {/* Filters Section */}
      {isSuperAdmin && (
        <div style={{ padding: '16px', borderBottom: '1px solid #EDE8DC', background: '#FBF8F2', flexShrink: 0 }}>
          <label style={{ fontSize: '11px', color: '#9E9488', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
            Department
          </label>
          <DepartmentFilter
            departments={departments}
            selected={selectedDeptId}
            onChange={onDeptChange}
            count={filteredByDept.length}
          />
        </div>
      )}

      {/* Filter chips + view toggle */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #EDE8DC', background: '#FBF8F2', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="group" aria-label="Filter meetings by type">
            <button
              type="button"
              onClick={() => setActiveType('all')}
              aria-pressed={activeType === 'all'}
              style={{
                padding: '5px 14px',
                borderRadius: 999,
                border: activeType === 'all' ? 'none' : '1px solid #D6CEBE',
                background: activeType === 'all' ? '#4C2A92' : 'white',
                color: activeType === 'all' ? 'white' : '#7A6F5E',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              All
            </button>
            {allTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setActiveType(type)}
                aria-pressed={activeType === type}
                style={{
                  padding: '5px 14px',
                  borderRadius: 999,
                  border: activeType === type ? 'none' : '1px solid #D6CEBE',
                  background: activeType === type ? '#4C2A92' : 'white',
                  color: activeType === type ? 'white' : '#7A6F5E',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
          {!isMobile && <ViewToggle view={viewMode} onViewChange={setViewMode} />}
        </div>
        <div style={{ fontSize: 11, color: '#B0A89A', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {totalCount} meeting{totalCount !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Meeting grid / list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {viewMode === 'list' ? (
          filteredMeetings.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#B0A89A', fontSize: 13 }}>
              No meetings in this category
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredMeetings
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .map((meeting) => {
                  const typeColor = TYPE_CHIP_COLORS[meeting.meeting_type] || '#7A6F5E'
                  const icon = TYPE_ICONS[meeting.meeting_type] || '🗓'
                  return (
                    <button
                      key={meeting.id}
                      type="button"
                      onClick={() => navigate(`/meetings/${meeting.id}`)}
                      aria-label={`${meeting.title}, ${new Date(meeting.date).toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}`}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '14px 16px',
                        background: 'white',
                        border: '1px solid #EDE8DC',
                        borderRadius: 14,
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.14s',
                        boxShadow: '0 1px 3px rgba(24,18,46,0.04)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#EDE8F8'
                        e.currentTarget.style.borderColor = '#4C2A92'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'white'
                        e.currentTarget.style.borderColor = '#EDE8DC'
                      }}
                    >
                      <div style={{
                        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                        background: `${typeColor}18`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18,
                      }}>
                        {icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1C1C1C', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {meeting.title}
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#7A6F5E' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                            background: `${typeColor}20`, color: typeColor,
                            fontSize: 11, fontWeight: 700,
                          }}>
                            {meeting.meeting_type?.charAt(0).toUpperCase() + meeting.meeting_type?.slice(1) || 'General'}
                          </span>
                          <span>
                            {new Date(meeting.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                      </div>
                      <span style={{ color: '#B0A89A', fontSize: 16, flexShrink: 0 }}>›</span>
                    </button>
                  )
                })}
            </div>
          )
        ) : (
          <CardGalleryView
            meetings={filteredMeetings.sort((a, b) => new Date(b.date) - new Date(a.date))}
            selectedMeeting={null}
            onSelectMeeting={(m) => navigate(`/meetings/${m.id}`)}
            title=""
            emptyMessage="No meetings in this category"
          />
        )}
      </div>
    </div>
  )
}
