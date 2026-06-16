import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useMatchReport() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const run = useCallback(async ({ subgroup } = {}) => {
    setLoading(true)
    setError(null)
    try {
      // Fetch active expected attendees
      let query = supabase
        .from('expected_attendees')
        .select('id, subgroup, full_name, leadership_category, match_key')
        .eq('active', true)
        .order('subgroup')
        .order('full_name')

      if (subgroup) query = query.eq('subgroup', subgroup)

      const { data: expected, error: eErr } = await query
      if (eErr) throw new Error(eErr.message)

      // Fetch all people for client-side join (roster is small)
      const { data: people, error: pErr } = await supabase
        .from('people')
        .select('id, first_name, last_name, people_category, demographics')
      if (pErr) throw new Error(pErr.message)

      // Build lookup by match_key
      const peopleMap = new Map()
      for (const p of people ?? []) {
        const key = `${p.first_name ?? ''} ${p.last_name ?? ''}`.toLowerCase().replace(/\s+/g, ' ').trim()
        peopleMap.set(key, p)
      }

      const result = (expected ?? []).map((e) => {
        const person = peopleMap.get(e.match_key ?? '') ?? null
        return {
          id: e.id,
          subgroup: e.subgroup,
          expected_name: e.full_name,
          leadership_category: e.leadership_category,
          matched: person !== null,
          actual_name: person ? `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim() : null,
          people_category: person?.people_category ?? null,
          demographics: person?.demographics ?? null,
        }
      })

      setRows(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  return { rows, loading, error, run }
}
