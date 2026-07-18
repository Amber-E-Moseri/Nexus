// GlobalTaskFeedPanel
// Slide-out panel for cross-space calendar feed subscriptions:
//   All My Tasks, All Followed Tasks, My Planner Schedule.
// Accessible from the Planner page header and user settings.

import { useState, useEffect, useCallback } from 'react'
import { X, Copy, Calendar, Apple, CheckCircle2, Circle, Loader2, Check } from 'lucide-react'
import { getGoogleCalendarSubscribeUrl, getOrCreateTaskFeedToken, getTaskFeedUrl } from '../lib/calendar'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../../../context/ToastContext'

const GLOBAL_FEEDS = [
  {
    type: 'all_my_tasks',
    name: 'All My Tasks',
    description: 'Every task assigned to you across all spaces, sorted by due date.',
  },
  {
    type: 'all_followed_tasks',
    name: 'All Followed Tasks',
    description: 'Tasks you follow across all spaces — stay informed on due dates.',
  },
  {
    type: 'planner',
    name: 'My Planner Schedule',
    description: 'Your time-blocked schedule from the Planner with exact start and end times.',
  },
]

function formatDate(value) {
  if (!value) return null
  try {
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return null
  }
}

function secondaryBtn(busy) {
  return {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'white',
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 600,
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.7 : 1,
  }
}

function FeedCard({ feed, subscription, busy, onCopy, onGoogle, onApple }) {
  const active = Boolean(subscription?.token)

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        background: 'white',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{feed.name}</h4>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {feed.description}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600 }}>
        {active ? (
          <>
            <CheckCircle2 size={13} style={{ color: '#2D8653' }} />
            <span style={{ color: '#2D8653' }}>Active</span>
            {subscription?.created_at && (
              <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>
                · since {formatDate(subscription.created_at)}
              </span>
            )}
          </>
        ) : (
          <>
            <Circle size={13} style={{ color: 'var(--text-tertiary)' }} />
            <span style={{ color: 'var(--text-tertiary)' }}>Not yet subscribed</span>
          </>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          disabled={busy}
          onClick={onCopy}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '8px 12px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--accent)',
            color: 'white',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? <Loader2 size={14} className="spin" /> : <Copy size={14} />}
          Copy Link
        </button>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" disabled={busy} onClick={onGoogle} style={secondaryBtn(busy)}>
            <Calendar size={14} />
            Google
          </button>
          <button type="button" disabled={busy} onClick={onApple} style={secondaryBtn(busy)}>
            <Apple size={14} />
            Apple
          </button>
        </div>
      </div>
    </div>
  )
}

export default function GlobalTaskFeedPanel({ userId, onClose }) {
  const { showToast } = useToast()
  // urls keyed by feed type — pre-loaded on mount so Copy Link is synchronous.
  // navigator.clipboard.writeText requires an active user-gesture context;
  // if we await an RPC inside the click handler that context expires before
  // the clipboard write, causing a NotAllowedError on first-time subscriptions.
  const [urls, setUrls] = useState({})
  const [loading, setLoading] = useState(true)
  const [subscriptions, setSubscriptions] = useState([])

  const loadAll = useCallback(async () => {
    if (!userId) return
    setLoading(true)

    // Fetch existing subscriptions first so we can display status badges.
    const { data } = await supabase
      .from('task_feed_subscriptions')
      .select('id, feed_type, token, created_at')
      .eq('user_id', userId)
      .is('space_id', null)
    const rows = data ?? []
    setSubscriptions(rows)

    // Pre-create tokens for any feed that doesn't have one yet, then build the
    // url map. All async work happens here (mount), not inside click handlers.
    const nextUrls = {}
    await Promise.all(
      GLOBAL_FEEDS.map(async (feed) => {
        try {
          const existing = rows.find((s) => s.feed_type === feed.type)?.token
          const token = existing ?? (await getOrCreateTaskFeedToken(userId, null, feed.type))
          if (token) nextUrls[feed.type] = getTaskFeedUrl(token)
        } catch (err) {
          console.error(`Failed to pre-load token for ${feed.type}:`, err)
        }
      }),
    )
    setUrls(nextUrls)

    // Refresh subscription rows now that tokens may have been created.
    const { data: refreshed } = await supabase
      .from('task_feed_subscriptions')
      .select('id, feed_type, token, created_at')
      .eq('user_id', userId)
      .is('space_id', null)
    setSubscriptions(refreshed ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const subFor = (type) => subscriptions.find((s) => s.feed_type === type)

  function handleCopy(feedType) {
    const url = urls[feedType]
    if (!url) {
      showToast('Feed link not ready yet — please try again', { tone: 'error' })
      return
    }
    navigator.clipboard.writeText(url).then(
      () => showToast('Feed link copied to clipboard', { tone: 'success' }),
      () => {
        // Clipboard write blocked — fall back to a prompt so the user can copy manually.
        window.prompt('Copy this link:', url)
      },
    )
  }

  function handleGoogle(feedType) {
    const url = urls[feedType]
    if (!url) { showToast('Feed link not ready yet', { tone: 'error' }); return }
    const googleUrl = getGoogleCalendarSubscribeUrl(url)
    if (!googleUrl) { showToast('Feed link not ready yet', { tone: 'error' }); return }
    window.open(googleUrl, '_blank', 'noopener')
  }

  function handleApple(feedType) {
    const url = urls[feedType]
    if (!url) { showToast('Feed link not ready yet', { tone: 'error' }); return }
    window.open(`webcal://${url.replace(/^https?:\/\//, '')}`, '_blank', 'noopener')
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, display: 'flex', zIndex: 60 }}
      role="dialog"
      aria-modal="true"
      aria-label="Sync tasks to calendar"
    >
      <style>{`@keyframes gtfspin{to{transform:rotate(360deg)}}.spin{animation:gtfspin .7s linear infinite}`}</style>
      <div style={{ flex: 1, background: 'rgba(28,22,16,0.32)' }} onClick={onClose} />
      <div
        style={{
          width: 'min(440px, 100vw)',
          background: 'var(--surface-secondary, #FAF8F3)',
          boxShadow: '-8px 0 32px rgba(28,22,16,0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'white',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              Sync Tasks to Calendar
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
              Subscribe to live iCal feeds in Google, Apple, or Outlook.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              display: 'flex',
              padding: 6,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'white',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {GLOBAL_FEEDS.map((feed) => (
            <FeedCard
              key={feed.type}
              feed={feed}
              subscription={subFor(feed.type)}
              busy={loading || !urls[feed.type]}
              onCopy={() => handleCopy(feed.type)}
              onGoogle={() => handleGoogle(feed.type)}
              onApple={() => handleApple(feed.type)}
            />
          ))}

          <div
            style={{
              display: 'flex',
              gap: 8,
              padding: '12px 14px',
              borderRadius: 10,
              background: '#FFFFFF',
              border: '1px solid var(--border)',
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            <Check size={15} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
            <span>
              These are live read-only feeds — your calendar app refreshes them automatically every 15 minutes.
              Changes in Nexus appear in your calendar soon after.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
