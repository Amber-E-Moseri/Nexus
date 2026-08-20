alter table registrations
  add column if not exists manually_confirmed boolean not null default false;
