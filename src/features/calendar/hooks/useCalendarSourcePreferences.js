// useCalendarSourcePreferences
// Per-user visibility toggles for Ministry Calendar sources (org calendar,
// Birthdays, Holidays, etc). Follows the same fail-open + delete-to-reset
// convention as useCategoryVisibility, but simpler — no org resolution
// needed at all, since ministry_calendar_sources has no org column and
// user_calendar_source_preferences is scoped by auth.uid() via RLS.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../hooks/useAuth'

export function useCalendarSourcePreferences() {
  const { profile } = useAuth()
  const [sources, setSources] = useState([])
  const [hiddenSourceIds, setHiddenSourceIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: sourceRows, error: sourcesErr } = await supabase
        .from('ministry_calendar_sources')
        .select('id, display_name, color, sync_enabled')
        .eq('sync_enabled', true)
        .order('display_name')
      if (sourcesErr) throw sourcesErr
      setSources(sourceRows ?? [])

      if (profile?.id) {
        const { data: prefRows, error: prefErr } = await supabase
          .from('user_calendar_source_preferences')
          .select('source_id')
          .eq('user_id', profile.id)
          .eq('hidden', true)
        if (prefErr) throw prefErr
        setHiddenSourceIds(new Set((prefRows ?? []).map((r) => r.source_id)))
      } else {
        setHiddenSourceIds(new Set())
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    load()
  }, [load])

  const toggleVisibility = useCallback(
    async (sourceId, currentlyHidden) => {
      if (!profile?.id) return
      const nextHidden = !currentlyHidden

      // Optimistic update.
      setHiddenSourceIds((prev) => {
        const next = new Set(prev)
        if (nextHidden) next.add(sourceId)
        else next.delete(sourceId)
        return next
      })

      try {
        if (nextHidden) {
          const { error: err } = await supabase
            .from('user_calendar_source_preferences')
            .upsert(
              { user_id: profile.id, source_id: sourceId, hidden: true, updated_at: new Date().toISOString() },
              { onConflict: 'user_id,source_id' },
            )
          if (err) throw err
        } else {
          const { error: err } = await supabase
            .from('user_calendar_source_preferences')
            .delete()
            .eq('user_id', profile.id)
            .eq('source_id', sourceId)
          if (err) throw err
        }
      } catch (e) {
        // Revert on failure.
        setHiddenSourceIds((prev) => {
          const next = new Set(prev)
          if (currentlyHidden) next.add(sourceId)
          else next.delete(sourceId)
          return next
        })
        setError(e.message)
        throw e
      }
    },
    [profile],
  )

  return { sources, hiddenSourceIds, loading, error, toggleVisibility, reload: load }
}
