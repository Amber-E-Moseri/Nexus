# BLW Canada OS - Soft Launch Deployment Checklist

## Pre-Deployment (24 hours before)

### Code & Build
- [ ] Pull latest from `feature/scheduled-sends-bounce-management` branch
- [ ] Run `npm install` to update dependencies
- [ ] Run `npm run build` - verify exit code 0 with no errors
- [ ] Review SOFT_LAUNCH_AUDIT_REPORT.md - confirm all ✅ statuses
- [ ] Create backup tag: `git tag -a v0.1.0-pilot-1 -m "Soft launch pilot 1"`

### Database
- [ ] Backup production Supabase database
  - Via Supabase dashboard: Settings → Backups → Create backup
- [ ] Test migrations apply cleanly in staging
  - Run all migrations in `supabase/migrations/`
- [ ] Verify RLS policies are enabled on all tables
  ```sql
  SELECT tablename, rowsecurity FROM pg_tables 
  WHERE rowsecurity = true ORDER BY tablename;
  ```
- [ ] Verify no stale migrations in queue

### Secrets & Environment
- [ ] Verify all env vars set in production:
  - `VITE_SUPABASE_URL` ✓
  - `VITE_SUPABASE_ANON_KEY` ✓
  - `RESEND_API_KEY` (for email) ✓
  - `JWT_SECRET` (if custom) ✓
  - `GOOGLE_DRIVE_CLIENT_ID` (if enabled) ✓
  - `ZOOM_CLIENT_ID` (if enabled) ✓
- [ ] Verify no secrets in git history: `git log -p | grep -i password`
- [ ] Rotate any recently exposed keys

### Integrations
- [ ] Test Resend email sending
  ```bash
  # Send test email via Resend
  curl -X POST "https://api.resend.com/emails" \
    -H "Authorization: Bearer $RESEND_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"from":"test@blwcanada.org","to":"pilot@example.com","subject":"Test","html":"<p>Test email</p>"}'
  ```
- [ ] Verify Google Drive auth callback URL points to production
- [ ] Test Zoom integration (if pilot includes meeting features)

### Pilot Users
- [ ] Prepare list of 5 pilot users with emails
- [ ] Create user invitations in system
- [ ] Send invitation emails with setup instructions
- [ ] Verify invitations are received (check spam folder)
- [ ] Confirm pilot users have accepted invitations

### Monitoring Setup
- [ ] Enable Supabase real-time logs for debugging
- [ ] Set up error tracking (if available)
- [ ] Create Slack/Email alerts for:
  - Build/deployment failures
  - Database connection errors
  - RLS policy violations
  - High error rates (>5% of requests)
- [ ] Create dashboard for key metrics:
  - Active users
  - API response times
  - Error rate
  - Email delivery success rate

---

## Deployment Day (Morning)

### Final Checks
- [ ] Confirm all team members are available (8am-5pm)
- [ ] Review rollback procedure
- [ ] Test rollback on staging first
- [ ] Create deployment window notice (Slack/email to pilots)

### Deploy to Production
- [ ] Merge feature branch to main
  ```bash
  git checkout main
  git pull origin main
  git merge feature/scheduled-sends-bounce-management
  git push origin main
  ```
- [ ] Deploy code to production (platform-specific)
  - If Docker: `docker build -t blw-canada-os:v0.1.0-pilot . && docker push ...`
  - If Vercel/Netlify: Trigger deployment from main branch
  - If custom: Run deployment script
- [ ] Monitor build logs for errors
- [ ] Verify deployment completed (check version endpoint)

### Post-Deploy Verification
- [ ] Verify app loads at production URL
- [ ] Test login with each of 4 user roles
  - [ ] Super Admin - can see org stats and all users
  - [ ] Dept Lead - can see only own department
  - [ ] Pastor - can see only assigned members
  - [ ] Member - limited to own tasks/meetings
- [ ] Test core flows:
  - [ ] Create a task
  - [ ] Create a sprint
  - [ ] Log a meeting
  - [ ] Send a campaign email
  - [ ] Upload a file
