// Export Selected / Export Filtered. Uses the existing, already-approved export column model
// (exportParticipants.js) unchanged: nothing sensitive is added for bulk. Passport numbers, Canadian
// immigration/status details, source_values and raw import payloads are not columns and must never become so.

import { downloadCsv, participantsToCsv } from './exportParticipants.js'

export function exportFilename(kind, now = new Date()) {
  return `icplc-${kind}-${now.toISOString().slice(0, 10)}.csv`
}

/** Build the CSV text for a set of participants (selected rows, or every filtered row). */
export function bulkExportCsv(participants) {
  return participantsToCsv(participants || [])
}

export function downloadBulkExport(kind, participants) {
  downloadCsv(exportFilename(kind), bulkExportCsv(participants))
  return (participants || []).length
}
