begin;

alter table public.departments
  add column if not exists task_field_settings jsonb not null default '{}'::jsonb;

alter table public.folders
  add column if not exists task_field_settings jsonb not null default '{}'::jsonb;

alter table public.lists
  add column if not exists task_field_settings jsonb not null default '{}'::jsonb;

comment on column public.departments.task_field_settings is
  'Space-level task field visibility settings. Used as the fallback scope for task modal fields.';

comment on column public.folders.task_field_settings is
  'Folder-level task field visibility overrides. Applied over space settings for tasks in the folder.';

comment on column public.lists.task_field_settings is
  'List-level task field visibility overrides. Applied over folder and space settings for tasks in the list.';

commit;
