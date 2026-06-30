// useCategoryVisibility
// Builds the per-role visibility matrix for calendar event categories.
//
// Reads use the get_hidden_categories RPC (SECURITY DEFINER) so any authorised
// manager can build the matrix regardless of table RLS. Writes go directly to
// calendar_category_visibility:
//   - hide  (true -> false): upsert a row with visible=false
//   - show  (false -> true): delete the rule, reverting to the fail-open default

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../hooks/useAuth'
import { getEventTypes } from '../lib/calendar'

// Roles whose visibility is configurable. super_admin always sees everything.
export const TOGGLEABLE_ROLES = ['member', 'pastor', 'dept_lead', 'regional_secretary']

// Resolve the org id for the current user. The users profile doesn't carry it,
// so derive it from the user's department (departments.organization_id).
async function resolveOrgId(profile) {
  if (profile?.org_id) return profile.org_id

  if (profile?.department_id) {
    const { data } = await supabase
      .from('departments')
      .select('organization_id')
      .eq('id', profile.department_id)
      .maybeSingle()
    if (data?.organization_id) return data.organization_id
  }

  // Single-org fallback: any department's org.
  const { data } = await supabase
    .from('departments')
    .select('organization_id')
    .not('organization_id', 'is', null)
    .limit(1)
    .maybeSingle()
  return data?.organization_id ?? null
}

export function useCategoryVisibility() {
  const { profile } = useAuth()
  const [categories, setCategories] = useState([])
  const [matrix, setMatrix] = useState({})
  const [orgId, setOrgId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resolvedOrg = await resolveOrgId(profile)
      setOrgId(resolvedOrg)

      const cats = await getEventTypes() // [{ id, name, color }]
      setCategories(cats)

      // Hidden category names per role.
      const hiddenByRole = {}
      await Promise.all(
        TOGGLEABLE_ROLES.map(async (role) => {
          const { data, error: rpcErr } = await supabase.rpc('get_hidden_categories', {
            p_org_id: resolvedOrg,
            p_role: role,
          })
          if (rpcErr) throw rpcErr
          hiddenByRole[role] = new Set((data ?? []).map((r) => r.category))
        }),
      )

      const nextMatrix = {}
      for (const cat of cats) {
        nextMatrix[cat.name] = { super_admin: true }
        for (const role of TOGGLEABLE_ROLES) {
          // Default fail-open: visible unless an explicit hidden rule exists.
          nextMatrix[cat.name][role] = !hiddenByRole[role].has(cat.name)
        }
      }
      setMatrix(nextMatrix)
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
    async (category, role, currentValue) => {
      if (role === 'super_admin') return // always visible, never toggled
      if (!orgId) {
        setError('Could not resolve organization')
        throw new Error('Could not resolve organization')
      }

      const nextValue = !currentValue

      // Optimistic update.
      setMatrix((prev) => ({
        ...prev,
        [category]: { ...prev[category], [role]: nextValue },
      }))

      try {
        if (nextValue === false) {
          // Hide: persist an explicit visible=false rule.
          const { error: err } = await supabase
            .from('calendar_category_visibility')
            .upsert(
              {
                org_id: orgId,
                category,
                role,
                visible: false,
                created_by: profile?.id ?? null,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'org_id,category,role' },
            )
          if (err) throw err
        } else {
          // Show: remove the rule, reverting to the fail-open default.
          const { error: err } = await supabase
            .from('calendar_category_visibility')
            .delete()
            .eq('org_id', orgId)
            .eq('category', category)
            .eq('role', role)
          if (err) throw err
        }
      } catch (e) {
        // Revert on failure.
        setMatrix((prev) => ({
          ...prev,
          [category]: { ...prev[category], [role]: currentValue },
        }))
        setError(e.message)
        throw e
      }
    },
    [orgId, profile],
  )

  return { matrix, categories, orgId, loading, error, toggleVisibility, reload: load }
}
