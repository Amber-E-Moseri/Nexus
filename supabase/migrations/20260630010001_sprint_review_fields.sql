alter table public.sprint_reviews
  add column if not exists final_attachments jsonb not null default '[]'::jsonb,
  add column if not exists reviewed_at timestamptz;

update public.sprint_reviews
set reviewed_at = completed_at
where reviewed_at is null
  and completed_at is not null;
