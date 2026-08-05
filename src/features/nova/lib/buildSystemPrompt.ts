// Nova system prompt assembly (Track A: how-to/FAQ knowledge base).
//
// Pure, framework-agnostic module — no Supabase client, no fetch, no
// Vite/React imports. It only turns already-fetched KB rows into the system
// prompt blocks the Anthropic Messages API expects. This lets the same file
// be imported both from the frontend (for token-count preflighting/tests)
// and from the `nova-chat` Deno edge function via a relative path, without
// either runtime needing the other's module resolution.
//
// Caching contract (see CLAUDE.md build prompt, section 4):
// - One cache_control breakpoint, on the single system block that carries
//   the instructions + KB content. That block is stable across requests for
//   a given role, so repeated questions from users sharing a role hit cache.
// - The user's question is NEVER part of the cached block — it's sent as a
//   separate `messages` entry, appended fresh every call.
// - Default (5-minute) ephemeral TTL. Do not upgrade to the 1-hour TTL
//   without usage data justifying it — see section 4 of the build prompt.

export const NOVA_ROLES = ['super_admin', 'regional_secretary', 'dept_lead', 'pastor', 'member'] as const
export type NovaRole = (typeof NOVA_ROLES)[number]

export interface NovaKbEntry {
  slug: string
  question: string
  answer: string
  feature_area: string
  applicable_roles: string[]
  related_slugs?: string[]
}

export interface NovaSystemBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

// Explicit, not implied — this is the load-bearing guardrail that keeps Nova
// inside its two jobs. Every word of the "do not guess" / "read-only" /
// "who to ask" instructions is required by the build prompt verbatim intent;
// don't soften this when editing.
const GUARDRAIL_INSTRUCTIONS = `You are Nova, the in-app assistant for BLW CAN NEXUS. You have exactly two jobs:

1. Answer how-to and FAQ questions about using Nexus, using ONLY the knowledge base below.
2. Answer two specific live-data questions about the asking user's own work, using your tools:
   - "What's due today in my sprint?" → use the get_sprint_due_today tool
   - "What do I need to follow up on today?" → use the get_my_followups_today tool

Only call a tool when the question IS one of those two live-data questions (or an
unambiguous paraphrase of one). A how-to/FAQ question is answered from the knowledge
base alone — never call a tool "just in case" it might add useful context to a
how-to answer. Calling a tool changes how this conversation gets logged and labeled
to the user, so a speculative tool call on a plain how-to question is a real mistake,
not a harmless extra step.

Give full, detailed answers — walk through the steps, don't just summarize. This is
the assistant's primary value, so depth matters more than brevity. Explain the "why"
where it helps, not just the destination.

You are strictly read-only. Do not attempt to create, edit, delete, or change
anything in Nexus, even if asked directly — politely decline and explain that you
can only look things up, not make changes.

You are not a general-purpose chatbot. If a question is not answered by the
knowledge base above and does not match one of your two tools, say honestly that
you don't know, and direct them to: the Help & FAQ page (in Apps → Help & FAQ),
or to a Super Admin if it's a platform/cross-department question. Do not guess,
do not improvise an answer from general knowledge about project-management software,
and do not attempt questions about other users' data, general knowledge, or anything
outside these two jobs (e.g. "what's the weather", "summarize this document",
"create a task for me"). A polite "that's not something I can help with" is the
correct response to those.

Never merge knowledge base content across roles. Only use the entries provided to
you below — they have already been filtered to the asking user's role.

Each knowledge base entry below is tagged with a [slug] identifier. Some entries
also have a RELATED line listing slugs of foundational or related entries.

After giving your full answer, if any KB entry you used has a RELATED list, look
up each listed slug in the knowledge base and briefly suggest those questions at
the end of your answer — for example: "**You might also want to know:** [question
text from that entry]." Only include entries that actually appear in this KB and
are genuinely relevant to what was asked. List at most 3 suggestions; omit
entirely if none are relevant. Keep each suggestion to one short line. Place
these before the KB_USED line.

End every response with a final line, on its own, in exactly this machine-readable
form (the caller strips this line before showing your answer to the user, so it
does not need to read naturally):
KB_USED: slug-one,slug-two
List every entry slug you actually drew on to answer. If you answered using a
tool instead of the knowledge base, or you gave the "I don't know" fallback, or
you declined an out-of-scope request, write exactly: KB_USED: none`

