import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useMeetings } from '../MeetingsContext'
import MeetingRecordTabs from './MeetingRecordTabs'
import StatsCards from './StatsCards'
import DepartmentFilter from './DepartmentFilter'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import CardGalleryView from '../../../components/meetings/CardGalleryView'
import ViewToggle from '../../../components/meetings/ViewToggle'
import { deleteMeeting } from '../lib/meetings'

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

function RecordPane({ selectedMeeting, canManage, onStartLive, isMobile, onBack, onMeetingDeleted }) {
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true)
      return
    }

    setIsDeleting(true)
    try {
      await deleteMeeting(selectedMeeting.id)
      onMeetingDeleted?.()
      setDeleteConfirm(false)
    } catch (error) {
      console.error('Failed to delete meeting:', error)
      alert('Failed to delete meeting: ' + error.message)
      setDeleteConfirm(false)
    } finally {
      setIsDeleting(false)
    }
  }

  if (!selectedMeeting) {
    return (
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9E9488',
          fontSize: 14,
        }}
      >
        Pick a meeting on the left, work the record on the right.
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, paddingLeft: isMobile ? 12 : 0, paddingRight: isMobile ? 12 : 0, paddingTop: isMobile ? 12 : 0, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          {isMobile && onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to meetings list"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 44,
                height: 44,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#1C1C1C',
                padding: 0,
              }}
            >
              <ChevronLeft size={24} aria-hidden="true" />
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1C1C1C' }}>
              {selectedMeeting.title}
            </h2>
            <div style={{ marginTop: 4, fontSize: 13, color: '#7E7D78' }}>
              {new Date(selectedMeeting.date).toLocaleDateString('en-CA', {
                weekday: isMobile ? 'short' : 'long',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
              {!isMobile && (
                <>
                  {' • '}
                  {selectedMeeting.meeting_type}
                </>
              )}
            </div>
          </div>
        </div>
        {canManage && !isMobile && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => onStartLive?.(selectedMeeting)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                paddingLeft: '12px',
                paddingRight: '12px',
                paddingTop: '8px',
                paddingBottom: '8px',
                borderRadius: 8,
                border: '1px solid #E5E5E4',
                background: 'white',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: '#1C1C1C',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#DC2626',
                }}
              />
              Start live
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                paddingLeft: '12px',
                paddingRight: '12px',
                paddingTop: '8px',
                paddingBottom: '8px',
                borderRadius: 8,
                border: deleteConfirm ? '1px solid #DC2626' : '1px solid #E5E5E4',
                background: deleteConfirm ? '#FEF2F2' : 'white',
                cursor: isDeleting ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: deleteConfirm ? '#DC2626' : '#7E7D78',
                flexShrink: 0,
                opacity: isDeleting ? 0.6 : 1,
              }}
            >
              <Trash2 size={14} />
              {deleteConfirm ? 'Confirm delete?' : 'Delete'}
            </button>
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', marginTop: 12, paddingLeft: isMobile ? 12 : 0, paddingRight: isMobile ? 12 : 0 }}>
        <MeetingRecordTabs meeting={selectedMeeting} />
      </div>
    </div>
  )
}

