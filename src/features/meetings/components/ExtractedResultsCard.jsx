import { useState } from 'react'
import { ErrorBoundary } from '../../../components/ErrorBoundary'

export default function ExtractedResultsCard({ results, onSaveToMinutes, onDiscard, saving }) {
  const outputMode = results.output_mode || 'organized'
  const [activeTab, setActiveTab] = useState(outputMode === 'hybrid' ? 'structured' : outputMode)

  // ── full_transcript mode ──────────────────────────────────────────────
  if (outputMode === 'full_transcript') {
    return (
      <FullTranscriptView
        cleanedTranscript={results.cleaned_transcript}
        chapters={results.chapters}
        onSave={onSaveToMinutes}
        onDiscard={onDiscard}
        saving={saving}
      />
    )
  }

  // ── organized mode ───────────────────────────────────────────────────
  if (outputMode === 'organized') {
    return (
      <ErrorBoundary>
        <OrganizedView
          results={results}
          onSaveToMinutes={onSaveToMinutes}
          onDiscard={onDiscard}
          saving={saving}
        />
      </ErrorBoundary>
    )
  }

  // ── hybrid mode (both tabs) ──────────────────────────────────────────
  if (outputMode === 'hybrid') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #EDE8DC', paddingBottom: 12 }}>
          <button
            onClick={() => setActiveTab('structured')}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'structured' ? '2px solid #4C2A92' : 'none',
              color: activeTab === 'structured' ? '#4C2A92' : '#9E9488',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Meeting Minutes
          </button>
          <button
            onClick={() => setActiveTab('full_transcript')}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'full_transcript' ? '2px solid #4C2A92' : 'none',
              color: activeTab === 'full_transcript' ? '#4C2A92' : '#9E9488',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Full Transcript
          </button>
        </div>

        {activeTab === 'structured' && (
          <OrganizedView results={results} onSaveToMinutes={onSaveToMinutes} onDiscard={onDiscard} saving={saving} />
        )}
        {activeTab === 'full_transcript' && (
          <FullTranscriptView
            cleanedTranscript={results.cleaned_transcript}
            chapters={results.chapters}
            onSave={onSaveToMinutes}
            onDiscard={onDiscard}
            saving={saving}
          />
        )}
      </div>
    )
  }

  return null
}

// ── Full Transcript View ──────────────────────────────────────────────

