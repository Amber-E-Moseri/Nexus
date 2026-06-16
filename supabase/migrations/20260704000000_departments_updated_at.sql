alter table public.departments
  add column if not exists updated_at timestamptz not null default now();

update public.departments
set updated_at = created_at;

create trigger departments_updated_at
before update on public.departments
for each row execute function public.set_updated_at();
