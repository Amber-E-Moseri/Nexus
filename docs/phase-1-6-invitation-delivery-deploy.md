# Phase 1.6 — Invitation Email Delivery Deployment

This guide covers deployment and verification for the Supabase Edge Function `send-user-invitation`.

## Required Secrets

Set these secrets in the same Supabase project used by the frontend:

- `SUPABASE_SERVICE_ROLE_KEY`
  Used by the Edge Function to read and update invitation records with elevated server-side permissions. This must never be exposed to the frontend.

- `RESEND_API_KEY`
  Used by the Edge Function to send invitation emails through Resend. This must remain server-side only.

- `INVITATION_FROM_EMAIL`
  The sender address used for invitation emails, for example `BLW Canada OS <noreply@yourdomain.com>`. The domain or sender must be valid in Resend.

- `INVITATION_FRONTEND_URL`
  The frontend base URL used to build activation links, for example `https://app.example.com`. The function appends `/activate?token=...`.

## Supabase CLI Commands

Set the required secrets:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
supabase secrets set RESEND_API_KEY=...
supabase secrets set INVITATION_FROM_EMAIL=...
supabase secrets set INVITATION_FRONTEND_URL=...
```

Deploy the function:

```bash
supabase functions deploy send-user-invitation
```

Verify the function exists:

```bash
supabase functions list
```

If you want to inspect one function specifically:

```bash
supabase functions deploy send-user-invitation --no-verify-jwt
```

Do not use `--no-verify-jwt` for production unless you intentionally want to disable JWT verification. The deployed production function should keep normal JWT verification enabled.

## Local Testing Notes

Serve the function locally:

```bash
supabase functions serve send-user-invitation
```

Local behavior notes:

- The function still requires the same environment variables locally.
- The local function must point at the same Supabase project schema shape expected by the frontend.
- The local caller still needs a valid authenticated JWT with a matching `users` row and role.
- `INVITATION_FRONTEND_URL` should be set to your local frontend URL during local testing, for example `http://127.0.0.1:5173`.

Typical local secret setup:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
supabase secrets set RESEND_API_KEY=...
supabase secrets set INVITATION_FROM_EMAIL=...
supabase secrets set INVITATION_FRONTEND_URL=http://127.0.0.1:5173
```

If you are using a local Supabase stack, make sure the frontend is connected to that same local stack when testing function behavior.

## UI Verification Checklist

After deployment, verify the following from the Invitations UI:

- Create invitation sends email.
- Delivery status changes to `sent`.
- Last sent timestamp updates.
- Send count increments.
- Resend rotates token and sends new email.
- Failed send shows `failed` badge and `delivery_error`.
- Activation link opens `/activate?token=...`.
- Successful activation marks invitation `activated`.

## Troubleshooting

### Missing Resend API key

Symptoms:

- Function returns a server error.
- Delivery status may move to `failed`.
- No email is delivered.

Fix:

- Set `RESEND_API_KEY` in the correct Supabase project.
- Redeploy the function if needed.

### Invalid FROM email or unverified Resend domain

Symptoms:

- Resend rejects the request.
- Delivery status becomes `failed`.
- `delivery_error` contains the mail provider failure.

Fix:

- Verify the sender domain in Resend.
- Update `INVITATION_FROM_EMAIL` to a valid verified sender.

### Wrong frontend URL

Symptoms:

- Email sends successfully but activation link opens the wrong app or broken route.

Fix:

- Correct `INVITATION_FRONTEND_URL`.
- Resend the invitation so a new email is generated with the right link.

### Missing service role key

Symptoms:

- Function cannot load or update invitation records correctly.
- Permission-related failures occur inside the function.

Fix:

- Set `SUPABASE_SERVICE_ROLE_KEY` in the same Supabase project as the function.
- Confirm the key belongs to the target project, not a different environment.

### Supabase email confirmation blocking immediate login

Symptoms:

- User opens the activation link and sets a password.
- Account creation succeeds but immediate sign-in does not complete as expected.

Fix:

- Review Supabase Auth email confirmation settings.
- If confirmation is enforced, align the activation flow with that policy or adjust project auth configuration intentionally.

### Function deployed to the wrong Supabase project

Symptoms:

- Frontend creates invitation records, but sending fails or appears disconnected from the UI.
- Function logs do not match the invitation data seen in the app.

Fix:

- Confirm the frontend and `send-user-invitation` are using the same Supabase project.
- Re-run secret setup and deploy against the correct project.

## Deployment Summary

Minimum production sequence:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
supabase secrets set RESEND_API_KEY=...
supabase secrets set INVITATION_FROM_EMAIL=...
supabase secrets set INVITATION_FRONTEND_URL=...
supabase functions deploy send-user-invitation
supabase functions list
```

Once deployed, complete the UI verification checklist before treating invitation email delivery as production-ready.
