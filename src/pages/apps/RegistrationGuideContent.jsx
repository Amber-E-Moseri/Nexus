import { useState } from 'react'
import { CheckCircle2, Clock, AlertCircle, HelpCircle } from 'lucide-react'

const STEPS = [
  {
    num: 1,
    title: 'Create the Sprint in Nexus',
    time: '10 min',
    description: 'Gates all registration page access',
    content: 'Go to Sprints → Create new sprint. Name it exactly as decided above — the code matches on this string with ILIKE. Create every team inside the sprint (one per function group). Add team members to each team.'
  },
  {
    num: 2,
    title: 'Configure the Event',
    time: '10 min',
    description: '6 files — make all edits in one PR',
    content: 'Update sprint name, event name, team lists, and form URLs across: Sidebar.jsx, RegistrationPage.jsx, RegistrationEcosystem.jsx, RegistrationPublicPage.jsx, and the two edge functions.'
  },
  {
    num: 3,
    title: 'Clear Old Event Data',
    time: '5 min',
    description: 'Only after previous event is wrapped up',
    content: 'Run truncate SQL on five tables (registrations, roster, working_list, event_payments, registration_config). Irreversible — export anything you need first.'
  },
  {
    num: 4,
    title: 'Set Up Google Sheet & Apps Script',
    time: '15 min',
    description: 'Connects the source form to Nexus',
    content: 'Copy the Google Sheet, paste appScript.gs into Apps Script editor, set Script Properties (NEXUS_API_URL, NEXUS_API_KEY), and test the sync.'
  },
  {
    num: 5,
    title: 'API Key — Set, Rotate, or Recover',
    time: '5 min',
    description: 'Authenticates the Google Sheet → Nexus sync',
    content: 'Run supabase secrets set, update Apps Script properties, and test. If expired, follow the rotation steps.'
  },
  {
    num: 6,
    title: 'Generate the Public Share Link',
    time: '2 min',
    description: 'Read-only view — no emails or phone numbers exposed',
    content: 'Go to /registration → Data tab → Public Share Link → Generate. Share the URL with subgroup leaders or exec team.'
  },
  {
    num: 7,
    title: 'Set Up Finance & Rooms Access',
    time: '5 min',
    description: 'Granted per-user via user_grants table',
    content: 'Insert user_grants rows for finance_data_access and/or rooms_access. Use SQL queries to find user UUIDs and set grants.'
  },
  {
    num: 8,
    title: 'Verify Access — End to End',
    time: '10 min',
    description: 'Test each tier with a real account',
    content: 'Confirm each role sees the correct tabs: super_admin/regional_secretary see all; team members see registration tabs; finance/rooms grants work; pastors see scoped views.'
  }
]

const PRELAUNCH_ITEMS = [
  { category: 'Event Identity', items: ['Full event name', 'Sprint name for Nexus', 'Subgroups list', 'Fellowships exempt from flying'] },
  { category: 'Teams & Access', items: ['Event team names', 'Accommodation team members', 'Finance access users', 'Programs space members'] },
  { category: 'External Forms', items: ['Registrations form URL', 'Flights form URL', 'NEXUS_API_KEY holder'] }
]

export default function RegistrationGuideContent() {
  const [completed, setCompleted] = useState({})
  const [expandedStep, setExpandedStep] = useState(null)

  const toggleComplete = (idx) => {
    setCompleted(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  const totalTime = STEPS.reduce((sum, step) => {
    const mins = parseInt(step.time)
    return sum + mins
  }, 0)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 10 }}>
          Registration System
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 12px', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          Event Setup Guide
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
          How to launch and configure the registration system for a new regional program. Programs are not run simultaneously — follow these steps each time.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 6 }}>
            One event at a time
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 6 }}>
            No schema changes needed
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 6 }}>
            ~{totalTime} min total
          </div>
        </div>
      </div>

      {/* Pre-launch section */}
      <div style={{
        background: 'var(--surface)',
        border: `1px solid var(--border)`,
        borderLeft: `4px solid var(--accent)`,
        borderRadius: 8,
        padding: '24px 28px',
        marginBottom: 40
      }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 20 }}>
          Before You Touch Code
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
          {PRELAUNCH_ITEMS.map(section => (
            <div key={section.category}>
              <h3 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 12 }}>
                {section.category}
              </h3>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {section.items.map((item, i) => (
                  <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        const key = `prelaunch-${section.category}-${i}`
                        toggleComplete(key)
                      }}
                      style={{
                        marginTop: 3,
                        cursor: 'pointer',
                        width: 16,
                        height: 16,
                        accentColor: 'var(--accent)'
                      }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 40 }}>
        {STEPS.map((step, idx) => (
          <div
            key={idx}
            style={{
              background: 'var(--surface)',
              border: `1px solid var(--border)`,
              borderTop: idx === 0 ? `1px solid var(--border)` : 'none',
              padding: '20px 24px',
              cursor: 'pointer',
              transition: 'background 0.15s',
              ':hover': { background: 'var(--surface-secondary)' }
            }}
            onClick={() => setExpandedStep(expandedStep === idx ? null : idx)}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-secondary)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--surface)'}
          >
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: completed[idx] ? 'var(--sage)' : 'var(--accent)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 14,
                  flexShrink: 0,
                  marginTop: 2
                }}
              >
                {completed[idx] ? '✓' : step.num}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', marginBottom: 4 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                    {step.title}
                  </h3>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    <Clock size={14} />
                    <span>{step.time}</span>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                  {step.description}
                </p>
              </div>
              <div
                style={{
                  width: 20,
                  height: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-tertiary)',
                  transform: expandedStep === idx ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                  flexShrink: 0,
                  marginTop: 2
                }}
              >
                ▼
              </div>
            </div>

            {expandedStep === idx && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                  {step.content}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary card */}
      <div style={{
        background: 'var(--sage-light)',
        border: `1px solid var(--sage-border)`,
        borderRadius: 8,
        padding: '16px 20px',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start'
      }}>
        <HelpCircle size={18} color="var(--sage)" style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>
          <strong>First-time setup:</strong> Allow 1.5–2 hours total. Subsequent events: 45 min–1 hour after you're familiar with the process.
        </div>
      </div>
    </div>
  )
}
