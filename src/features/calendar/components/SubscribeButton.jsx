import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, Check, ExternalLink } from 'lucide-react'
import { getOrCreateSubscription } from '../index'
import { FONT_BODY, FONT_HEADING } from '../lib/fonts'

function buildFeedUrl(token) {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-ical?token=${token}`
}

export default function SubscribeButton({ userId, deptOnly = false, departmentId = null, onCopied, onOpenTaskFeeds }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [feedUrl, setFeedUrl] = useState(null)
  const [copied, setCopied] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    // Scope changed (e.g. "My department only" toggled) — refetch on next open.
    setFeedUrl(null)
  }, [deptOnly, departmentId])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function ensureFeedUrl() {
    if (feedUrl) return feedUrl
    if (!userId) {
      setError('You must be signed in to subscribe.')
      return null
    }
    setLoading(true)
    setError(null)
    try {
      const subscription = await getOrCreateSubscription(
        userId,
        deptOnly ? 'department' : 'all',
        deptOnly ? departmentId : null,
      )
      const url = buildFeedUrl(subscription.token)
      setFeedUrl(url)
      return url
    } catch (err) {
      console.error('Failed to create calendar subscription:', err)
      setError('Could not generate a subscribe link. Please try again.')
      return null
    } finally {
      setLoading(false)
    }
  }

  async function handleToggle() {
    const next = !open
    setOpen(next)
    if (next) await ensureFeedUrl()
  }

  async function handleCopy() {
    const url = await ensureFeedUrl()
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      onCopied?.()
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy subscribe link:', err)
      setError('Could not copy the link — select and copy it manually.')
    }
  }

  const googleUrl = feedUrl
    ? `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(feedUrl.replace(/^https?:\/\//, 'webcal://'))}`
    : null
  const webcalUrl = feedUrl ? feedUrl.replace(/^https?:\/\//, 'webcal://') : null

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <motion.button
        type="button"
        onClick={handleToggle}
        whileHover={{ backgroundColor: '#F2EEE6' }}
        whileTap={{ scale: 0.97 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          padding: '9px 14px',
          backgroundColor: open ? '#F2EEE6' : 'var(--surface-secondary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '13.5px',
          fontFamily: FONT_BODY,
        }}
      >
        <Link2 size={14} style={{ color: 'var(--text-secondary)' }} />
        Subscribe
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '6px',
              backgroundColor: 'white',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 100,
              width: 320,
              padding: '16px',
              transformOrigin: 'top right',
            }}
          >
            <div style={{ fontFamily: FONT_HEADING, fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Subscribe to this calendar
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '12px', lineHeight: 1.5, color: 'var(--text-secondary)', fontFamily: FONT_BODY }}>
              Get live updates in Google Calendar, Apple Calendar, or Outlook. New and changed events sync automatically.
            </p>

            {error ? (
              <div style={{ fontSize: '12px', color: 'var(--coral-dark)', marginBottom: '10px' }}>{error}</div>
            ) : null}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                background: 'var(--surface-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                marginBottom: '12px',
              }}
            >
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                }}
              >
                {loading ? 'Generating link…' : feedUrl ?? '—'}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                disabled={loading}
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 10px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  background: copied ? 'var(--sage)' : 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'default' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {copied ? <Check size={12} /> : null}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <a
                href={googleUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { if (!googleUrl) e.preventDefault() }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: googleUrl ? 'var(--accent)' : 'var(--text-tertiary)',
                  textDecoration: 'none',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  cursor: googleUrl ? 'pointer' : 'default',
                }}
              >
                <ExternalLink size={13} />
                Add to Google Calendar
              </a>
              <a
                href={webcalUrl ?? undefined}
                onClick={(e) => { if (!webcalUrl) e.preventDefault() }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: webcalUrl ? 'var(--accent)' : 'var(--text-tertiary)',
                  textDecoration: 'none',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  cursor: webcalUrl ? 'pointer' : 'default',
                }}
              >
                <ExternalLink size={13} />
                Open in Apple / Outlook Calendar
              </a>
            </div>

            {onOpenTaskFeeds ? (
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)', fontFamily: FONT_BODY }}>
                  Need task deadlines too? Tasks use a separate live calendar feed.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onOpenTaskFeeds()
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'white',
                    color: 'var(--accent)',
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <ExternalLink size={13} />
                  Open Task Feed Options
                </button>
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
