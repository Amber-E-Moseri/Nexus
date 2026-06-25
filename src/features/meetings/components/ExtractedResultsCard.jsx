import { useState } from 'react'

export default function ExtractedResultsCard({ results, onSaveToMinutes, onDiscard, saving }) {
  const [summary, setSummary] = useState(results.summary)
  const [decisions, setDecisions] = useState(results.decisions || [])
  const [actionItems, setActionItems] = useState(results.extractedActionItems || [])
  const [newDecisionText, setNewDecisionText] = useState('')
  const [showAddDecision, setShowAddDecision] = useState(false)
  const [showAddAction, setShowAddAction] = useState(false)

  function handleRemoveDecision(index) {
    setDecisions(decisions.filter((_, i) => i !== index))
  }

  function handleAddDecision() {
    if (newDecisionText.trim()) {
      setDecisions([...decisions, newDecisionText])
      setNewDecisionText('')
      setShowAddDecision(false)
    }
  }

  function handleRemoveAction(index) {
    setActionItems(actionItems.filter((_, i) => i !== index))
  }

  function handleAddAction() {
    setActionItems([
      ...actionItems,
      {
        action: '',
        owner: null,
        dueDate: null,
        priority: 'medium',
      },
    ])
    setShowAddAction(true)
  }

  function handleUpdateAction(index, field, value) {
    const updated = [...actionItems]
    updated[index] = { ...updated[index], [field]: value }
    setActionItems(updated)
  }

  function handleSave() {
    onSaveToMinutes({
      summary,
      decisions,
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
        📋 AI Extracted Content
      </h3>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#9E9488' }}>Review and edit before saving to minutes</p>

      {/* Summary */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#2D2A22' }}>
          Meeting Summary
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

      {/* Key Points */}
      {results.keyPoints?.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#2D2A22' }}>
            Key Points
          </label>
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              fontSize: 13,
              color: '#2D2A22',
              lineHeight: 1.6,
            }}
          >
            {results.keyPoints.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Decisions */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#2D2A22' }}>
          Decisions Made
        </label>
        {decisions.map((decision, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              value={decision}
              onChange={(e) => {
                const updated = [...decisions]
                updated[i] = e.target.value
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
            <button
              onClick={() => setShowAddDecision(false)}
              style={{
                padding: '8px 12px',
                fontSize: 12,
                border: '1px solid #EDE8DC',
                borderRadius: 6,
                background: '#FFFFFF',
                color: '#2D2A22',
                cursor: 'pointer',
              }}
            >
              Cancel
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 8 }}>
              <input
                type="text"
                placeholder="What needs to be done?"
                value={item.action}
                onChange={(e) => handleUpdateAction(i, 'action', e.target.value)}
                style={{
                  padding: '8px 10px',
                  fontSize: 13,
                  border: '1px solid #EDE8DC',
                  borderRadius: 6,
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Owner"
                  value={item.owner || ''}
                  onChange={(e) => handleUpdateAction(i, 'owner', e.target.value || null)}
                  style={{
                    padding: '8px 10px',
                    fontSize: 13,
                    border: '1px solid #EDE8DC',
                    borderRadius: 6,
                    fontFamily: 'inherit',
                  }}
                />
                <input
                  type="date"
                  value={item.dueDate || ''}
                  onChange={(e) => handleUpdateAction(i, 'dueDate', e.target.value || null)}
                  style={{
                    padding: '8px 10px',
                    fontSize: 13,
                    border: '1px solid #EDE8DC',
                    borderRadius: 6,
                    fontFamily: 'inherit',
                  }}
                />
                <select
                  value={item.priority}
                  onChange={(e) => handleUpdateAction(i, 'priority', e.target.value)}
                  style={{
                    padding: '8px 10px',
                    fontSize: 13,
                    border: '1px solid #EDE8DC',
                    borderRadius: 6,
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                </select>
              </div>
            </div>
            <button
              onClick={() => handleRemoveAction(i)}
              style={{
                padding: '6px 10px',
                fontSize: 12,
                border: '1px solid #EDE8DC',
                borderRadius: 4,
                background: '#FFFFFF',
                color: '#DC3545',
                cursor: 'pointer',
              }}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          onClick={handleAddAction}
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
          + Add Action Item
        </button>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1,
            padding: '12px 16px',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            borderRadius: 6,
            background: '#4C2A92',
            color: '#FFFFFF',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? '💾 Saving...' : '💾 Save to Minutes'}
        </button>
        <button
          onClick={onDiscard}
          disabled={saving}
          style={{
            flex: 1,
            padding: '12px 16px',
            fontSize: 13,
            fontWeight: 600,
            border: '1px solid #EDE8DC',
            borderRadius: 6,
            background: '#FFFFFF',
            color: '#2D2A22',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          Discard
        </button>
      </div>
    </div>
  )
}
