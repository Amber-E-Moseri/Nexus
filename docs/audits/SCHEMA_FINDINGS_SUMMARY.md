# Schema Investigation - Executive Summary

## 🚨 CRITICAL FINDING
The React code references `invitation_campaigns` and `invitation_recipients` tables (in Step4PreviewSend.jsx:88-110), but **these tables do not exist in any migration file**. The code will fail when you try to save an invitation campaign.

---

## 1. EXACT COLUMN NAMES & TYPES (From Code Analysis)

### invitation_campaigns (MISSING FROM MIGRATIONS)
```
- id: uuid (PK)
- template_id: uuid
- org_id: uuid  
- created_by: uuid
- status: text ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed')
- content_data: jsonb (event details: name, date, time, venue, rsvp_by, rsvp_email)
- recipient_count: integer
- scheduled_at: timestamptz (nullable)
- created_at: timestamptz
- updated_at: timestamptz
```

### invitation_recipients (MISSING FROM MIGRATIONS)
```
- id: uuid (PK)
- campaign_id: uuid (FK invitation_campaigns)
- recipient_email: text
- recipient_name: text
- custom_fields: jsonb
- status: text ('pending', 'sent', 'failed', 'opened', 'clicked')
- sent_at: timestamptz (nullable)
- created_at: timestamptz
```

**Add for RSVP phase:**
- `invitation_recipients.rsvp_token` - secure token
- `invitation_recipients.rsvp_response` - 'pending', 'yes', 'no', 'maybe'
- `invitation_recipients.rsvp_at` - timestamptz when RSVP submitted

---

## 2. ROLE-CHECK HELPER FUNCTION

**Location:** `supabase/migrations/20260621000000_spaces_rls_security.sql:16-29`

```sql
create or replace function public.is_super_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'super_admin'
  )
$$;
```

**Current pattern used in communications RLS (NOT using the function):**
```sql
(auth.jwt() ->> 'role') in ('super_admin','dept_lead')  -- for insert/update
(auth.jwt() ->> 'role') = 'super_admin'                 -- for delete
```

**Recommendation:** Use same pattern for invitation tables RLS policies.

---

## 3. MIGRATION NAMING CONVENTION

**Format:** `YYYYMMDDhhmmss_kebab-case-description.sql`

**Examples:**
- `20260901000000_native_communications_system.sql`
- `20260721000001_communication_infrastructure.sql` ← note `_001` for same-day multiple
- `20260625000000_your_migration_here.sql` ← next one

**Pattern:**
- Timestamp always includes full datetime (usually `000000` for midnight)
- Multiple same-day migrations use `_001`, `_002` suffix
- Description is lowercase with hyphens, no spaces

---

## 4. EMAIL-SENDING FLOW (How RSVP Token Gets Embedded)

**Current flow:**
```
Step4PreviewSend.jsx → Create invitation_campaigns & invitation_recipients rows
  ↓
sendCampaignInvitations(campaignId)
  ↓
Production: POST /functions/v1/send-invitations with { campaignId }
  ↓
Edge function (in Supabase) sends emails
```

**For RSVP token:**
- Generate token BEFORE edge function is called (in React or in migration)
- Store in `invitation_recipients.rsvp_token` 
- Edge function inserts token into email body as: `https://nexus.app/rsvp?token=${token}`

**Token generation pattern (from 20260610000000):**
```sql
substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 48)
```

---

## 5. PUBLIC/UNAUTHENTICATED ROUTES

**Pattern from existing code:**

```jsx
// App.jsx lines 92-93 (user signup activation)
<Route path="/activate" element={<ActivateInvitation />} />
<Route path="/accept-invite" element={<ActivateInvitation />} />
```

**For RSVP, add similar public route:**
```jsx
<Route path="/rsvp" element={<RSVPPage />} />
// Usage: https://nexus.app/rsvp?token=abc123
```

**ActivateInvitation.jsx pattern to follow:**
1. Get token from query param: `params.get('token')`
2. Call RPC preview function to load data
3. Validate/render preview
4. User submits response (password for activate, RSVP choice for invitations)
5. Call RPC submit function
6. Show confirmation & redirect

**Missing routes in App.jsx:**
```
❌ /communications/invitations/new       (InvitationWizard)
❌ /communications/invitations/:campaignId (InvitationDetailPage)
```

These need to be added inside `<Route element={<Shell />}>` with `<ProtectedRoute roles={['super_admin', 'dept_lead']}>`.

---

## 6. SUPABASE CLIENT SETUP

**File:** `src/lib/supabase.js`

```javascript
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
})
```

Usage everywhere: `import { supabase } from '@/lib/supabase'`

---

## 7. ROUTER TYPE

**React Router v6**
- Uses: `<Routes>`, `<Route>`, `useNavigate()`, `useSearchParams()`
- Protected routes via `<ProtectedRoute roles={[...]}>` wrapper
- Both authenticated and public routes supported

---

## IMMEDIATE BLOCKERS (Must fix first)

1. **Create invitation_campaigns and invitation_recipients migrations**
   - They don't exist but code references them
   - Migration file: `20260625000000_invitation_system_schema.sql`
   - Include RSVP columns from start

2. **Add routes to App.jsx**
   - `/communications/invitations/new` 
   - `/communications/invitations/:campaignId`

3. **Verify invitation_templates schema**
   - Code mentions `content_slots` but schema unclear
   - May already exist, but confirm

---

**See detailed findings in:** [`RSVP_SCHEMA_INVESTIGATION.md`](RSVP_SCHEMA_INVESTIGATION.md)
