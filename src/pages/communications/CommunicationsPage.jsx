import { useState } from 'react'

const TABS = [
  { key: 'mail', label: 'Communications' },
]

function TabBar({ active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2, padding: '0 24px', borderBottom: '0.5px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          style={{
            border: 'none',
            background: 'none',
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            color: active === tab.key ? '#4C2A92' : '#9E9488',
            borderBottom: active === tab.key ? '2px solid #4C2A92' : '2px solid transparent',
            marginBottom: -1,
            transition: 'color .12s',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export default function CommunicationsPage() {
  const mailUrl = import.meta.env.VITE_MAIL_OS_URL ?? '/apps/mail/index.html'
  const [activeTab, setActiveTab] = useState('mail')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px 0',
          borderBottom: '0.5px solid var(--border)',
          background: 'var(--surface)',
          flexShrink: 0,
        }}
      >
        <div style={{ paddingBottom: 10 }}>
          <h1 style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
            Communications
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
            Powered by Mail OS
          </p>
        </div>
        <a
          href={mailUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 12,
            color: 'var(--accent)',
            textDecoration: 'none',
            padding: '5px 10px',
            border: '0.5px solid var(--border)',
            borderRadius: 8,
            marginBottom: 10,
          }}
        >
          Open in new tab ↗
        </a>
      </div>

      <TabBar active={activeTab} onChange={setActiveTab} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#FBF8F2' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 24px',
            borderBottom: '1px solid #EDE8DC',
            background: 'white',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              height: 36,
              width: 36,
              flexShrink: 0,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 12,
              background: '#4C2A92',
              color: 'white',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            C
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Communication workspace
            </div>
            <div style={{ marginTop: 3, fontSize: 12, color: 'var(--text-secondary)' }}>
              Run email campaigns and communication workflows inside the embedded OS.
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, padding: '1.5rem', background: '#FBF8F2' }}>
          <div style={{ height: '100%', borderRadius: 16, overflow: 'hidden', border: '1px solid #EDE8DC', background: 'white' }}>
            <iframe
              src={mailUrl}
              style={{ flex: 1, width: '100%', height: '100%', border: 'none', background: 'var(--surface-secondary)' }}
              title="Mail OS"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
