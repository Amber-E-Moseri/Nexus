# RSVP System Schema Investigation
**Date:** 2026-06-25  
**Status:** Critical Gap Found - Tables Referenced but Not Created

---

## 1. EXACT COLUMN NAMES & TYPES

### Tables Referenced in Code (BUT NOT YET CREATED IN MIGRATIONS)

**Table: `invitation_campaigns`**
```sql
-- Expected based on code in Step4PreviewSend.jsx:88-92
-- This table is NOT defined in any migration file yet!

Columns (inferred from Step4PreviewSend):
- id: uuid (primary key)
- template_id: uuid (FK to invitation_templates)
- org_id: uuid (referenced in queries)
- created_by: uuid (FK to users)
- status: text ('draft', 'sent', 'scheduled', as mentioned in code line 82)
- content_data: jsonb (stores merged template content)
- recipient_count: integer
- scheduled_at: timestamptz (for scheduled sends)

Reference location: 
  src/components/invitations/Step4PreviewSend.jsx:78-92
  src/pages/communications/InvitationsListPage.jsx:103-115
```

**Table: `invitation_recipients`**
```sql
-- Expected based on code in Step4PreviewSend.jsx:98-110
-- This table is NOT defined in any migration file yet!

Columns (inferred from Step4PreviewSend):
- id: uuid (primary key)
- campaign_id: uuid (FK to invitation_campaigns)
- recipient_email: text
- recipient_name: text
- custom_fields: jsonb (stored but not used)
- status: text ('pending', 'sent', as mentioned in code)

Reference location:
  src/components/invitations/Step4PreviewSend.jsx:98-110
```

**Table: `invitation_templates`**
```sql
-- Status: EXISTS? Partial reference found
-- Referenced in: InvitationsListPage.jsx:111 (joins on it)
-- But actual schema definition not located

Inferred columns:
- id: uuid
- name: text
- content_slots: jsonb (mentioned in InvitationWizard.jsx:90)
```

### FINDINGS
❌ **Critical Issue:** `invitation_campaigns` and `invitation_recipients` are referenced in React code but **DO NOT EXIST** in migrations folder. The code will fail when trying to insert into these tables.

✅ The email campaign system uses:
- `communication_campaigns` (defined in 20260721000001_communication_infrastructure.sql)
- `communication_sends` (defined in same)

**This means event invitations are using a DIFFERENT table structure than email campaigns.**

---

## 2. ROLE-CHECK HELPER FUNCTIONS

### Found: `is_super_admin()` ✅

**Location:** `supabase/migrations/20260621000000_spaces_rls_security.sql:16-29`

```sql
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'super_admin'
  )
$$;
```

**Usage in RLS Policies:**
The communication system uses inline role checks, NOT the `is_super_admin()` function:

```sql
-- Pattern from 20260721000001_communication_infrastructure.sql
create policy "comm_campaigns_insert" on public.communication_campaigns for insert to authenticated
  with check ((auth.jwt() ->> 'role') in ('super_admin','dept_lead'));

create policy "comm_campaigns_delete" on public.communication_campaigns for delete to authenticated
  using ((auth.jwt() ->> 'role') = 'super_admin');
```

**For invitation_campaigns and invitation_recipients, we should use the same pattern:**
- Insert/Update: `(auth.jwt() ->> 'role') in ('super_admin','dept_lead')`
- Delete: `(auth.jwt() ->> 'role') = 'super_admin'`
- View: authenticated users can view all (or filtered by org_id)

**Alternative approach:** Create a helper like:
```sql
create or replace function public.is_dept_lead()
returns boolean as $$
  select (auth.jwt() ->> 'role') = 'dept_lead'
$$;
```

---

## 3. MIGRATION FILE NAMING CONVENTION

**Format:** `YYYYMMDDHHHMMM_description.sql`

**Examples from codebase:**
- `20260901000000_native_communications_system.sql` (9 AM, Sept 1, 2026)
- `20260830000000_notifications_table.sql` (8 AM, Aug 30, 2026)
- `20260721000001_communication_infrastructure.sql` (7 AM, July 21, 2026 - note the `_001` suffix)

**Pattern:**
1. Timestamp: `YYYYMMDDHHmmss` (seconds are usually `000000` or `000001`)
2. Underscore separator
3. Lowercase kebab-case description
4. `.sql` extension

