// Nova retention enforcement.
// Hard-deletes nova_messages after 90 days and non-action audit rows after 90 days.
// Action rows (is_action = true) are retained indefinitely.
// This runs under service-role credentials — the only job in Nova that does so.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RETENTION_DAYS = 90

export async function cleanupAuditData(
  serviceClient: ReturnType<typeof createClient>,
): Promise<{ messagesDeleted: number; auditRowsDeleted: number }> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const [messagesResult, auditResult] = await Promise.all([
    serviceClient
      .from('nova_messages')
      .delete()
      .lt('created_at', cutoff)
      .select('id', { count: 'exact', head: true }),

    serviceClient
      .from('nova_audit_log')
      .delete()
      .lt('created_at', cutoff)
      .eq('is_action', false)
      .select('id', { count: 'exact', head: true }),
  ])

  if (messagesResult.error) {
    console.error('nova cleanup: messages delete failed:', messagesResult.error.message)
  }
  if (auditResult.error) {
    console.error('nova cleanup: audit delete failed:', auditResult.error.message)
  }

  return {
    messagesDeleted: messagesResult.count ?? 0,
    auditRowsDeleted: auditResult.count ?? 0,
  }
}
