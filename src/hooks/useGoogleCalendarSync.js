// useGoogleCalendarSync Hook
// Manages Google Calendar OAuth and sync operations

import { useState, useCallback, useEffect } from 'react';
import * as CalendarAPI from '../lib/calendar/api.js';

export function useGoogleCalendarSync(spaceId) {
  const [syncStatus, setSyncStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  const fetchSyncStatus = useCallback(async (orgId) => {
    if (!spaceId || !orgId) return;
    try {
      setLoading(true);
      setError(null);
      const status = await CalendarAPI.getGoogleSyncStatus(orgId, spaceId);
      setSyncStatus(status);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  const initiateOAuth = useCallback(async (orgId) => {
    try {
      setError(null);
      const oauthUrl = await CalendarAPI.getGoogleOAuthUrl(spaceId, orgId);
      window.location.href = oauthUrl;
    } catch (err) {
      setError(err.message);
    }
  }, [spaceId]);

  const triggerSync = useCallback(async (orgId) => {
    if (!spaceId || !orgId) return;
    try {
      setSyncing(true);
      setError(null);
      const result = await CalendarAPI.triggerGoogleSync(orgId, spaceId);
      // Refresh sync status after sync completes
      await fetchSyncStatus(orgId);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSyncing(false);
    }
  }, [spaceId, fetchSyncStatus]);

  const disconnect = useCallback(async (orgId) => {
    if (!spaceId || !orgId) return;
    try {
      setError(null);
      await CalendarAPI.disconnectGoogleCalendar(orgId, spaceId);
      setSyncStatus(null);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [spaceId]);

  return {
    syncStatus,
    loading,
    syncing,
    error,
    isConnected: syncStatus?.sync_enabled || false,
    fetchSyncStatus,
    initiateOAuth,
    triggerSync,
    disconnect,
  };
}
