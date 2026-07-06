/**
 * Normalises a raw row from external_integrations (as returned by Supabase)
 * into the shape the UI expects. Columns added in June-Nov 2026 migrations
 * may be null on pre-migration rows — defaults are applied here and nowhere else.
 *
 * Pure function: no side-effects, safe to unit-test without a Supabase client.
 */
export function migrateIntegrationRow(row) {
  return {
    ...row,
    scope: row.scope ?? 'global',
    department_ids: row.department_ids ?? [],
    user_ids: row.user_ids ?? [],
  }
}

/**
 * Builds the DB payload for an insert/update from draft UI state.
 * Nulls out the sibling scope arrays so switching e.g. departments→users
 * doesn't leave stale department_ids in the DB.
 *
 * Pure function: no side-effects, safe to unit-test without a Supabase client.
 */
export function buildSavePayload(draft) {
  const scope = draft.scope ?? 'global'

  return {
    name: draft.name.trim(),
    type: draft.type,
    launch_url: draft.launch_url.trim(),
    description: draft.description?.trim() || null,
    icon_emoji: draft.icon_emoji?.trim() || null,
    visible_to: draft.visible_to,
    enabled: Boolean(draft.enabled),
    show_in_sidebar: Boolean(draft.show_in_sidebar),
    sort_order: draft.sort_order ?? 0,
    scope,
    department_ids: scope === 'departments' ? (draft.department_ids ?? []) : null,
    user_ids: scope === 'users' ? (draft.user_ids ?? []) : null,
  }
}
