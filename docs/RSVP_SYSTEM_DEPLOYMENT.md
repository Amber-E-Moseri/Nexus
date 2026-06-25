# RSVP System Deployment Guide

**Date:** 2026-06-25  
**Version:** 1.0  
**Status:** Ready for Phase 1 Testing

---

## Pre-Deployment Checklist

### Database Layer
- [x] Migration file created: `20260625000000_invitation_system_core_schema.sql`
  - Tables: `invitation_campaigns`, `invitation_recipients`, `invitation_activity_log`
  - Indexes: 7 performance indexes on frequently queried columns
  - RLS policies: Enforced for both tables (org-level isolation)
  - Triggers: Auto-update RSVP counts and sent timestamps
- [x] RPC functions migration created: `20260625000001_rsvp_rpc_functions.sql`
  - `create_invitation_recipients_batch()` — Bulk insert with token generation
  - `submit_rsvp()` — Public RSVP submission (no auth)
  - `get_campaign_guest_list()` — Fetch guests by RSVP status
  - `get_campaign_rsvp_summary()` — RSVP analytics (counts, response rate)
  - `queue_invitation_reminders()` — Prepare 3-day and 1-day reminders

### Backend Services
- [x] Token generation library: `src/lib/rsvpTokens.js`
  - `generateRsvpToken()` — 48-char cryptographically secure token
  - `isValidRsvpTokenFormat()` — Format validation before DB query
  - Collision probability: ~1 in 2.4 × 10^83
- [x] Reminder edge function: `supabase/functions/send-invitation-reminders/index.ts`
  - Fetches pending reminders from database
  - Sends HTML emails via Resend
  - Handles 3-day and 1-day reminder types
- [x] Email integration updates
  - RSVP token embedded in campaign emails
  - RSVP links formatted as `/rsvp?token={token}`
  - Reminders include event details and RSVP link

### Frontend
- [x] Public RSVP page: `src/pages/communications/RSVPPage.jsx`
  - No authentication required
  - States: loading → form → submitted (or error)
  - RSVP buttons: Yes, Maybe, No
  - Optional notes field
  - Token validation via format check
- [x] Admin detail page enhanced: `src/pages/communications/InvitationDetailPage.jsx`
  - Added tabs: Delivery & Opens | RSVP Responses | Analytics
  - RSVP response breakdown (Yes/Maybe/No/Pending counts)
  - Response rate visualization
  - Guest list with filterable RSVP status
  - Real-time updates via Supabase subscriptions
- [x] App routing updated: `src/App.jsx`
  - Public route `/rsvp` added (outside `<Shell>`)
  - No authentication required for guest-facing page

### Testing
- [x] Permission tests: `src/tests/rsvp.permission.test.js`
  - 15+ test cases covering:
    - Token format validation
    - RSVP response validation
    - RLS policy enforcement
    - Email status tracking
    - RSVP count calculations

---

## Deployment Steps

### 1. Pre-deployment Verification

```bash
# Verify git branch
git branch
# Output: feature/rsvp-system

# Check file creation
ls supabase/migrations/20260625000000_invitation_system_core_schema.sql
ls supabase/migrations/20260625000001_rsvp_rpc_functions.sql
ls supabase/functions/send-invitation-reminders/index.ts
ls src/lib/rsvpTokens.js
ls src/pages/communications/RSVPPage.jsx
```

### 2. Database Migration

```bash
# Start local Supabase
supabase start

# Apply migrations
supabase migration up

# Verify tables created
supabase db list
# Expected output:
# ✓ invitation_campaigns
# ✓ invitation_recipients
# ✓ invitation_activity_log

# Verify RPC functions exist
supabase db exec "SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name LIKE 'create_invitation%';"
```

### 3. Edge Function Deployment

