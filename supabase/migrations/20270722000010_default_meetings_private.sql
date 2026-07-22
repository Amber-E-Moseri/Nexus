-- System-wide default: meetings are private unless explicitly shared.
--
-- App-level defaults were already private in MeetingModal.jsx (isPrivate
-- state defaults true) but ScheduleMeetingModal.jsx hardcoded
-- visibility: 'published' with no toggle — just fixed client-side to
-- 'private' + allowed_viewers: attendeeIds (sharing = inviting attendees).
-- This changes the column default too, for defense-in-depth against any
-- insert path that omits visibility entirely.

alter table public.meetings alter column visibility set default 'private';
