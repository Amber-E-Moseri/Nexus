// GlobalTaskFeedPanel
// Slide-out panel for cross-space calendar feed subscriptions:
//   All My Tasks, All Followed Tasks, My Planner Schedule.
// Accessible from the Planner page header and user settings.

import { useState, useEffect, useCallback } from 'react'
import { X, Copy, Calendar, Apple, CheckCircle2, Circle, Loader2, Check } from 'lucide-react'
import { getOrCreateTaskFeedToken, getTaskFeedUrl } from '../lib/calendar'
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
  const [subscriptions, setSubscriptions] = useState([])
  const [busyType, setBusyType] = useState(null)

  const loadSubscriptions = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('task_feed_subscriptions')
      .select('id, feed_type, token, created_at')
      .eq('user_id', userId)
      .is('space_id', null)
    setSubscriptions(data ?? [])
  }, [userId])

  useEffect(() => {
    loadSubscriptions()
  }, [loadSubscriptions])

  const subFor = (type) => subscriptions.find((s) => s.feed_type === type)

  async function ensureUrl(feedType) {
    const existing = subFor(feedType)?.token
    if (existing) return getTaskFeedUrl(existing)
    setBusyType(feedType)
    try {
      const token = await getOrCreateTaskFeedToken(userId, null, feedType)
      await loadSubscriptions()
      return getTaskFeedUrl(token)
    } finally {
      setBusyType(null)
    }
  }

  async function handleCopy(feedType) {
    try {
      const url = await ensureUrl(feedType)
      await navigator.clipboard.writeText(url)
      showToast('Feed link copied to clipboard', { tone: 'success' })
    } catch {
      showToast('Could not copy feed link', { tone: 'error' })
    }
  }

  async function handleGoogle(feedType) {
    try {
      const url = await ensureUrl(feedType)
      window.open(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url)}`, '_blank', 'noopener')
    } catch {
      showToast('Could not open Google Calendar', { tone: 'error' })
    }
  }

  async function handleApple(feedType) {
    try {
      const url = await ensureUrl(feedType)
      const webcal = `webcal://${url.replace(/^https?:\/\//, '')}`
      window.open(webcal, '_blank', 'noopener')
    } catch {
      showToast('Could not open Apple Calendar', { tone: 'error' })
    }
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
              busy={busyType === feed.type}
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
