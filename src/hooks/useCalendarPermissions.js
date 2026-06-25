// useCalendarPermissions Hook
// Manages calendar access control and role assignments

import { useState, useCallback, useEffect } from 'react';
import * as CalendarAPI from '../lib/calendar/api.js';

export function useCalendarPermissions(userId) {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPermissions = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await CalendarAPI.getCalendarPermissions(userId);
      setPermissions(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const grantPermission = useCallback(async (spaceId, canManage) => {
    try {
      setError(null);
      await CalendarAPI.grantCalendarPermission(userId, spaceId, canManage);
      // Refresh permissions
      await fetchPermissions();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [userId, fetchPermissions]);

  const revokePermission = useCallback(async (spaceId) => {
    try {
      setError(null);
      await CalendarAPI.revokeCalendarPermission(userId, spaceId);
      // Refresh permissions
      await fetchPermissions();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [userId, fetchPermissions]);

  const hasPermission = useCallback((spaceId, mustBeManager = false) => {
    const perm = permissions.find(p => p.space_id === spaceId);
    if (!perm) return false;
    if (mustBeManager) return perm.can_manage;
    return true;
  }, [permissions]);

  const isManager = useCallback((spaceId) => {
    const perm = permissions.find(p => p.space_id === spaceId);
    return perm?.can_manage || false;
  }, [permissions]);

  return {
    permissions,
    loading,
    error,
    fetchPermissions,
    grantPermission,
    revokePermission,
    hasPermission,
    isManager,
  };
}

// useUserCalendarRole Hook
// Gets the current user's role for a specific space

export function useUserCalendarRole(userId, spaceId) {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRole = useCallback(async () => {
    if (!userId || !spaceId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await CalendarAPI.getUserCalendarRole(userId, spaceId);
      setRole(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId, spaceId]);

  useEffect(() => {
    fetchRole();
  }, [fetchRole]);

  const isAdmin = useCallback(() => role === 'super_admin', [role]);
  const isManager = useCallback(() => role === 'manager', [role]);
  const isViewer = useCallback(() => role === 'viewer', [role]);
  const canManage = useCallback(() => role === 'super_admin' || role === 'manager', [role]);

  return {
    role,
    loading,
    error,
    fetchRole,
    isAdmin,
    isManager,
    isViewer,
    canManage,
  };
}

// usePermissionsSummary Hook
// Fetches the complete permissions summary for admin views

export function usePermissionsSummary() {
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await CalendarAPI.getPermissionsSummary();
      setSummary(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return {
    summary,
    loading,
    error,
    fetchSummary,
  };
}
