import { describe, it, expect } from 'vitest'
import { describeActivity, formatValue } from '../../features/icplc/lib/activityFormat.js'

describe('Activity log formatting', () => {
  it('shows a field change with who did it', () => {
    const info = describeActivity({
      action: 'participant_updated',
      users: { name: 'Amber Moseri', email: 'a@x.ca' },
      metadata: { actor_id: 'u1', source: 'app', changes: { subgroup: { from: 'BLW West Subgroup A', to: 'BLW West Subgroup B' } } },
    })
    expect(info.title).toBe('Subgroup changed')
    expect(info.actor).toBe('Amber Moseri')
    expect(info.automatic).toBe(false)
    expect(info.changes).toEqual([{ label: 'Subgroup', from: 'BLW West Subgroup A', to: 'BLW West Subgroup B' }])
  })

  it('marks automatic changes and keeps the reason and who triggered them', () => {
    const info = describeActivity({
      action: 'participant_updated',
      users: { name: 'Sam' },
      metadata: { source: 'automatic', reason: 'Automatic: readiness reached Ready', changes: { participation_status: { from: 'tracking', to: 'confirmed' } } },
    })
    expect(info.automatic).toBe(true)
    expect(info.actor).toBe('Automatic (triggered by Sam)')
    expect(info.reason).toMatch(/readiness reached Ready/)
    expect(info.changes[0]).toEqual({ label: 'Participation', from: 'Tracking', to: 'Confirmed' })
  })

  it('attributes system work to "System" and unknown people honestly', () => {
    expect(describeActivity({ action: 'participant_updated', metadata: { source: 'system', changes: {} } }).actor).toBe('System')
    expect(describeActivity({ action: 'participant_updated', metadata: { source: 'app', actor_id: 'gone', changes: {} } }).actor).toBe('Unknown user')
  })

  it('titles multi-field edits, creation and imports', () => {
    const two = describeActivity({ action: 'participant_updated', metadata: { changes: { notes: { from: null, to: 'x' }, gender: { from: null, to: 'female' } } } })
    expect(two.title).toBe('2 fields changed')
    expect(describeActivity({ action: 'participant_created', metadata: {} }).title).toBe('Added to the list')
    expect(describeActivity({ action: 'import_applied', metadata: {} }).title).toBe('Import applied')
  })

  it('formats values: empty, canonical constants, labels and long text', () => {
    expect(formatValue('notes', null)).toBe('empty')
    expect(formatValue('canada_residency_status', 'CANADIAN_CITIZEN')).toBe('Canadian citizen')
    expect(formatValue('participation_status', 'likely')).toBe('Confirming')
    expect(formatValue('participation_status', 'not_attending')).toBe('Not attending')
    expect(formatValue('notes', 'x'.repeat(200)).length).toBeLessThan(150)
  })
})