**Next migration should be:** `20260625000000_invitation_system_schema.sql` or similar

---

## 4. EMAIL-SENDING FLOW (HOW RSVP TOKEN FITS IN)

### Current Event Invitation Email Flow

**File:** `src/lib/invitations/sendEmail.js`

**Flow:**
```
Step4PreviewSend.jsx
  └─> handleLaunchCampaign()
      ├─> Create invitation_campaigns row
      ├─> Create invitation_recipients rows
      └─> Call sendCampaignInvitations(campaignId, testMode)
          ├─ if testMode:
          │   └─> sendCampaignInvitationsTest()
          │       ├─ Fetch pending invitation_recipients
          │       └─ Mark status='sent' (no actual email)
          │
          └─ if production:
              └─> sendCampaignInvitationsProduction()
                  ├─ Get auth token from supabase.auth.getSession()
                  └─ POST to ${VITE_SUPABASE_URL}/functions/v1/send-invitations
                     └─ Payload: { campaignId }
```

**Edge Function:** `/functions/v1/send-invitations` (NOT in this repo, likely in Supabase functions)

### WHERE RSVP TOKEN FITS

**Option A: Generate in React, embed in email**
```javascript
// Step4PreviewSend.jsx would need to:
// 1. Generate UUID tokens for each recipient
// 2. Store in new invitation_recipients.rsvp_token column
// 3. Include link in email body: `https://nexus.app/rsvp?token=${rsvp_token}`
```

**Option B: Generate via Supabase function, embed in email**
```sql
-- Edge function send-invitations could:
-- 1. Create rsvp_token for each recipient
-- 2. Pass to email template
-- 3. Email includes: https://nexus.app/rsvp?token=${token}
```

**Option C: Use invitation_recipients.id as key** (simpler)
```
-- But less secure; anyone could increment IDs to see others' RSVPs
-- Use UUID tokens instead
```

**Recommendation:** Option B (generate in Supabase edge function)
- Tokens already generated server-side for user invitations (line 102 in 20260610000000)
- Pattern: `substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 48)`

---

## 5. PUBLIC/UNAUTHENTICATED ROUTES (WHERE RSVP FITS)

### Current Public Routes in App.jsx

```jsx
// Lines 86-99 of src/App.jsx
<Route path="/login" element={<Login />} />
<Route path="/signup" element={<SignupInvite />} />
<Route path="/forgot-password" element={<ForgotPassword />} />
<Route path="/reset-password" element={<ResetPassword />} />
<Route path="/set-password" element={<SetPassword />} />
<Route path="/confirm-invite" element={<ConfirmInvite />} />
<Route path="/activate" element={<ActivateInvitation />} />
<Route path="/accept-invite" element={<ActivateInvitation />} />
<Route path="/auth/google-drive/callback" element={<GoogleDriveAuthCallback />} />
// ... other auth callbacks ...
<Route path="/reports/:share_token" element={<MeetingReportPublicPage />} />
```

### Pattern for RSVP Route

Based on `/activate?token=...` pattern (from ActivateInvitation.jsx:12):

```jsx
// Add to App.jsx (around line 92)
<Route path="/rsvp" element={<RSVPPage />} />
```

**Usage:**
```
https://nexus.app/rsvp?token=abc123def456...
```

### ActivateInvitation Pattern ✅ (Model for RSVP)

**File:** `src/pages/ActivateInvitation.jsx`

**Key aspects:**
1. Gets token from URL params: `params.get('token')`
2. Calls `previewInvitation(token)` to load data (uses RPC function `preview_user_invitation()`)
3. Validates token and shows preview
4. User enters password, calls `acceptInvitation()` RPC
5. Returns updated user object
6. Redirects to dashboard after success

**For RSVP, we'd follow similar pattern:**
1. Get token from URL params
2. Call `previewInvitationRsvp()` RPC to get invitation details
3. Show UI with event info + RSVP options (Yes/No/Maybe)
4. Submit choice via `submitRsvp()` RPC
5. Show confirmation
6. No authentication required

---

## 6. MIGRATION TIMESTAMP FORMAT DETAIL

### Real Examples from Codebase

```
20260610000000_invitation_delivery.sql
   │         │
   └─ Date ──┘ Time (always 000000 for midnight)

