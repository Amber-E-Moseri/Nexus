import { useState } from 'react'

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
      <OrganizedView
        results={results}
        onSaveToMinutes={onSaveToMinutes}
        onDiscard={onDiscard}
        saving={saving}
      />
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

function OrganizedView({ results, onSaveToMinutes, onDiscard, saving }) {
  const [summary, setSummary] = useState(results.summary)
  const [decisions, setDecisions] = useState(
    Array.isArray(results.decisions)
      ? results.decisions.map((d) => (typeof d === 'string' ? { decision: d, context: '' } : d))
      : []
  )
  const [actionItems, setActionItems] = useState(results.action_items || results.extractedActionItems || [])
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
        {decisions.map((decision, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              value={typeof decision === 'string' ? decision : decision.decision}
              onChange={(e) => {
                const updated = [...decisions]
                updated[i] = { ...updated[i], decision: e.target.value }
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
        {actionItems.map((item, i) => (
          <div
            key={i}
            style={{
              background: '#F9F8F6',
              border: '1px solid #EDE8DC',
              borderRadius: 6,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input
                type="text"
                placeholder="What needs to be done?"
                value={item.title || item.action || ''}
                onChange={(e) => handleUpdateAction(i, 'title', e.target.value)}
                style={{
                  padding: '8px 10px',
                  fontSize: 13,
                  border: '1px solid #EDE8DC',
                  borderRadius: 6,
                  fontFamily: 'inherit',
                }}
              />
              <input
                type="text"
                placeholder="Owner name"
                value={item.owner || ''}
                onChange={(e) => handleUpdateAction(i, 'owner', e.target.value)}
                style={{
                  padding: '8px 10px',
                  fontSize: 13,
                  border: '1px solid #EDE8DC',
                  borderRadius: 6,
                  fontFamily: 'inherit',
                }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input
                type="text"
                placeholder="Space (suggested)"
                value={item.suggested_space || ''}
                onChange={(e) => handleUpdateAction(i, 'suggested_space', e.target.value)}
                style={{
                  padding: '8px 10px',
                  fontSize: 13,
                  border: '1px solid #EDE8DC',
                  borderRadius: 6,
                  fontFamily: 'inherit',
                }}
              />
              <select
                value={item.space_confidence || 'high'}
                onChange={(e) => handleUpdateAction(i, 'space_confidence', e.target.value)}
                style={{
                  padding: '8px 10px',
                  fontSize: 13,
                  border: '1px solid #EDE8DC',
                  borderRadius: 6,
                }}
              >
                <option value="high">High confidence</option>
                <option value="low">Low confidence</option>
                <option value="ambiguous">Ambiguous</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input
                type="date"
                value={item.due_date || ''}
                onChange={(e) => handleUpdateAction(i, 'due_date', e.target.value)}
                style={{
                  padding: '8px 10px',
                  fontSize: 13,
                  border: '1px solid #EDE8DC',
                  borderRadius: 6,
                }}
              />
              <select
                value={item.priority || 'medium'}
                onChange={(e) => handleUpdateAction(i, 'priority', e.target.value)}
                style={{
                  padding: '8px 10px',
                  fontSize: 13,
                  border: '1px solid #EDE8DC',
                  borderRadius: 6,
                }}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <button
              onClick={() => handleRemoveAction(i)}
              style={{
                padding: '6px 12px',
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
      </div>

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
