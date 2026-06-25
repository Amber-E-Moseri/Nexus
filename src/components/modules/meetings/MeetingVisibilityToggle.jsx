import { useState } from 'react';
import { publishMeeting, unpublishMeeting } from '../../../lib/meetings/permissions';

export function MeetingVisibilityToggle({ meeting, onVisibilityChange }) {
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState(null);

  const isPublished = meeting.visibility === 'published';

  async function handleToggle() {
    if (publishing) return;

    // Confirm before publishing
    if (!isPublished) {
      const confirmed = window.confirm(
        'Publish this meeting? Everyone will be able to see it.\n\n' +
          'You can still edit it after publishing (only you and ORS can edit).'
      );
      if (!confirmed) return;
    }

    setPublishing(true);
    setError(null);

    try {
      if (isPublished) {
        await unpublishMeeting(meeting.id);
      } else {
        await publishMeeting(meeting.id);
      }

      if (onVisibilityChange) {
        onVisibilityChange(!isPublished);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="visibility-toggle">
      <div className="toggle-header">
        <span className="toggle-label">
          {isPublished ? '🌍 Published' : '🔒 Draft'}
        </span>
        <button
          onClick={handleToggle}
          disabled={publishing}
          className={`toggle-button ${isPublished ? 'published' : 'draft'}`}
          title={isPublished ? 'Make private' : 'Publish'}
        >
          {publishing ? '...' : isPublished ? 'Make Private' : 'Publish'}
        </button>
      </div>

      <div className="toggle-description">
        {isPublished ? (
          <p>Everyone in the organization can see this meeting</p>
        ) : (
          <p>Only you and ORS can see this meeting</p>
        )}
      </div>

      {error && <div className="error-message">⚠️ {error}</div>}
    </div>
  );
}
