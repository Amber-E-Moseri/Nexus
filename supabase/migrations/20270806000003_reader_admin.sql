-- Reader admin: per-user credit balances, transaction log, and book sharing

-- Credit balances (one row per user, balance stored as minutes)
create table public.reader_credits (
  user_id      uuid primary key references auth.users on delete cascade,
  balance_mins numeric not null default 0,
  updated_at   timestamptz default now()
);

alter table public.reader_credits enable row level security;

create policy "users read own credits"
  on public.reader_credits for select
  using (user_id = auth.uid());

create policy "admins read all credits"
  on public.reader_credits for select
  using (
    exists (select 1 from public.users where id = auth.uid() and role = 'super_admin')
  );

-- Transaction log (gifts + usage)
create table public.reader_credit_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  given_by    uuid references auth.users,
  type        text not null check (type in ('gift', 'usage', 'recurring')),
  amount_mins numeric not null,
  note        text,
  created_at  timestamptz default now()
);

create index reader_tx_user_idx on public.reader_credit_transactions (user_id, created_at desc);

alter table public.reader_credit_transactions enable row level security;

create policy "users read own transactions"
  on public.reader_credit_transactions for select
  using (user_id = auth.uid());

create policy "admins read all transactions"
  on public.reader_credit_transactions for select
  using (
    exists (select 1 from public.users where id = auth.uid() and role = 'super_admin')
  );

-- Book sharing (admin → user; read-only for recipient)
create table public.reader_shared_books (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.reader_books on delete cascade,
  shared_by   uuid not null references auth.users,
  shared_with uuid not null references auth.users,
  opened_at   timestamptz,
  created_at  timestamptz default now(),
  unique(book_id, shared_with)
);

alter table public.reader_shared_books enable row level security;

create policy "recipients and admins read shared books"
  on public.reader_shared_books for select
  using (
    shared_with = auth.uid()
    or shared_by = auth.uid()
    or exists (select 1 from public.users where id = auth.uid() and role = 'super_admin')
  );

create policy "admins insert shared books"
  on public.reader_shared_books for insert
  with check (
    exists (select 1 from public.users where id = auth.uid() and role = 'super_admin')
  );

-- Allow recipients to read metadata of books shared with them
create policy "recipients read shared book metadata"
  on public.reader_books for select
  using (
    exists (
      select 1 from public.reader_shared_books
      where book_id = public.reader_books.id
        and shared_with = auth.uid()
    )
  );

-- Allow admins to read all book metadata (for admin panel)
create policy "admins read all book metadata"
  on public.reader_books for select
  using (
    exists (select 1 from public.users where id = auth.uid() and role = 'super_admin')
  );

-- Allow recipients to download PDFs of shared books from Storage
create policy "recipients read shared pdfs"
  on storage.objects for select
  using (
    bucket_id = 'reader-pdfs'
    and exists (
      select 1
      from public.reader_shared_books rsb
      join public.reader_books rb on rb.id = rsb.book_id
      where rsb.shared_with = auth.uid()
        and name = rb.user_id::text || '/' || rb.id::text || '.pdf'
    )
  );

-- RPC: gift credits (super_admin only, enforced in function body)
create or replace function public.gift_reader_credits(
  p_user_id    uuid,
  p_hours      numeric,
  p_note       text default null,
  p_recurring  boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_giver_id uuid := auth.uid();
  v_mins     numeric := p_hours * 60;
begin
  if not exists (select 1 from users where id = v_giver_id and role = 'super_admin') then
    raise exception 'Access denied: super_admin required';
  end if;

  insert into reader_credits (user_id, balance_mins, updated_at)
  values (p_user_id, v_mins, now())
  on conflict (user_id) do update
    set balance_mins = reader_credits.balance_mins + v_mins,
        updated_at   = now();

  insert into reader_credit_transactions (user_id, given_by, type, amount_mins, note)
  values (
    p_user_id,
    v_giver_id,
    case when p_recurring then 'recurring'::text else 'gift'::text end,
    v_mins,
    p_note
  );
end;
$$;

grant execute on function public.gift_reader_credits(uuid, numeric, text, boolean) to authenticated;

-- RPC: record usage (called from client after session ends)
create or replace function public.record_reader_usage(
  p_user_id    uuid,
  p_mins_used  numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id <> auth.uid() then
    raise exception 'Access denied';
  end if;

  update reader_credits
  set balance_mins = greatest(0, balance_mins - p_mins_used),
      updated_at   = now()
  where user_id = p_user_id;

  insert into reader_credit_transactions (user_id, type, amount_mins)
  values (p_user_id, 'usage', -p_mins_used);
end;
$$;

grant execute on function public.record_reader_usage(uuid, numeric) to authenticated;
