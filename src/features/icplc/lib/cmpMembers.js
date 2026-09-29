/**
 * CMP Members API Loader
 *
 * Fetches members from CMP by role using Bearer token auth.
 * Query parameter auth is NOT supported by the CMP API (returns 401).
 */

const CMP_MEMBERS_URL = 'https://leaders.lwcanada.org/api/members'

export const TARGET_ROLES = [
  'BSCT',
  'Cell Leader',
  'Assistant Cell Leader',
  'Fellowship Coordinator',
  'Assistant Fellowship Coordinator',
  'Sub-group Pastor',
  'Group Pastor',
  'Church Coordinator',
]

/**
 * Fetch members from CMP with Bearer token auth
 * @param {string} leaderToken - CMP leader token
 * @returns {Promise<Array>} All member records
 */
export async function fetchMembers(leaderToken) {
  if (!leaderToken) {
    throw new Error('leaderToken required for Bearer auth')
  }

  const allMembers = []
  let page = 1
  const pageSize = 1000

  try {
    while (true) {
      const url = `${CMP_MEMBERS_URL}?pageSize=${pageSize}&page=${page}`

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${leaderToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`)
      }

      const payload = await res.json()

      if (!payload.data || payload.data.length === 0) {
        break
      }

      allMembers.push(...payload.data)

      // Check pagination
      const total = payload.pagination?.total
      if (total && allMembers.length >= total) {
        break
      }

      page++
    }

    return allMembers
  } catch (err) {
    console.error('CMP fetch failed:', err)
    throw err
  }
}

/**
 * Fetch and filter members by target roles
 * @param {string} leaderToken - CMP leader token
 * @returns {Promise<Object>} { total, filtered, members, byRole }
 */
export async function fetchMembersByRoles(leaderToken) {
  const allMembers = await fetchMembers(leaderToken)

  // Filter to target roles (members may have multiple roles in array)
  const filtered = allMembers.filter((member) => {
    const roles = member.roles || []

    if (!Array.isArray(roles)) {
      return TARGET_ROLES.includes(roles)
    }

    return roles.some((r) => TARGET_ROLES.includes(r))
  })

  return {
    total: allMembers.length,
    filtered: filtered.length,
    members: filtered,
    byRole: groupMembersByRole(filtered),
  }
}

/**
 * Group members by role for analysis
 * @param {Array} members - Filtered member list
 * @returns {Object} { roleName: [...members] }
 */
export function groupMembersByRole(members) {
  const grouped = {}

  TARGET_ROLES.forEach((role) => {
    grouped[role] = members.filter((m) => {
      const roles = m.roles || []

      if (Array.isArray(roles)) {
        return roles.includes(role)
      }
      return roles === role
    })
  })

  return grouped
}

/**
 * Filter members by creation date (last N days)
 * @param {Array} members - Member records
 * @param {number} days - Number of days back (default: 30)
 * @returns {Array} Filtered members
 */
export function filterMembersByDaysAdded(members, days = 30) {
  const now = new Date()
  const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  return members.filter((m) => {
    if (!m.createdAt) return false
    const createdDate = new Date(m.createdAt)
    return createdDate >= cutoffDate
  })
}

/**
 * Classify membership status based on cell participation
 * @param {Object} member - Member record
 * @returns {string} 'Member' | 'Prospect'
 */
export function getMembershipStatus(member) {
  // Member = has joined a cell
  if (member.joinedCellAt) return 'Member'
  // Prospect = added but not yet joined a cell
  return 'Prospect'
}

/**
 * Convert members to CSV format for registration people pool
 * @param {Array} members - Member records
 * @returns {string} CSV formatted string
 */
export function membersToCSV(members) {
  if (!members || members.length === 0) {
    return 'phone,fullName,kingsChatHandle,email,unitName,roles,membershipStatus'
  }

  // CSV headers
  const headers = ['phone', 'fullName', 'kingsChatHandle', 'email', 'unitName', 'roles', 'membershipStatus']

  // Escape CSV value (handle commas, quotes, newlines)
  function escapeCSV(val) {
    if (val === null || val === undefined) return ''
    const str = String(val)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"` // Double quotes for escaping
    }
    return str
  }

  // Build CSV rows
  const rows = members.map((m) => {
    return [
      escapeCSV(m.phone),
      escapeCSV(m.fullName),
      escapeCSV(m.kingsChatHandle),
      escapeCSV(m.email),
      escapeCSV(m.unit?.name || ''),
      escapeCSV(m.roles?.join('; ') || ''),
      escapeCSV(getMembershipStatus(m)),
    ].join(',')
  })

  return [headers.join(','), ...rows].join('\n')
}
