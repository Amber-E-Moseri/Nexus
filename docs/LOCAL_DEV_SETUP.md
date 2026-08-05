# Local Development Setup Checklist

This checklist reflects scripts and configuration currently in the repository.

## Prerequisites

- [ ] Node 20+ installed. CI currently uses Node 22.
- [ ] Docker Desktop running if you will use `supabase start`.
- [ ] Supabase CLI installed and authenticated with `supabase login`.
- [ ] Repository cloned and dependencies installed with `npm install`.
- [ ] `.env.local` created from `.env.example`.
- [ ] `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set to the approved development or staging project.
- [ ] Optional client integrations needed for the work configured from `.env.example`.

## Start the Application

1. Run `npm install`.
2. For isolated database work, run `supabase start`; otherwise use the approved development/staging project.
3. Apply local migrations with `supabase db reset` only when using the local stack. This resets local data.
4. Start the frontend with `npm run dev` and open the local URL printed by Vite (normally `http://localhost:5173`).
5. Run `npm test`, `npm run lint`, and `npm run build` before opening a pull request.

## Test Accounts and Seed Data

- The repository has `supabase/seed.sql`, but no published shared test login is stored in source control.
- Obtain an approved non-production test account from the platform administrator. Do not use a production admin account for routine development.
- There is currently no `npm run seed:test-data` script. Do not rely on one until it is added.

## First-Run Verification

- [ ] Sign in with the approved test account.
- [ ] Open a task board and confirm the account sees only authorized data.
- [ ] Create and remove a disposable local/staging task.
- [ ] Confirm the browser has no missing-environment error.
- [ ] For integration work, verify only the connection you changed.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Blank page or missing Supabase client | Confirm `.env.local` values and restart Vite. |
| Login succeeds but data is denied | Check role, JWT claims, memberships, and RLS; do not weaken RLS to unblock yourself. |
| `supabase start` fails | Confirm Docker is running and the CLI is supported. Use approved staging if local containers are unavailable. |
| Migration appears ignored | Confirm filename format is `<timestamp>_name.sql`; archived `.bak`/`.old` files are skipped. |
| Edge Function feature fails locally | Check its Supabase secret; public Vite variables are not Edge Function secrets. |

See [RUNBOOKS.md](./RUNBOOKS.md) for production incidents.
