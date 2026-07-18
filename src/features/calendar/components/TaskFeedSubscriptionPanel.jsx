// Task Feed Subscription Panel
// Slide-out panel that lets a user subscribe to their per-space task feeds
// (My Tasks / Created Tasks) as read-only iCal calendars.

import { X, Copy, Check, Calendar, Apple, CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { getGoogleCalendarSubscribeUrl, getTaskFeedUrl } from '../lib/calendar'
import { useTaskFeedSubscriptions } from '../../tasks/hooks/useTaskFeedSubscriptions'
import { useToast } from '../../../context/ToastContext'

const FEEDS = [
  {
    type: 'my_tasks',
    name: 'My Tasks',
    description: 'Your assigned tasks in this space as a calendar feed.',
  },
  {
    type: 'followed_tasks',
    name: 'Followed Tasks',
    description: 'Tasks you follow in this space as a calendar feed.',
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{feed.name}</h4>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {feed.description}
          </p>
        </div>
      </div>

      {/* Status indicator */}
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
          <button
            type="button"
            disabled={busy}
            onClick={onGoogle}
            style={secondaryBtn(busy)}
          >
            <Calendar size={14} />
            Google
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onApple}
            style={secondaryBtn(busy)}
          >
            <Apple size={14} />
            Apple
          </button>
        </div>
      </div>
    </div>
  )
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

export default function TaskFeedSubscriptionPanel({ spaceId, userId, onClose }) {
  const { showToast } = useToast()
  const { subscriptions, getOrCreateToken, myTasksLoading, followedTasksLoading } = useTaskFeedSubscriptions(userId, spaceId)

  const subscriptionFor = (type) => subscriptions.find((s) => s.feed_type === type)
  const isFeedBusy = (type) => (type === 'my_tasks' ? myTasksLoading : followedTasksLoading)

  // Ensure a token exists, returning the full feed URL.
  async function ensureUrl(feedType) {
    const existing = subscriptionFor(feedType)?.token
    const token = existing ?? (await getOrCreateToken(feedType))
    return getTaskFeedUrl(token)
  }

  async function handleCopy(feedType) {
    try {
      const url = await ensureUrl(feedType)
      try {
        await navigator.clipboard.writeText(url)
        showToast('Feed link copied to clipboard', { tone: 'success' })
      } catch {
        window.prompt('Copy this feed URL:', url)
      }
    } catch (e) {
      console.error('Failed to copy feed link:', e)
      showToast('Could not copy feed link', { tone: 'error' })
    }
  }

  async function handleGoogle(feedType) {
    try {
      const url = await ensureUrl(feedType)
      const googleUrl = getGoogleCalendarSubscribeUrl(url)
      if (!googleUrl) throw new Error('Feed link not ready yet')
      window.open(googleUrl, '_blank', 'noopener')
    } catch (e) {
      console.error('Failed to open Google Calendar:', e)
      showToast('Could not open Google Calendar', { tone: 'error' })
    }
  }

  async function handleApple(feedType) {
    try {
      const url = await ensureUrl(feedType)
      const webcal = `webcal://${url.replace(/^https?:\/\//, '')}`
      window.open(webcal, '_blank', 'noopener')
    } catch (e) {
      console.error('Failed to open Apple Calendar:', e)
      showToast('Could not open Apple Calendar', { tone: 'error' })
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, display: 'flex', zIndex: 60 }}
      role="dialog"
      aria-modal="true"
      aria-label="Subscribe to task feeds"
    >
      <style>{`@keyframes tfspin{to{transform:rotate(360deg)}}.spin{animation:tfspin .7s linear infinite}`}</style>
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
              Subscribe to Task Feeds
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
              Add your space tasks to your calendar app.
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
          {FEEDS.map((feed) => (
            <FeedCard
              key={feed.type}
              feed={feed}
              subscription={subscriptionFor(feed.type)}
              busy={isFeedBusy(feed.type)}
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
              These feeds are read-only. Changes made in your calendar app will not sync back to Nexus.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
