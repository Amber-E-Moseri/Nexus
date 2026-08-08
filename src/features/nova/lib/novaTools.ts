// Nova Track B tool definitions (live-data questions).
//
// Exactly two tools for v1 — see the build prompt, section 5: "resist the
// urge to add more here even though it'd be easy." Widening this list is a
// deliberate future decision, not something to default into while building
// something adjacent.
//
// This is schema only (what Claude sees), not implementation — the actual
// Supabase queries live in the `nova-chat` edge function, executed with the
// asking user's own JWT so Postgres RLS does the access control.

export interface NovaToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  cache_control?: { type: 'ephemeral' }
}

export const NOVA_TOOL_NAMES = [
  'get_sprint_due_today',
  'get_my_followups_today',
  'get_my_work_summary',
  'get_onboarding_status',
  'get_department_health',
] as const
export type NovaToolName = (typeof NOVA_TOOL_NAMES)[number]

// The tool schema itself is stable across every call regardless of who's
// asking, so it gets the same single cache_control breakpoint treatment as
// the KB system block (section 4/5) — put it on the LAST tool in the array,
// which caches the whole tools block per Anthropic's prefix-caching rules.
export function buildNovaToolDefinitions(): NovaToolDefinition[] {
  return [
    {
      name: 'get_sprint_due_today',
      description:
        "Get tasks due today in the asking user's own active sprint(s). Use this ONLY for " +
        'the exact question "what\'s due today in my sprint" (or close paraphrases of it). ' +
        'Returns only sprints the user is a member of — never call this to look up another ' +
        "user's sprint or a sprint by name.",
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'get_my_followups_today',
      description:
        'Get everything the asking user needs to follow up on today: their own overdue tasks, ' +
        'their own tasks due today, their own incomplete meeting action items, and pending sprint ' +
        "access requests awaiting the user's approval on sprints they own or manage. NOTE: " +
        '"awaiting your response" currently covers sprint access requests ONLY — Nexus has no ' +
        'queryable pending-approval table for absence-email batches or other approval types yet, ' +
        'so those are not included even if the user asks about them by name; do not imply this ' +
        'tool checked for absence approvals. Use this ONLY for the exact question ' +
        '"what do I need to follow up on today" (or close paraphrases). Results are grouped by ' +
        'category (overdue tasks / due today / meeting action items / awaiting your response) — ' +
        'preserve that grouping in your answer rather than flattening it into one list.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'get_my_work_summary',
      description:
        "Summarize everything the asking user needs to know about their work today and this week: " +
        'tasks due today, tasks due this week, upcoming meetings, unresolved meeting action items, ' +
        'and their onboarding status if incomplete. Use this to answer "What should I focus on today?" ' +
        'or "What\'s my week looking like?" questions.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'get_onboarding_status',
      description:
        "Get the asking user's Nexus onboarding progress and next steps. Use this when the user " +
        'asks about onboarding, setup, or "what am I supposed to do next?"',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'get_department_health',
      description:
        "Get the asking user's department's operational health score and breakdown (if the user is " +
        'a department lead or admin). Includes task execution rate, meeting discipline, action ' +
        'follow-through, adoption metrics, and explainability. Use this when asked "How is our health?", ' +
        '"Are we keeping up?", or similar. Only department leads and admins can access this.',
      input_schema: { type: 'object', properties: {} },
      cache_control: { type: 'ephemeral' },
    },
  ]
}
