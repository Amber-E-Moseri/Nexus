import React from 'react'
import Badge from '../../../components/ui/Badge.jsx'

// One place that explains every status pill used on the Working List and in the participant drawer.
// Keep these definitions in step with readinessEngine.js / documentationRules.js.
const SECTIONS = [
  {
    title: 'Participation (set by staff)',
    items: [
      { tone: 'mute', label: 'Tracking', text: 'On the list; attendance not decided yet.' },
      { tone: 'in_progress', label: 'Confirming', text: 'Likely to attend, not final.' },
      { tone: 'done', label: 'Confirmed', text: 'Attending.' },
      { tone: 'at_risk', label: 'Uncertain', text: 'May not attend.' },
      { tone: 'blocked', label: 'Not Attending', text: 'Not coming; left out of counts and attention lists.' },
    ],
  },
  {
    title: 'Registration',
    items: [
      { tone: 'done', label: 'Registered', text: 'A completed registration is linked to this person.' },
      { tone: 'blocked', label: 'Registration Missing', text: 'Registration was started but is not complete. It still needs to be completed.' },
      { tone: 'at_risk', label: 'Not Registered', text: 'Registration has not been started. It needs to be started.' },
    ],
  },
  {
    title: 'Readiness (worked out automatically)',
    items: [
      { tone: 'done', label: 'Ready', text: 'Passport ready, visa settled and arrival details recorded. Nothing outstanding.' },
      { tone: 'in_progress', label: 'Waiting on itinerary', text: 'Documents are settled; only arrival or flight details are missing.' },
      { tone: 'in_progress', label: 'In Progress', text: 'A visa or renewal is underway; nothing needed from staff right now.' },
      { tone: 'at_risk', label: 'Action Required', text: 'Something specific needs staff. The drawer lists the reasons under Needs Attention.' },
      { tone: 'blocked', label: 'Blocked', text: 'A passport problem is stopping a visa that is required.' },
      { tone: 'mute', label: 'Unknown', text: 'Not enough information yet, for example the passport status has not been recorded.' },
    ],
  },
]

export default function StatusKey() {
  return (
    <details className="icplc-status-key" style={{ marginBottom: 12 }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--icplc-purple, #4C2A92)' }}>
        Key: what the status pills mean
      </summary>
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 8 }}>
              {section.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {section.items.map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ flexShrink: 0, minWidth: 128 }}>
                    <Badge tone={item.tone} label={item.label} />
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}
