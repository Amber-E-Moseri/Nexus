-- Nova KB: Regional Updates + BLW CAN Map entries.
--
-- Regional Updates entries (regional-updates-what, regional-updates-post) are
-- inserted here and archived immediately in 20270808000004_nova_kb_archive_areas.sql
-- per product decision to scope Nova answers to active features only. Content
-- is preserved in the DB for audit purposes.
--
-- BLW CAN Map entries (can-map-what, can-map-edit) remain active.

insert into public.nova_kb_entries
  (slug, question, answer, feature_area, applicable_roles)
values

(
  'regional-updates-what',
  'What are Regional Updates?',
  'Regional Updates is a broadcast-style feed where Regional Secretaries and Super Admins post announcements, decisions, and highlights that are relevant across the whole BLW Canada sub-region — not just one department.

Updates appear in the Regional Updates section of the sidebar and may also surface in the dashboard activity feed. All staff can read them; only Regional Secretaries and Super Admins can create or edit them.',
  'regional_updates',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'regional-updates-post',
  'How do I post a Regional Update?',
  'Go to **Regional Updates** in the sidebar and click "New Update." Give it a title, write the body (rich text supported), and optionally attach files or links. Click Publish to broadcast it to all staff immediately.

Only Regional Secretaries and Super Admins can create or edit updates. If you have news to share org-wide, send it to your Regional Secretary to post on your behalf.',
  'regional_updates',
  ARRAY['super_admin','regional_secretary']
),

(
  'can-map-what',
  'What is the CAN Map?',
  'The CAN Map (BLW Canada Map) is an interactive map of Canadian post-secondary institutions showing where BLW Canada has (or is pursuing) campus ministry presence. Nearby campuses cluster together as you zoom out; click a marker to see details for that campus — name, region, ministry presence status, contact person, and photos.

You can find it at **Map** in the sidebar, or go directly to `/map`. Anyone signed in can view it, regardless of role.',
  'can_map',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'can-map-edit',
  'How do I add or edit a campus on the CAN Map?',
  'Campus data is managed from the admin edits page, not from the map itself — go to **Settings → Admin → Campus Edits** (or `/admin/campus-edits`). From there you can add a new campus, edit an existing one''s details, or delete one.

This page is restricted to Super Admins, Regional Secretaries, and the ORS (Data Management) role. If you need a campus added or corrected and don''t have access, reach out to one of those.

Campus photo management is a separate, narrower page (**Settings → Campus Photos**) restricted to Super Admins and ORS only — Regional Secretaries can edit campus details but not manage campus photos.',
  'can_map',
  ARRAY['super_admin','regional_secretary']
);
