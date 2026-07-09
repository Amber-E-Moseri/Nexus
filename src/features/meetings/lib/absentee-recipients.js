// Shared logic for resolving absent members to emailable recipients.
// Used by MeetingReportTab (meetings) and AbsenteeFollowUpPage (communications).

export function normalizeNameKey(name) {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').trim()
}

/**
 * Cross-reference absent names against the active roster and return
 * recipients in the shape the send-absence-emails edge function expects.
 *
 * @param {string[]} absentNames - names from meeting_attendance_reports.absent_names
 * @param {Array<{full_name: string, email?: string}>} roster - active expected_attendees rows
 * @returns {Array<{name: string, email: string}>}
 */
export function resolveAbsentRecipients(absentNames = [], roster = []) {
  const rosterMap = new Map(roster.map((row) => [normalizeNameKey(row.full_name), row]))

  const recipients = []
  for (const name of absentNames) {
    const match = rosterMap.get(normalizeNameKey(name))
    if (match?.email) {
      recipients.push({ name, email: match.email })
    }
  }
  return recipients
}

export function defaultAbsenceEmail(meetingLabel = '') {
  return {
    subject: `We missed you at ${meetingLabel}`,
    body: `Hi {{name}}, we missed you at ${meetingLabel}. Please review the meeting attendance report.`,
  }
}
