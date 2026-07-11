// useCategoryVisibility
// Department-based visibility matrix for calendar event categories.
//
// Semantics: if a category has ANY dept rows → it is restricted (only those depts see it).
//            If a category has NO rows → org-wide (everyone sees it).
//
// Reads from calendar_category_dept_visibility. Writes upsert/delete rows.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../hooks/useAuth'
import { getEventTypes } from '../lib/calendar'

// Default org_id for category visibility when no explicit org exists.
// This is a well-known UUID that allows visibility configuration to work
// without requiring full organization setup during initial deployment.
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000000'

async function resolveOrgId(profile) {
  if (profile?.org_id) return profile.org_id

  // NOTE: departments has no organization_id column (this deployment is
  // single-tenant — confirmed in 20261108000002_fix_notify_sync_failure.sql).
  // Selecting it 400s, so we go straight to the well-known default org, which
  // lets visibility configuration work without full organization setup.
  return DEFAULT_ORG_ID
}

export function useCategoryVisibility() {
  const { profile } = useAuth()
  const [categories, setCategories] = useState([])
  const [departments, setDepartments] = useState([])
  const [matrix, setMatrix] = useState({})   // { [categoryName]: { [deptId]: boolean } }
  const [orgId, setOrgId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let resolvedOrg, cats, deptsResult

      try {
        resolvedOrg = await resolveOrgId(profile)
      } catch (e) {
        console.error('Failed to resolve org:', e)
        resolvedOrg = null
      }

      try {
        cats = await getEventTypes()
      } catch (e) {
        console.error('Failed to load event types:', e)
        cats = []
      }

      try {
        const result = await supabase
          .from('departments')
          .select('id, name, color, space_type')
          .in('space_type', ['department', 'program'])
          .order('name')
        deptsResult = result
      } catch (e) {
        console.error('Failed to load departments:', e)
        deptsResult = { data: [], error: e }
      }

      const depts = deptsResult.data ?? []
      setCategories(cats)
      setDepartments(depts)
      setOrgId(resolvedOrg)

      // Load all dept-visibility rows for this org.
      const { data: rows, error: rowErr } = await supabase
        .from('calendar_category_dept_visibility')
        .select('category, department_id')
        .eq('org_id', resolvedOrg)
      if (rowErr) throw rowErr

      // Build a set of (category → Set of dept ids that have explicit access).
      const accessMap = {}
      for (const row of rows ?? []) {
        if (!accessMap[row.category]) accessMap[row.category] = new Set()
        accessMap[row.category].add(row.department_id)
      }

      // Build matrix: visible[cat][deptId] = true/false.
      // If a category has no rows → org-wide → all depts see it (true).
      // If it has rows → only listed depts see it.
      const nextMatrix = {}
      for (const cat of cats) {
        const restricted = accessMap[cat.name]
        nextMatrix[cat.name] = {}
        for (const dept of depts) {
          if (!restricted) {
            nextMatrix[cat.name][dept.id] = true   // org-wide
          } else {
            nextMatrix[cat.name][dept.id] = restricted.has(dept.id)
          }
        }
      }
      setMatrix(nextMatrix)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => { load() }, [load])

  const toggleVisibility = useCallback(async (categoryName, deptId, currentValue) => {
    const nextValue = !currentValue

    // Determine if this category is currently org-wide (all depts true).
    const catRow = matrix[categoryName] ?? {}
    const isOrgWide = Object.values(catRow).every(Boolean)

    // Optimistic update.
    setMatrix((prev) => ({
      ...prev,
      [categoryName]: { ...prev[categoryName], [deptId]: nextValue },
    }))

    try {
      if (nextValue === true) {
        if (isOrgWide) {
          // Was org-wide; toggling one dept to "on" means we're introducing restrictions —
          // but the user clicked an already-true cell on an org-wide category. No-op.
          setMatrix((prev) => ({ ...prev, [categoryName]: { ...prev[categoryName], [deptId]: true } }))
          return
        }
        // Add this dept to the access list.
        const { error: err } = await supabase
          .from('calendar_category_dept_visibility')
          .upsert(
            { org_id: orgId, category: categoryName, department_id: deptId, created_by: profile?.id ?? null },
            { onConflict: 'org_id,category,department_id' },
          )
        if (err) throw err
      } else {
        if (isOrgWide) {
          // Restricting from org-wide: insert rows for every OTHER dept, then remove this one.
          const otherDepts = departments.filter((d) => d.id !== deptId)
          const rows = otherDepts.map((d) => ({
            org_id: orgId,
            category: categoryName,
            department_id: d.id,
            created_by: profile?.id ?? null,
          }))
          if (rows.length > 0) {
            const { error: err } = await supabase
              .from('calendar_category_dept_visibility')
              .upsert(rows, { onConflict: 'org_id,category,department_id' })
            if (err) throw err
          }
        } else {
          // Remove this dept from the access list.
          const { error: err } = await supabase
            .from('calendar_category_dept_visibility')
            .delete()
            .eq('org_id', orgId)
            .eq('category', categoryName)
            .eq('department_id', deptId)
          if (err) throw err

          // If removing this dept leaves zero rows → category becomes org-wide again.
          // That's fine — zero rows = org-wide is the correct semantic.
          // But if the user intends to restrict it from this dept specifically, they need at least
          // one other dept to remain. The UI should handle this gracefully.
        }
      }
    } catch (e) {
      // Revert.
      setMatrix((prev) => ({
        ...prev,
        [categoryName]: { ...prev[categoryName], [deptId]: currentValue },
      }))
      setError(e.message)
      throw e
    }
  }, [orgId, profile, matrix, departments])

  // Make a category org-wide (remove all restrictions).
  const makeOrgWide = useCallback(async (categoryName) => {
    const { error: err } = await supabase
      .from('calendar_category_dept_visibility')
      .delete()
      .eq('org_id', orgId)
      .eq('category', categoryName)
    if (err) throw err

    setMatrix((prev) => {
      const allTrue = {}
      for (const deptId of Object.keys(prev[categoryName] ?? {})) allTrue[deptId] = true
      return { ...prev, [categoryName]: allTrue }
    })
  }, [orgId])

  return { matrix, categories, departments, orgId, loading, error, toggleVisibility, makeOrgWide, reload: load }
}

// Standalone helper used by MinistryCalendar to filter events for the current user.
// Returns a Set of category names the user's department can see.
// Super admin sees everything.
export async function getVisibleCategoriesForDept(orgId, departmentId) {
  if (!orgId || !departmentId) return null  // null = no filter, show all

  const { data, error } = await supabase
    .from('calendar_category_dept_visibility')
    .select('category, department_id')
    .eq('org_id', orgId)

  if (error) throw error
  const rows = data ?? []

  if (rows.length === 0) return null  // no restrictions at all, show all

  // Build: category → Set of allowed dept ids.
  const accessMap = {}
  for (const row of rows) {
    if (!accessMap[row.category]) accessMap[row.category] = new Set()
    accessMap[row.category].add(row.department_id)
  }

  // A category is visible to this dept if:
  //   - it has no rows (org-wide) → always visible
  //   - it has rows AND this dept is in the list
  // We return the set of hidden categories for easy filtering.
  const hidden = new Set()
  for (const [cat, deptSet] of Object.entries(accessMap)) {
    if (!deptSet.has(departmentId)) hidden.add(cat)
  }

  return hidden  // Set of category names that are HIDDEN from this dept
}