- [ ] Check error logs for exceptions
  - `SELECT * FROM public.activity_log WHERE created_at > now() - interval '1 hour' ORDER BY created_at DESC LIMIT 20;`
- [ ] Verify email sending works
  - Send test campaign to pilot users
  - Check delivery in Resend dashboard
- [ ] Monitor performance
  - Check database query times
  - Monitor server CPU/memory
  - Watch for slow API endpoints

---

## First Week (Daily Checks)

### Daily Standup
- [ ] Review error logs (no RLS violations?)
- [ ] Check pilot user feedback channel
- [ ] Verify all users can still log in
- [ ] Monitor email delivery rates (aim for >95%)
- [ ] Check for any database issues

### Day 1 Smoke Tests
- [ ] All 5 pilots receive welcome email
- [ ] All 5 pilots successfully log in
- [ ] Each pilot can create a task
- [ ] At least 1 pilot creates a sprint
- [ ] Verify no RLS policy violations in logs

### Day 2-3
- [ ] Gather initial feedback from pilots
- [ ] Monitor for any recurring errors
- [ ] Verify scheduled sends are working (if applicable)
- [ ] Check bounce handling is functional

### Day 4-7
- [ ] Compile pilot feedback report
- [ ] Identify any high-priority bugs
- [ ] Plan Phase 2 features based on feedback
- [ ] Decide: Ready for broader rollout or iterate?

---

## Rollback Procedure (If Needed)

### If Critical Error Occurs
1. **Immediate:** Stop accepting new user signups
2. **Within 5 min:** Revert to previous stable version
   ```bash
   git revert HEAD
   git push origin main
   # Then re-deploy
   ```
3. **Notify pilots:** Send message explaining issue and timeline
4. **Investigate:** Review error logs to understand root cause
5. **Fix & Test:** Apply fix to feature branch and test thoroughly
6. **Re-deploy:** Once confident, deploy fixed version again

### Database Rollback
- If migrations caused data corruption:
  1. Stop application
  2. Restore from backup (Supabase → Settings → Backups → Restore)
  3. Apply only non-problematic migrations
  4. Restart application
  5. Verify data integrity

---

## Success Criteria for Soft Launch

### Must Have (Go/No-Go)
- ✅ 5 pilots can log in
- ✅ Core features work without errors
- ✅ No RLS policy violations
- ✅ Email delivery working (>90% success)
- ✅ Database stable (no connection errors)

### Should Have (Nice to Have)
- ✅ Response times <200ms (p95)
- ✅ Zero critical errors in logs
- ✅ All 5 pilots report it's "usable"
- ✅ File uploads working without issues

### Nice to Have (Bonus)
- ✅ All pilots complete at least 1 task
- ✅ At least 1 sprint created
- ✅ At least 1 campaign sent
- ✅ Positive feedback from pilots

---

## Week 2 Decision Point

### If All Success Criteria Met → Expand
- [ ] Invite next 20 pilot users (for broader alpha)
- [ ] Plan Phase 2 feature rollout
- [ ] Set date for public beta

### If Issues Found → Iterate
- [ ] Fix identified issues
- [ ] Re-test with current 5 pilots
- [ ] Extend soft launch by 1-2 weeks
- [ ] Re-assess readiness

### Critical Issues → Rollback
- [ ] Revert to previous stable version
- [ ] Notify pilots of delay
- [ ] Fix root cause
- [ ] Reschedule soft launch

---

## Contact & Escalation

**During Deployment:**
- Lead: [Assign lead coordinator]
- Technical: [Assign backend lead]
- Support: [Assign support contact]

**Escalation Path:**
1. Issue detected → Log in Slack #deployment channel
2. No resolution in 15 min → Page on-call engineer
3. No resolution in 1 hour → Consider rollback
4. Critical data loss → Execute database rollback

---

**Deployment Date:** [Fill in]  
**Deployed By:** [Fill in]  
**Rollback By:** [Fill in]  
**Sign-off By:** [Fill in]
