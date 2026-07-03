ALTER TABLE public.meetings
ADD COLUMN IF NOT EXISTS polished_transcript text;

CREATE INDEX IF NOT EXISTS meetings_polished_transcript_idx
  ON public.meetings USING GIN(to_tsvector('english', coalesce(polished_transcript, '')));
