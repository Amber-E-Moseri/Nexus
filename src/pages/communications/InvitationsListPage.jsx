import { useEffect, useState } from 'react'
import { Plus, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { FONT_HEADING } from '../../lib/fonts'

const PRIMARY = 'var(--purple-700)'
const SURFACE = '#FFFFFF'

const STATUS_COLORS = {
  draft: { bg: 'var(--surface-sub)', color: 'var(--ink-2)' },
  sending: { bg: 'var(--accent-yellow-tint)', color: 'var(--accent-yellow-text)' },
  sent: { bg: 'var(--accent-green-tint)', color: 'var(--accent-green-text)' },
  paused: { bg: 'var(--accent-yellow-tint)', color: 'var(--accent-yellow-text)' },
}

function Spinner() {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--accent)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--accent)',
          animation: 'pulse 1.5s ease-in-out infinite 0.2s',
        }}
      />
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--accent)',
          animation: 'pulse 1.5s ease-in-out infinite 0.4s',
        }}
      />
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.draft
  return (
    <span
      style={{
        display: 'inline-block',
        borderRadius: 999,
        padding: '3px 10px',
        fontSize: 11,
        fontWeight: 700,
        background: colors.bg,
        color: colors.color,
        textTransform: 'capitalize',
      }}
    >
      {status}
    </span>
  )
}

function formatDate(dateString) {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function InvitationsListPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!profile?.id) return

    async function loadCampaigns() {
      try {
        setLoading(true)
        setError(null)

        const { data, error: err } = await supabase
          .from('invitation_campaigns')
          .select('id, name, status, sent_at, created_at')
          .eq('created_by', profile.id)
          .order('created_at', { ascending: false })

        if (err) throw err

        setCampaigns(data ?? [])
      } catch (err) {
        setError(err.message ?? 'Failed to load campaigns')
      } finally {
        setLoading(false)
      }
    }

    loadCampaigns()

    // Real-time subscription
    const subscription = supabase
      .channel(`invitation_campaigns:created_by=eq.${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invitation_campaigns',
          filter: `created_by=eq.${profile.id}`,
        },
        async (payload) => {
          // Refetch campaigns when changes occur
          const { data } = await supabase
            .from('invitation_campaigns')
            .select('id, name, status, sent_at, created_at')
            .eq('created_by', profile.id)
            .order('created_at', { ascending: false })
          setCampaigns(data ?? [])
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [profile?.id])

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          flexDirection: 'column',
          gap: 16,
          color: 'var(--text-secondary)',
        }}
      >
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{error}</div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#F7F5F0' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: `1px solid ${'var(--border)'}`,
          background: SURFACE,
          flexShrink: 0,
        }}
      >
        <div>
          <h1 style={{ fontFamily: FONT_HEADING, fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Invitations</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/communications/invitations/new')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '10px 16px',
            fontSize: 12.5,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(76,42,146,0.15)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#3D2178'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = PRIMARY
          }}
        >
          <Plus size={16} /> New Invitation
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
        {loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-secondary)',
              gap: 12,
            }}
          >
            <Spinner />
            <span style={{ fontSize: 13 }}>Loading campaigns...</span>
          </div>
        ) : campaigns.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              flexDirection: 'column',
              gap: 12,
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>No campaigns yet</div>
            <button
              type="button"
              onClick={() => navigate('/communications/invitations/new')}
              style={{
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '8px 16px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: 8,
              }}
            >
              Create your first invitation
            </button>
          </div>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              background: SURFACE,
            }}
          >
            <thead>
              <tr style={{ borderBottom: `1px solid ${'var(--border)'}`, background: '#FAFAF7' }}>
                <th
                  style={{
                    padding: '12px 20px',
                    textAlign: 'left',
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Campaign Name
                </th>
                <th
                  style={{
                    padding: '12px 20px',
                    textAlign: 'left',
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Template
                </th>
                <th
                  style={{
                    padding: '12px 20px',
                    textAlign: 'left',
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Recipients
                </th>
                <th
                  style={{
                    padding: '12px 20px',
                    textAlign: 'left',
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    padding: '12px 20px',
                    textAlign: 'left',
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Sent At
                </th>
                <th
                  style={{
                    padding: '12px 20px',
                    textAlign: 'center',
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr
                  key={campaign.id}
                  style={{
                    borderBottom: `1px solid ${'var(--border)'}`,
                    cursor: 'pointer',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#FAFAF7'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = SURFACE
                  }}
                  onClick={() => navigate(`/communications/invitations/${campaign.id}`)}
                >
                  <td
                    style={{
                      padding: '14px 20px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      maxWidth: 200,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {campaign.name}
                  </td>
                  <td
                    style={{
                      padding: '14px 20px',
                      fontSize: 12.5,
                      color: 'var(--text-primary)',
                      maxWidth: 200,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {campaign.invitation_templates?.name ?? '-'}
                  </td>
                  <td
                    style={{
                      padding: '14px 20px',
                      fontSize: 12.5,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {campaign.recipient_count ?? '-'}
                  </td>
                  <td
                    style={{
                      padding: '14px 20px',
                      fontSize: 12.5,
                    }}
                  >
                    <StatusBadge status={campaign.status} />
                  </td>
                  <td
                    style={{
                      padding: '14px 20px',
                      fontSize: 12.5,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {formatDate(campaign.sent_at)}
                  </td>
                  <td
                    style={{
                      padding: '14px 20px',
                      textAlign: 'center',
                      color: 'var(--accent)',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ChevronRight size={16} style={{ opacity: 0.5 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
