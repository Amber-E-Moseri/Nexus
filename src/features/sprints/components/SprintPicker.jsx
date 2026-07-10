import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../hooks/useAuth'
import { getAllSprints } from '../lib/sprints'

// Sprints a task can be linked to: not archived, still open for work.
const LINKABLE_STATUSES = ['planning', 'active']

// Sprint list + the current user's memberships rarely change within a session and
// several pickers can render at once (one per extracted action item). Memoize the
// fetches at module scope so we hit the network once, not once per instance.
let _sprintsPromise = null
const _membershipPromiseByUser = {}

function getSprintsOnce() {
  if (!_sprintsPromise) _sprintsPromise = getAllSprints()
  return _sprintsPromise
}

async function getMyMembershipSprintIds(userId) {
  if (!userId) return []
  if (!_membershipPromiseByUser[userId]) {
    _membershipPromiseByUser[userId] = supabase
      .from('sprint_members')
      .select('sprint_id')
      .eq('user_id', userId)
      .then(({ data }) => (data ?? []).map((r) => r.sprint_id))
  }
  return _membershipPromiseByUser[userId]
}

/** Clear the module cache (call after creating/joining a sprint mid-session). */
export function invalidateSprintPickerCache() {
  _sprintsPromise = null
  for (const k of Object.keys(_membershipPromiseByUser)) delete _membershipPromiseByUser[k]
}

/**
 * Space-scoped sprint dropdown. Lists active/planning sprints in `spaceId` that the
 * current user can actually add tasks to (their memberships; all for super_admin).
 *
 * Props:
 *   spaceId   — department/space id to filter sprints by (null → nothing to show)
 *   value     — currently selected sprint id (or '' / null)
 *   onChange  — (sprintId|null) => void
 *   disabled  — bool
 *   style     — style overrides for the <select>
 *   placeholder — text for the empty option (default "No sprint")
 */
export default function SprintPicker({ spaceId, value, onChange, disabled = false, style, placeholder = 'No sprint' }) {
  const { profile } = useAuth()
  const isSuperAdmin = profile?.role === 'super_admin'
  const [sprints, setSprints] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all([getSprintsOnce(), getMyMembershipSprintIds(profile?.id)])
      .then(([allSprints, memberIds]) => {
        if (!active) return
        const memberSet = new Set(memberIds)
        const linkable = (allSprints ?? []).filter(
          (s) =>
            LINKABLE_STATUSES.includes(s.status) &&
            !s.is_archived &&
            (isSuperAdmin || memberSet.has(s.id)),
        )
        setSprints(linkable)
      })
      .catch((err) => {
        console.warn('[SprintPicker] Failed to load sprints:', err.message)
        if (active) setSprints([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [profile?.id, isSuperAdmin])

  // Only sprints belonging to the given space are selectable.
  const options = sprints.filter((s) => !spaceId || s.department_id === spaceId)

  const selectStyle = {
    padding: '6px 8px',
    fontSize: 13,
    border: '1px solid #E9E4D8',
    borderRadius: 6,
    background: '#fff',
    color: '#2D2A22',
    width: '100%',
    ...style,
  }

  if (loading) {
    return (
      <select disabled style={{ ...selectStyle, opacity: 0.6 }}>
        <option>Loading sprints…</option>
      </select>
    )
  }

  return (
    <select
      aria-label="Link to sprint"
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value || null)}
      style={{ ...selectStyle, opacity: disabled ? 0.6 : 1 }}
    >
      <option value="">{placeholder}</option>
      {options.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
          {s.status === 'planning' ? ' (upcoming)' : ''}
        </option>
      ))}
      {options.length === 0 && (
        <option value="" disabled>
          {spaceId ? 'No sprints you can add to in this space' : 'Select a space first'}
        </option>
      )}
    </select>
  )
}
