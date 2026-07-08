-- Reconcile broadcast_campaigns with communication_segments
-- Adds optional segment_id FK to broadcast_campaigns and documents the
-- canonical recipient pill shape on both tables.

-- 1. Document the canonical pill shape on communication_segments.filters
comment on column public.communication_segments.filters is
  'Array of recipient pill objects: [{"type":"department","deptId":"..."}, {"type":"role","role":"pastor"}, {"type":"individual","email":"...","name":"..."}]';

-- 2. Add optional segment_id to broadcast_campaigns
--    Nullable; no default. When set, takes precedence over recipient_filters at send time.
alter table public.broadcast_campaigns
  add column if not exists segment_id uuid
    references public.communication_segments(id)
    on delete set null;

-- 3. Document recipient_filters: inline pills, same shape as communication_segments.filters,
--    superseded by segment_id when that column is set.
comment on column public.broadcast_campaigns.recipient_filters is
  'Inline recipient pills — same shape as communication_segments.filters: [{"type":"department","deptId":"..."}, {"type":"role","role":"pastor"}, {"type":"individual","email":"...","name":"..."}]. Ignored at send time if segment_id is set.';

-- 4. Document the new segment_id column
comment on column public.broadcast_campaigns.segment_id is
  'Optional FK to communication_segments. When set, the segment filters are resolved at send time and recipient_filters is ignored. Both columns coexist; segment_id takes precedence.';
