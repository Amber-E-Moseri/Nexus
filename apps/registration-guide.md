# Registration System — Setup & Handoff Guide

**For super_admin users:** This guide is now integrated into Nexus. Go to **Apps** → **Event Setup Guide** for the interactive version with time estimates, progress checkboxes, and expandable steps.

This markdown version is the detailed reference. It covers how to launch, configure, and swap the registration system for a new regional program. Programs are not run simultaneously — this guide assumes you're replacing one event with the next.

**Quick reference:**
- **First-time setup:** ~1.5–2 hours
- **Repeat event:** 45 min–1 hour  
- **Total steps:** 8 (from sprint creation to access verification)

---

## Before You Start — Questions to Answer First

Work through this section before touching any code or data. The answers feed every step below.

### Event identity
- [ ] What is the **full event name**? *(e.g. "This Is It 2.0", "Atmosphere Conference")*
- [ ] What **sprint name** will you use in Nexus? Must be exact — the code does a `LIKE '%<name>%'` match.
- [ ] What **subgroups** exist? *(e.g. Zone A, Zone B, Youth, Partners)*
- [ ] Are there any **fellowships exempt from flying** (expected to drive instead)? List them.

### Teams
- [ ] What **teams** will be part of this event? *(Secretariat, Finance, Transportation, etc.)*  
  Whoever is on a team gets access to the `/registration` page.
- [ ] Who is on the **Accommodation / Room Coordination** team? *(Gets room assignment tab)*
- [ ] Who needs **finance tab access** that is NOT already on a team?  
  Finance tab is gated separately via `user_grants` with `grant_type = 'finance_data_access'`.
- [ ] Who needs **room assignment access** but isn't on the Accommodation team?  
  Add a `user_grants` row with `grant_type = 'rooms_access'`.

### Access & visibility
- [ ] Who should see the **public share link** (read-only registration overview)?  
  The link is token-gated — anyone with the URL can view it. Share deliberately.
- [ ] Should pastors have a **scoped view** (only their own subgroup), or full access?  
  Scoped view is on by default for `role = 'pastor'`.
- [ ] Which users need access to the **Programs space** in Nexus?  
  Programs space members automatically get Rooms tab access.
- [ ] Do you want the public share link **active from day one** or only once registration opens?

### External forms & API
- [ ] What is the **registrations form URL** from lwcanada.org?  
  Format: `https://leaders.lwcanada.org/api/forms/<FORM_ID>/submissions`
- [ ] What is the **flights/travel form URL** (if applicable)?
- [ ] Who generates and holds the **NEXUS_API_KEY** Supabase secret?  
  Needed to connect the Google Sheet Apps Script.

---

## Step 1 — Create the Sprint in Nexus

1. Go to **Sprints** → Create new sprint.
2. Name it exactly as decided above — the code matches on this string.
3. Create all **teams** inside the sprint (one team per function group).
4. Add team members to each team.

> The sprint teams gate access to `/registration`. If someone's name isn't in a team in this sprint, they cannot enter the page.

---

## Step 2 — Update the Code (6 files)

These are the only files that need to change between events. Make all edits in a single PR.

### 2a. Sidebar — `src/components/layout/Sidebar.jsx`

**Sprint name match** (line ~343):
```js
// Change this:
.ilike('name', '%This Is It 2.0%')
// To:
.ilike('name', '%Your New Event Name%')
```

**Nav label** (line ~795):
```js
// Change this:
"This Is It Registration"
// To:
"Your Event Registration"
```

**Team list** (lines ~330–339) — replace `REGISTRATION_TEAMS` with this event's team names:
```js
const REGISTRATION_TEAMS = [
  'Secretariat and Planning',
  'Registration',
  'Finance',
  'Transportation',
  // ... etc
]
```

---

### 2b. Registration page gate — `src/pages/events/RegistrationPage.jsx`

**Sprint name match** (line ~56):
```js
.ilike('name', '%Your New Event Name%')
```

