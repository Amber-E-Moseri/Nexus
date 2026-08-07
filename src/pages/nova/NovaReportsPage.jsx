import { useEffect, useState } from 'react'
import { BarChart3, RefreshCw, ChevronDown, ChevronUp, FileText, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { askNovaOrchestrate } from '../../features/nova/lib/novaApi'
import NovaMarkdown from '../../features/nova/components/NovaMarkdown'
import SourceChip from '../../features/nova/components/SourceChip'

const REPORT_TYPES = [
  { value: 'department_overview', label: 'Department Overview', description: 'Tasks, meetings, and status for the last 30 days' },
  { value: 'sprint_summary', label: 'Sprint Summary', description: 'Current sprint progress, risks, and task breakdown' },
  { value: 'meeting_digest', label: 'Meeting Digest', description: 'Summary of recent meetings and key outcomes' },
]

const TYPE_LABELS = Object.fromEntries(REPORT_TYPES.map((t) => [t.value, t.label]))

function ReportCard({ report }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      border: '1px solid var(--border-light)',
      borderRadius: 10,
      marginBottom: 10,
      overflow: 'hidden',
      background: 'white',
    }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', cursor: 'pointer',
          background: 'var(--surface-secondary)',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <FileText size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
            {report.title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {TYPE_LABELS[report.report_type] ?? report.report_type}
            {report.period_start && ` · ${report.period_start} – ${report.period_end}`}
            {report.generated_by_user?.name && ` · by ${report.generated_by_user.name}`}
          </div>
        </div>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </div>
      {expanded && (
        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border-light)' }}>
          {report.narrative && (
            <NovaMarkdown text={report.narrative} />
          )}
          {report.source_refs?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {report.source_refs.map((s) => (
                <SourceChip key={`${s.type}-${s.id}`} source={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function NovaReportsPage() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generateType, setGenerateType] = useState('department_overview')
  const [showGenerator, setShowGenerator] = useState(false)
  const [generatedResult, setGeneratedResult] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadReports()
  }, [])

  async function loadReports() {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('nova_reports')
      .select(`
        id, report_type, title, period_start, period_end, status,
        narrative, source_refs, created_at,
        generated_by_user:users!generated_by(name)
      `)
      .order('created_at', { ascending: false })
      .limit(20)

    if (err) setError(err.message)
    else setReports(data ?? [])
    setLoading(false)
  }

  async function handleGenerate() {
    setGenerating(true)
    setGeneratedResult(null)
    try {
      const typeLabel = REPORT_TYPES.find((t) => t.value === generateType)?.label ?? 'report'
      const response = await askNovaOrchestrate({
        intent: 'report',
        message: `Generate a ${typeLabel}`,
        context: { reportType: generateType },
      })
      setGeneratedResult(response)
      await loadReports()
      setShowGenerator(false)
    } catch (err) {
      setError(err?.message || 'Nova could not generate the report.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BarChart3 size={20} style={{ color: 'var(--accent)' }} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
              Nova Reports
            </h1>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-tertiary)' }}>
            AI-generated reports grounded in live Nexus data
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={loadReports}
            disabled={loading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 13px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: '1px solid var(--border)', background: 'var(--surface-secondary)',
              color: 'var(--text-secondary)', cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={12} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
          <button
            type="button"
            onClick={() => setShowGenerator((v) => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: '1px solid var(--accent)', background: 'var(--accent)',
              color: '#fff', cursor: 'pointer',
            }}
          >
            <Plus size={13} />
            Generate Report
          </button>
        </div>
      </div>

      {/* Generator panel */}
      {showGenerator && (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px',
          marginBottom: 20, background: 'var(--surface-secondary)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
            Choose report type
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {REPORT_TYPES.map((t) => (
              <label
                key={t.value}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${generateType === t.value ? 'var(--accent)' : 'var(--border-light)'}`,
                  background: generateType === t.value ? 'rgba(var(--accent-rgb), 0.06)' : 'white',
                }}
              >
                <input
                  type="radio"
                  name="reportType"
                  value={t.value}
                  checked={generateType === t.value}
                  onChange={() => setGenerateType(t.value)}
                  style={{ marginTop: 2, accentColor: 'var(--accent)' }}
                />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{t.description}</div>
                </div>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: 'var(--accent)', color: '#fff', border: 'none',
                cursor: generating ? 'not-allowed' : 'pointer',
                opacity: generating ? 0.7 : 1, fontFamily: 'inherit',
              }}
            >
              {generating && <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />}
              {generating ? 'Generating…' : 'Generate with Nova'}
            </button>
            <button
              type="button"
              onClick={() => setShowGenerator(false)}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'transparent', color: 'var(--text-secondary)',
                border: '1px solid var(--border-light)', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{ padding: 14, background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, fontSize: 13, color: '#991B1B', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Reports list */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          Loading reports…
        </div>
      )}

      {!loading && reports.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>
          <BarChart3 size={32} style={{ marginBottom: 12, opacity: 0.3, color: 'var(--accent)' }} />
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No reports yet</div>
          <div style={{ fontSize: 12 }}>Generate your first report using the button above.</div>
        </div>
      )}

      {!loading && reports.map((r) => <ReportCard key={r.id} report={r} />)}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
