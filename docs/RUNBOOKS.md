# Nexus Runbooks

Use this document during an incident or deployment. Do not paste secrets into tickets, chat, commits, or browser consoles.

## Deployment

### Deploy a frontend-only change

1. Confirm the working tree contains only intended changes with `git status` and `git diff`.
2. Run `npm run build` and `npm test` locally.
3. Push the feature branch and use the Vercel preview deployment to smoke-test the changed flow while signed in as the affected role.
4. Merge to `main`. The GitHub workflow builds on `main`; Vercel's Git integration publishes the production deployment.
5. In Vercel, confirm the production deployment is Ready and open `https://nexus.lwcanada.org`.
6. Smoke-test sign-in, one affected read flow, and one affected write flow. Check Supabase Edge Function logs if the flow invokes a function.

### Deploy database or Edge Function changes

1. Complete the frontend-only checks above.
2. Read the migration and verify it is additive or has a safe data backfill. Never edit a migration that has already reached production.
3. Authenticate and link the intended project: `supabase login`, then `supabase link --project-ref <production-project-ref>`.
4. Inspect pending migrations with `supabase migration list`.
5. Apply them with `supabase db push`. Record the migration name in the deployment ticket and verify it appears as applied.
6. Deploy each changed function explicitly: `supabase functions deploy <function-name>`.
7. Set or verify Edge Function secrets in Supabase Dashboard before exercising the feature. Function secrets are separate from Vercel environment variables.
8. Run the changed flow in production with a non-sensitive test record and inspect the relevant function log.

### Roll back

1. For a frontend regression, use Vercel Deployments to promote the last known-good production deployment.
2. For an Edge Function regression, redeploy the last known-good Git commit for that function. A Vercel rollback does not revert Supabase functions.
3. For a database migration, do not run destructive reversal commands. Create a reviewed corrective forward migration, or restore a verified backup with incident-lead approval.
4. Add an entry to [INCIDENTS.md](./INCIDENTS.md) before closing the incident.

## Common Issues

### Tasks are not syncing to Google Calendar

1. Confirm the user connected Google Calendar in Settings -> Integrations and enabled task sync.
2. Confirm the task has a due date and is assigned to the user or followed by them. Sync is one-way from Nexus to Google Calendar.
3. Check the integration connection and expiry state in Supabase. Do not expose stored OAuth tokens.
4. Inspect calendar sync Edge Function logs and verify Google OAuth secrets exist in Supabase Edge Function secrets.
5. Reconnect the user only when the connection is expired or revoked, then retest with one task.

### A query started failing after an RLS change

1. Stop further policy or migration deploys.
2. Capture the operation, role, authenticated user ID, table, and request error. Never use the service-role key in the client as a workaround.
3. Reproduce with an affected account; inspect the policy, JWT claims, and relevant membership rows.
4. Make the smallest corrective forward migration.
5. Test both an allowed role and a role that must be denied before deploying.

### Resend email delivery is failing

1. Pause bulk sends and automations that could retry repeatedly.
2. Check Resend status and dashboard for quota, domain, suppression, or API errors.
3. Inspect the calling Edge Function logs (`broadcast-campaign`, `automation-engine`, `email-digest`, or the relevant function).
4. Verify `RESEND_API_KEY` exists in Supabase Edge Function secrets. Do not log or paste its value.
5. Send one internal test after recovery, then resume queued sends.

### Production site does not load after deployment

1. Check Vercel deployment state and build logs.
2. Promote the previous known-good production deployment if this is a regression.
3. Verify Vercel environment variables and the deployed commit.
4. If the page loads but data fails, check Supabase status, browser network errors, RLS, and function logs.

## Emergency Access

Fill this table with named primary and backup custodians. Do not store passwords or raw keys here.

| System | Primary custodian | Backup custodian | Emergency action |
| --- | --- | --- | --- |
| Supabase organization/project | _Assign_ | _Assign_ | Suspend risky deploys; inspect health, logs, backups, and RLS. |
| Vercel project | _Assign_ | _Assign_ | Promote the previous deployment or disable a compromised deployment. |
| Resend | _Assign_ | _Assign_ | Pause campaigns, inspect suppression/quota, rotate compromised API keys. |
| Google Cloud OAuth | _Assign_ | _Assign_ | Disable compromised credentials and rotate the client secret. |
| GitHub repository | _Assign_ | _Assign_ | Restrict branch access and revoke compromised tokens. |

## Secret Rotation

1. Create the replacement secret with the provider.
2. Add it to the correct store: Vercel for runtime variables; Supabase Edge Function secrets for functions; provider consoles for OAuth and email.
3. Redeploy the dependent runtime and run a narrow live verification.
4. Revoke the old secret only after verification. Record the date, owner, and dependent systems in the incident log or change record.
