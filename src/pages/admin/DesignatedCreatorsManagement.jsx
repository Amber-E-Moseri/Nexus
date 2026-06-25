import { useState, useEffect } from 'react';
import {
  getDesignatedCreators,
  grantCreatePermission,
  revokeCreatePermission,
  getUserByEmail,
} from '../../lib/meetings/permissions';
import '../../styles/designated-creators.css';

export function DesignatedCreatorsManagement() {
  const [creators, setCreators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    loadCreators();
  }, []);

  async function loadCreators() {
    setLoading(true);
    try {
      const data = await getDesignatedCreators();
      setCreators(data);
    } catch (err) {
      console.error('Failed to load creators:', err);
      setError('Failed to load designated creators');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!newUserEmail.trim()) {
      setError('Please enter an email address');
      return;
    }

    setAdding(true);
    setError(null);
    setSuccess(null);

    try {
      // Resolve email to user ID
      const user = await getUserByEmail(newUserEmail.trim());

      if (!user) {
        setError(`User not found: ${newUserEmail}`);
        setAdding(false);
        return;
      }

      // Grant permission
      await grantCreatePermission(user.id);
      setNewUserEmail('');
      setSuccess(`✓ ${user.name} can now create meetings`);
      await loadCreators();
    } catch (err) {
      setError(`Failed to add creator: ${err.message}`);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(userId, userName) {
    if (!confirm(`Remove ${userName}'s ability to create meetings?`)) {
      return;
    }

    try {
      await revokeCreatePermission(userId);
      setSuccess(`✓ ${userName} can no longer create meetings`);
      await loadCreators();
    } catch (err) {
      setError(`Failed to remove creator: ${err.message}`);
    }
  }

  if (loading) {
    return (
      <div className="designated-creators card">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="designated-creators card">
      <h3>🔑 Who Can Create Meetings?</h3>

      {/* Current Creators */}
      <div className="creators-list">
        <h4>Designated Creators</h4>
        {creators.length === 0 ? (
          <p className="empty">No designated creators (only ORS can create)</p>
        ) : (
          <ul>
            {creators.map((creator) => (
              <li key={creator.id} className="creator-item">
                <div className="creator-info">
                  <span className="user-email">{creator.user_id}</span>
                  <span className="granted-date">
                    Granted {new Date(creator.granted_at).toLocaleDateString()}
                  </span>
                </div>
                <button
                  onClick={() => handleRemove(creator.user_id, creator.user_id)}
                  className="btn-remove"
                  title="Remove permission"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <hr />

      {/* Add New Creator */}
      <div className="add-creator-form">
        <h4>Add Designated Creator</h4>
        <div className="input-group">
          <input
            type="email"
            value={newUserEmail}
            onChange={(e) => setNewUserEmail(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Enter email address"
            disabled={adding}
            className="creator-input"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newUserEmail.trim()}
            className="btn-primary"
          >
            {adding ? 'Adding...' : 'Add'}
          </button>
        </div>
        <p className="help-text">
          Designated creators can create meetings (in addition to ORS users)
        </p>
      </div>

      {/* Messages */}
      {error && <div className="error-message">⚠️ {error}</div>}
      {success && <div className="success-message">✓ {success}</div>}
    </div>
  );
}
