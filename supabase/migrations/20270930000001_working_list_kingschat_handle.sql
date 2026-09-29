-- Add kingschat_handle column to working_list
alter table public.working_list
  add column if not exists kingschat_handle text default '';