20260721000001_communication_infrastructure.sql
                 ^^^^^^^^ Note the _001 suffix when multiple migrations same day

20260905000002_milestone_templates.sql
                ^^^^^^^^ Multiple migrations in same hour
```

### Meaning
- `2026` = Year 2026
- `06` = June (month 6)
- `25` = Day 25
- `000000` = 00:00:00 (midnight UTC)
- After timestamp: optional `_NNN` suffix if multiple migrations same second

---

## 7. ROUTER & ROUTE SETUP

**Router:** React Router v6 (detected from imports: `Routes`, `Route`, `useNavigate`, `useSearchParams`)

**Location:** `src/App.jsx`

**Missing Routes for Event Invitations:**
```jsx
// These routes are USED in code but NOT defined in App.jsx:
❌ /communications/invitations/new    (navigated to in InvitationsListPage.jsx:219)
❌ /communications/invitations/:id    (navigated to in Step4PreviewSend.jsx:123)
❌ /communications/invitations/:id/edit  (not yet, but might be needed)
```

**Required additions to App.jsx (around line 300):**
```jsx
// Import the components first
const InvitationWizard = lazy(() => import('./pages/communications/InvitationWizard'))
const InvitationDetailPage = lazy(() => import('./pages/communications/InvitationDetailPage'))

// Then add routes inside <Route element={<Shell />}>
<Route
  path="/communications/invitations/new"
  element={
    <ProtectedRoute roles={['super_admin', 'dept_lead']}>
      <InvitationWizard />
    </ProtectedRoute>
  }
/>
<Route
  path="/communications/invitations/:campaignId"
  element={
    <ProtectedRoute roles={['super_admin', 'dept_lead']}>
      <InvitationDetailPage />
    </ProtectedRoute>
  }
/>
```

---

## 8. SUPABASE CLIENT SETUP

**File:** `src/lib/supabase.js`

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
```

**Usage:**
```javascript
// Anywhere in the codebase:
import { supabase } from '@/lib/supabase'

const { data, error } = await supabase
  .from('table_name')
  .select('columns')
  .eq('column', 'value')
```

---

## SUMMARY TABLE

| Item | Finding | Status |
|------|---------|--------|
| invitation_campaigns table | Referenced in code, NOT in migrations | ❌ Missing |
| invitation_recipients table | Referenced in code, NOT in migrations | ❌ Missing |
| invitation_templates table | Partially referenced, schema unclear | ⚠️ Needs validation |
| Role check pattern | `(auth.jwt() ->> 'role') in (...)` | ✅ Clear |
| is_super_admin() function | Exists, but not used in comm system | ✅ Available |
| Migration naming | `YYYYMMDDhhmmss_kebab-case.sql` | ✅ Clear |
| Email sending flow | Calls edge function `/send-invitations` | ✅ Clear |
| RSVP token placement | Should embed in email sent by edge function | 📋 Plan needed |
| Public RSVP route | Should follow `/activate` pattern | 📋 Needs creation |
| Missing auth routes | `/communications/invitations/new`, `/:id` | ❌ Missing |
| Router type | React Router v6 | ✅ Clear |
| Supabase client | Exported from `src/lib/supabase.js` | ✅ Clear |

---

## CRITICAL NEXT STEPS (Before RSVP Planning)

1. **Create `invitation_campaigns` and `invitation_recipients` tables** via migration
   - File: `20260625000000_invitation_system_schema.sql`
   - Include columns for rsvp_token and rsvp tracking
   
2. **Add missing routes** to `src/App.jsx`
   - `/communications/invitations/new` → InvitationWizard
   - `/communications/invitations/:campaignId` → InvitationDetailPage

3. **Clarify `invitation_templates` schema**
   - Find existing definition or create it in new migration
   - Ensure content_slots structure is documented

4. **Create RPC functions for RSVP**
   - `submit_rsvp_response(token, response)` - for public RSVP submission
   - `preview_invitation_rsvp(token)` - for public invitation preview

5. **Create public RSVP page component**
   - File: `src/pages/RSVPPage.jsx`
   - Route: `/rsvp?token=...`
   - Pattern: Similar to `ActivateInvitation.jsx`

---

**Next Action:** Confirm whether `invitation_campaigns` and `invitation_recipients` should exist. If not in migrations, we need to create them. If they exist elsewhere (e.g., created manually in Supabase), we need to document the schema.
