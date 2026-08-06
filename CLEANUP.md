# Portfolio Cleanup Checklist

Items found in the codebase that reference the real organization name, real people's names, internal system names, or production infrastructure. These should be addressed before this repository is made public.

**This file is for tracking — nothing below has been changed automatically.**

---

## 1. Organization Identity (Pervasive)

- **`package.json`** — `"name": "blw-canada-os"` → rename to `"nexus"` or `"nexus-platform"`
- **`public/canada_sr.png`** — org logo used in the sidebar; replace with a generic placeholder
- String `"BLW CAN NEXUS"` appears as the platform brand name in sidebar labels, email templates, notification copy, the unsubscribe page, Nova's system prompt, and more — do a global find across `src/` and replace with `"Nexus"` or your chosen portfolio brand name
- `"BLW Canada Sub-Region"` — `src/features/meetings/components/MeetingReportTab.jsx` (~line 2656)
- `"BLW Canada"` / `"BLW CAN"` — appears in map components, type labels, `HelpPage.jsx`

---

## 2. Hardcoded Email Addresses

| File | Line | Value |
|------|------|-------|
| `src/components/emails/InvitationEmail.tsx` | 38 | `invites@blwcannexus.ca` |
| `src/features/communications/components/CampaignEditor.jsx` | 342 | `noreply@blwcannexus.ca` |
| `src/features/communications/components/SendConfirmationModal.jsx` | 41 | `noreply@blwcannexus.ca` |
| `src/tests/jwtClaims.test.js` | 137, 144 | `admin@blwcanada.org` |

Replace with placeholder values like `noreply@example.com` or move to environment variables.

---

## 3. Production URLs

| File | Line | URL |
|------|------|-----|
| `src/pages/HelpPage.jsx` | 591 | `https://nexus.blwcanada.org` (PWA install instructions) |
| `src/pages/HelpPage.jsx` | 643 | `nexus.lwcanada.org/api/mcp` (MCP connector instructions) |
| `src/pages/admin/EmailAdminPage.jsx` | 56, 121 | `https://nexus.lwcanada.org` (hardcoded email preview base URL) |
| `src/components/emails/InvitationEmail.tsx` | 54 | `https://blwcannexus.ca/logo.png` |
| `src/pages/growth/GrowthTrackingPage.jsx` | 1231 | `leaders.lwcanada.org` (external data source) |
| `src/features/registration/RegistrationEcosystem.jsx` | 2339 | `leaders.lwcanada.org` (same external source) |

Move production base URLs to `VITE_APP_URL` / `VITE_FRONTEND_URL` environment variables where possible. For the logo URL, serve the asset locally.

---

## 4. Real Person's Name Hardcoded in Logic

- **`src/pages/spaces/SpaceOverview.jsx` line 123** — string comparison `'amber moseri'` used to identify a specific org member and customize their dashboard view. This is identity logic that belongs in a database flag (`is_primary_contact BOOL` or similar), not a hardcoded name. Should be refactored before publication.

---

## 5. Internal System Names

- **`Elvanto`** — referenced by name in `src/lib/csv/elvanto-attendance-parser.ts` and `src/components/meetings/AttendanceImportModal.jsx` (import UI says "Export CSV from Elvanto"). Elvanto is a real third-party church management system. Decide whether to name it (it identifies the org's vertical) or genericize the label to "your attendance management system."
- **`blwcan_spotify`** — localStorage key in `src/components/map/PrayerMode.jsx` lines 68, 196. Contains the org abbreviation; rename to a generic key like `nexus_prayer_spotify`.
- **`RockSolid`** — referenced in the edge function folder name `supabase/functions/rocksolid-sync/`. RockSolid is a real church management system. Consider renaming the folder to `roster-sync-external` or similar.

---

## 6. Internal Data Embedded in Source

- **`src/features/registration/RegistrationEcosystem.jsx` line ~249** — `BLW University of Manitoba` and `BLW University of Winnipeg` are hardcoded as exempt fellowships in business logic. Generalize or extract to a config table.
- **`src/tests/documentUpload.test.js`** — uses `BLW_Minutes_` as a document name prefix in test assertions. Update to a generic prefix.

---

## 7. Migration Filenames Containing Real People's Names

The following migration filenames reveal real individuals' names. The files themselves may be safe (they likely contain `GRANT` SQL), but the filenames appear in `git log` and `git blame`:

```
*_grant_moseriamber_dept_lead.sql
*_grant_natasha_media_dept_lead.sql
*_rooms_access_grant_nigel.sql
*_grant_sharon_finance_access.sql
*_delete_test_user_aemoseri.sql
*_pastor_toby_meetings_private.sql
*_assign_subgroup_credamoseri.sql
```

Also: `tii2_*` migrations reference an internal event name ("This Is It 2").

**Note:** Renaming these files does not remove them from git history. Options:
- Publish the repo without the `supabase/migrations/` folder (provide a schema dump instead)
- Use `git filter-repo` to rewrite history (destructive; loses accurate authorship timestamps)
- Leave migrations as-is and accept that filenames are visible in history (they contain no credentials or sensitive data beyond names)

---

## 8. Files to Audit Before Publishing

- **`supabase/seed.sql`** — may contain real user emails, campus names, or org-specific seed data. Audit before publishing; replace real values with generic placeholders.
- **`docs/`** (~60 files) — contains internal operational documentation. Several files likely reference real people's names, internal process details, or configuration that shouldn't be public. Audit each file or exclude the folder from the portfolio repo.
- **`apps/meeting-os/`** — a separate embedded app with its own `package.json`; inspect for hardcoded org references before including.
- **`blwdiag/`** — diagnostics tooling; inspect for hardcoded connection strings or internal endpoint references.
- **`vercel.json`** — may contain production domain rewrites or environment references; audit before publishing.
- **`api/README.md`** — the MCP server README may reference production URLs or internal instructions.

---

## 9. Git Config

- **Git user name** is set to a real full name. If you want the portfolio repo's commit history to be pseudonymous, this would need to be rewritten — but that's a personal preference, not a privacy requirement.
