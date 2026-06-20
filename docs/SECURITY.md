# Security Policy & RLS Architecture

## RLS (Row Level Security) Philosophy

All tables with user-scoped or department-scoped data have RLS enabled. The default posture is:
- **Deny by default** — policies explicitly grant access, nothing is public unless intentional
- **Role-based gates** — roles (super_admin, dept_lead, etc.) determine access
- **Department/space scoping** — data is typically bound to a department or space the user is a member of

## Service Role Usage

Service role is used **only** for scheduled/automated operations that run outside user sessions:

### 1. Campaign Scheduling & Retry
**Functions**: `fire_scheduled_campaigns()`, `check_and_fire_campaigns_manually()`, `retry_failed_campaign()`
**Files**: `20260722000000_scheduled_sends.sql`, `20260729000000_scheduled_sends_retry_and_bounce_management.sql`
**Purpose**: Trigger edge functions that send transactional emails
**Scope**: Read-only access to service_role_key from `app_settings` table; calls specific edge function
**Risk Level**: Low
**Why needed**: Edge functions must use service role to bypass RLS when sending emails (user sessions don't exist in that context)

### 2. Configuration Storage
**Table**: `app_settings`
**RLS**: No policies (only service role / security-definer functions can read)
**Contains**: Supabase URL and service role key for scheduled operations
**Access**: Only by security-definer functions, never directly from client

**⚠️ Critical**: Never expose service_role_key to the client. It is configured server-side only.

---

## Recent RLS Hardening (2026-07-31)

### What Was Fixed
Migration `20260731000000_rls_coverage_hardening.sql` addresses:

1. **Missing RLS** on `campaign_link_clicks` and `email_bounces`
   - Both now restricted to dept_lead+ (analytics/management role)

2. **Overly Permissive Policies** on communication tables
   - `communication_segments`, `communication_campaigns`, `communication_sends`, `communication_ab_tests`
   - `communication_contacts`, `communication_categories`, `communication_contact_categories`
   - All changed from `USING (true)` → `USING ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead'))`

3. **Task Status Definitions** hardened
   - Now scopes to department-level or space membership instead of global visibility

### What Remains Public (Intentional)
- `communication_unsubscribes` — anonymous insert allowed (unsubscribe link)
- `meeting_attendance_reports` — public reporting dashboard
- `expected_attendees` — attendance tracking (review if this should be scoped)

**Action**: If public reporting tables should be department-scoped, uncomment the policies in the migration and test.

---

## RLS Audit Checklist

Before deploying new features:

- [ ] All new tables have `alter table public.{table} enable row level security;`
- [ ] Every table with RLS has at least one SELECT policy
- [ ] No policies use `USING (true)` or `WITH CHECK (true)` without explicit role checks
- [ ] Service role usage is documented (why, scope, risk)
- [ ] Unsubscribe / webhook endpoints are validated server-side (not just RLS)
- [ ] Public/anonymous access is intentional and reviewed

---

## Key Functions & Their RLS Philosophy

### User-Facing Functions
- `is_space_member()` — checks space membership (any role)
- `can_view_space()` — checks if user can see a space (inherited from space_members or dept_lead)
- `can_manage_space()` — checks if user can modify a space (owner/manager role or dept_lead)
- `is_super_admin()` — simple check (used in many policies)

### Webhook/Scheduled Functions (Service Role)
- `handle_bounce_event()` — updates `email_bounces` (from Resend webhook)
- `select_ab_test_winner()` — calculates A/B test metrics (called from analytics)
- `calendar_approver_ids()` — lists approvers (so submitters can notify them)

---

## Testing RLS

To verify RLS is working correctly:

```sql
-- Test as regular user (should see nothing or minimal data)
set role authenticated;
set request.jwt.claims = '{"sub":"user-uuid","role":"member"}';
select * from communication_campaigns;  -- Should fail or return no rows

-- Test as dept_lead (should see campaigns)
set role authenticated;
set request.jwt.claims = '{"sub":"user-uuid","role":"dept_lead","department_id":"dept-id"}';
select * from communication_campaigns;  -- Should return user's campaigns

-- Test as super_admin (should see all)
set role authenticated;
set request.jwt.claims = '{"sub":"user-uuid","role":"super_admin"}';
select * from communication_campaigns;  -- Should return all campaigns
```

---

## Incident Response

If a data breach or unauthorized access is suspected:

1. **Check app_settings for service_role_key compromise**
   - If exposed, regenerate immediately in Supabase dashboard
   - Update `app_settings` table with new key

2. **Review recent RLS changes** — search migrations for `drop policy` to see what was changed

3. **Audit logs** — check `activity_log` table for suspicious patterns

4. **Webhook validation** — if Resend or other webhooks are involved, verify:
   - Origin IP/signature validation
   - Payload authenticity

---

## References

- [Supabase RLS Docs](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- This project's audit: [RLS Audit Report](./SECURITY_AUDIT_2026-07-31.md)
