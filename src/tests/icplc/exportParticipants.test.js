import { describe, it, expect } from 'vitest'
import { csvCell, participantsToCsv, EXPORT_COLUMNS } from '../../features/icplc/lib/exportParticipants.js'

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"')
  })
  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)")
    expect(csvCell('@cmd')).toBe("'@cmd")
    expect(csvCell('+1 555')).toBe("'+1 555")
  })
  it('renders null and undefined as empty', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })
})

describe('participantsToCsv', () => {
  const person = {
    id: '1', full_name: 'Ada, Obi', email: 'ada@example.com', subgroup: 'BLW West Subgroup A',
    participation_status: 'confirmed', registration_status: 'registered', passport_readiness: 'ready',
    tags: [{ name: 'Visa help' }, { name: 'VIP' }],
  }
  it('writes a header plus one row per person with the same column count', () => {
    const lines = participantsToCsv([person]).split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[0].split(',')).toHaveLength(EXPORT_COLUMNS.length)
    expect(lines[1].startsWith('"Ada, Obi",ada@example.com')).toBe(true)
    expect(lines[1]).toContain('Visa help; VIP')
    expect(lines[1]).toContain(',West,') // group derived from subgroup
  })
})
