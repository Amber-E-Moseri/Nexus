import { useState } from 'react'
import { FileDown, Loader } from 'lucide-react'
import { useMiSubgroups } from '../hooks/useMiStructure'
import { useMiFirstTimers } from '../hooks/useMiFirstTimers'
import { useMiFoundationSchool } from '../hooks/useMiFoundationSchool'
import { useMiTrends } from '../hooks/useMiTrends'
import { useQuery } from '@tanstack/react-query'
import { fetchAllSubgroupStats } from '../lib/miApi'
import {
  generateAttendanceSummaryPDF,
  generateAttendanceTrendsPDF,
  generateFirstTimersPDF,
  generateFoundationSchoolPDF,
} from '../lib/miPdfReports'

const REPORTS = [
  {
    id: 'attendance-summary',
    title: 'Attendance Summary',
    description: 'Frequency breakdown by subgroup — In system, Active, 1×, 2×, 3×, 3+× with active %.',
    orientation: 'Landscape',
  },
  {
    id: 'attendance-trends',
    title: 'Attendance Trends',
    description: 'Week-over-week service and cell attendance for the selected time window.',
    orientation: 'Landscape',
  },
  {
    id: 'first-timers',
    title: 'First-Timer Report',
    description: 'New member count by source (service vs cell) for the past month.',
    orientation: 'Portrait',
  },
  {
    id: 'foundation-school',
    title: 'Foundation School Report',
    description: 'Completion rate breakdown across all active members.',
    orientation: 'Portrait',
  },
]

export default function MiReportsView({ dateFrom, dateTo, eventType }) {
  const [generating, setGenerating] = useState(null)

  const filters = { dateFrom, dateTo, eventType }
  const { data: subgroups = [] } = useMiSubgroups()
  const { data: sgStats } = useQuery({
    queryKey: ['mi_all_subgroup_stats', filters],
    queryFn: () => fetchAllSubgroupStats(filters),
    staleTime: 30000,
  })
  const { data: weeks = [] } = useMiTrends({ dateFrom, dateTo })
  const { data: firstTimers } = useMiFirstTimers({ monthsBack: 1 })
  const { data: fsStats } = useMiFoundationSchool()

  const handleGenerate = async (reportId) => {
    setGenerating(reportId)
    try {
      if (reportId === 'attendance-summary') {
        generateAttendanceSummaryPDF(subgroups, sgStats, filters)
      } else if (reportId === 'attendance-trends') {
        generateAttendanceTrendsPDF(weeks)
      } else if (reportId === 'first-timers') {
        generateFirstTimersPDF(firstTimers || {}, { monthsBack: 1 })
      } else if (reportId === 'foundation-school') {
        generateFoundationSchoolPDF(fsStats || { completed: 0, in_progress: 0, not_recorded: 0, total: 0, percentages: { completed: 0, in_progress: 0, not_recorded: 0 } })
      }
    } finally {
      setGenerating(null)
    }
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: '#9E9488', margin: '0 0 18px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        PDF reports — client-side, no upload
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {REPORTS.map(report => (
          <div key={report.id} style={{
            background: '#fff',
            border: '0.5px solid #EDE8DC',
            borderRadius: 12,
            padding: '18px 20px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#2D2A22' }}>{report.title}</span>
              <span style={{ fontSize: 10, color: '#9E9488', background: '#F5F3ED', padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                {report.orientation}
              </span>
            </div>
            <p style={{ fontSize: 12, color: '#9E9488', margin: '0 0 14px', lineHeight: 1.5 }}>
              {report.description}
            </p>
            <button
              onClick={() => handleGenerate(report.id)}
              disabled={generating === report.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 6,
                background: generating === report.id ? '#F5F3ED' : '#4C2A92',
                color: generating === report.id ? '#9E9488' : '#fff',
                border: 'none',
                cursor: generating === report.id ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 500,
                fontFamily: 'inherit',
                transition: 'background 0.15s',
              }}
            >
              {generating === report.id
                ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Generating...</>
                : <><FileDown size={13} /> Generate PDF</>
              }
            </button>
          </div>
        ))}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
