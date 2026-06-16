begin;

delete from public.task_comments
where task_id is null
   or author_id is null;

alter table public.task_comments
  alter column task_id set not null,
  alter column author_id set not null;

commit;
