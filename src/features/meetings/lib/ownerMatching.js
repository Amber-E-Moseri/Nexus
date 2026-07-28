// Shared owner/space resolution for AI-extracted action items.
// Used by both extraction paths (AudioTranscriptionPanel and the meeting
// detail page's AI Extract tab) so an AI-suggested owner is matched to a
// real user the same way everywhere.

import { getAllDepartments, getAllUsers } from '../../automations/lib/automations'

const normalizeName = (s) => (s || '').trim().toLowerCase()

// Cache org directory with 10-minute TTL. Memoization alone didn't expire,
// causing stale data across long sessions. This reduces database queries
// significantly by not refetching on every extraction.
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
let _cachedDepts = null
let _cachedUsers = null
let _deptsFetchTime = 0
let _usersFetchTime = 0

export function getOrgDepartments() {
  const now = Date.now()
  if (_cachedDepts && now - _deptsFetchTime < CACHE_TTL_MS) {
    return Promise.resolve(_cachedDepts)
  }
  return getAllDepartments().then((data) => {
    _cachedDepts = data
    _deptsFetchTime = now
    return data
  })
}

export function getOrgUsers() {
  const now = Date.now()
  if (_cachedUsers && now - _usersFetchTime < CACHE_TTL_MS) {
    return Promise.resolve(_cachedUsers)
  }
  return getAllUsers().then((data) => {
    _cachedUsers = data
    _usersFetchTime = now
    return data
  })
}

// Match an AI-extracted owner name to a real user. Only returns a match when
// it's unambiguous — a wrong auto-assignment is worse than none.
export function matchUserByName(name, users) {
  const n = normalizeName(name)
  if (!n || n === 'tbd' || n === 'unassigned') return null
  const exact = users.find((u) => normalizeName(u.name) === n)
  if (exact) return exact
  const firstNameMatches = users.filter((u) => normalizeName(u.name).split(' ')[0] === n.split(' ')[0])
  return firstNameMatches.length === 1 ? firstNameMatches[0] : null
}

export function matchDepartmentByName(name, departments) {
  const n = normalizeName(name)
  if (!n) return null
  return departments.find((d) => normalizeName(d.name) === n) ?? null
}

// Resolve an action item's assignee + department for the merge form pre-fill.
// Department is DETERMINISTIC when the owner resolves to a real user: we use that
// user's actual department membership rather than the AI's fuzzy space guess. The
// AI-suggested space (matchDepartmentByName) is only a fallback for owners we can't
// resolve to a known user (ambiguous/external names).
export function resolveAssignment(item, directory) {
  const user = matchUserByName(item.owner, directory.users)
  const aiDeptId = matchDepartmentByName(item.suggested_space, directory.departments)?.id ?? null
  return {
    assigneeId: user?.id ?? null,
    departmentId: user?.department_id ?? aiDeptId,
    sprintId: null,
  }
}
