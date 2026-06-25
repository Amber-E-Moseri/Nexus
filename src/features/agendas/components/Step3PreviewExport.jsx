import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { useHasPermission } from '../../../hooks/useHasPermission'
import { useAgendaWizard, calculateTimings } from '../../../hooks/useAgendaWizard'
import { THEME_OPTIONS } from '../../../data/agendaTemplates'
import { generateAgendaPdf } from '../../../lib/agendaPdfGenerator'
import { createAgenda, createMeetingWithAgenda } from '..'

export default function Step3PreviewExport() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { hasPermission: canCreateMeetings, loading: checkingPermissions } = useHasPermission('meetings:manage')
  const { agendaData, agendaItems, isSaving, setIsSaving, reset } = useAgendaWizard()
  const [exportError, setExportError] = useState(null)

  const timings = calculateTimings(agendaData.startTime, agendaItems)
  const selectedTheme = THEME_OPTIONS.find((t) => t.id === agendaData.theme) || THEME_OPTIONS[0]
  const totalMinutes = timings.reduce((sum, item) => sum + item.duration, 0)

  // Permission guard
  if (!checkingPermissions && !canCreateMeetings) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', background: '#FCFAF6', borderRadius: 12 }}>
        <h2 style={{ color: '#DC3545', marginBottom: 16 }}>Cannot Finalize</h2>
        <p style={{ color: '#9E9488', marginBottom: 20 }}>
          You don't have permission to finalize agendas. Only ORS members can publish meetings.
        </p>
        <p style={{ fontSize: 12, color: '#999' }}>
          Contact your administrator if you believe this is an error.
        </p>
      </div>
    )
  }

  if (checkingPermissions) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Verifying permissions...</div>
  }

  async function handleExportPdf() {
    setExportError(null)
    setIsSaving(true)
    try {
      const filename = `${agendaData.title || 'agenda'}-${agendaData.date || 'undated'}.pdf`
        .replace(/\s+/g, '-')
        .toLowerCase()

      await generateAgendaPdf(agendaData, agendaItems, timings, filename)
      // Success message (optional)
      // Could show toast: "✓ PDF exported successfully"
    } catch (err) {
      const errorMsg = err.message || 'Failed to export PDF. Please try again.'
      setExportError(errorMsg)
      console.error('PDF export error:', err)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSaveAgendaOnly() {
    setExportError(null)
    setIsSaving(true)
    try {
      const preparedAgendaData = {
        title: agendaData.title,
        meetingType: agendaData.meetingType,
        departmentId: profile?.department_id,
        date: agendaData.date,
        startTime: agendaData.startTime,
        endTime: agendaData.endTime,
        location: agendaData.location,
        moderator: agendaData.moderator,
        theme: agendaData.theme,
        createdBy: profile?.id,
      }

      const meetingData = {
        title: agendaData.title,
        summary: null,
        minutes: null,
        zoomJoinUrl: null,
        driveUrl: null,
      }

      const { meeting, agenda } = await createMeetingWithAgenda(
        meetingData,
        preparedAgendaData,
        agendaItems
      )

      const successMsg = `✓ Meeting finalized! ID: ${meeting.id.slice(0, 8)} | Agenda: ${agenda.id.slice(0, 8)}`
      setExportError(null)
      alert(successMsg)
      reset()
      navigate('/meetings')
    } catch (err) {
      const errorMessage = err.message || 'Failed to finalize meeting'
      setExportError(errorMessage)
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }


  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, maxWidth: 1200 }}>
      {/* Preview */}
      <div>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#0C0E18' }}>
          PDF Preview
        </h2>
        <div
          id="agenda-pdf-content"
          style={{
            background: selectedTheme.background,
            border: `2px solid ${selectedTheme.primary}`,
            borderRadius: 12,
            padding: '40px',
            fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
            color: '#333',
            lineHeight: 1.6,
            minHeight: 600,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: 32, paddingBottom: 20, borderBottom: `3px solid ${selectedTheme.primary}` }}>
            <h1 style={{ margin: '0 0 12px', fontSize: 28, fontWeight: 700, color: selectedTheme.primary }}>
              {agendaData.title || 'Untitled Meeting'}
            </h1>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
              <strong>Date:</strong> {agendaData.date ? new Date(agendaData.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Not set'} |{' '}
              <strong>Time:</strong> {agendaData.startTime} - {agendaData.endTime}
            </div>
            {agendaData.location && (
              <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
                <strong>Location:</strong> {agendaData.location}
              </div>
            )}
            {agendaData.moderator && (
              <div style={{ fontSize: 13, color: '#666' }}>
                <strong>Moderator:</strong> {agendaData.moderator}
              </div>
            )}
          </div>

          {/* Agenda Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
            <thead>
              <tr style={{ background: selectedTheme.primary, color: 'white' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', border: `1px solid ${selectedTheme.primary}`, width: '5%' }}>S/N</th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', border: `1px solid ${selectedTheme.primary}`, width: '28%' }}>Segment</th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', border: `1px solid ${selectedTheme.primary}`, width: '32%' }}>Notes</th>
                <th style={{ padding: '12px', textAlign: 'center', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', border: `1px solid ${selectedTheme.primary}`, width: '12%' }}>Duration</th>
                <th style={{ padding: '12px', textAlign: 'right', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', border: `1px solid ${selectedTheme.primary}`, width: '23%' }}>Timing</th>
              </tr>
            </thead>
            <tbody>
              {timings.map((item, index) => (
                <tr key={item.id} style={{ background: index % 2 === 0 ? 'white' : `${selectedTheme.accent}40` }}>
                  <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: selectedTheme.primary, border: `1px solid ${selectedTheme.primary}20` }}>
                    {index + 1}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: selectedTheme.primary, border: `1px solid ${selectedTheme.primary}20` }}>
                    {item.segment}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 11, color: '#666', border: `1px solid ${selectedTheme.primary}20` }}>
                    {item.notes}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 11, color: '#666', textAlign: 'center', border: `1px solid ${selectedTheme.primary}20` }}>
                    {item.duration} min
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 11, color: selectedTheme.primary, fontWeight: 500, textAlign: 'right', border: `1px solid ${selectedTheme.primary}20` }}>
                    {item.timing}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summary */}
          <div style={{ background: `${selectedTheme.accent}20`, borderLeft: `4px solid ${selectedTheme.primary}`, padding: '12px 16px', fontSize: 12, marginBottom: 16 }}>
            <strong style={{ color: selectedTheme.primary }}>Meeting Summary</strong>
            <div style={{ marginTop: 6, color: '#666', fontSize: 11 }}>
              <div>• Total Items: {timings.length}</div>
              <div>• Total Duration: {totalMinutes} minutes</div>
              <div>• Meeting Type: {agendaData.meetingType?.replace(/_/g, ' ')}</div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ borderTop: `1px solid ${selectedTheme.primary}20`, paddingTop: 12, fontSize: 10, color: '#999', textAlign: 'center' }}>
            Generated by BLW CAN NEXUS Meeting Planner | {new Date().toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Actions Sidebar */}
      <div>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#0C0E18' }}>
          Save & Share
        </h3>

        {exportError && (
          <div style={{ marginBottom: 12, padding: '12px', background: 'rgba(220, 53, 69, 0.1)', border: '1px solid #DC3545', borderRadius: 8, fontSize: 12, color: '#DC3545' }}>
            <div style={{ marginBottom: 8 }}>⚠ {exportError}</div>
            <button
              type="button"
              onClick={() => setExportError(null)}
              style={{
                padding: '6px 12px',
                fontSize: 11,
                background: '#DC3545',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Retry
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isSaving}
            style={{
              borderRadius: 8,
              border: 'none',
              background: '#4C2A92',
              padding: '12px 14px',
              fontSize: 13,
              fontWeight: 600,
              color: 'white',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.6 : 1,
              transition: 'opacity .2s',
            }}
          >
            {isSaving ? '⏳ Exporting...' : '📥 Export PDF'}
          </button>
          <button
            type="button"
            onClick={handleSaveAgendaOnly}
            disabled={isSaving}
            style={{
              borderRadius: 8,
              border: 'none',
              background: '#4C2A92',
              padding: '12px 14px',
              fontSize: 13,
              fontWeight: 600,
              color: 'white',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.6 : 1,
              transition: 'opacity .2s',
            }}
          >
            {isSaving ? '⏳ Planning...' : '💾 Plan Meeting'}
          </button>
        </div>

        <div style={{ marginTop: 20, padding: '14px', background: '#F8F8F8', borderRadius: 8, fontSize: 11, color: '#666', border: '1px solid #E5DDD0' }}>
          <p style={{ margin: '0 0 10px', fontWeight: 600, color: '#0C0E18' }}>
            📊 Summary
          </p>
          <div style={{ fontSize: 11, lineHeight: 1.8, color: '#999' }}>
            <div>
              <strong style={{ color: '#666' }}>Items:</strong> {timings.length}
            </div>
            <div>
              <strong style={{ color: '#666' }}>Duration:</strong> {totalMinutes} min
            </div>
            <div>
              <strong style={{ color: '#666' }}>Theme:</strong> {selectedTheme.name}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, padding: '12px', background: 'rgba(76, 42, 146, 0.06)', borderRadius: 8, borderLeft: `3px solid #4C2A92` }}>
          <p style={{ margin: 0, fontSize: 11, color: '#4C2A92', fontWeight: 500 }}>
            💡 <strong>Tip:</strong> Export as PDF to print or share with your team.
          </p>
        </div>
      </div>
    </div>
  )
}
