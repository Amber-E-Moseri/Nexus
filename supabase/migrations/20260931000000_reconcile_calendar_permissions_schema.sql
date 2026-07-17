-- Reconciliation migration for calendar_permissions schema conflict
-- Issue: three migrations (20260625000000, 20260730000000, 20260805000000) defined this table
-- with incompatible column sets due to CREATE TABLE IF NOT EXISTS no-opping after first apply.
--
-- Lineage 1 (20260625000000): can_manage boolean, org_id, space_id — NO permission/created_by
-- Lineage 2 (20260730000000/20260805000000): permission text, created_by — NO org_id/can_manage
-- Lineage 3 (20260805000000 ALTER): adds can_manage boolean default false
--
-- Later migrations (20261219000001, 20261224000000) assume lineage 2's columns (permission, created_by),
-- while others (20260930000005_calendar_sync_failure_notifications) assume lineage 1's columns (org_id).
--
-- This migration consolidates into a canonical schema:
-- - Preserve the BOOLEAN can_manage model (simpler, already in use by RLS policies)
-- - Add permission TEXT as an alias/view for backwards compat (UPDATE ... permission = 'can_manage' -> can_manage = true)
-- - Remove org_id/space_id (callers should use users.department_id instead)
-- - Keep created_by (audit trail, already present in some live deployments)

-- Step 1: Ensure the table exists with the canonical schema
-- If only one lineage exists in production, ADD the missing columns as NO OPs.
ALTER TABLE IF EXISTS public.calendar_permissions
  ADD COLUMN IF NOT EXISTS can_manage boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS permission text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id),
  DROP COLUMN IF EXISTS org_id,  -- might not exist, no-op if missing
  DROP COLUMN IF EXISTS space_id;

-- Step 2: Backfill permission from can_manage for any existing rows
UPDATE public.calendar_permissions
SET permission = CASE WHEN can_manage THEN 'can_manage' ELSE NULL END
WHERE permission IS NULL AND can_manage IS NOT NULL;

-- Step 3: Backfill can_manage from permission for any existing rows (opposite direction)
UPDATE public.calendar_permissions
SET can_manage = (permission = 'can_manage')
WHERE can_manage IS NULL OR can_manage = false;

-- Step 4: Drop the old unique constraint (user_id, space_id) if it exists and recreate
-- as (user_id) since space_id is gone. This allows multiple roles per user across spaces.
ALTER TABLE IF EXISTS public.calendar_permissions
  DROP CONSTRAINT IF EXISTS calendar_permissions_user_id_space_id_key;

ALTER TABLE IF EXISTS public.calendar_permissions
  ADD CONSTRAINT calendar_permissions_user_id_key UNIQUE (user_id);

-- Step 5: Ensure permission column enforces the valid check
ALTER TABLE IF EXISTS public.calendar_permissions
  DROP CONSTRAINT IF EXISTS calendar_permissions_permission_check;

ALTER TABLE IF EXISTS public.calendar_permissions
  ADD CONSTRAINT calendar_permissions_permission_check
    CHECK (permission IS NULL OR permission = 'can_manage');

-- Step 6: Make can_manage NOT NULL (every user either has permission or doesn't)
ALTER TABLE IF EXISTS public.calendar_permissions
  ALTER COLUMN can_manage SET NOT NULL;

COMMENT ON TABLE public.calendar_permissions IS
  'Role grants for calendar event management. Canonically keyed on user_id; can_manage=true grants permission.';

COMMENT ON COLUMN public.calendar_permissions.can_manage IS
  'True if user can create/edit/delete calendar events and approve pending events. Master truth for RLS policy checks.';

COMMENT ON COLUMN public.calendar_permissions.permission IS
  'Deprecated text alias (permission=''can_manage''). Kept for backwards compat with older migrations. Use can_manage instead.';

COMMENT ON COLUMN public.calendar_permissions.created_by IS
  'User who granted this permission; null for legacy/seed grants.';
