// useCalendarSubscriptions Hook
// Manages calendar subscription (iCal feed) operations

import { useState, useCallback, useEffect } from 'react';
import * as CalendarAPI from '../lib/calendar/api.js';

export function useCalendarSubscriptions(autoFetch = true) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSubscriptions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await CalendarAPI.fetchCalendarSubscriptions();
      setSubscriptions(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) {
      fetchSubscriptions();
    }
  }, [fetchSubscriptions, autoFetch]);

  const createSubscription = useCallback(async (subscription) => {
    try {
      setError(null);
      const newSub = await CalendarAPI.createCalendarSubscription(subscription);
      setSubscriptions([newSub, ...subscriptions]);
      return newSub;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [subscriptions]);

  const updateSubscription = useCallback(async (id, updates) => {
    try {
      setError(null);
      const updated = await CalendarAPI.updateCalendarSubscription(id, updates);
      setSubscriptions(subscriptions.map(s => s.id === id ? updated : s));
      return updated;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [subscriptions]);

  const deleteSubscription = useCallback(async (id) => {
    try {
      setError(null);
      await CalendarAPI.deleteCalendarSubscription(id);
      setSubscriptions(subscriptions.filter(s => s.id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [subscriptions]);

  const copyFeedUrl = useCallback((token) => {
    const url = CalendarAPI.getICalFeedUrl(token);
    navigator.clipboard.writeText(url);
  }, []);

  return {
    subscriptions,
    loading,
    error,
    fetchSubscriptions,
    createSubscription,
    updateSubscription,
    deleteSubscription,
    copyFeedUrl,
    getICalFeedUrl: CalendarAPI.getICalFeedUrl,
  };
}

// useCalendarSubscription Hook
// Manages a single subscription

export function useCalendarSubscription(subscriptionId) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSubscription = useCallback(async () => {
    if (!subscriptionId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await CalendarAPI.fetchCalendarSubscription(subscriptionId);
      setSubscription(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const updateSubscription = useCallback(async (updates) => {
    try {
      setError(null);
      const updated = await CalendarAPI.updateCalendarSubscription(subscriptionId, updates);
      setSubscription(updated);
      return updated;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [subscriptionId]);

  const deleteSubscription = useCallback(async () => {
    try {
      setError(null);
      await CalendarAPI.deleteCalendarSubscription(subscriptionId);
      setSubscription(null);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [subscriptionId]);

  return {
    subscription,
    loading,
    error,
    fetchSubscription,
    updateSubscription,
    deleteSubscription,
  };
}
