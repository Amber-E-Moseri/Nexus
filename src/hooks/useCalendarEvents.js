// useCalendarEvents Hook
// Manages calendar event state and operations

import { useState, useCallback, useEffect } from 'react';
import * as CalendarAPI from '../lib/calendar/api.js';

export function useCalendarEvents(filters = {}, autoFetch = true) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await CalendarAPI.fetchCalendarEvents(filters);
      setEvents(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (autoFetch) {
      fetchEvents();
    }
  }, [fetchEvents, autoFetch]);

  const createEvent = useCallback(async (event) => {
    try {
      setError(null);
      const newEvent = await CalendarAPI.createCalendarEvent(event);
      setEvents([newEvent, ...events]);
      return newEvent;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [events]);

  const updateEvent = useCallback(async (id, updates) => {
    try {
      setError(null);
      const updated = await CalendarAPI.updateCalendarEvent(id, updates);
      setEvents(events.map(e => e.id === id ? updated : e));
      return updated;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [events]);

  const deleteEvent = useCallback(async (id) => {
    try {
      setError(null);
      await CalendarAPI.deleteCalendarEvent(id);
      setEvents(events.filter(e => e.id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [events]);

  return {
    events,
    loading,
    error,
    fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}

// useCalendarEvent Hook
// Manages a single calendar event

export function useCalendarEvent(eventId) {
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchEvent = useCallback(async () => {
    if (!eventId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await CalendarAPI.fetchCalendarEvent(eventId);
      setEvent(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchEvent();
  }, [fetchEvent]);

  const updateEvent = useCallback(async (updates) => {
    try {
      setError(null);
      const updated = await CalendarAPI.updateCalendarEvent(eventId, updates);
      setEvent(updated);
      return updated;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [eventId]);

  const deleteEvent = useCallback(async () => {
    try {
      setError(null);
      await CalendarAPI.deleteCalendarEvent(eventId);
      setEvent(null);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [eventId]);

  return {
    event,
    loading,
    error,
    fetchEvent,
    updateEvent,
    deleteEvent,
  };
}

// usePendingApprovals Hook
// Manages pending event approvals

export function usePendingApprovals() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPending = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await CalendarAPI.getPendingCalendarEvents();
      setPending(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const approveEvent = useCallback(async (eventId) => {
    try {
      setError(null);
      await CalendarAPI.approveCalendarEvent(eventId);
      setPending(pending.filter(e => e.id !== eventId));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [pending]);

  const rejectEvent = useCallback(async (eventId, note) => {
    try {
      setError(null);
      await CalendarAPI.rejectCalendarEvent(eventId, note);
      setPending(pending.filter(e => e.id !== eventId));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [pending]);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  return {
    pending,
    loading,
    error,
    fetchPending,
    approveEvent,
    rejectEvent,
  };
}
