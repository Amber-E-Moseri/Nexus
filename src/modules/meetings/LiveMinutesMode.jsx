import { useState, useEffect, useRef } from 'react'
import { useMeetings } from './MeetingsContext'

function LiveMinutesModeInner({ meeting, onClose }) {
  const { editMeeting } = useMeetings()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [currentItemIndex, setCurrentItemIndex] = useState(0)
  const [notes, setNotes] = useState('')
  const [capturedItems, setCapturedItems] = useState([])
  const [showAddItem, setShowAddItem] = useState(false)
  const [newItemText, setNewItemText] = useState('')
  const notesRef = useRef(null)
  const timerRef = useRef(null)

  const agendaItems = meeting.agenda ? meeting.agenda.split('\n').filter((l) => l.trim()) : []

  useEffect(() => {
    if (!isPaused) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1)
      }, 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isPaused])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const handleAddAgendaItem = () => {
    if (newItemText.trim()) {
      setAgendaItems([...agendaItems, newItemText.trim()])
      setNewItemText('')
      setShowAddItem(false)
    }
  }

  const handleCaptureAction = () => {
    if (notes.trim()) {
      setCapturedItems([
        ...capturedItems,
        {
          id: Date.now(),
          type: 'action',
          text: notes.trim(),
          timestamp: new Date().toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }),
        },
      ])
      setNotes('')
    }
  }

  const handleMarkDecision = () => {
    if (notes.trim()) {
      setCapturedItems([
        ...capturedItems,
        {
          id: Date.now(),
          type: 'decision',
          text: notes.trim(),
          timestamp: new Date().toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }),
        },
      ])
      setNotes('')
    }
  }

  const handleNextItem = () => {
    if (currentItemIndex < agendaItems.length - 1) {
      setCurrentItemIndex(currentItemIndex + 1)
      setNotes('')
    }
  }

  const handleEndMeeting = async () => {
    try {
      await editMeeting(meeting.id, {
        minutes: notes,
      })
      onClose?.()
    } catch (error) {
      console.error('Failed to save minutes:', error)
    }
  }

  const currentItem = agendaItems[currentItemIndex]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#000' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          background: '#1C1C2E',
          borderBottom: '1px solid #333',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              paddingLeft: '10px',
              paddingRight: '10px',
              paddingTop: '6px',
              paddingBottom: '6px',
              borderRadius: 6,
              background: '#7F1D1D',
              fontSize: 12,
              fontWeight: 700,
              color: 'white',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#DC2626',
                animation: 'pulse 2s infinite',
              }}
            />
            LIVE
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>
              {meeting.title}
            </div>
            <div style={{ marginTop: 2, fontSize: 12, color: '#999' }}>
              {meeting.meeting_type} • started {new Date(meeting.date).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'white', fontFamily: 'DM Mono' }}>
              {formatTime(elapsedSeconds)}
            </div>
            <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#999' }}>
              Elapsed
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsPaused(!isPaused)}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid #666',
              background: 'transparent',
              color: 'white',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={handleEndMeeting}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              background: '#E8A020',
              color: '#000',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            End & save minutes
          </button>
        </div>
      </div>

      {/* Main content - 3 columns */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 1, background: '#1C1C1C' }}>
        {/* Left column - Agenda */}
        <div
          style={{
            flex: '0 0 280px',
            overflowY: 'auto',
            borderRight: '1px solid #333',
            padding: '16px 12px',
            background: '#1C1C2E',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#999', marginBottom: 8 }}>
            {agendaItems.filter((_, i) => i < currentItemIndex).length} / {agendaItems.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {agendaItems.map((item, idx) => (
              <div
                key={idx}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background:
                    idx === currentItemIndex
                      ? '#4C2A92'
                      : idx < currentItemIndex
                        ? '#2D1B47'
                        : '#333',
                  border: idx === currentItemIndex ? '2px solid #7C3AED' : '1px solid #444',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onClick={() => setCurrentItemIndex(idx)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div
                    style={{
                      marginTop: 2,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      border: '2px solid',
                      borderColor: idx === currentItemIndex ? '#7C3AED' : idx < currentItemIndex ? '#16A34A' : '#666',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {idx < currentItemIndex ? (
                      <div style={{ fontSize: 10, color: '#16A34A', fontWeight: 700 }}>✓</div>
                    ) : null}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'white',
                        textDecoration: idx < currentItemIndex ? 'line-through' : 'none',
                      }}
                    >
                      {item}
                    </div>
                    {idx === currentItemIndex && (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: '#A78BFA',
                        }}
                      >
                        Discussing now
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {showAddItem ? (
              <div style={{ padding: '10px 12px', borderRadius: 8, background: '#333', border: '1px dashed #666' }}>
                <input
                  type="text"
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddAgendaItem()
                  }}
                  placeholder="Add agenda item..."
                  autoFocus
                  style={{
                    width: '100%',
                    background: '#2D1B47',
                    border: '1px solid #444',
                    borderRadius: 4,
                    padding: '6px 8px',
                    color: 'white',
                    fontSize: 12,
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddItem(true)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'transparent',
                  border: '1px dashed #666',
                  color: '#999',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + Add agenda item
              </button>
            )}
          </div>
        </div>

        {/* Center column - Notes */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            background: '#1C1C2E',
            borderRight: '1px solid #333',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>
                  {currentItem ? `${currentItemIndex + 1}. ${currentItem}` : 'No items'}
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#999' }}>notes autosaved now</div>
            </div>
          </div>

          <textarea
            ref={notesRef}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Take notes here..."
            style={{
              flex: 1,
              background: '#2D1B47',
              border: '1px solid #444',
              borderRadius: 8,
              padding: '12px 14px',
              color: 'white',
              fontSize: 13,
              lineHeight: 1.7,
              fontFamily: 'DM Sans',
              resize: 'none',
              outline: 'none',
            }}
          />

          <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleCaptureAction}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: 'transparent',
                  border: '1px solid #666',
                  color: '#E8A020',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: 10 }}>●</span>
                Capture action item
              </button>
              <button
                type="button"
                onClick={handleMarkDecision}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: 'transparent',
                  border: '1px solid #666',
                  color: '#999',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                ★ Mark decision
              </button>
            </div>
            <button
              type="button"
              onClick={handleNextItem}
              disabled={currentItemIndex >= agendaItems.length - 1}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                background: currentItemIndex < agendaItems.length - 1 ? '#4C2A92' : '#444',
                border: 'none',
                color: 'white',
                fontSize: 12,
                fontWeight: 600,
                cursor: currentItemIndex < agendaItems.length - 1 ? 'pointer' : 'not-allowed',
              }}
            >
              Next item →
            </button>
          </div>
        </div>

        {/* Right column - Attendance + Captured */}
        <div
          style={{
            flex: '0 0 280px',
            overflowY: 'auto',
            padding: '16px 12px',
            background: '#1C1C2E',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
{/* Captured Items */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#999', marginBottom: 8 }}>
              CAPTURED THIS MEETING · {capturedItems.length}
            </div>
            {capturedItems.length === 0 ? (
              <div style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}>
                Capture action items or decisions as you go
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {capturedItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: '#2D1B47',
                      borderLeft: `2px solid ${item.type === 'action' ? '#E8A020' : '#7C3AED'}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <span
                        style={{
                          marginTop: 2,
                          display: 'inline-block',
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: item.type === 'action' ? '#E8A020' : '#7C3AED',
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>
                          {item.text}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 10, color: '#999' }}>
                          {item.timestamp}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div
              style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid #333',
                fontSize: 11,
                color: '#666',
              }}
            >
              These post to the department board when you end the meeting
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}

export default function LiveMinutesMode({ meeting, onClose }) {
  return <LiveMinutesModeInner meeting={meeting} onClose={onClose} />
}
