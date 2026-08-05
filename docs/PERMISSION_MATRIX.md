# Maintainer Permission Matrix

Assign named people to these tiers. Grant the smallest level needed, enable MFA everywhere, and review this matrix quarterly.

| Maintainer tier | Supabase | Vercel | Resend | Google Cloud | GitHub | Production responsibility |
| --- | --- | --- | --- | --- | --- | --- |
| Observer / volunteer | Read-only project visibility if needed; no SQL editor | View deployment/logs | View-only | None | Read + issues | Documentation, reproduction, UI testing. |
| Feature maintainer | Approved staging access; no production policy changes | Preview deployments | Test/sandbox only | Test project only | Write feature branches / PRs | UI fixes and feature branches. |
| Integration owner | Staging function logs/secrets for owned integration | Preview + logs | Manage owned test configuration | Manage owned test OAuth client | Write branches / PRs | Calendar, email, or integration testing. |
| Platform administrator | Production admin, migrations, RLS, functions | Production deploy/promote and env management | Manage keys/domains | Manage production OAuth | Main protection and releases | Incident response, secrets, migrations, production changes. |

## Assignment Register

| System | Primary | Backup | Last reviewed |
| --- | --- | --- | --- |
| Supabase production | _Assign_ | _Assign_ | _Date_ |
| Vercel production | _Assign_ | _Assign_ | _Date_ |
| Resend | _Assign_ | _Assign_ | _Date_ |
| Google Cloud OAuth | _Assign_ | _Assign_ | _Date_ |
| GitHub repository | _Assign_ | _Assign_ | _Date_ |

## Rules

- External volunteers do not receive production database write access, production deployment permission, production key management, or production OAuth management on day one.
- Production access is time-bound where possible and removed when a volunteer leaves.
- Personal API keys are generated per user, shown once, and rotated rather than shared.
