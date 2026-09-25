import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'
import { Plus, Trash2, Save, Edit2, X, Copy } from 'lucide-react'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#FAFAF8'
const GREEN = '#2e7d32'
const RED = '#c62828'
const YELLOW = '#f57c00'

const ALL_PERMISSION_TIERS = [
  'unscoped_edit',
  'finance_only',
  'scoped_edit_all',
  'scoped_edit_reg',
  'scoped_view_reg',
]

const TIER_DESCRIPTIONS = {
  unscoped_edit: 'Full edit access, all tabs',
  finance_only: 'Finance tab only, no edit',
  scoped_edit_all: 'All tabs, scoped by subgroup',
  scoped_edit_reg: 'Registration data tab only, edit within scope',
  scoped_view_reg: 'Registration data tab only, view only',
}

const AVAILABLE_TABS = [
  'overview',
  'summary',
  'tii-report',
  'checkin',
  'confirm',
  'discipleship',
  'compliance',
  'import',
  'central',
  'rooms',
  'transport',
  'finance',
]

export default function EventConfigsPage() {
  const { showToast } = useToast()
  const [configs, setConfigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState(null)

  useEffect(() => {
    loadConfigs()
  }, [])

  async function loadConfigs() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('event_configs')
        .select('*')
        .order('event_name')

      if (error) throw error
      setConfigs(data || [])
    } catch (err) {
      console.error('Failed to load event configs:', err)
      showToast('Failed to load event configs', 'error')
    } finally {
      setLoading(false)
    }
  }

  function startEdit(config) {
    setEditingId(config.id)
    setFormData({
      ...config,
      team_permissions: config.team_permissions || {},
      tab_config: config.tab_config || [],
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setFormData(null)
  }

  async function saveConfig() {
    if (!formData) return

    try {
      const { error } = await supabase
        .from('event_configs')
        .update({
          event_name: formData.event_name,
          sprint_pattern: formData.sprint_pattern,
          is_active: formData.is_active,
          team_permissions: formData.team_permissions,
          tab_config: formData.tab_config,
          public_token_key: formData.public_token_key,
          early_cutoff_at: formData.early_cutoff_at,
          early_fee: formData.early_fee,
          standard_fee: formData.standard_fee,
          local_detection_regex: formData.local_detection_regex,
          exempt_fellowships: formData.exempt_fellowships,
        })
        .eq('id', formData.id)

      if (error) throw error

      showToast('Event config saved', 'success')
      setEditingId(null)
      setFormData(null)
      await loadConfigs()
    } catch (err) {
      console.error('Failed to save config:', err)
      showToast('Failed to save config', 'error')
    }
  }

  async function deleteConfig(id) {
    if (!confirm('Delete this event config? This cannot be undone.')) return

    try {
      const { error } = await supabase
        .from('event_configs')
        .delete()
        .eq('id', id)

      if (error) throw error

      showToast('Event config deleted', 'success')
      await loadConfigs()
    } catch (err) {
      console.error('Failed to delete config:', err)
      showToast('Failed to delete config', 'error')
    }
  }

  function updateTeamPermission(tier, teamName, isAdd) {
    if (!formData) return

    const newPerms = { ...formData.team_permissions }
    const teamList = newPerms[tier] || []

    if (isAdd) {
      if (!teamList.includes(teamName)) {
        newPerms[tier] = [...teamList, teamName]
      }
    } else {
      newPerms[tier] = teamList.filter(t => t !== teamName)
    }

    setFormData({ ...formData, team_permissions: newPerms })
  }

  function addTeamInputRow(tier) {
    if (!formData) return
    const newTeam = prompt('Enter team name:')
    if (newTeam?.trim()) {
      updateTeamPermission(tier, newTeam.trim(), true)
    }
  }

  function toggleTab(tabKey) {
    if (!formData) return

    const newTabConfig = formData.tab_config || []
    const existing = newTabConfig.find(t => t.key === tabKey)

    if (existing) {
      setFormData({
        ...formData,
        tab_config: newTabConfig.filter(t => t.key !== tabKey),
      })
    } else {
      setFormData({
        ...formData,
        tab_config: [...newTabConfig, { key: tabKey, hidden: true }],
      })
    }
  }

  function isTabHidden(tabKey) {
    return (formData?.tab_config || []).some(t => t.key === tabKey)
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: MUTED }}>Loading...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '40px 20px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: TEXT, margin: '0 0 8px' }}>
          Event Configurations
        </h1>
        <p style={{ fontSize: 14, color: MUTED, margin: 0 }}>
          Customize team permissions and visibility for registration events
        </p>
      </div>

      {editingId && formData ? (
        <EditForm
          config={formData}
          onSave={saveConfig}
          onCancel={cancelEdit}
          onChange={setFormData}
          updateTeamPermission={updateTeamPermission}
          addTeamInputRow={addTeamInputRow}
          toggleTab={toggleTab}
          isTabHidden={isTabHidden}
        />
      ) : (
        <ConfigsList configs={configs} onEdit={startEdit} onDelete={deleteConfig} />
      )}
    </div>
  )
}

