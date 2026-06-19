import { describe, it, expect } from 'vitest'
import { parseElvantoCSV, AttendanceRecord } from './elvanto-attendance-parser'

describe('parseElvantoCSV', () => {
  it('should parse valid CSV with required columns', () => {
    const csv = `Meeting,Date,Time,PersonName,PersonID,Status,Percentage
Foundation School Leads,2024-06-16,14:00,Amara D.,person_123,Present,100%
Grace M.,person_456,Present,96%`

    const result = parseElvantoCSV(csv)

    expect(result.summary.valid_records).toBe(2)
    expect(result.summary.invalid_rows).toBe(0)
    expect(result.records.length).toBe(2)
    expect(result.records[0].person_name).toBe('Amara D.')
    expect(result.records[0].status).toBe('present')
    expect(result.records[0].date).toBe('2024-06-16')
  })

  it('should handle different status values', () => {
    const csv = `Meeting,Date,PersonName,Status
Test Meeting,2024-06-16,John Doe,Present
Test Meeting,2024-06-16,Jane Smith,Absent
Test Meeting,2024-06-16,Bob Wilson,Late
Test Meeting,2024-06-16,Alice Brown,Excused`

    const result = parseElvantoCSV(csv)

    expect(result.summary.valid_records).toBe(4)
    expect(result.records[0].status).toBe('present')
    expect(result.records[1].status).toBe('absent')
    expect(result.records[2].status).toBe('late')
    expect(result.records[3].status).toBe('excused')
  })

  it('should normalize status to lowercase', () => {
    const csv = `Meeting,Date,PersonName,Status
Test Meeting,2024-06-16,John Doe,PRESENT
Test Meeting,2024-06-16,Jane Smith,Absent`

    const result = parseElvantoCSV(csv)

    expect(result.records[0].status).toBe('present')
    expect(result.records[1].status).toBe('absent')
  })

  it('should handle multiple date formats', () => {
    const csv1 = `Meeting,Date,PersonName,Status
Test Meeting,2024-06-16,John Doe,Present`

    const csv2 = `Meeting,Date,PersonName,Status
Test Meeting,06/16/2024,John Doe,Present`

    const result1 = parseElvantoCSV(csv1)
    const result2 = parseElvantoCSV(csv2)

    expect(result1.records[0].date).toBe('2024-06-16')
    expect(result2.records[0].date).toBe('2024-06-16')
  })

  it('should handle optional fields', () => {
    const csv = `Meeting,Date,PersonName,Status
Test Meeting,2024-06-16,John Doe,Present`

    const result = parseElvantoCSV(csv)

    expect(result.records[0].time).toBeUndefined()
    expect(result.records[0].person_id).toBeUndefined()
    expect(result.records[0].attendance_percentage).toBeUndefined()
  })

  it('should parse percentage values', () => {
    const csv = `Meeting,Date,PersonName,Status,Percentage
Test Meeting,2024-06-16,John Doe,Present,100%
Test Meeting,2024-06-16,Jane Smith,Present,85.5
Test Meeting,2024-06-16,Bob Wilson,Present,120`

    const result = parseElvantoCSV(csv)

    expect(result.records[0].attendance_percentage).toBe(100)
    expect(result.records[1].attendance_percentage).toBe(85.5)
    expect(result.records[2].attendance_percentage).toBe(100) // Capped at 100
  })

  it('should reject CSV missing required columns', () => {
    const csv = `Meeting,Date,PersonName
Test Meeting,2024-06-16,John Doe`

    const result = parseElvantoCSV(csv)

    expect(result.summary.valid_records).toBe(0)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].error).toMatch(/missing.*required.*Status/i)
  })

  it('should skip rows with invalid dates', () => {
    const csv = `Meeting,Date,PersonName,Status
Test Meeting,2024-06-16,John Doe,Present
Test Meeting,invalid-date,Jane Smith,Present
Test Meeting,2024-06-17,Bob Wilson,Present`

    const result = parseElvantoCSV(csv)

    expect(result.summary.valid_records).toBe(2)
    expect(result.summary.invalid_rows).toBe(1)
    expect(result.errors[0].row).toBe(3)
  })

  it('should skip rows with missing required fields', () => {
    const csv = `Meeting,Date,PersonName,Status
Test Meeting,2024-06-16,John Doe,Present
,2024-06-16,Jane Smith,Present
Test Meeting,2024-06-17,Bob Wilson,Present`

    const result = parseElvantoCSV(csv)

    expect(result.summary.valid_records).toBe(2)
    expect(result.summary.invalid_rows).toBe(1)
  })

  it('should default unknown status to absent', () => {
    const csv = `Meeting,Date,PersonName,Status
Test Meeting,2024-06-16,John Doe,Unknown
Test Meeting,2024-06-16,Jane Smith,Maybe`

    const result = parseElvantoCSV(csv)

    expect(result.records[0].status).toBe('absent')
    expect(result.records[1].status).toBe('absent')
  })

  it('should handle empty CSV', () => {
    const result = parseElvantoCSV('')

    expect(result.summary.valid_records).toBe(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('should handle CSV with only headers', () => {
    const csv = 'Meeting,Date,PersonName,Status'

    const result = parseElvantoCSV(csv)

    expect(result.summary.valid_records).toBe(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('should trim whitespace from values', () => {
    const csv = `Meeting,Date,PersonName,Status
  Test Meeting  ,  2024-06-16  ,  John Doe  ,  Present  `

    const result = parseElvantoCSV(csv)

    expect(result.records[0].meeting_name).toBe('Test Meeting')
    expect(result.records[0].person_name).toBe('John Doe')
  })

  it('should handle CSV with extra columns', () => {
    const csv = `Meeting,Date,PersonName,Status,ExtraColumn,AnotherExtra
Test Meeting,2024-06-16,John Doe,Present,value1,value2`

    const result = parseElvantoCSV(csv)

    expect(result.summary.valid_records).toBe(1)
    expect(result.records[0].person_name).toBe('John Doe')
  })

  it('should be case-insensitive for column headers', () => {
    const csv = `meeting,DATE,personname,status
Test Meeting,2024-06-16,John Doe,Present`

    const result = parseElvantoCSV(csv)

    expect(result.summary.valid_records).toBe(1)
    expect(result.records[0].person_name).toBe('John Doe')
  })
})