```bash
# Deploy reminder function
supabase functions deploy send-invitation-reminders

# Verify deployment
supabase functions list
# Expected: send-invitation-reminders (enabled)

# Test invocation (manual)
curl --request POST 'http://127.0.0.1:54321/functions/v1/send-invitation-reminders' \
  --header 'Authorization: Bearer <ANON_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{"reminderType": "3d"}'
```

### 4. Email Service Configuration

```bash
# Verify Resend API key is set
echo $RESEND_API_KEY

# Update environment variables (if needed)
# RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
```

### 5. Frontend Build & Test

```bash
# Install dependencies
npm install

# Type check
npm run type-check

# Run unit tests
npm test rsvp

# Build
npm run build

# Preview build
npm run preview
```

### 6. End-to-End Manual Testing

#### Scenario 1: Create and Send Campaign
1. Navigate to Communications → Invitations
2. Click "New Invitation"
3. Fill event details:
   - Title: "Test RSVP Event"
   - Date: 2 weeks from today
   - Time: 6:00 PM
   - Location: "Test Venue"
4. Upload recipients (CSV with name, email columns)
5. Review and send
6. **Verify:** Recipients receive email with embedded RSVP token

#### Scenario 2: Guest RSVP Flow
1. Guest opens email and clicks "Yes, I'm Coming!"
2. Redirected to `/rsvp?token=ABC...XYZ` (48-char token)
3. Page loads with event details
4. Guest optionally adds notes
5. Click "Confirm RSVP"
6. **Verify:** Page shows "✓ You're Confirmed!"
7. **Verify:** Admin sees guest in "Yes" list with timestamp

#### Scenario 3: Admin Views Analytics
1. Host opens campaign detail page
2. Click "RSVP Responses" tab
3. **Verify:** Shows updated counts (Yes, Maybe, No, Pending)
4. Click "Analytics" tab
5. **Verify:** Response rate bar and breakdown chart visible
6. **Verify:** Stats update in real-time as guests RSVP

### 7. Production Deployment

```bash
# Commit changes
git add -A
git commit -m "feat: implement Phase 1 RSVP system (DB, backend, frontend)"

# Push to remote
git push origin feature/rsvp-system

# Create PR on GitHub
gh pr create --title "feat: implement RSVP system (Evite-competitive)" \
  --body "Adds invitation campaigns, guest RSVP tracking, and analytics."

# After PR approval, merge to main
git checkout main
git merge feature/rsvp-system

# Deploy to Supabase production
supabase db push --linked  # Requires --linked flag for production

# Deploy edge functions to production
supabase functions deploy send-invitation-reminders --linked

# Verify production deployment
# Check Supabase dashboard: https://app.supabase.com
# - Tables created in public schema
# - RPC functions callable
# - Edge functions deployed
```

### 8. Schedule Reminders (Optional: Cron Setup)

#### Option A: pg_cron (Scheduled via Supabase)
```sql
-- Schedule 3-day reminder at 9am daily
select cron.schedule('send-3d-reminders', '0 9 * * *', $$
  select http_post(
    'https://PROJECT_ID.supabase.co/functions/v1/send-invitation-reminders',
    jsonb_build_object('reminderType', '3d'),
    jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    )
  );
$$);

-- Schedule 1-day reminder at 9am daily
select cron.schedule('send-1d-reminders', '0 9 * * *', $$
  select http_post(
    'https://PROJECT_ID.supabase.co/functions/v1/send-invitation-reminders',
    jsonb_build_object('reminderType', '1d'),
    jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    )
  );
$$);
```

#### Option B: Manual Trigger (No Cron Setup Required)
```jsx
// In admin dashboard or scheduled cloud function
async function sendRemindersManually(reminderType) {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/send-invitation-reminders`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reminderType }), // '3d' or '1d'
    }
  );
  const data = await response.json();
  console.log(`Reminders sent: ${data.remindersSent}`);
}
```

---

## Validation & Monitoring

### Database Validation

```sql
-- Check table row counts
SELECT 'invitation_campaigns' as table_name, count(*) as rows FROM invitation_campaigns
UNION ALL
SELECT 'invitation_recipients', count(*) FROM invitation_recipients
UNION ALL
SELECT 'invitation_activity_log', count(*) FROM invitation_activity_log;

