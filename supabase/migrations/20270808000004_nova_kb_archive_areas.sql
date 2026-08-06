-- Nova KB: archive 4 feature areas per product decision (14 entries).
-- Using status = 'archived' rather than DELETE: nova_kb_read only returns
-- status = 'active' rows (see 20270807000006_nova_knowledge_base.sql), so
-- archiving removes these from anything Nova will say without losing the
-- content or the audit trail. Reversible by flipping status back to
-- 'active' if any of these come back into scope later.
--
-- Areas archived: Org Chart / Directory, Growth Tracking, Immerse, and
-- Regional Updates (if those entries exist — added and archived same week).
-- BLW CAN Map entries are unaffected and stay active.

update public.nova_kb_entries
set status = 'archived',
    last_reviewed_at = now()
where slug in (
  'org-chart',
  'org-find-contact',
  'org-people-page',
  'org-update-profile',
  'growth-what',
  'growth-log',
  'growth-visibility',
  'growth-usage',
  'immerse-what',
  'immerse-access',
  'immerse-share',
  'immerse-manage',
  'regional-updates-what',
  'regional-updates-post'
);
