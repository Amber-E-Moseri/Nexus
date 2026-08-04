-- Retire legacy meeting type values and normalize the labels used by Meetings.
update public.meetings
set meeting_type = 'manager_meeting'
where meeting_type = 'direction_meeting';

update public.meetings
set meeting_type = 'regional'
where meeting_type = 'regional_group';
