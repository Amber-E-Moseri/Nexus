# Testing & Deployment Guide: Prompts 1-5

Complete step-by-step instructions for testing and pushing all changes from Prompts 1-5.

---

## Overview

| Prompt | Component | Status | Your Action |
|--------|-----------|--------|-------------|
| 2 | GitHub Actions: Deactivate Sprint Members | ✅ Fixed | Verify syntax |
| 3 | Secure Unsubscribe Tokens | ✅ Implemented | Run migrations, test endpoints |
| 4 | Rate Limiting on RSVP | ✅ Implemented | Run migrations, deploy function |
| 5 | CI/CD Pipeline | ✅ Created | Configure secrets, test |

---

## PART 1: Test Locally (15 minutes)

### Step 1.1: Verify File Changes

Confirm all changes are in place:

```bash
cd ~/Downloads/clickup

# Verify Prompt 2 (GitHub Actions fix)
ls -la .github/workflows/deactivate-temp-sprint-members.yml
# Should show the file exists

# Verify Prompt 3 (Unsubscribe tokens)
ls -la supabase/migrations/20260902000000_secure_unsubscribe_tokens.sql
# Should exist

# Verify Prompt 4 (Rate limiting)
ls -la supabase/migrations/20260902000001_rate_limiting.sql
ls -la supabase/functions/_shared/rateLimit.ts
ls -la supabase/functions/rsvp/index.ts
# All should exist

# Verify Prompt 5 (CI/CD)
ls -la .github/workflows/ci.yml
ls -la docs/CI_CD_PIPELINE.md
ls -la docs/CI_SETUP_QUICKSTART.md
# All should exist
```

### Step 1.2: Check Git Status

```bash
git status

# Should show:
# - Modified: .github/workflows/deactivate-temp-sprint-members.yml
# - Modified: supabase/migrations/20260622193832_dashboard_role_queries.sql
# - Modified: supabase/functions/rsvp/index.ts
# - Modified: supabase/functions/send-communication-email/index.ts
# - New files: migrations, functions, documentation

# Verify specific changes
git diff .github/workflows/deactivate-temp-sprint-members.yml
# Should show: --input-type=module flag added
```

### Step 1.3: Verify Migration Files

```bash
# Check migration timestamps (should be 20260902)
ls supabase/migrations/ | grep 20260902
# Output:
# 20260902000000_secure_unsubscribe_tokens.sql
# 20260902000001_rate_limiting.sql

# Verify migration content
cat supabase/migrations/20260902000000_secure_unsubscribe_tokens.sql | head -20
# Should show token-related columns
```

### Step 1.4: Verify Rate Limiting Module

```bash
# Check shared module exists and has expected functions
grep -n "generateRandomToken\|checkRateLimit\|extractClientIp" supabase/functions/_shared/rateLimit.ts

# Should output line numbers for these functions
```

### Step 1.5: Verify RSVP Function

```bash
# Check rate limiting integration
grep -n "checkRateLimit\|extractClientIp" supabase/functions/rsvp/index.ts

# Should show the rate limiting code
```

### Step 1.6: Verify CI/CD Workflow

```bash
# Check workflow file syntax
cat .github/workflows/ci.yml | grep -E "^  [a-z]+:" | head -10

# Should show job names: setup, security, build, test, lint, type-check, ci-status, deploy

# Verify documentation exists
ls -lh docs/ | grep -E "CI_|RATE_|UNSUBSCRIBE"
# Should show: CI_CD_PIPELINE.md, CI_SETUP_QUICKSTART.md, CI_CD_IMPLEMENTATION_SUMMARY.md, etc.
```

---

## PART 2: Test on Supabase (20 minutes)

### Step 2.1: Verify Current Database State

Before pushing migrations, check what's already in the database:

```bash
# List existing tables and migrations
supabase db list

# Check migrations already applied
supabase migration list

# Should show recent migrations including:
# - 20260901000000_native_communications_system.sql (applied)
# - 20260831000000_task_milestones.sql (applied)
```

