// CSV export of participants (used by the Working List bulk bar). Pure, so it is unit-tested.

import { deriveReadiness, deriveFlightStatus } from './readinessEngine.js'
import { attentionCategoryKeys, registrationState, REGISTRATION_STATE_LABELS } from './documentationRules.js'
import { groupForSubgroup } from './subgroups.js'

export const EXPORT_COLUMNS = [
  ['Name', (p) => p.full_name],
  ['Email', (p) => p.email],
  ['Phone', (p) => p.phone_number || p.phone || p.source_values?.phone_number?.value],
  ['KingsChat', (p) => p.kingschat_username],
  ['Group', (p) => groupForSubgroup(p.subgroup) || p.group_name],
  ['Subgroup', (p) => p.subgroup],
  ['Campus', (p) => p.region],
  ['Participation', (p) => p.participation_status],
  ['Registration', (p) => REGISTRATION_STATE_LABELS[registrationState(p)]],
  ['Passport', (p) => p.passport_readiness],
  ['Visa requirement', (p) => p.visa_requirement],
  ['Visa process', (p) => p.visa_process_status],
  ['Readiness', (p) => deriveReadiness(p).readiness],
  ['Flights', (p) => deriveFlightStatus(p)],
  ['Needs attention', (p) => attentionCategoryKeys(p).join('; ')],
  ['Tags', (p) => (p.tags || []).map((t) => t.name).join('; ')],
]

/** Quote a cell, and neutralise spreadsheet formulas (=, +, -, @) so opening the file can't run one. */
export function csvCell(value) {
  let text = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function participantsToCsv(participants) {
  const lines = [EXPORT_COLUMNS.map(([label]) => csvCell(label)).join(',')]
  for (const p of participants) lines.push(EXPORT_COLUMNS.map(([, get]) => csvCell(get(p))).join(','))
  return lines.join('\r\n')
}

export function downloadCsv(filename, csv) {
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
