// Google Calendar Connection Component
// Manage Google Calendar OAuth and sync configuration

import { useEffect } from 'react';
import { useGoogleCalendarSync } from '../../../hooks/useGoogleCalendarSync.js';
import { formatDistanceToNow } from 'date-fns';

export function GoogleCalendarConnect({ spaceId, orgId }) {
  const { syncStatus, loading, syncing, error, isConnected, fetchSyncStatus, initiateOAuth, triggerSync, disconnect } = useGoogleCalendarSync(spaceId);

  useEffect(() => {
    if (orgId && spaceId) {
      fetchSyncStatus(orgId);
    }
  }, [orgId, spaceId, fetchSyncStatus]);

  const handleConnect = async () => {
    await initiateOAuth(orgId);
  };

  const handleSync = async () => {
    if (orgId) {
      await triggerSync(orgId);
    }
  };

  const handleDisconnect = async () => {
    if (window.confirm('Disconnect Google Calendar? Synced events will remain in both calendars.')) {
      if (orgId) {
        await disconnect(orgId);
      }
    }
  };

  if (loading) {
    return <div className="text-center py-4">Loading sync status...</div>;
  }

  return (
    <div className="border rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4">Google Calendar Integration</h3>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {isConnected ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-600 font-medium">✓ Connected</p>
              <p className="text-sm text-gray-600">
                {syncStatus?.last_sync_at
                  ? `Last synced ${formatDistanceToNow(new Date(syncStatus.last_sync_at), { addSuffix: true })}`
                  : 'Never synced'}
              </p>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={syncing}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm text-gray-600 mb-3">
              Sync direction: <span className="font-medium">{syncStatus?.sync_direction || 'both'}</span>
            </p>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>

          {syncStatus?.event_count && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
              <p className="text-blue-800">
                {syncStatus.event_count} events in this space
                ({syncStatus.synced_count} synced to Google)
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-gray-600">
            Connect your Google Calendar to enable automatic two-way sync of events.
          </p>
          <button
            onClick={handleConnect}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Connect Google Calendar
          </button>
        </div>
      )}
    </div>
  );
}
