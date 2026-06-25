export function PermissionsBadge({ meeting, canEdit, canDelete }) {
  return (
    <div className="permissions-badge">
      <div className="permission-item">
        <span className="label">Visibility:</span>
        {meeting.visibility === 'published' ? (
          <span className="value public">🌍 Public</span>
        ) : (
          <span className="value private">🔒 Private</span>
        )}
      </div>

      <div className="permission-item">
        <span className="label">Edit:</span>
        {canEdit ? (
          <span className="value allowed">✓ Yes</span>
        ) : (
          <span className="value denied">✗ No</span>
        )}
      </div>

      <div className="permission-item">
        <span className="label">Delete:</span>
        {canDelete ? (
          <span className="value allowed">✓ Yes</span>
        ) : (
          <span className="value denied">✗ No</span>
        )}
      </div>
    </div>
  );
}
