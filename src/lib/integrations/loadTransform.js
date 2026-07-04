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
