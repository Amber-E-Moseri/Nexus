import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve('supabase/migrations/20261002000001_add_jason_ikeokwu_pastors_pfcc.sql'),
  'utf8',
)

describe('Jason Ikeokwu PFCC/Pastors migration', () => {
  it('skips the production-only assignment when Jason is absent on fresh replay', () => {
    expect(migration).toContain(
      'RAISE NOTICE \'User matching "Jason Ikeokwu" not found in users table; skipping PFCC/Pastors assignment\'',
    )
    expect(migration).toMatch(/IF v_jason_id IS NULL THEN[\s\S]*RAISE NOTICE[\s\S]*RETURN;[\s\S]*END IF;/)
    expect(migration).not.toContain('RAISE EXCEPTION \'User matching "Jason Ikeokwu" not found')
  })

  it('preserves the assignment and required department invariants when Jason exists', () => {
    expect(migration).toContain("RAISE EXCEPTION 'Pastors department space not found'")
    expect(migration).toContain("RAISE EXCEPTION 'PFCC department space not found'")
    expect(migration).toMatch(/UPDATE users\s+SET department_id = v_pfcc\s+WHERE id = v_jason_id;/)
    expect(migration).toMatch(/INSERT INTO space_members \(space_id, user_id, role\)\s+VALUES \(v_pastors, v_jason_id, 'member'\)\s+ON CONFLICT \(space_id, user_id\) DO NOTHING;/)
  })
})
