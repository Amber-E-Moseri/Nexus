-- ============================================================================
-- RSVP NOTES CHARACTER LIMIT CONSTRAINT
-- Defense in depth: Frontend + Database validation
-- ============================================================================

alter table invitation_recipients
  add constraint rsvp_notes_max_length
  check (char_length(rsvp_notes) <= 500);

comment on constraint rsvp_notes_max_length on invitation_recipients is
  'RSVP notes limited to 500 characters. Prevents spam and keeps notes concise (allergies, dietary needs, plus-one info, etc.)';

-- Update comment on column for clarity
comment on column invitation_recipients.rsvp_notes is
  'Optional guest notes when RSVP-ing. Limited to 500 characters. Examples: dietary restrictions, plus-one info, accessibility needs.';
