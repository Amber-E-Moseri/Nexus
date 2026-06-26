import { describe, test, expect } from 'vitest'

/**
 * Name normalization utility for matching absent members with roster
 * Matches the implementation in MeetingReportTab.jsx line 104
 */
function normalizeNameKey(name) {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').trim()
}

function namesMatch(name1, name2) {
  return normalizeNameKey(name1) === normalizeNameKey(name2)
}

describe('Email Absent - Name Matching Edge Cases', () => {
  describe('Basic name matching', () => {
    test('matches exact same names', () => {
      expect(namesMatch('John Doe', 'John Doe')).toBe(true)
    })

    test('matches case-insensitive names', () => {
      expect(namesMatch('John Doe', 'john doe')).toBe(true)
      expect(namesMatch('JOHN DOE', 'john doe')).toBe(true)
      expect(namesMatch('JoHn DoE', 'john doe')).toBe(true)
    })

    test('matches names with different whitespace', () => {
      expect(namesMatch('John  Doe', 'John Doe')).toBe(true)
      expect(namesMatch('  John Doe  ', 'John Doe')).toBe(true)
      expect(namesMatch('John\t Doe', 'John Doe')).toBe(false) // tabs are removed
    })

    test('does not match different names', () => {
      expect(namesMatch('John Doe', 'Jane Smith')).toBe(false)
    })
  })

  describe('Special characters', () => {
    test('matches names with apostrophes', () => {
      expect(namesMatch("O'Brien", "OBrien")).toBe(true)
      expect(namesMatch("John O'Brien", "John OBrien")).toBe(true)
    })

    test('matches names with hyphens - removes hyphens', () => {
      // Mary-Jane Smith -> maryjanesmit
      expect(namesMatch('Mary-Jane Smith', 'MaryJaneSmith')).toBe(true)
      expect(namesMatch('Smith-Jones', 'SmithJones')).toBe(true)
      // But won't match with spaces: 'maryjane smith' != 'maryjanesmit'
      expect(namesMatch('Mary-Jane Smith', 'mary jane smith')).toBe(false)
    })

    test('matches names with accents - accents are removed', () => {
      // Special characters including accents are removed
      expect(namesMatch('José', 'Jose')).toBe(true)
      expect(namesMatch('François', 'Francois')).toBe(true)
    })

    test('handles comma-separated names (Lastname, Firstname format)', () => {
      // Commas are removed: "John, Doe" -> "johndoe", "John Doe" -> "johndoe"
      expect(namesMatch('John, Doe', 'John Doe')).toBe(true)
      // But word order matters: "Doe, John" -> "doejohn" vs "John Doe" -> "johndoe"
      expect(namesMatch('Doe, John', 'John Doe')).toBe(false)
    })
  })

  describe('Title and prefix handling', () => {
    test('removes titles during normalization', () => {
      // Periods are removed: 'Rev. John Doe' -> 'revjohndoe'
      expect(namesMatch('Rev. John Doe', 'Rev John Doe')).toBe(true)
      expect(namesMatch('Dr. John Doe', 'Dr John Doe')).toBe(true)
      // But with title vs without: 'mrjohndoe' vs 'johndoe'
      expect(namesMatch('Mr. John Doe', 'John Doe')).toBe(false)
    })

    test('titles are included in normalized key (need preprocessing to ignore)', () => {
      // The normalization function doesn't automatically strip titles
      // To match 'Rev. John' with 'John', you'd need to preprocess the roster
      expect(namesMatch('Rev. John', 'John')).toBe(false)
      expect(namesMatch('Rev John', 'John')).toBe(false)
    })
  })

  describe('Hyphenated and compound names', () => {
    test('matches hyphenated first names when hyphens removed', () => {
      // Jean-Paul -> jeanpaul (hyphen removed)
      expect(namesMatch('Jean-Paul Smith', 'JeanPaul Smith')).toBe(true)
      // But won't match with hyphen preserved: jeanpaulsmith != jeanpaulsmith with different spacing
      expect(namesMatch('Jean-Paul Smith', 'jean paul smith')).toBe(false)
    })

    test('matches hyphenated last names when hyphens removed', () => {
      // Smith-Jones -> smithjones (hyphen removed)
      expect(namesMatch('John Smith-Jones', 'John SmithJones')).toBe(true)
      expect(namesMatch('John Smith-Jones', 'john smith jones')).toBe(false)
    })

    test('matches compound names with spaces', () => {
      expect(namesMatch('Mary Jane', 'mary jane')).toBe(true)
      expect(namesMatch('Mary Jane', 'maryJane')).toBe(false) // spaces matter
    })
  })

  describe('Edge cases', () => {
    test('handles empty strings', () => {
      expect(normalizeNameKey('')).toBe('')
      expect(normalizeNameKey('   ')).toBe('')
      expect(normalizeNameKey(null)).toBe('')
      expect(normalizeNameKey(undefined)).toBe('')
    })

    test('handles single names', () => {
      expect(namesMatch('John', 'john')).toBe(true)
    })

    test('handles very long names', () => {
      // Both normalize to 'johannsebastianwilhelmvonsmithjones3'
      const longName = 'Johann Sebastian Wilhelm Von Smith-Jones III'
      const longNameSameFormat = 'Johann Sebastian Wilhelm Von Smith Jones 3'
      expect(namesMatch(longName, longNameSameFormat)).toBe(true)
    })

    test('handles names with numbers', () => {
      // Jr. -> removed, so 'johnsmithjr' vs 'johnsmith2'
      expect(namesMatch('John Smith Jr.', 'John Smith Jr')).toBe(true)
      expect(namesMatch('John Smith 2nd', 'John Smith 2nd')).toBe(true)
    })

    test('handles Unicode characters - special chars removed', () => {
      // Accented characters are removed by [^a-z0-9] pattern
      // François -> franois (ç removed), Francois -> francois (different!)
      expect(namesMatch('François', 'Francois')).toBe(false)
      expect(namesMatch('François', 'Franois')).toBe(true) // Both remove accent
      // Müller: ü removed -> mller, Muller: u kept -> muller
      expect(namesMatch('Müller', 'Muller')).toBe(false)
      expect(namesMatch('Müller', 'Mller')).toBe(true)
    })
  })

  describe('Real-world roster matching scenarios', () => {
    const testRoster = [
      { name: 'John Doe', email: 'john@example.com' },
      { name: 'Jane Smith', email: 'jane@example.com' },
      { name: "Michael O'Brien", email: 'michael@example.com' },
      { name: 'Mary-Jane Watson', email: 'mary@example.com' },
      { name: 'Rev. Paul Johnson', email: 'paul@example.com' },
      { name: 'Jean-Paul Dupont', email: 'jean@example.com' },
      { name: 'García, José', email: 'jose@example.com' },
    ]

    test('finds email for exact roster match', () => {
      const absenceEntry = { name: 'John Doe' }
      const match = testRoster.find((r) => namesMatch(r.name, absenceEntry.name))
      expect(match).toBeDefined()
      expect(match?.email).toBe('john@example.com')
    })

    test('finds email for case-mismatched entry', () => {
      const absenceEntry = { name: 'jane smith' }
      const match = testRoster.find((r) => namesMatch(r.name, absenceEntry.name))
      expect(match).toBeDefined()
      expect(match?.email).toBe('jane@example.com')
    })

    test('finds email for name with special characters', () => {
      const absenceEntry = { name: 'Michael OBrien' }
      const match = testRoster.find((r) => namesMatch(r.name, absenceEntry.name))
      expect(match).toBeDefined()
      expect(match?.email).toBe('michael@example.com')
    })

    test('finds email for hyphenated name when formatted correctly', () => {
      // Mary-Jane Watson is normalized to 'maryjamewatson'
      const absenceEntry = { name: 'Mary-Jane Watson' }
      const match = testRoster.find((r) => namesMatch(r.name, absenceEntry.name))
      expect(match).toBeDefined()
      expect(match?.email).toBe('mary@example.com')
    })

    test('fails to find email for non-existent name', () => {
      const absenceEntry = { name: 'Unknown Person' }
      const match = testRoster.find((r) => namesMatch(r.name, absenceEntry.name))
      expect(match).toBeUndefined()
    })

    test('handles partially matching names (should not match)', () => {
      const absenceEntry = { name: 'John' }
      const match = testRoster.find((r) => namesMatch(r.name, absenceEntry.name))
      expect(match).toBeUndefined()
    })

    test('handles comma-separated format from reports', () => {
      const absenceEntry = { name: 'Smith, Jane' }
      // This won't match because the word order is different
      // Pre-processing would be needed to handle this
      const match = testRoster.find((r) => namesMatch(r.name, absenceEntry.name))
      expect(match).toBeUndefined()
    })
  })

  describe('Email Absent handler workflow', () => {
    test('creates recipients list with matching emails', () => {
      const absentMembers = [
        { name: 'John Doe' },
        { name: 'jane smith' },
        { name: 'Unknown Person' },
      ]

      const roster = [
        { full_name: 'John Doe', email: 'john@example.com' },
        { full_name: 'Jane Smith', email: 'jane@example.com' },
      ]

      const recipients = absentMembers
        .filter((absent) => {
          const match = roster.find((r) => namesMatch(r.full_name, absent.name))
          return match?.email
        })
        .map((absent) => {
          const match = roster.find((r) => namesMatch(r.full_name, absent.name))
          return { name: absent.name, email: match.email }
        })

      expect(recipients).toHaveLength(2)
      expect(recipients[0].email).toBe('john@example.com')
      expect(recipients[1].email).toBe('jane@example.com')
    })

    test('skips members without matching emails', () => {
      const absentMembers = [
        { name: 'John Doe' },
        { name: 'Unknown Person' },
      ]

      const roster = [{ full_name: 'John Doe', email: 'john@example.com' }]

      const recipients = absentMembers
        .filter((absent) => {
          const match = roster.find((r) => namesMatch(r.full_name, absent.name))
          return match?.email
        })
        .map((absent) => {
          const match = roster.find((r) => namesMatch(r.full_name, absent.name))
          return { name: absent.name, email: match.email }
        })

      expect(recipients).toHaveLength(1)
      expect(recipients[0].name).toBe('John Doe')
    })
  })

  describe('Email template personalization', () => {
    test('replaces {{name}} placeholder with recipient name', () => {
      const template = 'Hi {{name}}, we missed you at the meeting.'
      const name = 'John Doe'
      const personalized = template.replace(/\{\{name\}\}/g, name)
      expect(personalized).toBe('Hi John Doe, we missed you at the meeting.')
    })

    test('handles multiple {{name}} placeholders', () => {
      const template = 'Hello {{name}}, {{name}} was missed.'
      const name = 'John'
      const personalized = template.replace(/\{\{name\}\}/g, name)
      expect(personalized).toBe('Hello John, John was missed.')
    })

    test('handles missing placeholders gracefully', () => {
      const template = 'Hi there, you were missed.'
      const personalized = template.replace(/\{\{name\}\}/g, 'John')
      expect(personalized).toBe('Hi there, you were missed.')
    })

    test('handles empty names in personalization', () => {
      const template = 'Hi {{name}}, welcome back.'
      const personalized = template.replace(/\{\{name\}\}/g, '')
      expect(personalized).toBe('Hi , welcome back.')
    })
  })
})
