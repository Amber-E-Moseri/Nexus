import { useEffect, useState } from 'react'
import { Plus, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#F4F1EA'
const SURFACE = '#ffffff'
const GOLD = '#E8A020'

const STATUS_COLORS = {
  draft: { bg: '#F4F1EA', color: '#9E9488' },
  sending: { bg: '#E8EEFA', color: '#1A56DB' },
  sent: { bg: '#EBF7F1', color: '#2D8653' },
  paused: { bg: '#FEF3C7', color: '#92400E' },
}

function Spinner() {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: PRIMARY,
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: PRIMARY,
          animation: 'pulse 1.5s ease-in-out infinite 0.2s',
        }}
      />
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: PRIMARY,
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
    if (!profile?.org_id) return

    async function loadCampaigns() {
      try {
        setLoading(true)
        setError(null)

        const { data, error: err } = await supabase
          .from('invitation_campaigns')
          .select(`
            id,
            name,
            status,
            sent_at,
            template_id,
            invitation_templates(name)
          `)
          .eq('org_id', profile.org_id)
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
      .channel(`invitation_campaigns:org_id=eq.${profile.org_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invitation_campaigns',
          filter: `org_id=eq.${profile.org_id}`,
        },
        async (payload) => {
          // Refetch campaigns when changes occur
          const { data } = await supabase
            .from('invitation_campaigns')
            .select(`
              id,
              name,
              status,
              sent_at,
              template_id,
              invitation_templates(name)
            `)
            .eq('org_id', profile.org_id)
            .order('created_at', { ascending: false })
          setCampaigns(data ?? [])
        },
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [profile?.org_id])

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
          color: MUTED,
        }}
      >
        <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT }}>{error}</div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            background: PRIMARY,
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: BG }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: `1px solid ${BORDER}`,
          background: SURFACE,
          flexShrink: 0,
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: TEXT, margin: 0 }}>Invitations</h1>
          <p style={{ fontSize: 12, color: MUTED, margin: '4px 0 0 0' }}>
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
            background: PRIMARY,
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
              color: MUTED,
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
              color: MUTED,
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT }}>No campaigns yet</div>
            <button
              type="button"
              onClick={() => navigate('/communications/invitations/new')}
              style={{
                background: PRIMARY,
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
              <tr style={{ borderBottom: `1px solid ${BORDER}`, background: '#FAFAF7' }}>
                <th
                  style={{
                    padding: '12px 20px',
                    textAlign: 'left',
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: TEXT,
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
                    color: TEXT,
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
                    color: TEXT,
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
                    color: TEXT,
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
                    color: TEXT,
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
                    color: TEXT,
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
                    borderBottom: `1px solid ${BORDER}`,
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
                      color: TEXT,
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
                      color: TEXT,
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
                      color: MUTED,
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
                      color: MUTED,
                    }}
                  >
                    {formatDate(campaign.sent_at)}
                  </td>
                  <td
                    style={{
                      padding: '14px 20px',
                      textAlign: 'center',
                      color: PRIMARY,
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
