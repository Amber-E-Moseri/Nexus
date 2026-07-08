// Calendar Subscription Manager
// Create and manage iCal feed subscriptions

import { useState, useEffect } from 'react';
import { getOrCreateSubscription, getSubscriptions, deleteSubscription } from '../lib/calendar.js';
import { formatDistanceToNow } from 'date-fns';

export function SubscriptionManager({ userId, orgId }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(null);

  useEffect(() => {
    if (!userId) return;
    loadSubscriptions();
  }, [userId]);

  const loadSubscriptions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getSubscriptions(userId);
      setSubscriptions(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAllScope = async (e) => {
    e?.preventDefault?.();
    setCreating(true);
    try {
      setError(null);
      const sub = await getOrCreateSubscription(userId, 'all');
      if (sub) {
        setSubscriptions(prev => {
          const existing = prev.find(s => s.scope === 'all' && !s.department_id);
          return existing ? prev : [...prev, sub];
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this subscription? People using the feed will lose access.')) {
      try {
        setError(null);
        await deleteSubscription(id);
        setSubscriptions(prev => prev.filter(s => s.id !== id));
      } catch (err) {
        setError(err.message);
      }
    }
  };

  const handleCopy = (token) => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-ical?token=${token}`;
    navigator.clipboard.writeText(url);
    setCopySuccess(token);
    setTimeout(() => setCopySuccess(null), 2000);
  };

  const allScopeSubscription = subscriptions.find(s => s.scope === 'all' && !s.department_id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          iCal Feed Subscriptions
        </h2>
        <p style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
          Generate tokens for external calendar applications to subscribe to approved ministry calendar events.
        </p>
      </div>

      {error && (
        <div style={{
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid var(--color-error)',
          backgroundColor: 'var(--surface-error)',
          color: 'var(--color-error)',
          fontSize: '13px',
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Loading...</div>
      ) : allScopeSubscription ? (
        <div style={{
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          backgroundColor: 'var(--surface-secondary)',
        }}>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
              All Events
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Created {formatDistanceToNow(new Date(allScopeSubscription.created_at), { addSuffix: true })}
            </div>
          </div>

          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '12px',
            padding: '8px',
            backgroundColor: 'var(--surface-primary)',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            fontFamily: 'monospace',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            wordBreak: 'break-all',
          }}>
            <span style={{ flex: 1, overflow: 'auto' }}>{allScopeSubscription.token}</span>
            <button
              onClick={() => handleCopy(allScopeSubscription.token)}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                backgroundColor: 'var(--color-primary)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {copySuccess === allScopeSubscription.token ? '✓ Copied' : 'Copy'}
            </button>
            <button
              onClick={() => handleDelete(allScopeSubscription.id)}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                backgroundColor: 'var(--color-error)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleCreateAllScope}
          disabled={creating}
          style={{
            padding: '12px',
            backgroundColor: 'var(--color-primary)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: creating ? 'not-allowed' : 'pointer',
            opacity: creating ? 0.7 : 1,
          }}
        >
          {creating ? 'Creating...' : 'Generate All Events Token'}
        </button>
      )}

      <div style={{
        padding: '12px',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--surface-tertiary)',
        fontSize: '12px',
        color: 'var(--text-secondary)',
      }}>
        <p style={{ marginTop: 0, marginBottom: '8px', fontWeight: 500, color: 'var(--text-primary)' }}>
          How to use iCal feeds:
        </p>
        <ol style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.6 }}>
          <li>Copy the token above</li>
          <li>In Google Calendar, click "+" next to "Other calendars"</li>
          <li>Select "Subscribe to calendar"</li>
          <li>Paste the URL and confirm</li>
          <li>The calendar will auto-update every 15 minutes</li>
        </ol>
      </div>
    </div>
  );
}
