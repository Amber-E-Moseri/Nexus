# Release 1 — Local Testing Checklist

## Prerequisites ✓
- [x] Docker Desktop installed (not running yet, will start below)
- [x] Supabase CLI installed
- [x] Node 18+ and npm available
- [x] Current directory: `C:\Users\moser\Downloads\clickup`

## Step 1: Start Services

```bash
# Open a terminal and run:
supabase start
```

Wait for output like:
```
API URL: http://localhost:54321
Studio URL: http://localhost:54323
```

**Expected time:** 2-3 minutes

## Step 2: Apply Migrations

```bash
supabase db push
```

**Expected output:**
```
Applying migration: 20270813000001_analytics_foundation.sql
Applying migration: 20270813000002_onboarding_tables.sql
✓ Migrations applied successfully
```

## Step 3: Verify Database Schema

```bash
supabase db pull
```

Then check that new tables are in `supabase/schema.sql`:
- `analytics_events`
- `user_onboarding_state`
- `user_onboarding_progress`
- `user_achievements`

**Expected:** File should be updated with new tables listed

## Step 4: Run Unit Tests

```bash
npm test -- adoption.test.ts
```

**Expected output:**
```
✓ Adoption System - Analytics Events
  ✓ should create analytics_events table
  ✓ should have required columns on analytics_events
  ✓ should have indexes on analytics_events

✓ Adoption System - Onboarding Tables
  ✓ should create user_onboarding_state table
  ✓ should create user_onboarding_progress table
  ✓ should create user_achievements table
  ✓ should have unique constraint on (user_id, step_key)

✓ Adoption System - Onboarding RPCs
  ✓ should have mark_onboarding_step_complete RPC
  ✓ should have dismiss_onboarding RPC
  ✓ should have get_onboarding_status RPC

✓ Adoption System - Nova Tools
  ✓ should export NOVA_TOOL_NAMES constant
  ✓ should include new adoption tools in NOVA_TOOL_NAMES
  ✓ should build Nova tool definitions including new tools

✓ Adoption System - Configuration
  ✓ should export onboarding config
  ✓ should have role-aware onboarding steps
  ✓ should define adoption funnel stages
  ✓ should define feature adoption thresholds
  ✓ should define confidence thresholds
  ✓ should define default health components with correct weights

✓ Adoption System - OnboardingChecklist Component
  ✓ should export OnboardingChecklist component

Tests: 20 passed
```

**Expected time:** 10-30 seconds

## Step 5: Start Dev Server

In a **new terminal** (keep Supabase running in the other):

```bash
npm run dev
```

Wait for output like:
```
VITE v5.0.0  ready in XX ms

➜  Local:   http://localhost:5173/
```

## Step 6: Test Onboarding Checklist in Browser

1. Open http://localhost:5173 in your browser
2. Log in (use existing account or create new via invite)
3. Navigate to **Dashboard** (should be default after login)
4. Look for **"Welcome to Nexus 👋"** card above the stat cards
5. Verify it shows:
   - Progress bar (should show 0/5 or similar)
   - Checklist of steps with ○ circles (not yet started)
   - Description text for each step
   - "Go" buttons on incomplete steps

**Expected:** Card appears and is interactive

## Step 7: Verify Trigger Works

In **Supabase Studio** (http://localhost:54323):

1. Go to **SQL Editor**
2. Create a new task via the UI (or run SQL):
   ```sql
   INSERT INTO public.tasks (title, department_id) VALUES ('Test Task', (SELECT id FROM public.departments LIMIT 1))
   RETURNING id;
   ```
3. Copy the returned task ID
4. Run this query:
   ```sql
   SELECT event, actor_id, target_type, target_id 
   FROM public.analytics_events 
   WHERE target_id = '<task-id>' 
   LIMIT 1;
   ```

**Expected:** A row should appear showing the task creation was tracked

## Step 8: Test Onboarding RPC

In **Supabase Studio SQL Editor**:

```sql
-- Get your user ID
SELECT id FROM public.users LIMIT 1;
```

Copy the user ID, then:

```sql
-- Call the RPC
SELECT * FROM public.get_onboarding_status('<your-user-id>'::uuid);
```

**Expected response:**
```json
{
  "started_at": "2027-08-13T...",
  "completed_at": null,
  "dismissed_at": null,
  "last_seen_at": null,
  "onboarding_version": 1,
  "steps": []
}
```

## Step 9: Test Mark Step Complete

In **Supabase Studio SQL Editor**:

```sql
-- Mark a step as complete
SELECT * FROM public.mark_onboarding_step_complete(
  'profile_complete'::text,
  5::integer,
  '{}'::jsonb
);

-- Verify it was marked
SELECT * FROM public.user_onboarding_progress 
WHERE step_key = 'profile_complete' 
LIMIT 1;
```

**Expected:** `completed_at` should have a timestamp

## Step 10: Verify Nova Tools Are Available

In **Supabase Studio SQL Editor**, check that new functions exist:

```sql
SELECT * FROM information_schema.routines
WHERE routine_schema = 'public' 
  AND routine_name IN ('get_onboarding_status', 'mark_onboarding_step_complete', 'dismiss_onboarding')
ORDER BY routine_name;
```

**Expected:** 3 rows should appear

---

## Troubleshooting

### Docker not running
**Error:** `failed to inspect container`
- Open Docker Desktop (the application)
- Wait for it to fully start
- Try `supabase start` again

### Migrations fail to apply
**Error:** `column does not exist` or `syntax error`
- Check that you're on the latest code: `git status`
- Verify migrations are syntactically correct: `grep "CREATE TABLE" supabase/migrations/20270813*.sql`
- If they look wrong, re-read RELEASE_1_SUMMARY.md to understand schema

### Tests fail with "module not found"
**Error:** `Cannot find module 'adoption-config'`
- Make sure you ran `npm install` recently
- Clear node_modules cache: `npm ci`
- Try again: `npm test -- adoption.test.ts`

### Onboarding checklist doesn't appear on dashboard
**Cause:** Component may not be rendering or RLS is blocking queries
- Check browser console for errors (press F12)
- In Supabase Studio, verify `user_onboarding_state` table has RLS enabled
- Try logging in as a different user

### Trigger doesn't fire
**Symptom:** Create a task but nothing appears in `analytics_events`
- Check Postgres logs: `supabase logs`
- Verify trigger was created: `SELECT * FROM information_schema.triggers WHERE trigger_name = 'activity_log_to_analytics';`
- Manually test backfill: `SELECT public.backfill_analytics_events(now() - interval '1 hour', now());`

---

## Success = All 10 Steps Pass ✓

Once you've completed all steps above, Release 1 is verified locally.

**Next:** Commit the changes and start Release 2 (analytics dashboard, nudges, health scoring)

---

## Commands Summary (Copy-Paste Friendly)

```bash
# Terminal 1: Start Supabase
supabase start

# Terminal 2: Apply migrations
supabase db push

# Terminal 2: Verify schema
supabase db pull

# Terminal 2: Run tests
npm test -- adoption.test.ts

# Terminal 3: Start dev server
npm run dev

# Then visit:
# - App: http://localhost:5173
# - Supabase Studio: http://localhost:54323
```
