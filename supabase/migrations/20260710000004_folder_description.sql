-- Folder descriptions (Create Folder modal, ClickUp parity)
alter table public.folders add column if not exists description text;
