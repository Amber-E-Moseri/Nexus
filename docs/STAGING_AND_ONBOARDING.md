# Staging and Volunteer Onboarding

## Staging Baseline

Create and maintain a separate staging environment before giving volunteers production responsibilities.

| Layer | Required staging setup |
| --- | --- |
| GitHub | `staging` branch protected with review required. |
| Vercel | Separate staging project or environment connected to `staging`; do not share production variables by default. |
| Supabase | Separate project with its own URL, anon key, service key, RLS, migrations, and seed data. |
| Resend | Test domain or restricted recipient allow-list; never send a staging campaign to real audiences. |
| Google | Separate OAuth credentials and redirect URLs for staging. |

## First Tasks

Volunteers may start independently with UI fixes that do not alter data models or permissions, documentation, help text, email template copy, tests for existing behavior, and isolated non-critical feature branches.

Volunteers pair with a platform administrator for RLS changes, migrations, Edge Function secrets, provider key rotation, real-audience email work, production deployment, rollback, and access management.

## Promotion Checklist

1. Feature branch passes build, test, and lint checks.
2. Change is tested on staging with an appropriate role.
3. RLS changes include allowed and denied cases.
4. Migration and correction plan are reviewed.
5. A platform administrator approves the production window.