### Step 2.2: Test Migration Scripts Locally

```bash
# ✅ Migrations were already pushed on 2026-06-23
# Verify they were applied:
supabase db list

# Should show:
# ✓ app_notifications
# ✓ broadcast_campaigns
# ✓ notification_preferences
# ✓ rate_limits
# ✓ rate_limit_violations
```

### Step 2.3: Verify Rate Limiting Tables

```bash
# Check rate_limits table schema
supabase db query "SELECT * FROM information_schema.columns WHERE table_name = 'rate_limits';" 

# Should show columns:
# - id, ip_address, email, endpoint, attempt_count, window_start, expires_at, created_at, updated_at

# Check rate_limit_violations table
supabase db query "SELECT * FROM information_schema.columns WHERE table_name = 'rate_limit_violations';"

# Should show columns:
# - id, ip_address, email, endpoint, limit_type, current_count, limit_value, created_at
```

### Step 2.4: Verify Unsubscribe Token Columns

```bash
# Check if new columns exist
supabase db query "SELECT * FROM information_schema.columns WHERE table_name = 'communication_unsubscribes' AND column_name IN ('unsubscribe_token', 'token_created_at', 'token_expires_at');"

# Should show 3 rows for the new columns
```

---

## PART 3: Deploy & Test Functions (15 minutes)

### Step 3.1: Deploy Updated Edge Functions

```bash
# Deploy the updated RSVP function with rate limiting
supabase functions deploy rsvp

# Deploy the updated send-communication-email function with new tokens
supabase functions deploy send-communication-email

# Deploy the updated handle-unsubscribe function
supabase functions deploy handle-unsubscribe

# Verify deployments
supabase functions list
# Should show all 3 functions listed with recent updated_at times
```

### Step 3.2: Test RSVP Rate Limiting (Hands-on)

```bash
# Get a valid test token from your database
# (or generate a test one)

# Test 1: Send 10 requests (should all succeed)
for i in {1..10}; do
  curl -X POST http://localhost:54321/functions/v1/rsvp \
    -H "X-Forwarded-For: 192.168.1.1" \
    -H "Content-Type: application/json" \
    -d '{"token": "test-token-'$i'", "response": "rsvp_yes"}' \
    -w "Request $i: %{http_code}\n"
  sleep 0.5
done

# Expected output: Request 1-10 all return 400 or 404 (invalid token, but not 429 rate limited)

# Test 2: Send 11th request (should be rate limited)
curl -X POST http://localhost:54321/functions/v1/rsvp \
  -H "X-Forwarded-For: 192.168.1.1" \
  -H "Content-Type: application/json" \
  -d '{"token": "test-token", "response": "rsvp_yes"}' \
  -w "Status: %{http_code}\n"

# Expected: 429 Too Many Requests
# Should see header: Retry-After: 45 (or similar)

# Test 3: Check rate_limit_violations table
supabase db query "SELECT * FROM public.rate_limit_violations WHERE ip_address = '192.168.1.1' ORDER BY created_at DESC LIMIT 5;"

# Should show entries for this IP
```

### Step 3.3: Test Secure Unsubscribe Tokens

```bash
# Generate a random token
TOKEN=$(openssl rand -hex 32)
echo "Generated token: $TOKEN"

# Hash it (SHA256)
TOKEN_HASH=$(echo -n "$TOKEN" | sha256sum | awk '{print $1}')
echo "Token hash: $TOKEN_HASH"

# Store it in database
supabase db query "INSERT INTO public.communication_unsubscribes (email, unsubscribe_token, token_created_at, token_expires_at) VALUES ('test@example.com', '$TOKEN_HASH', now(), now() + interval '30 days');"

# Test unsubscribe endpoint
curl -X POST http://localhost:54321/functions/v1/handle-unsubscribe \
  -H "Content-Type: application/json" \
  -d '{"token": "'$TOKEN'", "action": "unsubscribe"}' \
  -w "Status: %{http_code}\n"

# Expected: 200 OK with {"success": true}
```

