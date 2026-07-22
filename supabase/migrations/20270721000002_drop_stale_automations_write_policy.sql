-- The original automations_write policy (from 20260616000000) was never
-- dropped when the Phase 3 RLS swap created automations_write_admin_lead.
-- Both are permissive and OR together, meaning the old policy's
-- current_user_role() = 'dept_lead' check widens access beyond what
-- automations_write_admin_lead intends. Drop the stale one.
drop policy if exists "automations_write" on public.automations;
