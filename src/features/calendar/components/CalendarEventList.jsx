// Calendar Event List
// Display calendar events with filtering, sorting, and actions

import { useState } from 'react';
import { useCalendarEvents } from '../../../hooks/useCalendarEvents.js';
import { formatEventDateRange, getStatusColor, getPriorityColor } from '../../../lib/calendar/api.js';
import { formatDistanceToNow } from 'date-fns';

export function CalendarEventList({ spaceId, onEditEvent, canManage = false }) {
  const [filters, setFilters] = useState({
    space_id: spaceId,
    status: 'approved',
  });
  const [sortBy, setSortBy] = useState('start_date');
  const { events, loading, error } = useCalendarEvents(filters);

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value || undefined,
    }));
  };

  const sortedEvents = [...events].sort((a, b) => {
    if (sortBy === 'start_date') {
      return new Date(a.start_date) - new Date(b.start_date);
    }
    if (sortBy === 'priority') {
      const priorityOrder = { high: 1, medium: 2, low: 3 };
      return (priorityOrder[a.priority] || 0) - (priorityOrder[b.priority] || 0);
    }
    if (sortBy === 'created') {
      return new Date(b.created_at) - new Date(a.created_at);
    }
    return 0;
  });

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <h3 className="font-semibold text-gray-900">Filters & Sorting</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <select
              value={filters.status || ''}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">All statuses</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Priority</label>
            <select
              value={filters.priority || ''}
              onChange={(e) => handleFilterChange('priority', e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">All priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="start_date">Start Date</option>
              <option value="priority">Priority</option>
              <option value="created">Recently Created</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Events */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading events...</div>
        ) : sortedEvents.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No events found. Create one to get started!
          </div>
        ) : (
          sortedEvents.map(event => (
            <CalendarEventCard
              key={event.id}
              event={event}
              onEdit={() => onEditEvent?.(event.id)}
              canManage={canManage}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CalendarEventCard({ event, onEdit, canManage }) {
  const statusColor = getStatusColor(event.status);
  const priorityColor = getPriorityColor(event.priority);

  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h4 className="text-lg font-semibold text-gray-900">{event.title}</h4>
          {event.description && (
            <p className="text-sm text-gray-600 mt-1">{event.description}</p>
          )}
        </div>
        {canManage && (
          <button
            onClick={onEdit}
            className="ml-4 text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            Edit
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4 mb-3 text-sm">
        <div>
          <span className="text-gray-500">Dates</span>
          <p className="font-medium text-gray-900">{formatEventDateRange(event)}</p>
        </div>
        <div>
          <span className="text-gray-500">Type</span>
          <p className="font-medium text-gray-900 capitalize">{event.event_type}</p>
        </div>
        <div>
          <span className="text-gray-500">Location</span>
          <p className="font-medium text-gray-900">{event.location || '—'}</p>
        </div>
        <div>
          <span className="text-gray-500">Created</span>
          <p className="font-medium text-gray-900">
            {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${statusColor}-100 text-${statusColor}-800`}>
          {event.status}
        </span>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${priorityColor}-100 text-${priorityColor}-800`}>
          {event.priority} priority
        </span>
        {event.is_org_wide && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
            🌍 Organization-wide
          </span>
        )}
        {event.synced_to_google && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            ✓ Google Calendar
          </span>
        )}
        {event.sprint_id && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            📋 Linked to Sprint
          </span>
        )}
      </div>
    </div>
  );
}
