# Nova — Role-Aware AI Assistant

## Problem

Staff members repeatedly asked the same operational questions — how to invite someone to a sprint, what tasks were due that day, how the attendance reporting cycle worked — either by messaging colleagues or going unanswered. A searchable knowledge base existed but wasn't discoverable in context. The organization needed an assistant that could answer how-to questions and surface live task data without hallucinating about organizational state.

## Key Technical Decisions

**Intentionally narrow tool surface.** Nova has exactly two live-data tools, both backed by Supabase RPCs called from the `nova-chat` Deno edge function: `get_sprint_due_today` (tasks due in the requesting user's active sprint) and `get_my_followups_today` (follow-up items for the day). Everything else is answered from the knowledge base or explicitly declined. This boundary was a deliberate product decision — a richer tool surface (arbitrary task queries, meeting history, etc.) would require trusting the model to scope its own queries correctly, introducing hallucination risk for a user base that wasn't expecting an AI system to make mistakes.

**Role-filtered knowledge base.** `nova_knowledge_base` entries carry an `allowed_roles` array. The `nova-chat` edge function builds the system prompt at request time from only the entries the requesting user's role can see. A new team member's Nova instance surfaces onboarding and task management articles; an administrator's instance also includes permissions, integration, and platform configuration documentation. Knowledge base entries are managed through an admin UI and reviewed via `/admin/nova-review`.

**Prompt caching on the knowledge block.** The system prompt — which includes the full text of role-filtered knowledge base articles — is sent to the Anthropic API with `cache_control: ephemeral` on the system message block. On repeated queries within the cache window, the prefix is reused, significantly reducing input token costs for a large static knowledge block that changes rarely.

**Streaming SSE responses.** The `nova-chat` edge function reads from Anthropic's streaming API and re-streams the response as Server-Sent Events to the client. `NovaChat.jsx` renders tokens as they arrive using `EventSource`, giving the assistant a conversational feel without waiting for the full response before displaying anything.

## Schema Highlights

- `nova_knowledge_base`: `title`, `content` (Markdown), `allowed_roles TEXT[]`, `area` category enum, `active BOOL`, `sort_order`
- `nova_query_log`: `user_id`, `user_message`, `assistant_response`, `tools_called JSONB`, `feedback` enum (thumbs_up, thumbs_down, null), `created_at`
- Admin review page (`/admin/nova-review`) shows log entries with feedback filtering and role context for quality auditing

## Engineering Challenge: Review Context Without Storing Assembled Prompts

The admin review page needs to show the full system prompt that was active during any given query — context that explains why Nova answered the way it did. Storing the entire assembled system prompt per query would be expensive (each prompt includes the full KB article text) and would create a storage-intensive audit trail.

The review page instead re-assembles the system prompt at review time: given the `user_id` from the log entry, it fetches that user's role and re-runs the same KB filtering logic used at query time. This is fast and cheap, but it means the review reflects the current knowledge base state, not the state when the query ran — a KB article that has been edited since the query was logged will appear in its current form during review. This is documented as a known limitation: the review page is a debugging tool, not an audit log. A future version could snapshot the KB version ID alongside the log entry and diff against it.
