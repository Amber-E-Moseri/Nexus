/**
 * Export Selected / Export Filtered use the existing, approved export column model only. Nothing sensitive or
 * raw may appear, whatever the participant row carries.
 */
import { describe, it, expect } from 'vitest'
import { EXPORT_COLUMNS } from '../../features/icplc/lib/exportParticipants.js'
import { bulkExportCsv, exportFilename } from '../../features/icplc/lib/bulkExport.js'

const SENSITIVE = {
  full_name: 'Ada Example',
  email: 'ada@example.test',
  participation_status: 'confirmed',
  passport_number: 'PASS-SECRET-123',
  passport_country: 'Nigeria',
  passport_expiry: '2031-01-01',
  canada_residency_status: 'PERMANENT_RESIDENT',
  canada_status_document_readiness: 'READY',
  canada_status_document_number: 'DOC-SECRET-999',
  emergency_contact_name: 'Emergency Person',
  emergency_contact_phone: '+1-555-0100',
  dietary_restrictions: 'peanuts',
  notes: 'private staff note',
  override_fields: { passport_readiness: { overridden: true, by: 'u1' } },
  source_values: {
    registered_raw: { value: 'Yes' },
    cmp_documentation: { submission_id: 'form-1', passport_number: 'RAW-PASSPORT-777' },
    raw_import_payload: 'RAW-PAYLOAD-555',
  },
  documentation_review_fingerprint: 'passport_status',
  tags: [{ name: 'Finances' }],
}

describe('bulk export', () => {
  it('EXP-1 uses exactly the approved export columns', () => {
    const header = bulkExportCsv([SENSITIVE]).split('\r\n')[0].split(',')
    expect(header).toEqual(EXPORT_COLUMNS.map(([label]) => label))
  })

  it('EXP-2 sensitive and raw values never appear', () => {
    const csv = bulkExportCsv([SENSITIVE])
    for (const secret of [
      'PASS-SECRET-123', 'DOC-SECRET-999', 'RAW-PASSPORT-777', 'RAW-PAYLOAD-555', 'Emergency Person',
      '+1-555-0100', 'peanuts', 'private staff note', '2031-01-01', 'PERMANENT_RESIDENT', 'passport_status',
    ]) {
      expect(csv).not.toContain(secret)
    }
  })

  it('EXP-3 no sensitive column exists in the schema', () => {
    const labels = EXPORT_COLUMNS.map(([l]) => l.toLowerCase()).join('|')
    for (const banned of ['passport number', 'expiry', 'canadian', 'residency', 'source', 'payload', 'emergency', 'dietary', 'notes', 'override', 'fingerprint']) {
      expect(labels).not.toContain(banned)
    }
  })

  it('EXP-4 exports exactly the rows it is given (selected only / filtered only)', () => {
    const rows = [{ ...SENSITIVE, full_name: 'One' }, { ...SENSITIVE, full_name: 'Two' }]
    expect(bulkExportCsv(rows.slice(0, 1)).split('\r\n')).toHaveLength(2) // header + 1
    expect(bulkExportCsv(rows).split('\r\n')).toHaveLength(3)
    expect(bulkExportCsv([])).toBe(EXPORT_COLUMNS.map(([l]) => l).join(','))
  })

  it('EXP-5 formula-like cells are neutralised and the filename is dated', () => {
    expect(bulkExportCsv([{ ...SENSITIVE, full_name: '=HYPERLINK("x")' }])).toContain("'=HYPERLINK")
    expect(exportFilename('selected', new Date('2026-10-01T10:00:00Z'))).toBe('icplc-selected-2026-10-01.csv')
  })
})
