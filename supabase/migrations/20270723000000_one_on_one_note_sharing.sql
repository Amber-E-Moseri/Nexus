-- Add note-sharing controls for one-on-one meetings
-- Allows reg sec to selectively share notes with individual attendees

ALTER TABLE public.meetings
ADD COLUMN IF NOT EXISTS notes_shared_with uuid[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS series_instance_num int;

-- Index for efficient lookup of meetings in a series
CREATE INDEX IF NOT EXISTS idx_meetings_recurrence_instance
ON public.meetings (recurrence_id, series_instance_num)
WHERE recurrence_id IS NOT NULL AND series_instance_num IS NOT NULL;

-- RLS policy update: notes visibility
-- For one-on-one meetings, creator or users in notes_shared_with can see notes
-- For published meetings, everyone can see notes
-- Policy is enforced in application layer via getMeetingDetails()