**`allowedTeams` array** (lines ~40–49) — must match the team names you created in the sprint exactly:
```js
const allowedTeams = [
  'Secretariat and Planning',
  'Finance',
  // ... etc
]
```

---

### 2c. Registration ecosystem — `src/features/registration/RegistrationEcosystem.jsx`

**Sprint name match** (line ~343):
```js
.ilike('name', '%Your New Event Name%')
```

**Page header text** (line ~784):
```js
// Change "This Is It 2.0" to your event name
```

**Exempt fellowships** (line ~30):
```js
const EXEMPT_FELLOWSHIPS = new Set([
  // Fellowships expected to DRIVE (not fly)
  'BLW University of Manitoba',
  'BLW University of Winnipeg',
  // Add or remove for your event's location
])
```

**Rooms access grants** — Instead of hardcoding name checks, use `user_grants` with `grant_type = 'rooms_access'`. Example:
```sql
-- Run in Supabase SQL editor to grant rooms access to a specific user:
insert into user_grants (user_id, grant_type, granted_by)
values ('<user-uuid>', 'rooms_access', '<your-uuid>');
```
The code now checks `user_grants` automatically — no need for name-based hacks.

---

### 2d. Public page header — `src/pages/events/RegistrationPublicPage.jsx`

**Header and footer text** (lines ~131, ~303):
```js
// Line 131:
"Your New Event Name"
// Line 303:
"BLW Canada Nexus · Your New Event Name · Shared registration view"
```

---

### 2e. Bulk email edge function — `supabase/functions/registration-bulk-email/index.ts`

**Email subheader** (line ~54):
```ts
// Change "This Is It 2.0 Registration" to your event name
```

Deploy after editing:
```bash
supabase functions deploy registration-bulk-email
```

---

### 2f. API sync edge function — `supabase/functions/registration-api-sync/index.ts`

Update the two form URLs at the top of the file:
```ts
const REGISTRATIONS_FORM_URL =
  'https://leaders.lwcanada.org/api/forms/<NEW_FORM_ID>/submissions'
const FLIGHTS_FORM_URL =
  'https://leaders.lwcanada.org/api/forms/<NEW_FLIGHTS_FORM_ID>/submissions'
```

Deploy after editing:
```bash
supabase functions deploy registration-api-sync
```

---

## Step 3 — Clear Old Event Data

> **Do this only after TII2 is fully wrapped up.** This is irreversible — export anything you need first.

Run in the **Supabase SQL editor**:

```sql
-- Clear all five registration tables for the new event
truncate table registrations  restart identity cascade;
truncate table roster          restart identity cascade;
truncate table working_list    restart identity cascade;
truncate table event_payments  restart identity cascade;

-- Clear all config (targets, room assignments, public token)
delete from registration_config;
```

After clearing, verify the Registration page shows 0 records before doing anything else.

---

## Step 4 — Set Up the Google Sheet & Apps Script

1. **Make a copy** of the TII2 Google Sheet (or create a new one with the same column headers).
2. Open **Extensions → Apps Script**.
3. Paste the contents of `src/features/registration/appScript.gs` into the editor.
4. In Apps Script: go to **Project Settings → Script Properties** and add:

| Property | Value |
|---|---|
| `NEXUS_API_URL` | `https://blwcannexus.vercel.app/functions/v1/registrations-sync` |
| `NEXUS_API_KEY` | *(the key from Step 5 below)* |

5. Save and run `onOpen()` once to register the custom menu.
6. Test: **Nexus Sync → Sync Working List to Nexus** — should succeed with no errors.

> The `HEADER_MAP` in `appScript.gs` maps your sheet's column headers to Nexus fields. If the new form uses different column names, update `HEADER_MAP` to match. The column matching is exact-string — check spelling carefully.

---

## Step 5 — API Key: Set, Rotate, or Recover

The `NEXUS_API_KEY` is a Supabase Edge Function secret that authenticates the Google Sheet → Nexus sync.

### First-time setup
```bash
supabase secrets set NEXUS_API_KEY=<generate-a-long-random-string>
```

