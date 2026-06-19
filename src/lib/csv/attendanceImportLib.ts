import { supabase } from '../supabase'

export interface MatchResult {
  matched: boolean
  userId?: string
  personName: string
  error?: string
}

interface PersonMatch {
  id: string
  name: string
  external_id?: string
}

// Fuzzy match: check if CSV name appears in user name or vice versa
function fuzzyNameMatch(csvName: string, userName: string): boolean {
  const csv = csvName.toLowerCase().trim()
  const user = userName.toLowerCase().trim()

  // Exact match
  if (csv === user) return true

  // Initials match: "A.D." matches "Amara D." or "Amara Doe"
  const csvInitials = csv
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .join('')
  const userInitials = user
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .join('')

  if (csvInitials && userInitials && csvInitials === userInitials && csvInitials.length >= 2) {
    return true
  }

  // Substring match (at least 2 chars and word boundary)
  if (csv.length >= 2 && user.includes(csv)) return true
  if (user.length >= 2 && csv.includes(user)) return true

  // Last name match (split by space, compare last parts)
  const csvParts = csv.split(/\s+/)
  const userParts = user.split(/\s+/)
  if (csvParts.length > 0 && userParts.length > 0) {
    const csvLast = csvParts[csvParts.length - 1]
    const userLast = userParts[userParts.length - 1]
    if (csvLast.length >= 3 && userLast.length >= 3 && csvLast === userLast) {
      return true
    }
  }

  return false
}

export async function matchPersonToUser(
  personName: string,
  personId?: string,
): Promise<MatchResult> {
  if (!personName) {
    return {
      matched: false,
      personName,
      error: 'Empty person name',
    }
  }

  try {
    // Step 1: Try external ID match if provided
    if (personId) {
      const { data, error } = await supabase
        .from('users')
        .select('id, name')
        .eq('external_id', personId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows, which is fine
        throw error
      }

      if (data) {
        return {
          matched: true,
          userId: data.id,
          personName,
        }
      }
    }

    // Step 2: Try exact name match
    const { data: exactMatches, error: exactError } = await supabase
      .from('users')
      .select('id, name')
      .ilike('name', personName)
      .limit(5)

    if (exactError && exactError.code !== 'PGRST116') {
      throw exactError
    }

    if (exactMatches && exactMatches.length > 0) {
      // Prefer exact match
      const exact = exactMatches.find((u) => u.name.toLowerCase() === personName.toLowerCase())
      if (exact) {
        return {
          matched: true,
          userId: exact.id,
          personName,
        }
      }
    }

    // Step 3: Try fuzzy match on all users
    const { data: allUsers, error: allError } = await supabase
      .from('users')
      .select('id, name')
      .limit(500) // Adjust based on your user count

    if (allError && allError.code !== 'PGRST116') {
      throw allError
    }

    if (allUsers && allUsers.length > 0) {
      for (const user of allUsers) {
        if (fuzzyNameMatch(personName, user.name)) {
          return {
            matched: true,
            userId: user.id,
            personName,
          }
        }
      }
    }

    // Step 4: No match found
    return {
      matched: false,
      personName,
      error: `Person not found in system`,
    }
  } catch (err) {
    return {
      matched: false,
      personName,
      error: `Database error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

export async function matchPeopleToUsers(
  people: Array<{ name: string; id?: string }>,
): Promise<MatchResult[]> {
  const results: MatchResult[] = []

  for (const person of people) {
    const result = await matchPersonToUser(person.name, person.id)
    results.push(result)
  }

  return results
}

export interface ImportSummary {
  imported: number
  skipped: number
  mismatches: Array<{
    person_name: string
    error: string
  }>
}

export async function importElvantoAttendance(
  records: Array<{
    meeting_name: string
    date: string
    person_name: string
    person_id?: string
    status: 'present' | 'absent' | 'late' | 'excused'
    attendance_percentage?: number
  }>,
  meetingId: string,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    imported: 0,
    skipped: 0,
    mismatches: [],
  }

  if (!records || records.length === 0) {
    return summary
  }

  // Match all people first
  const matchResults = await Promise.all(
    records.map((r) => matchPersonToUser(r.person_name, r.person_id)),
  )

  // Prepare rows for batch upsert
  const rowsToInsert = []

  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    const match = matchResults[i]

    if (!match.matched) {
      summary.skipped++
      summary.mismatches.push({
        person_name: record.person_name,
        error: match.error || 'Person not found',
      })
      continue
    }

    rowsToInsert.push({
      meeting_id: meetingId,
      user_id: match.userId,
      status: record.status,
      attendance_percentage: record.attendance_percentage || null,
      marked_at: new Date().toISOString(),
      source: 'elvanto_import',
    })
  }

  // Batch upsert
  if (rowsToInsert.length > 0) {
    const { error } = await supabase
      .from('meeting_attendance')
      .upsert(rowsToInsert, {
        onConflict: 'meeting_id,user_id',
      })

    if (error) {
      throw new Error(`Batch import failed: ${error.message}`)
    }

    summary.imported = rowsToInsert.length
  }

  return summary
}
