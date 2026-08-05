# Nova — Pre-Merge Checklist

Four items raised during the verification pass on `feature/nova-assistant`,
after the initial build was already functionally complete and its stated
acceptance criteria were re-verified against the real project. See
[NOVA_ASSISTANT.md](NOVA_ASSISTANT.md) for full detail on each.

- [ ] **Decide the fate of `get_my_followups_today`'s narrowed scope.**
      It now covers sprint access requests only, not absence approvals (no
      backing table exists for the latter) and not literally "sprint
      invites" (the real mechanism is access *requests*, which is a
      different UX than invite/accept). Either accept this as v1 scope and
      make sure nothing user-facing overstates coverage, or scope a real
      pending-approvals table as a near-term follow-up.

- [x] **Confirm the live edge function rejects unauthenticated / forged
      requests at the HTTP level**, not just "the UI won't call it wrong."
      Done — tested no-auth-header, garbage bearer token, and a
      structurally-valid-but-forged JWT (fake `user_role: super_admin`
      claim). All three rejected with 401; the forged-JWT case is caught by
      Supabase's platform gateway signature verification before the
      function's own code runs, so a crafted role claim is worthless
      without the real project signing secret.

- [ ] **Watch the admin review queue for track mislabeling in real usage.**
      One reproducible-in-principle-but-not-reliably-reproduced case of a
      how-to question spuriously triggering a tool call (mislabeling it
      `live_data` instead of `kb`) was found and the system prompt was
      tightened against it (0/6 on a follow-up round). Not provably
      eliminated — check `/admin/nova-review` periodically for the first
      couple of weeks post-launch for a recurring pattern, not just isolated
      flags.

- [ ] **Confirm Org Chart / People directory RLS scope before trusting the
      `tasks-department-visibility` KB entry.** It claims both are visible
      org-wide with no department restriction. Not verified in this pass —
      the `users` table SELECT policy has changed across 6 migrations and
      the current effective behavior wasn't traced. This is a
      privacy-adjacent claim (who can see whose contact info), so confirm
      it's actually true before end users see it as a stated fact from Nova.
