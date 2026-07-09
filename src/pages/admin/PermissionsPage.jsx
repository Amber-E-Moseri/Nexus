import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useRequirePermission } from '../../hooks/useHasPermission';
import {
  getRolePermissions,
  toggleRolePermission,
  getPermissionCategories,
} from '../../lib/permissions/api';
import { useToast } from '../../context/ToastContext';
import './PermissionsPage.css';

export default function PermissionsPage() {
  const { profile } = useAuth();
  const { hasPermission, loading: authLoading } = useRequirePermission('super_admin');
  const toast = useToast();
  
  const [selectedRole, setSelectedRole] = useState('ors');
  const [permissions, setPermissions] = useState([]);
  const [allRolePermissions, setAllRolePermissions] = useState({});
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState('role');

  const roleOptions = ['super_admin', 'dept_lead', 'pastor', 'ors', 'reg_sec', 'member'];
  const roleLabels = {
    super_admin: 'Admin',
    dept_lead: 'Lead',
    pastor: 'Pastor',
    ors: 'ORS',
    reg_sec: 'Reg Sec',
    member: 'Member',
  };

  const authorized = authLoading || hasPermission;

  // Hooks must run on every render (BLW-13: these effects used to sit below
  // the unauthorized early-return, which crashes React when permission state
  // resolves after first render).
  useEffect(() => {
    if (!authorized) return;
    loadAllPermissions();
    loadCategories();
  }, [authorized]);

  useEffect(() => {
    if (!authorized) return;
    loadRolePermissions(selectedRole);
  }, [selectedRole, authorized]);

  if (!authorized) {
    return (
      <div className="permissions-page unauthorized">
        <h1>Unauthorized</h1>
        <p>Only Super Admin can manage permissions.</p>
      </div>
    );
  }

  const loadRolePermissions = async () => {
    setLoading(true);
    try {
      const data = await getRolePermissions(selectedRole);
      setPermissions(data);
    } catch (err) {
      toast.error('Failed to load permissions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadAllPermissions = async () => {
    try {
      const allPerms = {};
      for (const role of roleOptions) {
        const data = await getRolePermissions(role);
        allPerms[role] = data;
      }
      setAllRolePermissions(allPerms);
    } catch (err) {
      console.error('Failed to load all permissions:', err);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await getPermissionCategories();
      setCategories(data);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const handleToggle = async (role, permissionKey, currentEnabled) => {
    setIsSaving(true);
    try {
      await toggleRolePermission(role, permissionKey, !currentEnabled);

      if (role === selectedRole) {
        setPermissions(prev =>
          prev.map(p =>
            p.permission_key === permissionKey
              ? { ...p, enabled: !currentEnabled }
              : p
          )
        );
      }

      setAllRolePermissions(prev => ({
        ...prev,
        [role]: prev[role].map(p =>
          p.permission_key === permissionKey
            ? { ...p, enabled: !currentEnabled }
            : p
        ),
      }));

      toast.success(
        `"${permissionKey}" ${!currentEnabled ? 'enabled' : 'disabled'} for ${roleLabels[role]}`
      );
    } catch (err) {
      toast.error(err.message || 'Failed to update permission');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const groupedPermissions = {};
  permissions.forEach(p => {
    const cat = p.category || 'other';
    if (!groupedPermissions[cat]) {
      groupedPermissions[cat] = [];
    }
    groupedPermissions[cat].push(p);
  });

  const allPermissionKeys = [];
  const seen = new Set();
  Object.values(allRolePermissions).forEach(rolePerms => {
    rolePerms.forEach(p => {
      if (!seen.has(p.permission_key)) {
        allPermissionKeys.push(p.permission_key);
        seen.add(p.permission_key);
      }
    });
  });

  const getPermissionStatus = (role, permissionKey) => {
    const rolePerms = allRolePermissions[role] || [];
    const perm = rolePerms.find(p => p.permission_key === permissionKey);
    return perm?.enabled || false;
  };

  return (
    <div className="permissions-page">
      <div className="permissions-header">
        <h1>Permission Management</h1>
        <p>Configure role-based permissions. Changes apply immediately.</p>
      </div>

      <div className="view-toggle">
        <button
          className={`toggle-btn ${viewMode === 'role' ? 'active' : ''}`}
          onClick={() => setViewMode('role')}
        >
          Role-Focused View
        </button>
        <button
          className={`toggle-btn ${viewMode === 'matrix' ? 'active' : ''}`}
          onClick={() => setViewMode('matrix')}
        >
          Matrix View
        </button>
      </div>

      {viewMode === 'role' && (
        <div className="role-view">
          <div className="role-controls">
            <label>
              <strong>Select Role:</strong>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                disabled={isSaving}
              >
                {roleOptions.map(role => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {loading ? (
            <p className="loading-message">Loading permissions...</p>
          ) : permissions.length === 0 ? (
            <p className="no-data-message">No permissions found for this role.</p>
          ) : (
            <div className="permission-categories">
              {Object.entries(groupedPermissions).map(([category, perms]) => (
                <div key={category} className="category-section">
                  <h3 className="category-title">
                    {category.replace('_', ' ').toUpperCase()}
                  </h3>
                  <div className="permission-list">
                    {perms.map(perm => (
                      <div key={perm.id} className="permission-row">
                        <div className="permission-info">
                          <div className="permission-key">{perm.permission_key}</div>
                          <div className="permission-description">{perm.description}</div>
                          {!perm.is_baseline && (
                            <div className="permission-badge special">Special</div>
                          )}
                        </div>
                        <div className="permission-toggle">
                          <label className="toggle-switch">
                            <input
                              type="checkbox"
                              checked={perm.enabled}
                              onChange={() =>
                                handleToggle(selectedRole, perm.permission_key, perm.enabled)
                              }
                              disabled={isSaving || selectedRole === 'super_admin'}
                              title={selectedRole === 'super_admin' ? 'Admin cannot be modified' : ''}
                            />
                            <span className="toggle-slider"></span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedRole === 'super_admin' && (
            <div className="info-box">
              <p>ℹ️ Admin role has all permissions by default and cannot be modified.</p>
            </div>
          )}
        </div>
      )}

      {viewMode === 'matrix' && (
        <div className="matrix-view">
          <div className="matrix-scroll-container">
            <table className="permission-matrix">
              <thead>
                <tr>
                  <th className="permission-name-header">Permission</th>
                  {roleOptions.map(role => (
                    <th key={role} className="role-header">
                      {roleLabels[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allPermissionKeys.map(permissionKey => (
                  <tr key={permissionKey} className="matrix-row">
                    <td className="permission-name-cell">
                      <code>{permissionKey}</code>
                    </td>
                    {roleOptions.map(role => {
                      const isEnabled = getPermissionStatus(role, permissionKey);
                      return (
                        <td
                          key={`${role}-${permissionKey}`}
                          className={`matrix-cell ${isEnabled ? 'enabled' : 'disabled'}`}
                        >
                          <button
                            className="matrix-toggle"
                            onClick={() =>
                              handleToggle(role, permissionKey, isEnabled)
                            }
                            disabled={isSaving || role === 'super_admin'}
                            title={role === 'super_admin' ? 'Admin cannot be modified' : ''}
                          >
                            {isEnabled ? '✓' : '✗'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="matrix-legend">
            <div className="legend-item">
              <span className="legend-check enabled">✓</span> = Permission enabled
            </div>
            <div className="legend-item">
              <span className="legend-check disabled">✗</span> = Permission disabled
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