function formatKbEntry(entry: NovaKbEntry): string {
  let text = `[${entry.slug}] Q: ${entry.question}\nA: ${entry.answer}`
  if (entry.related_slugs && entry.related_slugs.length > 0) {
    text += `\nRELATED: ${entry.related_slugs.join(',')}`
  }
  return text
}

// Grouped by feature_area so the model has topical locality when scanning —
// purely a readability aid, has no effect on caching or correctness.
export function formatKbBlock(entries: NovaKbEntry[]): string {
  if (entries.length === 0) {
    return '(No knowledge base entries are currently available for your role.)'
  }

  const byArea = new Map<string, NovaKbEntry[]>()
  for (const entry of entries) {
    const list = byArea.get(entry.feature_area) ?? []
    list.push(entry)
    byArea.set(entry.feature_area, list)
  }

  const sections: string[] = []
  for (const [area, areaEntries] of byArea) {
    const heading = area.replace(/_/g, ' ').toUpperCase()
    sections.push(`--- ${heading} ---\n${areaEntries.map(formatKbEntry).join('\n\n')}`)
  }
  return sections.join('\n\n')
}

/**
 * Build the cached system block(s) for a given role's KB entries. Callers
 * MUST have already filtered `entries` to `status = 'active'` and this
 * role being present in `applicable_roles` — this function does not
 * re-filter, so it stays a pure formatter with no knowledge of RLS.
 */
export function buildNovaSystemBlocks(role: NovaRole, entries: NovaKbEntry[]): NovaSystemBlock[] {
  const kbBlock = formatKbBlock(entries)
  const text = `${GUARDRAIL_INSTRUCTIONS}\n\n=== KNOWLEDGE BASE (role: ${role}) ===\n\n${kbBlock}`

  return [
    {
      type: 'text',
      text,
      // Single top-level breakpoint per section 4 — one stable block, not
      // per-sub-block breakpoints. The KB is the only thing that needs to
      // survive across requests; everything variable (the question) lives
      // outside this block entirely.
      cache_control: { type: 'ephemeral' },
    },
  ]
}

export function isNovaRole(value: unknown): value is NovaRole {
  return typeof value === 'string' && (NOVA_ROLES as readonly string[]).includes(value)
}

export interface ParsedNovaResponse {
  text: string
  kbSlugsUsed: string[]
}

// Strips the "KB_USED: ..." marker line the system prompt asks the model to
// emit as its final line (see GUARDRAIL_INSTRUCTIONS above) and returns the
// slugs it named, so the caller can log nova_query_log.kb_entries_used
// against real citations instead of "every entry that was in context."
//
// Deliberately NOT anchored to end-of-string. An end-anchored match is only
// correct if the model reliably puts the marker exactly last with nothing
// trailing it — if it ever emits the marker mid-response and then keeps
// talking (a model formatting slip, not something the caller can prevent),
// an end-anchored regex simply fails to match and the raw "KB_USED: ..."
// line leaks straight into the user-facing answer. A leaked internal tag in
// a chat response is a real defect, not a cosmetic one, so this scans for
// and strips every line matching the marker anywhere in the text, however
// many times it appears, and unions the cited slugs across all of them.
const KB_USED_LINE = /^[ \t]*KB_USED:[ \t]*([^\n]*?)[ \t]*$/gim

export function parseKbUsedTrailer(rawText: string): ParsedNovaResponse {
  let kbSlugsUsed: string[] = []
  let matched = false

  const stripped = rawText.replace(KB_USED_LINE, (_full, list: string) => {
    matched = true
    const listed = list.trim()
    if (listed && listed.toLowerCase() !== 'none') {
      kbSlugsUsed = kbSlugsUsed.concat(
        listed.split(',').map((s) => s.trim()).filter(Boolean),
      )
    }
    return ''
  })

  if (!matched) return { text: rawText.trim(), kbSlugsUsed: [] }

  // Removing the marker line(s) can leave a run of blank lines behind
  // (e.g. "answer\n\n" + "" + "\n\n" from a trailing marker) — collapse
  // those so the visible answer doesn't end with dangling whitespace.
  const text = stripped.replace(/\n{3,}/g, '\n\n').trim()
  return { text, kbSlugsUsed: [...new Set(kbSlugsUsed)] }
}
