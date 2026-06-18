CREATE TABLE IF NOT EXISTS calendar_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  response text NOT NULL CHECK (response IN ('going','maybe','not_going')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE calendar_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own RSVPs"
  ON calendar_rsvps FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Managers read all RSVPs"
  ON calendar_rsvps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE public.users.id = auth.uid()
      AND public.users.role = 'super_admin'
    )
  );

CREATE INDEX calendar_rsvps_event_id ON calendar_rsvps(event_id);
CREATE INDEX calendar_rsvps_user_id ON calendar_rsvps(user_id);
