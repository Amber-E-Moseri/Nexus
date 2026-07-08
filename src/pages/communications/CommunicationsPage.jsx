import { useState } from 'react'
import InvitationWizard from './InvitationWizard'
import InvitationsListPage from './InvitationsListPage'
import { FONT_HEADING } from '../../lib/fonts'

const PRIMARY = 'var(--purple-700)'
const BORDER = 'var(--border-1)'
const TEXT = 'var(--ink-1)'
const MUTED = 'var(--ink-3)'

export default function CommunicationsPage() {
  const [view, setView] = useState('campaigns') // 'campaigns' | 'invitations'
  const mailUrl = import.meta.env.VITE_MAIL_OS_URL ?? '/apps/mail/index.html'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderBottom: '0.5px solid var(--border)',
          background: 'var(--surface)',
          flexShrink: 0,
        }}
      >
        <div>
          <h1 style={{ fontFamily: FONT_HEADING, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Communications
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
            {view === 'campaigns' ? 'Email campaigns for Admin and ORS' : 'Invitation campaigns'}
          </p>
        </div>
        {view === 'campaigns' && (
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
            }}
          >
            Open full screen ↗
          </a>
        )}
      </div>

      {/* Tab Navigation */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          borderBottom: `1px solid ${BORDER}`,
          padding: '0 24px',
          background: 'var(--surface)',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => setView('campaigns')}
          style={{
            padding: '12px 16px',
            borderBottom: view === 'campaigns' ? `3px solid ${PRIMARY}` : 'none',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontWeight: view === 'campaigns' ? 600 : 400,
            fontSize: 13,
            color: view === 'campaigns' ? PRIMARY : MUTED,
            transition: 'all 0.2s',
          }}
        >
          Email Campaigns
        </button>
        <button
          type="button"
          onClick={() => setView('invitations')}
          style={{
            padding: '12px 16px',
            borderBottom: view === 'invitations' ? `3px solid ${PRIMARY}` : 'none',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontWeight: view === 'invitations' ? 600 : 400,
            fontSize: 13,
            color: view === 'invitations' ? PRIMARY : MUTED,
            transition: 'all 0.2s',
          }}
        >
          Invitations
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--surface-secondary)' }}>
        {view === 'campaigns' && (
          <iframe
            src={mailUrl}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="BLW Mail"
          />
        )}
        {view === 'invitations' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <InvitationsListPage />
          </div>
        )}
      </div>
    </div>
  )
}
