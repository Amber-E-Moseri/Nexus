-- Reconcile broadcast_campaigns with communication_segments
-- Adds optional segment_id FK to broadcast_campaigns and documents the
-- canonical recipient pill shape on both tables.
-- GUARD: both tables created later (communication_segments: 20260721000001,
-- broadcast_campaigns: 20260901000000).
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'communication_segments' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE $cmt$comment on column public.communication_segments.filters is
      'Array of recipient pill objects: [{"type":"department","deptId":"..."}, {"type":"role","role":"pastor"}, {"type":"individual","email":"...","name":"..."}]'$cmt$;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'broadcast_campaigns' AND relnamespace = 'public'::regnamespace)
     AND EXISTS (SELECT 1 FROM pg_class WHERE relname = 'communication_segments' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE $stmt$alter table public.broadcast_campaigns
      add column if not exists segment_id uuid
        references public.communication_segments(id)
        on delete set null$stmt$;
    EXECUTE $cmt2$comment on column public.broadcast_campaigns.recipient_filters is
      'Inline recipient pills — same shape as communication_segments.filters. Ignored at send time if segment_id is set.'$cmt2$;
    EXECUTE $cmt3$comment on column public.broadcast_campaigns.segment_id is
      'Optional FK to communication_segments. When set, the segment filters are resolved at send time and recipient_filters is ignored.'$cmt3$;
  END IF;
END;
$guard$;