### Step 3.4: Verify Function Logs

```bash
# Check recent logs for deployed functions
supabase functions logs rsvp --limit 20

# Should show successful deployments and recent invocations

supabase functions logs handle-unsubscribe --limit 20

# Should show successful deployments and token handling
```

---

## PART 4: Commit Changes (10 minutes)

### Step 4.1: Stage All Changes

```bash
cd ~/Downloads/clickup

# Check what's changed
git status

# Stage all changes
git add .

# Verify staging
git status
# Should show all files as "Changes to be committed"
```

### Step 4.2: Create Commit Message

```bash
# Create a comprehensive commit message for all prompts
git commit -m "feat: implement security hardening and CI/CD pipeline

SECURITY (Prompts 2-4):
- Fix: GitHub Actions ESM import with --input-type=module flag
- Add: Secure random unsubscribe tokens with SHA-256 hashing
  * Replace deterministic tokens with 32-byte random tokens
  * Implement 30-day token expiration
  * Add migration 20260902000000
  * Store token hashes (never plaintext) in DB
- Add: Rate limiting on RSVP endpoint
  * 10 requests per minute per IP
  * 20 requests per hour per email
  * Implement sliding window algorithm
  * Add violation logging for abuse detection
  * Add rate_limit and rate_limit_violations tables
  * Shared rateLimit.ts module for reuse

CI/CD (Prompt 5):
- Add: Comprehensive GitHub Actions CI/CD pipeline
  * 8 parallel jobs: setup, security, build, test, lint, type-check, ci-status, deploy
  * Auto-deploys to Vercel on main branch success
  * PR status comments with detailed feedback
  * npm audit security scanning
  * Optimized caching for 1-2 minute runs
  * Optional ESLint and TypeScript auto-detection
- Add: Complete documentation
  * CI_CD_PIPELINE.md (600+ lines, complete reference)
  * CI_SETUP_QUICKSTART.md (150+ lines, 5-minute setup)
  * CI_CD_IMPLEMENTATION_SUMMARY.md (300+ lines, technical overview)
- Update: README.md with CI status badge

MIGRATIONS:
- 20260902000000: Secure unsubscribe tokens schema
- 20260902000001: Rate limiting infrastructure (with idempotent checks)
- Fixed: 20260622193832 dashboard_role_queries (ambiguous column refs)

FILES CHANGED:
- .github/workflows/ci.yml (new, 550+ lines)
- .github/workflows/deactivate-temp-sprint-members.yml (fixed)
- supabase/migrations/20260902000000_secure_unsubscribe_tokens.sql (new)
- supabase/migrations/20260902000001_rate_limiting.sql (new)
- supabase/functions/_shared/rateLimit.ts (new, shared module)
- supabase/functions/rsvp/index.ts (updated with rate limiting)
- supabase/functions/handle-unsubscribe/index.ts (updated with random tokens)
- supabase/functions/send-communication-email/index.ts (updated with random tokens)
- docs/CI_CD_PIPELINE.md (new, 600+ lines)
- docs/CI_SETUP_QUICKSTART.md (new, 150+ lines)
- docs/CI_CD_IMPLEMENTATION_SUMMARY.md (new, 300+ lines)
- docs/RATE_LIMITING.md (new, 450+ lines)
- docs/RATE_LIMITING_IMPLEMENTATION_SUMMARY.md (new, 200+ lines)
- docs/UNSUBSCRIBE_TOKEN_SECURITY.md (new, 250+ lines)
- README.md (added CI status badge)

TESTING:
✅ Migrations pushed to remote database
✅ Functions deployed to Supabase
✅ Rate limiting tested with curl
✅ Token generation verified
✅ Documentation complete and comprehensive

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"

# Verify commit was created
git log --oneline -5
# Should show your new commit at the top
```