function ConfigsList({ configs, onEdit, onDelete }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {configs.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>
          <p>No event configurations found</p>
        </div>
      ) : (
        configs.map(config => (
          <div
            key={config.id}
            style={{
              background: '#fff',
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: TEXT, margin: '0 0 8px' }}>
                  {config.event_name}
                </h3>
                <p style={{ fontSize: 13, color: MUTED, margin: '4px 0' }}>
                  Sprint Pattern: <code style={{ background: BG, padding: '2px 6px', borderRadius: 3 }}>{config.sprint_pattern}</code>
                </p>
                <p style={{ fontSize: 13, color: MUTED, margin: '4px 0' }}>
                  Status:{' '}
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: config.is_active ? '#E8F5E9' : '#FCE4EC',
                      color: config.is_active ? GREEN : RED,
                    }}
                  >
                    {config.is_active ? 'Active' : 'Inactive'}
                  </span>
                </p>
                <div style={{ marginTop: 12, fontSize: 13 }}>
                  <p style={{ margin: '0 0 8px', fontWeight: 600, color: TEXT }}>Team Permissions:</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    {ALL_PERMISSION_TIERS.map(tier => {
                      const teams = config.team_permissions?.[tier] || []
                      return (
                        <div key={tier} style={{ fontSize: 12, color: MUTED }}>
                          <span style={{ fontWeight: 600, color: TEXT }}>{tier}:</span>{' '}
                          {teams.length > 0 ? teams.join(', ') : '—'}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginLeft: 16 }}>
                <button
                  onClick={() => onEdit(config)}
                  style={{
                    padding: '8px 12px',
                    background: PRIMARY,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Edit2 size={14} />
                  Edit
                </button>
                <button
                  onClick={() => onDelete(config.id)}
                  style={{
                    padding: '8px 12px',
                    background: RED + '18',
                    color: RED,
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function EditForm({
  config,
  onSave,
  onCancel,
  onChange,
  updateTeamPermission,
  addTeamInputRow,
  toggleTab,
  isTabHidden,
}) {
  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        padding: 32,
        maxWidth: 800,
      }}
    >
      <h2 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: '0 0 24px' }}>
        Edit: {config.event_name}
      </h2>

      {/* Basic Info */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: TEXT, margin: '0 0 12px' }}>
          Basic Information
        </h3>
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 6 }}>
              Event Name
            </label>
            <input
              type="text"
              value={config.event_name}
              onChange={e => onChange({ ...config, event_name: e.target.value })}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                fontSize: 14,
                color: TEXT,
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 6 }}>
              Sprint Pattern (SQL ILIKE)
            </label>
            <input
              type="text"
              value={config.sprint_pattern}
              onChange={e => onChange({ ...config, sprint_pattern: e.target.value })}
              placeholder="%Event Name%"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                fontSize: 14,
                color: TEXT,
              }}
            />
            <p style={{ fontSize: 11, color: MUTED, margin: '6px 0 0' }}>
              Use % as wildcard. Matches sprint names that contain this pattern.
            </p>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.is_active}
                onChange={e => onChange({ ...config, is_active: e.target.checked })}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Active</span>
            </label>
            <p style={{ fontSize: 11, color: MUTED, margin: '6px 0 0' }}>
              The active config is loaded by RegistrationPage on startup
            </p>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 6 }}>
              Public Token Key
            </label>
            <input
              type="text"
              value={config.public_token_key || ''}
              onChange={e => onChange({ ...config, public_token_key: e.target.value })}
              placeholder="e.g., tii_public_token"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                fontSize: 14,
                color: TEXT,
              }}
            />
          </div>
        </div>
      </div>

      {/* Team Permissions */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: TEXT, margin: '0 0 12px' }}>
          Team Permissions
        </h3>
        <p style={{ fontSize: 12, color: MUTED, margin: '0 0 16px' }}>
          Define which teams get which access levels. Add teams by clicking "Add Team" within each tier.
        </p>

        <div style={{ display: 'grid', gap: 16 }}>
          {ALL_PERMISSION_TIERS.map(tier => (
            <div
              key={tier}
              style={{
                background: BG,
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                padding: 16,
              }}
            >
              <div style={{ marginBottom: 12 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: TEXT, margin: 0 }}>
                  {tier.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </h4>
                <p style={{ fontSize: 11, color: MUTED, margin: '4px 0 0' }}>
                  {TIER_DESCRIPTIONS[tier]}
                </p>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {(config.team_permissions?.[tier] || []).map(team => (
                  <div
                    key={team}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: '#fff',
                      border: `1px solid ${BORDER}`,
                      borderRadius: 6,
                      padding: '6px 12px',
                      fontSize: 12,
                    }}
                  >
                    <span>{team}</span>
                    <button
                      onClick={() => updateTeamPermission(tier, team, false)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: RED,
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => addTeamInputRow(tier)}
                style={{
                  padding: '8px 12px',
                  background: PRIMARY + '18',
                  color: PRIMARY,
                  border: `1px solid ${PRIMARY}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Plus size={14} />
                Add Team
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Tab Visibility */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: TEXT, margin: '0 0 12px' }}>
          Tab Visibility
        </h3>
        <p style={{ fontSize: 12, color: MUTED, margin: '0 0 16px' }}>
          Check boxes to hide tabs from this event (unchecked = visible)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
          {AVAILABLE_TABS.map(tab => (
            <label
              key={tab}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={isTabHidden(tab)}
                onChange={() => toggleTab(tab)}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ fontSize: 13, color: TEXT }}>
                {tab.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '10px 20px',
            background: BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            color: TEXT,
          }}
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          style={{
            padding: '10px 20px',
            background: GREEN,
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Save size={14} />
          Save Config
        </button>
      </div>
    </div>
  )
}
