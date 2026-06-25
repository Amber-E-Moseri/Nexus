// Calendar Approval Queue
// Manage pending event approvals for calendar managers

import { useState } from 'react';
import { usePendingApprovals } from '../../../hooks/useCalendarEvents.js';
import { formatEventDateRange } from '../../../lib/calendar/api.js';
import { formatDistanceToNow } from 'date-fns';

export function ApprovalQueue() {
  const { pending, loading, error, approveEvent, rejectEvent } = usePendingApprovals();
  const [rejectionNotes, setRejectionNotes] = useState({});
  const [processingId, setProcessingId] = useState(null);

  const handleApprove = async (eventId) => {
    setProcessingId(eventId);
    try {
      await approveEvent(eventId);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (eventId) => {
    setProcessingId(eventId);
    try {
      const note = rejectionNotes[eventId] || 'No reason provided';
      await rejectEvent(eventId, note);
      setRejectionNotes(prev => {
        const newNotes = { ...prev };
        delete newNotes[eventId];
        return newNotes;
      });
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading pending events...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Event Approvals</h2>
        {pending.length > 0 && (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
            {pending.length} pending
          </span>
        )}
      </div>

      {pending.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 text-lg">No pending approvals</p>
          <p className="text-gray-400 text-sm mt-2">All submitted events have been reviewed.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map(event => (
            <ApprovalCard
              key={event.id}
              event={event}
              onApprove={() => handleApprove(event.id)}
              onReject={() => handleReject(event.id)}
              rejectionNote={rejectionNotes[event.id]}
              onNoteChange={(note) => setRejectionNotes(prev => ({ ...prev, [event.id]: note }))}
              processing={processingId === event.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ event, onApprove, onReject, rejectionNote, onNoteChange, processing }) {
  const [showRejectForm, setShowRejectForm] = useState(false);

  return (
    <div className="border-2 border-yellow-200 bg-yellow-50 rounded-lg p-6">
      <div className="grid grid-cols-2 gap-6 mb-4">
        <div>
          <h4 className="text-lg font-semibold text-gray-900">{event.title}</h4>
          {event.description && (
            <p className="text-gray-600 mt-2">{event.description}</p>
          )}
        </div>
        <div className="text-sm text-gray-600 space-y-1">
          <p><span className="font-medium">Submitted by:</span> {event.created_by}</p>
          <p><span className="font-medium">Submitted:</span> {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}</p>
          <p><span className="font-medium">Type:</span> {event.event_type}</p>
        </div>
      </div>

      <div className="bg-white rounded p-4 mb-4 text-sm space-y-2">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <span className="text-gray-500">Dates</span>
            <p className="font-medium">{formatEventDateRange(event)}</p>
          </div>
          <div>
            <span className="text-gray-500">Priority</span>
            <p className="font-medium capitalize">{event.priority}</p>
          </div>
          <div>
            <span className="text-gray-500">Location</span>
            <p className="font-medium">{event.location || '—'}</p>
          </div>
        </div>

        {event.is_org_wide && (
          <div className="flex items-center gap-2 text-purple-600">
            <span className="font-medium">🌍 Organization-wide visibility</span>
          </div>
        )}

        {event.sprint_id && (
          <div className="flex items-center gap-2 text-green-600">
            <span className="font-medium">📋 Linked to sprint</span>
          </div>
        )}
      </div>

      {!showRejectForm ? (
        <div className="flex gap-3">
          <button
            onClick={onApprove}
            disabled={processing}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md disabled:opacity-50"
          >
            {processing ? 'Processing...' : '✓ Approve'}
          </button>
          <button
            onClick={() => setShowRejectForm(true)}
            disabled={processing}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md disabled:opacity-50"
          >
            ✕ Reject
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            value={rejectionNote || ''}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Reason for rejection..."
            className="w-full border rounded-md p-2 text-sm"
            rows="3"
          />
          <div className="flex gap-2">
            <button
              onClick={onReject}
              disabled={processing}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md disabled:opacity-50"
            >
              {processing ? 'Processing...' : 'Confirm Rejection'}
            </button>
            <button
              onClick={() => {
                setShowRejectForm(false);
                onNoteChange('');
              }}
              disabled={processing}
              className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium py-2 px-4 rounded-md disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
