-- Immerse reader: per-user library, highlights, and notes

-- Storage bucket for PDF files
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reader-pdfs', 'reader-pdfs', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

-- Per-user bucket access: path must start with user's UUID
create policy "users manage own pdfs"
  on storage.objects for all
  using (
    bucket_id = 'reader-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'reader-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Book metadata
create table public.reader_books (
  id                uuid primary key,
  user_id           uuid not null references auth.users on delete cascade,
  title             text not null,
  author            text,
  source            text default 'pdf',
  word_count        integer,
  estimated_minutes integer,
  progress_index    integer default 0,
  last_read_at      timestamptz,
  created_at        timestamptz default now()
);

create index reader_books_user_idx on public.reader_books (user_id, last_read_at desc nulls last);

alter table public.reader_books enable row level security;

create policy "users manage own books"
  on public.reader_books for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Highlights
create table public.reader_highlights (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  book_id      uuid not null references public.reader_books on delete cascade,
  sentence_idx integer not null,
  text         text not null,
  created_at   timestamptz default now()
);

create index reader_highlights_book_idx on public.reader_highlights (book_id, user_id);

alter table public.reader_highlights enable row level security;

create policy "users manage own highlights"
  on public.reader_highlights for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Notes
create table public.reader_notes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  book_id      uuid not null references public.reader_books on delete cascade,
  sentence_idx integer not null,
  content      text not null,
  anchor_text  text,
  created_at   timestamptz default now()
);

create index reader_notes_book_idx on public.reader_notes (book_id, user_id);

alter table public.reader_notes enable row level security;

create policy "users manage own notes"
  on public.reader_notes for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