-- Verify RLS is enabled
SELECT tablename, hasindexes, hasrules FROM pg_tables 
WHERE tablename IN ('invitation_campaigns', 'invitation_recipients');

-- Check trigger execution
SELECT trigger_schema, trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE event_object_table IN ('invitation_recipients', 'invitation_campaigns');
```

### Application Monitoring

```javascript
// Log RSVP submissions (for analytics)
supabase
  .channel('rsvp-submissions')
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'invitation_recipients' },
    (payload) => {
      console.log('RSVP submitted:', {
        campaign_id: payload.new.campaign_id,
        response: payload.new.rsvp_response,
        timestamp: payload.new.rsvp_at,
      });
    }
  )
  .subscribe();
```

### Email Delivery Tracking

- Monitor Resend dashboard for bounce rates and complaints
- Set up Resend webhook to log delivery events
- Alert if bounce rate > 2% or complaint rate > 0.1%

### Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Email delivery | 98%+ | Resend logs + webhook tracking |
| RSVP page load | <2s | Browser DevTools Network tab |
| Token uniqueness | 100% | SQL query: `SELECT COUNT(DISTINCT rsvp_token) FROM invitation_recipients` |
| RLS enforcement | 100% | Test with different user roles |
| Admin analytics load | <1s | React DevTools Profiler |

---

## Troubleshooting

### Migrations Won't Apply
```bash
# Check migration syntax
supabase migration validate

# View migration errors
supabase migration up --debug

# Rollback if needed (local only)
supabase migration down
```

### RSVP Tokens Not Generating
- Verify `crypto` module is available in Node.js runtime
- Check token format: Should be exactly 48 alphanumeric characters
- Test token generation: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"

### Reminders Not Sending
- Verify `RESEND_API_KEY` environment variable is set
- Check edge function logs: `supabase functions logs send-invitation-reminders`
- Verify campaign `reminder_3d_sent` and `reminder_1d_sent` flags
- Check email recipient status (pending, sent, bounced)

### RLS Policy Blocking Queries
- Verify JWT claims include `org_id` and `role`
- Test RLS with admin token first (should always work)
- Check policy conditions with specific org IDs

---

## Post-Deployment (Phase 2 & 3)

### Phase 2: Approval Workflows
- Dept_leads approve invitations before send
- Audit trail of approvers
- Scheduled send option (send later)

### Phase 3: Attendance Reconciliation
- Compare RSVP "yes" vs actual attendance
- Identify no-shows and last-minute cancellations
- Auto-generate follow-up tasks for attendance gaps

### Phase 4: Integration with Calendar & Tasks
- Auto-sync events to calendar when campaign sent
- Create action items from meeting minutes
- Link attendance to pastoral follow-ups

---

## Support & Documentation

- **Schema Documentation:** Comments in migration files
- **RPC Function Docs:** Inline comments and parameter descriptions
- **Frontend Component Docs:** JSDoc comments in React components
- **Email Integration:** See `RESEND_SETUP.md`
- **Token Security:** See `TOKEN_SECURITY.md`

---

## Rollback Plan

If critical issues are discovered post-deployment:

```bash
# Local rollback (DEV only)
supabase migration down

# Production rollback (requires careful coordination)
# 1. Keep migrations in place (cannot undo)
# 2. Disable RSVP features in frontend (feature flag)
# 3. Stop sending reminders (disable cron)
# 4. Notify users of maintenance window
# 5. Apply hotfix migration
```

---

**Deployment completed by:** Amber Moseri  
**Date:** 2026-06-25  
**Next review:** 2026-07-02 (Phase 1 testing complete)