### If the key has expired or was rotated
```bash
# 1. Generate a new key (use any secure random generator)
# 2. Update the Supabase secret:
supabase secrets set NEXUS_API_KEY=<new-key>

# 3. Update the Google Sheet Apps Script property:
# Go to Extensions → Apps Script → Project Settings → Script Properties
# Update NEXUS_API_KEY to the new value

# 4. Test immediately: run "Sync Working List to Nexus" from the sheet menu
```

### To verify what key is currently set
```bash
supabase secrets list
```
This shows key names only (not values). If `NEXUS_API_KEY` appears in the list, it's set.

### If the edge function rejects all requests (401 errors)
- Check the key in Apps Script matches exactly (no trailing space, no quotes)
- Re-deploy the sync function in case the secret wasn't picked up:
  ```bash
  supabase functions deploy registration-api-sync
  supabase functions deploy registrations-sync
  ```

---

## Step 6 — Generate the Public Share Token

Once data is loading correctly:

1. Go to `/registration` → **Data** tab.
2. Scroll to **Public Share Link**.
3. Click **Generate link**.
4. Copy the URL and share with whoever needs read-only access (subgroup leaders, exec team, etc.).

The link shows: name, subgroup, fellowship, registration status — no emails or phone numbers.

### To expire a token
Click **Remove link** in the Data tab. The old URL immediately returns empty results. Generate a new one if needed.

### If the token stops working
The `get_public_registration_data` RPC reads the token from `registration_config` where `key = 'public_token'`. If the row was accidentally deleted, regenerating from the UI recreates it.

> **Note:** The config key is now generic (`'public_token'`), so future events don't need code changes to the RPC — only update the string literals in the 6 UI files.

---

## Step 7 — Set Up Finance Access

Finance tab access is controlled by a separate `user_grants` table — independent of team membership.

```sql
-- Grant finance access
insert into user_grants (user_id, grant_type, granted_by)
values ('<user-uuid>', 'finance_data_access', '<your-uuid>');

-- Revoke (when event is done or person changes)
delete from user_grants
where user_id = '<user-uuid>' and grant_type = 'finance_data_access';
```

To find a user's UUID:
```sql
select id, name, email from users where name ilike '%<name>%';
```

---

## Step 8 — Verify Access End to End

Before going live, test each access tier with a real account (or ask the person to try):

| Role | Expected access |
|---|---|
| super_admin / regional_secretary | All tabs: Roster, Registrations, Delegates Compliance, Flights, Finance, Room Assignment |
| Accommodation team member | All tabs including Room Assignment (no Finance) |
| Finance grant holder | All tabs including Finance (no Room Assignment unless also on Accommodation) |
| Programs space member | All tabs including Room Assignment |
| Any other event team member | Roster, Registrations, Delegates Compliance, Flights |
| Pastor (scoped) | Roster tab only, filtered to their subgroup |
| No team / no grant | Cannot access `/registration` at all |

---

## Troubleshooting

**"Access denied" on `/registration`**  
The person isn't in any sprint team for this event. Add them to a team in the Nexus Sprint page.

**Sync button does nothing / no data appears**  
- Check Apps Script properties (`NEXUS_API_URL`, `NEXUS_API_KEY` are set)
- Open Apps Script → Run → `syncAllToNexus` manually and read the execution log
- Confirm the edge functions are deployed: `supabase functions list`

**Rooms tab is missing**  
User isn't a super_admin, regional_secretary, Programs space member, or Accommodation team member. Add them to the Accommodation sprint team.

**Public link returns empty page**  
Token was deleted or never generated. Go to Data tab → Generate link.

**API sync returns 401**  
Rotate the API key (Step 5 above).

**Registrations not matching roster names**  
The name-fuzzy-matching in `registration-api-sync` strips honorifics and normalises spacing. If someone registered as "Sis Jane Smith" and the roster has "Jane Smith", it should match. If it doesn't, check the roster `full_name` column for extra characters or encoding issues.