---

## PART 5: Push to GitHub (5 minutes)

### Step 5.1: Push to Main Branch

```bash
# Push changes to GitHub
git push origin main

# Watch for output indicating successful push
# Should show: ... -> refs/heads/main
```

### Step 5.2: Verify GitHub Actions Triggered

```bash
# Wait 30-60 seconds for GitHub to process

# Option 1: Check GitHub web UI
# Go to: https://github.com/[owner]/[repo]/actions
# Should see CI/CD Pipeline running with status

# Option 2: Use GitHub CLI
gh run list --workflow ci.yml --limit 1

# Should show: IN PROGRESS or COMPLETED

# Watch the run
gh run watch <RUN_ID>

# Or view logs
gh run view <RUN_ID> --log
```

### Step 5.3: Verify All Checks Pass

Expected results:

```
✅ Setup - PASSED (30s)
✅ Security - PASSED (20s)
✅ Build - PASSED (45s)
✅ Test - PASSED (40s)
⚪ Lint - SKIPPED (ESLint not installed)
⚪ Type Check - SKIPPED (TypeScript not installed)
✅ CI Status - PASSED
✅ Deploy - SKIPPED (only runs on pushes, not pull requests)
```

---

## PART 6: Configure Branch Protection (5 minutes)

### Step 6.1: Set GitHub Secrets

1. Go to: **GitHub Repository** → **Settings** → **Secrets and variables** → **Actions**

2. Click **New repository secret**

3. Add `SUPABASE_URL`:
   - Name: `SUPABASE_URL`
   - Value: `https://your-project.supabase.co`
   - Click **Add secret**

4. Add `SUPABASE_ANON_KEY`:
   - Name: `SUPABASE_ANON_KEY`
   - Value: `eyJ...` (your anon key from Supabase)
   - Click **Add secret**

**Where to find these**:
```
Supabase Dashboard → Settings → API
- Project URL = SUPABASE_URL
- anon public key = SUPABASE_ANON_KEY
```

### Step 6.2: Enable Branch Protection

1. Go to: **GitHub Repository** → **Settings** → **Branches**

2. Click **Add rule**

3. Fill in `main` as the branch name pattern

4. Check these boxes:
   ```
   ✅ Require a pull request before merging
   ✅ Require status checks to pass before merging
      ✓ Select: build
      ✓ Select: test
      ✓ Select: security
   ✅ Require code reviews before merging
      - Required number of approvals: 1
      - Dismiss stale pull request approvals when new commits are pushed
   ✅ Include administrators
   ```

5. Click **Create**

---

## PART 7: Test the Full Pipeline with a PR (10 minutes)

### Step 7.1: Create a Test Branch

```bash
git checkout -b test/verify-prompts

# Make a small change
echo "# Test PR for Prompts 1-5" >> README.md

# Commit it
git add README.md
git commit -m "test: verify CI pipeline with test PR"

# Push to GitHub
git push origin test/verify-prompts
```

### Step 7.2: Create Pull Request

1. Go to GitHub → **Pull requests** → **New pull request**

2. Select:
   - Base: `main`
   - Compare: `test/verify-prompts`

3. Click **Create pull request**

4. Add title: "Test: Verify CI Pipeline"

5. Click **Create pull request**

### Step 7.3: Monitor the Pipeline

```bash
# Watch the checks run
# GitHub UI: Pull Request → Checks tab

# Or use CLI:
gh run list --workflow ci.yml --limit 1

# View detailed logs:
gh run view <RUN_ID> --log
```

### Step 7.4: Verify Results

All checks should show:
```
✅ build - PASSED
✅ test - PASSED
✅ security - PASSED
✅ ci-status - PASSED
```

And a comment should appear on the PR:
```
## CI Pipeline Status
✅ All checks passed!
[View full workflow run →]
```

