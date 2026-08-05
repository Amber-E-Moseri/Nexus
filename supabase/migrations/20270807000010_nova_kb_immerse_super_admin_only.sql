-- Nova KB fix: Immerse is now restricted to super_admin only. It was
-- previously accessible to regional_secretary too via three separate
-- frontend entry points (App.jsx route guard, a Sidebar.jsx command-list
-- entry, and an AppsPage.jsx "My Library" tile) — all three have been
-- changed to super_admin-only, matching the sidebar's own pre-existing
-- "Surprise" placeholder for regional_secretary (see
-- src/components/layout/Sidebar.jsx), which was the one place already
-- correctly reflecting the intended restriction. This migration brings the
-- KB content in line so Nova doesn't tell a regional_secretary they have
-- access to something they no longer do.
--
-- Supersedes the 20270807000009 fix, which correctly separated "route
-- access" from "admin capability" but was written when regional_secretary
-- still had route access at all — that premise no longer holds.

update public.nova_kb_entries
set answer = 'Immerse is a built-in reading and study tool in Nexus. It lets you upload your own PDFs and books into a personal library, then read them in a dedicated interface — with page-flip animations, highlights, notes, and a clean reading experience without distractions.

Access it from **Books** in the sidebar (or navigate to /books). This is a Super Admin-only feature — no other role, including Regional Secretary, has access to it.',
    applicable_roles = ARRAY['super_admin'],
    last_reviewed_at = now()
where slug = 'immerse-what';

update public.nova_kb_entries
set applicable_roles = ARRAY['super_admin'],
    last_reviewed_at = now()
where slug = 'immerse-access';

update public.nova_kb_entries
set answer = 'Sharing a book into someone else''s Immerse library is available from the Admin panel inside Immerse: choose the book and the recipient, and it creates a full independent copy in that person''s library (it is not a live link — the recipient gets their own copy to read, highlight, and annotate separately from yours). Immerse itself is Super Admin only, so this — like everything else in Immerse — is not available to any other role.',
    applicable_roles = ARRAY['super_admin'],
    last_reviewed_at = now()
where slug = 'immerse-share';

update public.nova_kb_entries
set answer = 'For a book in your own library, hover over its card to reveal the rename/delete controls. Rename lets you type a new title; delete permanently removes it from your library (this cannot be undone). Immerse is Super Admin only, so this applies only to that role — no other role has a library to manage.',
    applicable_roles = ARRAY['super_admin'],
    last_reviewed_at = now()
where slug = 'immerse-manage';

-- roles-regional-secretary listed its exceptions from "near-super-admin
-- access" without mentioning Immerse — now that Immerse is Super Admin
-- only, leaving it off the exceptions list would let this entry imply
-- regional_secretary still has it.
update public.nova_kb_entries
set answer = 'Regional Secretary has near-super-admin access — they can see and act across all departments with a few exceptions (they can''t access campus photos settings, certain permission/integration management tools, or Immerse/Books, which is Super Admin only).

Regional Secretaries typically support the whole organization and need visibility across departments to do their job. If you have a request that requires someone to look across multiple departments, a Regional Secretary can often help.',
    last_reviewed_at = now()
where slug = 'roles-regional-secretary';
