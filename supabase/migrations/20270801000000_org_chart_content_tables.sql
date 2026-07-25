-- Org chart text content (BLW-org-chart-edit)
--
-- The /org page (OrgChartPage.jsx) has always rendered its node/edge text
-- (titles, subtitles, detail paragraphs, edge labels) from hardcoded JS
-- constants. This adds persistence for just the TEXT fields so
-- regional_secretary/super_admin can edit them in the UI and have edits
-- stick for every viewer. Layout fields (x/y/w/h/tier/accent/type/bend)
-- stay in the JS file — only text moves here, joined back in by id.

create table public.org_chart_nodes (
  id text primary key,
  code text not null default '',
  title text not null default '',
  sub text not null default '',
  flow_caption text not null default '',
  details jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);

create table public.org_chart_edges (
  id text primary key,
  label text not null default '',
  details jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);

alter table public.org_chart_nodes enable row level security;
alter table public.org_chart_edges enable row level security;

-- Viewing the org chart stays open to every authenticated user.
create policy org_chart_nodes_select on public.org_chart_nodes
  for select using (auth.uid() is not null);
create policy org_chart_edges_select on public.org_chart_edges
  for select using (auth.uid() is not null);

-- Only super_admin / regional_secretary can write — same idiom as
-- can_manage_space() in 20270726000000_regional_secretary_can_manage_space.sql.
create policy org_chart_nodes_insert on public.org_chart_nodes
  for insert with check (public.is_super_admin() or public.current_user_role() = 'regional_secretary');
create policy org_chart_nodes_update on public.org_chart_nodes
  for update using (public.is_super_admin() or public.current_user_role() = 'regional_secretary')
  with check (public.is_super_admin() or public.current_user_role() = 'regional_secretary');
create policy org_chart_nodes_delete on public.org_chart_nodes
  for delete using (public.is_super_admin() or public.current_user_role() = 'regional_secretary');

create policy org_chart_edges_insert on public.org_chart_edges
  for insert with check (public.is_super_admin() or public.current_user_role() = 'regional_secretary');
create policy org_chart_edges_update on public.org_chart_edges
  for update using (public.is_super_admin() or public.current_user_role() = 'regional_secretary')
  with check (public.is_super_admin() or public.current_user_role() = 'regional_secretary');
create policy org_chart_edges_delete on public.org_chart_edges
  for delete using (public.is_super_admin() or public.current_user_role() = 'regional_secretary');

drop trigger if exists org_chart_nodes_updated_at on public.org_chart_nodes;
create trigger org_chart_nodes_updated_at
  before update on public.org_chart_nodes
  for each row
  execute function public.set_updated_at();

drop trigger if exists org_chart_edges_updated_at on public.org_chart_edges;
create trigger org_chart_edges_updated_at
  before update on public.org_chart_edges
  for each row
  execute function public.set_updated_at();
