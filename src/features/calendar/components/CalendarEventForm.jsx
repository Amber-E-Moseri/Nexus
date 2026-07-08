// Calendar Event Form
// Create/edit calendar events with validation and approval workflow

import { useState, useEffect } from 'react';
import { useCalendarEvent } from '../../../hooks/useCalendarEvents.js';
import { supabase } from '../../../lib/supabase.js';

export function CalendarEventForm({ eventId, spaceId, onSave, onCancel }) {
  const { event: existingEvent } = useCalendarEvent(eventId);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    event_type: 'event',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    all_day: true,
    location: '',
    priority: 'medium',
    duration_days: 1,
    sprint_id: null,
    is_org_wide: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sprints, setSprints] = useState([]);

  // Populate form with existing event data
  useEffect(() => {
    if (existingEvent) {
      setFormData({
        title: existingEvent.title,
        description: existingEvent.description,
        event_type: existingEvent.event_type,
        start_date: new Date(existingEvent.start_date).toISOString().split('T')[0],
        end_date: existingEvent.end_date ? new Date(existingEvent.end_date).toISOString().split('T')[0] : '',
        all_day: existingEvent.all_day,
        location: existingEvent.location || '',
        priority: existingEvent.priority || 'medium',
        duration_days: existingEvent.duration_days || 1,
        sprint_id: existingEvent.sprint_id,
        is_org_wide: existingEvent.is_org_wide,
      });
    }
  }, [existingEvent]);

  // Fetch sprints for the space
  useEffect(() => {
    async function fetchSprints() {
      const { data } = await supabase
        .from('sprints')
        .select('id, name, start_date, end_date')
        .eq('department_id', spaceId)
        .order('start_date', { ascending: false });
      setSprints(data || []);
    }
    if (spaceId) fetchSprints();
  }, [spaceId]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const user = (await supabase.auth.getUser()).data.user;

      const eventData = {
        ...formData,
        space_id: spaceId,
        created_by: user.id,
        status: 'pending', // Requires approval
      };

      if (existingEvent) {
        // Update existing
        const { error: updateError } = await supabase
          .from('calendar_events')
          .update(eventData)
          .eq('id', eventId);
        if (updateError) throw updateError;
      } else {
        // Create new
        const { error: insertError } = await supabase
          .from('calendar_events')
          .insert([eventData]);
        if (insertError) throw insertError;
      }

      onSave?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">Event Title</label>
        <input
          type="text"
          required
          value={formData.title}
          onChange={(e) => handleChange('title', e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          placeholder="e.g., Easter Celebration"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => handleChange('description', e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          rows="4"
          placeholder="Event details and notes..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Event Type</label>
          <select
            value={formData.event_type}
            onChange={(e) => handleChange('event_type', e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="conference">Conference</option>
            <option value="program">Program</option>
            <option value="training">Training</option>
            <option value="prayer">Prayer</option>
            <option value="graduation">Graduation</option>
            <option value="event">Event</option>
            <option value="deadline">Deadline</option>
            <option value="leave">Leave / Out of Office</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Priority</label>
          <select
            value={formData.priority}
            onChange={(e) => handleChange('priority', e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Start Date</label>
          <input
            type="date"
            required
            value={formData.start_date}
            onChange={(e) => handleChange('start_date', e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">End Date</label>
          <input
            type="date"
            value={formData.end_date}
            onChange={(e) => handleChange('end_date', e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
        </div>
      </div>

      <div>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={formData.all_day}
            onChange={(e) => handleChange('all_day', e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="ml-2 text-sm text-gray-700">All-day event</span>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Location</label>
        <input
          type="text"
          value={formData.location}
          onChange={(e) => handleChange('location', e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          placeholder="e.g., Student Centre"
        />
      </div>

      {sprints.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700">Linked Sprint</label>
          <select
            value={formData.sprint_id || ''}
            onChange={(e) => handleChange('sprint_id', e.target.value || null)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="">No sprint</option>
            {sprints.map(sprint => (
              <option key={sprint.id} value={sprint.id}>{sprint.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={formData.is_org_wide}
            onChange={(e) => handleChange('is_org_wide', e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="ml-2 text-sm text-gray-700">Organization-wide event (visible to all)</span>
        </label>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Saving...' : existingEvent ? 'Update Event' : 'Create Event'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-gray-500">
        New events require approval from a calendar manager before they appear to others.
      </p>
    </form>
  );
}