export default function UnifiedMeetingsView({
  isSuperAdmin = false,
  departments = [],
  selectedDeptId,
  onDeptChange,
  canManage = false,
  onStartLive,
}) {
  const { meetings, loading } = useMeetings()
  const [selectedMeeting, setSelectedMeeting] = useState(null)
  const [activeType, setActiveType] = useState('all')
  const [viewMode, setViewMode] = useState('list')
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const isMobile = useMediaQuery('(max-width: 640px)')
  const isTablet = useMediaQuery('(max-width: 1024px)')

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
          .not('description', 'is', null)

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

  // On mobile, show detail view when a meeting is selected
  const showListPane = !isMobile || !selectedMeeting
  const showDetailPane = !isMobile || selectedMeeting

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: 300, alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSpinner label="Loading meetings" />
      </div>
    )
  }

  const totalCount = filteredMeetings.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Stats Cards Section */}
      {stats && isSuperAdmin && (
        <div style={{ padding: '16px', borderBottom: '0.5px solid var(--border)', background: 'white', flexShrink: 0 }}>
          <StatsCards stats={stats} />
        </div>
      )}

      {/* Filters Section */}
      {isSuperAdmin && (
        <div style={{ padding: '16px', borderBottom: '0.5px solid var(--border)', background: 'white', flexShrink: 0 }}>
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

      {/* Main Content Area: Two Lanes */}
      <div style={{ display: 'flex', gap: 0, height: '100%', overflow: 'hidden', flex: 1 }}>
        {/* Left pane - meeting list sidebar */}
        {showListPane && (
          <div
            style={{
              flex: isMobile ? 1 : '0 0 340px',
              overflowY: 'auto',
              borderRight: isMobile ? 'none' : '1px solid var(--border)',
              padding: '16px 0',
              background: 'white',
              display: showListPane ? 'flex' : 'none',
              flexDirection: 'column',
            }}
          >
            {/* Header with filters and view toggle */}
            <div style={{ paddingLeft: 16, paddingRight: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1C1C1C' }}>
                  Filter by Type
                </h3>
                {!isMobile && <ViewToggle view={viewMode} onViewChange={setViewMode} />}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }} role="group" aria-label="Filter meetings by type">
                <button
                  type="button"
                  onClick={() => setActiveType('all')}
                  aria-pressed={activeType === 'all'}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 999,
                    border: activeType === 'all' ? 'none' : '1px solid var(--border)',
                    background: activeType === 'all' ? 'var(--accent)' : 'white',
                    color: activeType === 'all' ? 'white' : 'var(--text-primary)',
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
                      padding: '6px 14px',
                      borderRadius: 999,
                      border: activeType === type ? 'none' : '1px solid var(--border)',
                      background: activeType === type ? 'var(--accent)' : 'white',
                      color: activeType === type ? 'white' : 'var(--text-primary)',
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
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                {totalCount} meeting{totalCount !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Meeting list or card gallery */}
            {viewMode === 'list' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {filteredMeetings.length === 0 ? (
                  <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                    No meetings in this category
                  </div>
                ) : (
                  filteredMeetings
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map((meeting) => (
                      <button
                        key={meeting.id}
                        type="button"
                        onClick={() => setSelectedMeeting(meeting)}
                        aria-pressed={selectedMeeting?.id === meeting.id}
                        aria-label={`${meeting.title}, ${new Date(meeting.date).toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}`}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          background: selectedMeeting?.id === meeting.id ? '#F3E8FF' : 'transparent',
                          border: selectedMeeting?.id === meeting.id ? '2px solid var(--accent)' : 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'all 0.12s',
                          borderBottom: '1px solid var(--border)',
                        }}
                        onMouseEnter={(e) => {
                          if (selectedMeeting?.id !== meeting.id) e.currentTarget.style.background = '#FAFAF9'
                        }}
                        onMouseLeave={(e) => {
                          if (selectedMeeting?.id !== meeting.id) e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {meeting.title}
                        </div>
                        <div style={{ marginTop: 4, display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: TYPE_CHIP_COLORS[meeting.meeting_type] || '#E5E5E4',
                              color: 'white',
                              fontSize: 10,
                              fontWeight: 600,
                            }}
                          >
                            {meeting.meeting_type?.charAt(0).toUpperCase() + meeting.meeting_type?.slice(1) || 'General'}
                          </span>
                          <span>
                            {new Date(meeting.date).toLocaleDateString('en-CA', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                      </button>
                    ))
                )}
              </div>
            ) : (
              <CardGalleryView
                meetings={filteredMeetings.sort((a, b) => new Date(b.date) - new Date(a.date))}
                selectedMeeting={selectedMeeting}
                onSelectMeeting={setSelectedMeeting}
                title=""
                emptyMessage="No meetings in this category"
              />
            )}
          </div>
        )}

        {/* Right pane - meeting record */}
        {showDetailPane && (
          <RecordPane
            selectedMeeting={selectedMeeting}
            canManage={canManage}
            onStartLive={onStartLive}
            isMobile={isMobile}
            onBack={() => setSelectedMeeting(null)}
            onMeetingDeleted={() => {
              setSelectedMeeting(null)
              // Trigger reload of meetings via context
              window.location.reload()
            }}
          />
        )}
      </div>
    </div>
  )
}
