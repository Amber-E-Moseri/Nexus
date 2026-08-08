-- Add email opt-out preference to users table
-- Default: opted_out = false (all users opted in by default)
-- Users can opt out by setting opted_out = true

ALTER TABLE public.users
ADD COLUMN opted_out BOOLEAN DEFAULT FALSE;

-- Add index for efficient querying
CREATE INDEX idx_users_opted_out ON public.users(opted_out);
