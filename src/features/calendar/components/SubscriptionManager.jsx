// Calendar Subscription Manager
// Create and manage iCal feed subscriptions

import { useState } from 'react';
import { useCalendarSubscriptions } from '../../../hooks/useCalendarSubscriptions.js';
import { formatDistanceToNow } from 'date-fns';

export function SubscriptionManager({ spaceId }) {
  const { subscriptions, loading, error, createSubscription, deleteSubscription, copyFeedUrl } = useCalendarSubscriptions();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    filter_priority: null,
    filter_status: 'confirmed',
    is_public: true,
  });
  const [creating, setCreating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(null);

  const spaceSubscriptions = subscriptions.filter(s => s.space_id === spaceId);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createSubscription({
        ...formData,
        space_id: spaceId,
      });
      setFormData({
        name: '',
        description: '',
        filter_priority: null,
        filter_status: 'confirmed',
        is_public: true,
      });
      setShowForm(false);
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = (token) => {
    copyFeedUrl(token);
    setCopySuccess(token);
    setTimeout(() => setCopySuccess(null), 2000);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this subscription? People using the feed will lose access.')) {
      await deleteSubscription(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Calendar Subscriptions</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : 'Create Subscription'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="border rounded-lg p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Subscription Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="e.g., Ministry Calendar 2026"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              rows="2"
              placeholder="Optional description..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Filter by Priority</label>
              <select
                value={formData.filter_priority || ''}
                onChange={(e) => handleChange('filter_priority', e.target.value || null)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="">All priorities</option>
                <option value="high">High only</option>
                <option value="medium">Medium only</option>
                <option value="low">Low only</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Filter by Status</label>
              <select
                value={formData.filter_status}
                onChange={(e) => handleChange('filter_status', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="confirmed">Confirmed events only</option>
                <option value="">All statuses</option>
              </select>
            </div>
          </div>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.is_public}
              onChange={(e) => handleChange('is_public', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="ml-2 text-sm text-gray-700">Public (shareable via link)</span>
          </label>

          <button
            type="submit"
            disabled={creating}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Subscription'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-center py-4">Loading subscriptions...</div>
      ) : spaceSubscriptions.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No subscriptions yet. Create one to generate an iCal feed.
        </div>
      ) : (
        <div className="space-y-4">
          {spaceSubscriptions.map(sub => (
            <div key={sub.id} className="border rounded-lg p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-medium text-gray-900">{sub.name}</h4>
                  {sub.description && <p className="text-sm text-gray-600">{sub.description}</p>}
                </div>
                <button
                  onClick={() => handleDelete(sub.id)}
                  className="text-red-600 hover:text-red-700 text-sm font-medium"
                >
                  Delete
                </button>
              </div>

              <div className="bg-gray-50 rounded p-3 mb-3">
                <p className="text-xs text-gray-600 mb-2">iCal Feed URL:</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/api/calendar/subscribe/${sub.token}`}
                    className="flex-1 text-xs bg-white border border-gray-300 rounded px-2 py-1"
                  />
                  <button
                    onClick={() => handleCopy(sub.token)}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded text-sm"
                  >
                    {copySuccess === sub.token ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                <div>
                  {sub.filter_priority && <span>Priority: {sub.filter_priority}</span>}
                </div>
                <div>
                  {sub.is_public && <span className="text-blue-600">🌍 Public</span>}
                </div>
                <div className="text-right">
                  {sub.last_accessed_at
                    ? `Last used ${formatDistanceToNow(new Date(sub.last_accessed_at), { addSuffix: true })}`
                    : 'Never accessed'}
                </div>
              </div>

              {sub.access_count > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  Accessed {sub.access_count} times
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-800">
        <p className="font-medium mb-2">How to use iCal feeds:</p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>Copy the iCal Feed URL above</li>
          <li>In Google Calendar, click "+" next to "Other calendars"</li>
          <li>Select "Subscribe to calendar"</li>
          <li>Paste the URL and confirm</li>
          <li>The calendar will auto-update every 15 minutes</li>
        </ol>
      </div>
    </div>
  );
}