### Step 7.5: Merge the Test PR

Once all checks pass:
1. Click **Merge pull request**
2. Click **Confirm merge**
3. Click **Delete branch**

---

## Quick Verification Checklist

After completing all steps, verify:

### Migrations ✅
- [ ] `supabase db push --include-all` completed successfully
- [ ] `rate_limits` table exists with all columns
- [ ] `rate_limit_violations` table exists
- [ ] `communication_unsubscribes` has token columns
- [ ] No errors in migration history

### Functions ✅
- [ ] `supabase functions deploy rsvp` succeeded
- [ ] `supabase functions deploy handle-unsubscribe` succeeded
- [ ] `supabase functions deploy send-communication-email` succeeded
- [ ] All 3 functions show in `supabase functions list`

### GitHub Actions ✅
- [ ] `.github/workflows/ci.yml` exists
- [ ] `SUPABASE_URL` secret set
- [ ] `SUPABASE_ANON_KEY` secret set
- [ ] Branch protection enabled for `main`
- [ ] Last workflow run passed (all 3 required jobs)

### Documentation ✅
- [ ] `docs/CI_CD_PIPELINE.md` exists
- [ ] `docs/CI_SETUP_QUICKSTART.md` exists
- [ ] `docs/RATE_LIMITING.md` exists
- [ ] `docs/UNSUBSCRIBE_TOKEN_SECURITY.md` exists
- [ ] README.md has CI status badge

### Code ✅
- [ ] All files committed and pushed
- [ ] No uncommitted changes in working directory
- [ ] Git log shows your comprehensive commit message
- [ ] GitHub shows all changes reflected

---

## Troubleshooting

### If migrations fail
```bash
# Check migration status
supabase migration list

# Rollback and try again
supabase db reset
supabase db push
```

### If functions don't deploy
```bash
# Check function logs
supabase functions logs rsvp --tail

# Verify function syntax
supabase functions validate

# Deploy with verbose output
supabase functions deploy rsvp --verbose
```

### If GitHub Actions fails
```bash
# View detailed logs
gh run view <RUN_ID> --log

# Re-run the workflow
gh run rerun <RUN_ID>

# Debug locally (requires 'act' tool)
act -j build
```

### If secrets not working
- Verify exact secret names: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- Secrets are case-sensitive
- Secrets are environment-scoped (can't be viewed after creation)
- Check they appear in Settings → Secrets (name only)

---

## Expected Time Summary

| Phase | Time | Status |
|-------|------|--------|
| Part 1: Local verification | 15 min | ✅ Do this first |
| Part 2: Database testing | 20 min | ✅ Critical |
| Part 3: Function deployment | 15 min | ✅ Required |
| Part 4: Git commit | 10 min | ✅ Required |
| Part 5: Push to GitHub | 5 min | ✅ Required |
| Part 6: Branch protection | 5 min | ✅ Recommended |
| Part 7: Full pipeline test | 10 min | ✅ Verification |
| **TOTAL** | **~80 minutes** | |

---

## Success Criteria

You're done when:

✅ All migrations applied successfully to remote database
✅ All edge functions deployed to Supabase
✅ GitHub Actions workflow triggers on push
✅ Branch protection prevents merge without checks
✅ Rate limiting active and working
✅ Unsubscribe tokens secure and working
✅ All documentation in place
✅ Test PR created and merged successfully
✅ CI pipeline shows all checks passing

---

**Next Steps**:
1. Start with Part 1: Local Verification
2. Follow through each part sequentially
3. Test the full pipeline with a PR
4. You're ready for production! 🚀

Questions? Check the detailed docs:
- `docs/CI_CD_PIPELINE.md` - Complete reference
- `docs/CI_SETUP_QUICKSTART.md` - Quick setup
- `docs/RATE_LIMITING.md` - Rate limiting details
- `docs/UNSUBSCRIBE_TOKEN_SECURITY.md` - Token security
