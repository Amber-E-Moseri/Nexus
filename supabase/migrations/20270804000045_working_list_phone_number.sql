-- Update working_list schema: add phone_number, drop leadership_category,
-- and clear all existing rows so the user can re-sync from Google Sheets.

alter table public.working_list
  add column if not exists phone_number text not null default '';

alter table public.working_list
  drop column if exists leadership_category;

-- Clear all rows (user will re-import from Google Sheets)
delete from public.working_list;
