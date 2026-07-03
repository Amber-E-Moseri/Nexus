ALTER TABLE public.meetings
ADD COLUMN IF NOT EXISTS context text DEFAULT '';

CREATE INDEX IF NOT EXISTS meetings_context_idx
  ON public.meetings USING GIN(to_tsvector('english', coalesce(context, '')));