function FullTranscriptView({ cleanedTranscript, chapters = [], onSave, onDiscard, saving }) {
  const [transcript, setTranscript] = useState(cleanedTranscript)
  const [showChapters, setShowChapters] = useState(true)

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #EDE8DC',
        borderRadius: 8,
        padding: 20,
        marginTop: 20,
      }}
    >
      <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#2D2A22' }}>
        📝 Full Transcript
      </h3>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#9E9488' }}>Cleaned and ready for archival</p>

      {chapters.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => setShowChapters(!showChapters)}
            style={{
              padding: '8px 12px',
              fontSize: 12,
              border: '1px solid #EDE8DC',
              borderRadius: 6,
              background: '#FFFFFF',
              color: '#4C2A92',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {showChapters ? 'Hide' : 'Show'} Chapters ({chapters.length})
          </button>
          {showChapters && (
            <ul style={{ margin: '12px 0 0 0', paddingLeft: 20, fontSize: 13, color: '#2D2A22' }}>
              {chapters.map((ch, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  <strong>{ch.title}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        rows={12}
        style={{
          width: '100%',
          padding: 12,
          fontSize: 13,
          border: '1px solid #EDE8DC',
          borderRadius: 6,
          fontFamily: 'monospace',
          resize: 'vertical',
          marginBottom: 16,
        }}
      />

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onSave({ cleaned_transcript: transcript, chapters })}
          disabled={saving}
          style={{
            padding: '10px 20px',
            fontSize: 13,
            border: 'none',
            borderRadius: 6,
            background: '#4C2A92',
            color: '#FFFFFF',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            opacity: saving ? 0.5 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Save Transcript'}
        </button>
        <button
          onClick={onDiscard}
          disabled={saving}
          style={{
            padding: '10px 20px',
            fontSize: 13,
            border: '1px solid #EDE8DC',
            borderRadius: 6,
            background: '#FFFFFF',
            color: '#2D2A22',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontWeight: 500,
          }}
        >
          Discard
        </button>
      </div>
    </div>
  )
}

// ── Organized View (Meeting Minutes) ──────────────────────────────────

const PRIORITY_COLORS = {
  high:   { bg: '#FEF2F2', border: '#FCA5A5', dot: '#DC2626', label: 'High' },
  medium: { bg: '#FFFBEB', border: '#FCD34D', dot: '#D97706', label: 'Medium' },
  low:    { bg: '#F0FDF4', border: '#86EFAC', dot: '#16A34A', label: 'Low' },
}

function OrganizedView({ results, onSaveToMinutes, onDiscard, saving }) {
  const [detailedNotesExpanded, setDetailedNotesExpanded] = useState(false)
  const [summary, setSummary] = useState(results.summary)
  const [decisions, setDecisions] = useState(
    Array.isArray(results.decisions)
      ? results.decisions
          .filter((d) => d != null) // Filter out null/undefined
          .map((d) => {
            // Normalize all decision shapes to { decision: string, context: string }
            if (typeof d === 'string') return { decision: d, context: '' }
            if (d && typeof d === 'object' && typeof d.decision === 'string') {
              return { ...d, decision: d.decision, context: d.context || '' }
            }
            // Malformed object: skip it (would crash on render otherwise)
            console.warn('[ExtractedResultsCard] Malformed decision object:', d)
            return null
          })
          .filter((d) => d !== null)
      : []
  )
  const [actionItems, setActionItems] = useState(
    Array.isArray(results.action_items) ? results.action_items :
    Array.isArray(results.extractedActionItems) ? results.extractedActionItems : []
  )
  const [newDecisionText, setNewDecisionText] = useState('')
  const [showAddDecision, setShowAddDecision] = useState(false)

  function handleRemoveDecision(index) {
    setDecisions(decisions.filter((_, i) => i !== index))
  }

  function handleAddDecision() {
    if (newDecisionText.trim()) {
      setDecisions([...decisions, { decision: newDecisionText, context: '' }])
      setNewDecisionText('')
      setShowAddDecision(false)
    }
  }

  function handleRemoveAction(index) {
    setActionItems(actionItems.filter((_, i) => i !== index))
  }

  function handleUpdateAction(index, field, value) {
    const updated = [...actionItems]
    updated[index] = { ...updated[index], [field]: value }
    setActionItems(updated)
  }

  function handleSave() {
    onSaveToMinutes({
      summary,
      decisions: decisions.map((d) => (typeof d === 'string' ? d : d.decision)),
      actionItems,
      detectedEntities: results.detected_entities || {},
    })
  }

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #EDE8DC',
        borderRadius: 8,
        padding: 20,
        marginTop: 20,
      }}
    >
      <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#2D2A22' }}>
        📋 Meeting Minutes
      </h3>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#9E9488' }}>Review and edit before saving</p>

      {/* Data Issues Alert */}
      {results.data_issues && results.data_issues.length > 0 && (
        <div
          style={{
            marginBottom: 20,
            padding: 12,
            backgroundColor: '#FEF0E6',
            border: '1px solid #FED9B3',
            borderRadius: 6,
          }}
        >
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#C94830' }}>
            ⚠️ Data Issues Detected
          </p>
          {results.data_issues.map((issue, i) => (
            <div key={i} style={{ fontSize: 12, color: '#9E5C3C', marginBottom: i < results.data_issues.length - 1 ? 6 : 0 }}>
              <strong>{issue.participant_name}</strong> ({issue.type}): {issue.action}
            </div>
          ))}
        </div>
      )}

      {/* Detailed Notes */}
      {results.detailed_notes && (
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => setDetailedNotesExpanded(!detailedNotesExpanded)}
            style={{
              display: 'block',
              marginBottom: 8,
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 600,
              color: '#4C2A92',
              background: 'transparent',
              border: '1px solid #EDE8DC',
              borderRadius: 6,
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
            }}
          >
            {detailedNotesExpanded ? '▼' : '▶'} Detailed Notes
          </button>
          {detailedNotesExpanded && (
            <div
              style={{
                background: '#F9F8F6',
                border: '1px solid #EDE8DC',
                borderRadius: 6,
                padding: 12,
                fontSize: 13,
                lineHeight: 1.6,
                color: '#2D2A22',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                maxHeight: '400px',
                overflow: 'auto',
              }}
            >
              {results.detailed_notes}
              {results.scripture_references && results.scripture_references.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #E9E4D8' }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 12, textTransform: 'uppercase', color: '#9E9488' }}>
                    Scripture References
                  </div>
                  {results.scripture_references.map((ref, i) => (
                    <div key={i} style={{ fontSize: 12, marginBottom: 6, color: '#5C524C' }}>
                      <strong>{ref.citation}</strong>
                      {ref.confidence === 'confirmed' && ref.verse_text && (
                        <div style={{ marginTop: 2, fontStyle: 'italic', color: '#7A7168' }}>
                          "{ref.verse_text}"
                        </div>
                      )}
                      {ref.confidence === 'unconfirmed' && (
                        <div style={{ marginTop: 2, fontSize: 11, color: '#A89A8A' }}>
                          [citation unconfirmed — verse text not verified]
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#2D2A22' }}>
          Summary
        </label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          style={{
            width: '100%',
            padding: 12,
            fontSize: 13,
            border: '1px solid #EDE8DC',
            borderRadius: 6,
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
      </div>

      {/* Decisions */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#2D2A22' }}>
          Decisions Made
        </label>
        {decisions
          .map((decision, i) => {
            // Defensive: handle null, undefined, or malformed decision objects
            if (decision == null) return null
            const decisionText =
              typeof decision === 'string' ? decision : (decision?.decision ?? '')
            return { i, decision, decisionText }
          })
          .filter((item) => item !== null)
          .map(({ i, decision, decisionText }) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                type="text"
                value={decisionText}
                onChange={(e) => {
                  const updated = [...decisions]
                  // Ensure the object has a decision property (handle string case)
                  if (typeof updated[i] === 'string') {
                    updated[i] = { decision: e.target.value, context: '' }
                  } else if (updated[i] && typeof updated[i] === 'object') {
                    updated[i] = { ...updated[i], decision: e.target.value }
                  }
                  setDecisions(updated)
                }}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  fontSize: 13,
                  border: '1px solid #EDE8DC',
                  borderRadius: 6,
                  fontFamily: 'inherit',
                }}
              />
              <button
                onClick={() => handleRemoveDecision(i)}
                style={{
                  padding: '8px 12px',
                  fontSize: 12,
                  border: '1px solid #EDE8DC',
                  borderRadius: 6,
                  background: '#FFFFFF',
                  color: '#DC3545',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Remove
              </button>
            </div>
          ))}
        {!showAddDecision ? (
          <button
            onClick={() => setShowAddDecision(true)}
            style={{
              padding: '8px 12px',
              fontSize: 12,
              border: '1px solid #EDE8DC',
              borderRadius: 6,
              background: '#FFFFFF',
              color: '#4C2A92',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            + Add Decision
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={newDecisionText}
              onChange={(e) => setNewDecisionText(e.target.value)}
              placeholder="New decision"
              autoFocus
              style={{
                flex: 1,
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid #EDE8DC',
                borderRadius: 6,
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleAddDecision}
              disabled={!newDecisionText.trim()}
              style={{
                padding: '8px 12px',
                fontSize: 12,
                border: 'none',
                borderRadius: 6,
                background: '#4C2A92',
                color: '#FFFFFF',
                cursor: newDecisionText.trim() ? 'pointer' : 'not-allowed',
                fontWeight: 500,
                opacity: newDecisionText.trim() ? 1 : 0.5,
              }}
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Action Items */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#2D2A22' }}>
          Action Items
        </label>
        {actionItems.map((item, i) => {
          const priority = item.priority || 'medium'
          const pc = PRIORITY_COLORS[priority] || PRIORITY_COLORS.medium
          return (
            <div
              key={i}
              style={{
                background: pc.bg,
                border: `1px solid ${pc.border}`,
                borderLeft: `4px solid ${pc.dot}`,
                borderRadius: 8,
                padding: '12px 14px',
                marginBottom: 10,
              }}
            >
              {/* Title row */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 15 }}>✅</span>
                <input
                  type="text"
                  placeholder="What needs to be done?"
                  value={item.title || item.action || ''}
                  onChange={(e) => handleUpdateAction(i, 'title', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    fontSize: 13,
                    fontWeight: 600,
                    border: '1px solid #EDE8DC',
                    borderRadius: 6,
                    fontFamily: 'inherit',
                    background: 'white',
                  }}
                />
              </div>

              {/* Meta row — wraps on narrow screens */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 130, flex: '1 1 130px' }}>
                  <span style={{ fontSize: 12 }}>👤</span>
                  <input
                    type="text"
                    placeholder="Owner"
                    value={item.owner || ''}
                    onChange={(e) => handleUpdateAction(i, 'owner', e.target.value)}
                    style={{ flex: 1, padding: '6px 8px', fontSize: 12, border: '1px solid #EDE8DC', borderRadius: 6, fontFamily: 'inherit', background: 'white' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 120, flex: '1 1 120px' }}>
                  <span style={{ fontSize: 12 }}>📅</span>
                  <input
                    type="date"
                    value={item.due_date || ''}
                    onChange={(e) => handleUpdateAction(i, 'due_date', e.target.value)}
                    style={{ flex: 1, padding: '6px 8px', fontSize: 12, border: '1px solid #EDE8DC', borderRadius: 6, background: 'white' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 110, flex: '1 1 110px' }}>
                  <span style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: pc.dot,
                    flexShrink: 0,
                  }} />
                  <select
                    value={priority}
                    onChange={(e) => handleUpdateAction(i, 'priority', e.target.value)}
                    style={{ flex: 1, padding: '6px 8px', fontSize: 12, border: '1px solid #EDE8DC', borderRadius: 6, background: 'white' }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              {/* Space row */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 140, flex: '2 1 140px' }}>
                  <span style={{ fontSize: 12 }}>📁</span>
                  <input
                    type="text"
                    placeholder="Suggested space"
                    value={item.suggested_space || ''}
                    onChange={(e) => handleUpdateAction(i, 'suggested_space', e.target.value)}
                    style={{ flex: 1, padding: '6px 8px', fontSize: 12, border: '1px solid #EDE8DC', borderRadius: 6, fontFamily: 'inherit', background: 'white' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 110, flex: '1 1 110px' }}>
                  <select
                    value={item.space_confidence || 'high'}
                    onChange={(e) => handleUpdateAction(i, 'space_confidence', e.target.value)}
                    style={{ flex: 1, padding: '6px 8px', fontSize: 12, border: '1px solid #EDE8DC', borderRadius: 6, background: 'white' }}
                  >
                    <option value="high">High confidence</option>
                    <option value="low">Low confidence</option>
                    <option value="ambiguous">Ambiguous</option>
                  </select>
                </div>
              </div>

              <button
                onClick={() => handleRemoveAction(i)}
                style={{
                  padding: '5px 10px',
                  fontSize: 11,
                  border: 'none',
                  borderRadius: 6,
                  background: 'rgba(220,53,69,0.1)',
                  color: '#DC3545',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Remove
              </button>
            </div>
          )
        })}
      </div>

      {/* Detected Entities (flexible extraction) */}
      <DetectedEntitiesSection entities={results.detected_entities} />

      {/* Save/Discard */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '10px 20px',
            fontSize: 13,
            border: 'none',
            borderRadius: 6,
            background: '#4C2A92',
            color: '#FFFFFF',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            opacity: saving ? 0.5 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Save to Minutes'}
        </button>
        <button
          onClick={onDiscard}
          disabled={saving}
          style={{
            padding: '10px 20px',
            fontSize: 13,
            border: '1px solid #EDE8DC',
            borderRadius: 6,
            background: '#FFFFFF',
            color: '#2D2A22',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontWeight: 500,
          }}
        >
          Discard
        </button>
      </div>
    </div>
  )
}

// ── Detected Entities Section (Flexible Extraction Layer 1) ──────────

const ENTITY_META = {
  testimonies:          { icon: '🙏', label: 'Testimonies',          color: '#7C3AED' },
  pledges:              { icon: '💰', label: 'Pledges',              color: '#059669' },
  teaching_sessions:    { icon: '📖', label: 'Teaching Sessions',    color: '#2563EB' },
  announcements:        { icon: '📢', label: 'Announcements',        color: '#D97706' },
  attendance_metrics:   { icon: '📊', label: 'Attendance Metrics',   color: '#0891B2' },
  recognition_segments: { icon: '🏆', label: 'Recognition',          color: '#CA8A04' },
  campaigns:            { icon: '🚀', label: 'Campaigns',            color: '#DC2626' },
  strategic_initiatives:{ icon: '🎯', label: 'Strategic Initiatives', color: '#7C3AED' },
  budget_discussions:   { icon: '💵', label: 'Budget Discussions',   color: '#059669' },
  q_and_a:              { icon: '❓', label: 'Q&A',                  color: '#2563EB' },
  other:                { icon: '📌', label: 'Other',                color: '#6B7280' },
}

function confidenceColor(c) {
  if (c >= 0.8) return '#16A34A'
  if (c >= 0.6) return '#D97706'
  return '#DC2626'
}

function DetectedEntitiesSection({ entities }) {
  const [expanded, setExpanded] = useState({})
  if (!entities || typeof entities !== 'object') return null
  const types = Object.keys(entities).filter((k) => entities[k]?.detected)
  if (types.length === 0) return null

  const toggle = (type) => setExpanded((prev) => ({ ...prev, [type]: !prev[type] }))

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #EDE8DC',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#2D2A22' }}>
          Detected Content
        </span>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 10,
          background: '#F3F0FF', color: '#7C3AED', fontWeight: 600,
        }}>
          {types.length} {types.length === 1 ? 'type' : 'types'}
        </span>
      </div>

      {types.map((type) => {
        const data = entities[type]
        const meta = ENTITY_META[type] || { icon: '📌', label: type.replace(/_/g, ' '), color: '#6B7280' }
        const isOpen = !!expanded[type]

        return (
          <div key={type} style={{
            border: '1px solid #EDE8DC', borderRadius: 8, marginBottom: 8, overflow: 'hidden',
          }}>
            <button
              onClick={() => toggle(type)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '10px 14px', border: 'none', background: '#FAFAF8',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 14 }}>{meta.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#2D2A22', flex: 1 }}>
                {meta.label}
              </span>
              <span style={{
                fontSize: 11, padding: '1px 6px', borderRadius: 8,
                background: meta.color + '18', color: meta.color, fontWeight: 600,
              }}>
                {data.count}
              </span>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: confidenceColor(data.confidence),
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 11, color: '#9E9488' }}>
                {Math.round(data.confidence * 100)}%
              </span>
              <span style={{ fontSize: 11, color: '#9E9488' }}>
                {isOpen ? '▼' : '▶'}
              </span>
            </button>

            {isOpen && (
              <div style={{ padding: '12px 14px', borderTop: '1px solid #EDE8DC' }}>
                {data.ambiguities?.length > 0 && (
                  <div style={{
                    marginBottom: 10, padding: '6px 10px', fontSize: 12,
                    background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 6, color: '#92400E',
                  }}>
                    {data.ambiguities.map((a, i) => <div key={i}>⚠️ {a}</div>)}
                  </div>
                )}
                <EntityItems type={type} items={data.items || []} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EntityItems({ type, items }) {
  if (!items.length) return <div style={{ fontSize: 12, color: '#9E9488' }}>No items</div>

  switch (type) {
    case 'testimonies': return <TestimoniesItems items={items} />
    case 'pledges': return <PledgesItems items={items} />
    case 'teaching_sessions': return <TeachingItems items={items} />
    case 'recognition_segments': return <RecognitionItems items={items} />
    case 'campaigns': return <CampaignItems items={items} />
    case 'attendance_metrics': return <MetricsItems items={items} />
    case 'q_and_a': return <QAItems items={items} />
    case 'strategic_initiatives': return <TableItems items={items} columns={['initiative', 'owner', 'timeline']} />
    case 'budget_discussions': return <TableItems items={items} columns={['topic', 'amount', 'decision']} />
    case 'announcements': return <AnnouncementItems items={items} />
    case 'other': return <OtherItems items={items} />
    default: return <GenericItems items={items} />
  }
}

function TestimoniesItems({ items }) {
  return items.map((t, i) => (
    <div key={i} style={{
      padding: '10px 12px', marginBottom: 8, background: '#F9F8F6',
      border: '1px solid #EDE8DC', borderRadius: 6, borderLeft: '3px solid #7C3AED',
    }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#2D2A22' }}>{t.person}</span>
        {t.campus && <Tag text={t.campus} color="#7C3AED" />}
        {t.theme && <Tag text={t.theme} color="#2563EB" />}
      </div>
      {t.impact_pillars?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
          {t.impact_pillars.map((p, j) => <Tag key={j} text={p} color="#059669" />)}
        </div>
      )}
      {t.key_decision && (
        <div style={{ fontSize: 12, color: '#5C524C', marginBottom: 4 }}>
          <strong>Key decision:</strong> {t.key_decision}
        </div>
      )}
      {t.transcript_excerpt && <Excerpt text={t.transcript_excerpt} />}
    </div>
  ))
}

function PledgesItems({ items }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#F3F0FF' }}>
            {['Person', 'Type', 'Amount', 'Region', 'Target Date'].map((h) => (
              <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#5C524C', borderBottom: '1px solid #EDE8DC' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((p, i) => (
            <tr key={i} style={{ background: i % 2 ? '#FAFAF8' : 'white' }}>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid #F5F0E8' }}>{p.person}</td>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid #F5F0E8' }}>{p.commitment_type}</td>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid #F5F0E8', fontWeight: 600 }}>{p.amount || '—'}</td>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid #F5F0E8' }}>{p.region || '—'}</td>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid #F5F0E8' }}>{p.target_date || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TeachingItems({ items }) {
  return items.map((t, i) => (
    <div key={i} style={{
      padding: '10px 12px', marginBottom: 8, background: '#F9F8F6',
      border: '1px solid #EDE8DC', borderRadius: 6, borderLeft: '3px solid #2563EB',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#2D2A22', marginBottom: 4 }}>
        {t.title}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: '#5C524C', marginBottom: 6 }}>
        {t.facilitator && <span>👤 {t.facilitator}</span>}
        {t.estimated_duration && <span>⏱️ {t.estimated_duration}</span>}
        {t.reusability && <Tag text={`Reusability: ${t.reusability}`} color={t.reusability === 'high' ? '#059669' : t.reusability === 'medium' ? '#D97706' : '#9E9488'} />}
      </div>
      {t.core_topics?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
          {t.core_topics.map((topic, j) => <Tag key={j} text={topic} color="#2563EB" />)}
        </div>
      )}
      {t.scripture?.length > 0 && (
        <div style={{ fontSize: 12, color: '#7C3AED', marginBottom: 4 }}>
          📜 {t.scripture.join(', ')}
        </div>
      )}
      {t.transcript_excerpt && <Excerpt text={t.transcript_excerpt} />}
    </div>
  ))
}

function RecognitionItems({ items }) {
  return items.map((r, i) => (
    <div key={i} style={{
      padding: '10px 12px', marginBottom: 8, background: '#FFFBEB',
      border: '1px solid #FCD34D', borderRadius: 6, borderLeft: '3px solid #CA8A04',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E', marginBottom: 4 }}>
        🏆 {r.award_type}
      </div>
      {r.period && <div style={{ fontSize: 12, color: '#78716C', marginBottom: 4 }}>Period: {r.period}</div>}
      {r.recipients?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {r.recipients.map((name, j) => <Tag key={j} text={name} color="#CA8A04" />)}
        </div>
      )}
    </div>
  ))
}

function CampaignItems({ items }) {
  return items.map((c, i) => (
    <div key={i} style={{
      padding: '10px 12px', marginBottom: 8, background: '#FEF2F2',
      border: '1px solid #FCA5A5', borderRadius: 6, borderLeft: '3px solid #DC2626',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#991B1B', marginBottom: 4 }}>
        🚀 {c.campaign_name}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#5C524C', marginBottom: 4 }}>
        {c.goal && <span><strong>Goal:</strong> {c.goal}</span>}
        {c.target && <span><strong>Target:</strong> {c.target}</span>}
      </div>
      {c.tiers?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
          {c.tiers.map((tier, j) => <Tag key={j} text={tier} color="#DC2626" />)}
        </div>
      )}
      {c.transcript_excerpt && <Excerpt text={c.transcript_excerpt} />}
    </div>
  ))
}

function MetricsItems({ items }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {items.map((m, i) => (
        <div key={i} style={{
          padding: '8px 14px', background: '#F0F9FF', border: '1px solid #BAE6FD',
          borderRadius: 6, textAlign: 'center', minWidth: 100,
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0369A1' }}>
            {typeof m.value === 'number' ? m.value.toLocaleString() : m.value}
          </div>
          <div style={{ fontSize: 11, color: '#5C524C' }}>{m.metric}</div>
          {m.comparison && <div style={{ fontSize: 10, color: '#9E9488', marginTop: 2 }}>{m.comparison}</div>}
        </div>
      ))}
    </div>
  )
}

function QAItems({ items }) {
  return items.map((qa, i) => (
    <div key={i} style={{
      padding: '10px 12px', marginBottom: 8, background: '#F9F8F6',
      border: '1px solid #EDE8DC', borderRadius: 6,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#2D2A22', marginBottom: 4 }}>
        ❓ {qa.question}
      </div>
      {qa.asked_by && <div style={{ fontSize: 11, color: '#9E9488', marginBottom: 4 }}>Asked by: {qa.asked_by}</div>}
      {qa.answer_summary && (
        <div style={{ fontSize: 12, color: '#5C524C', paddingLeft: 12, borderLeft: '2px solid #EDE8DC' }}>
          {qa.answer_summary}
          {qa.answered_by && <span style={{ fontSize: 11, color: '#9E9488' }}> — {qa.answered_by}</span>}
        </div>
      )}
    </div>
  ))
}

function AnnouncementItems({ items }) {
  return items.map((a, i) => (
    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12, color: '#2D2A22' }}>
      <span style={{ color: '#D97706' }}>📢</span>
      <div>
        <span>{a.content}</span>
        {a.announced_by && <span style={{ color: '#9E9488' }}> — {a.announced_by}</span>}
        {a.effective_date && <span style={{ color: '#9E9488' }}> (effective: {a.effective_date})</span>}
      </div>
    </div>
  ))
}

function OtherItems({ items }) {
  return items.map((o, i) => (
    <div key={i} style={{
      padding: '8px 12px', marginBottom: 6, background: '#F9F8F6',
      border: '1px solid #EDE8DC', borderRadius: 6, fontSize: 12,
    }}>
      <div style={{ fontWeight: 600, color: '#2D2A22', marginBottom: 2 }}>{o.label}</div>
      <div style={{ color: '#5C524C' }}>{o.description}</div>
      {o.transcript_excerpt && <Excerpt text={o.transcript_excerpt} />}
    </div>
  ))
}

function TableItems({ items, columns }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#F9F8F6' }}>
            {columns.map((col) => (
              <th key={col} style={{
                padding: '6px 8px', textAlign: 'left', fontWeight: 600,
                color: '#5C524C', borderBottom: '1px solid #EDE8DC',
                textTransform: 'capitalize',
              }}>
                {col.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ background: i % 2 ? '#FAFAF8' : 'white' }}>
              {columns.map((col) => (
                <td key={col} style={{ padding: '6px 8px', borderBottom: '1px solid #F5F0E8' }}>
                  {item[col] || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GenericItems({ items }) {
  return items.map((item, i) => (
    <div key={i} style={{
      padding: '8px 12px', marginBottom: 6, background: '#F9F8F6',
      border: '1px solid #EDE8DC', borderRadius: 6, fontSize: 12,
    }}>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>
        {JSON.stringify(item, null, 2)}
      </pre>
    </div>
  ))
}

function Tag({ text, color }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 10,
      fontSize: 11, fontWeight: 500, background: color + '15', color,
    }}>
      {text}
    </span>
  )
}

function Excerpt({ text }) {
  return (
    <div style={{
      marginTop: 4, padding: '4px 8px', fontSize: 11, color: '#78716C',
      fontStyle: 'italic', background: '#F5F0E8', borderRadius: 4,
      maxHeight: 60, overflow: 'hidden',
    }}>
      "{text}"
    </div>
  )
}
