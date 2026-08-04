-- Reader admin: per-user credit balances, transaction log, and book sharing.
-- Sharing model: admin creates a full independent copy for the recipient
-- (new reader_books row + PDF re-uploaded to recipient's Storage folder).
-- recipient_shared_books is audit provenance only, not access control.

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
  using (exists (select 1 from public.users where id = auth.uid() and role = 'super_admin'));

-- Transaction log
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
  using (exists (select 1 from public.users where id = auth.uid() and role = 'super_admin'));

-- Tag column on reader_books (admin-assigned label shown in library)
alter table public.reader_books add column if not exists tag text;

-- Provenance: records which books were shared from whom to whom (audit only)
create table public.reader_shared_books (
  id                  uuid primary key default gen_random_uuid(),
  source_book_id      uuid not null,
  recipient_book_id   uuid not null,
  shared_by           uuid not null references auth.users,
  shared_with         uuid not null references auth.users,
  created_at          timestamptz default now(),
  unique(source_book_id, shared_with)
);

alter table public.reader_shared_books enable row level security;

create policy "admins read all share records"
  on public.reader_shared_books for select
  using (exists (select 1 from public.users where id = auth.uid() and role = 'super_admin'));

create policy "admins insert share records"
  on public.reader_shared_books for insert
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'super_admin'));

-- Allow admins to upload PDFs to any user's folder (needed for share copy)
create policy "admins upload any reader pdf"
  on storage.objects for insert
  with check (
    bucket_id = 'reader-pdfs'
    and exists (select 1 from public.users where id = auth.uid() and role = 'super_admin')
  );

-- Allow admins to read any PDF (needed to download source before re-uploading)
create policy "admins read any reader pdf"
  on storage.objects for select
  using (
    bucket_id = 'reader-pdfs'
    and exists (select 1 from public.users where id = auth.uid() and role = 'super_admin')
  );

-- RPC: create a copy of a book for a recipient (super_admin only)
-- Returns the new book UUID created for the recipient.
create or replace function public.share_reader_book(
  p_source_book_id  uuid,
  p_shared_with     uuid,
  p_tag             text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id    uuid := auth.uid();
  v_new_book_id uuid := gen_random_uuid();
  v_book        reader_books;
begin
  if not exists (select 1 from users where id = v_admin_id and role = 'super_admin') then
    raise exception 'Access denied: super_admin required';
  end if;

  select * into v_book from reader_books where id = p_source_book_id and user_id = v_admin_id;
  if not found then
    raise exception 'Book not found or not owned by you';
  end if;

  -- Create independent copy for the recipient (admin-chosen tag included)
  insert into reader_books (
    id, user_id, title, author, source,
    word_count, estimated_minutes, progress_index, last_read_at, created_at, tag
  ) values (
    v_new_book_id, p_shared_with, v_book.title, v_book.author, v_book.source,
    v_book.word_count, v_book.estimated_minutes, 0, now(), now(),
    coalesce(p_tag, v_book.tag)
  );

  -- Record provenance
  insert into reader_shared_books (source_book_id, recipient_book_id, shared_by, shared_with)
  values (p_source_book_id, v_new_book_id, v_admin_id, p_shared_with)
  on conflict (source_book_id, shared_with) do nothing;

  return v_new_book_id;
end;
$$;

grant execute on function public.share_reader_book(uuid, uuid, text) to authenticated;

-- RPC: gift credits (super_admin only)
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
  values (p_user_id, v_giver_id, case when p_recurring then 'recurring'::text else 'gift'::text end, v_mins, p_note);
end;
$$;

grant execute on function public.gift_reader_credits(uuid, numeric, text, boolean) to authenticated;

-- RPC: record usage (own user only)
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
