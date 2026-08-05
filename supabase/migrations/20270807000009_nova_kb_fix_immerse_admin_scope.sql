-- Nova KB fix: the Immerse entries seeded in 20270807000007 claimed Regional
-- Secretary has "manage the library" / share capability equal to Super
-- Admin. Verified against the actual code and this is wrong:
--   - share_reader_book / gift_reader_credits RPCs (20270806000009_reader_admin.sql)
--     check `role = 'super_admin'` only, never regional_secretary.
--   - BooksApp.jsx derives `isAdmin = effectiveRole === 'super_admin'`, which
--     gates the Admin panel (share / credits) — regional_secretary never sees it.
--   - reader_books RLS is pure per-user ownership (`user_id = auth.uid()`),
--     no role check at all, so rename/delete of your OWN book was never an
--     admin-only action in the first place — any role that can reach /books
--     (super_admin or regional_secretary; dept_lead/pastor/member are blocked
--     at the route level and never see these entries) can do it equally.
-- Corrected model: route access to Immerse itself = super_admin +
-- regional_secretary only. Managing your own personal library (rename/
-- delete your own books) = equal between those two roles. Sharing a book to
-- someone else's library, or managing reading-time credits = super_admin only.

update public.nova_kb_entries
set answer = 'Immerse is a built-in reading and study tool in Nexus. It lets you upload your own PDFs and books into a personal library, then read them in a dedicated interface — with page-flip animations, highlights, notes, and a clean reading experience without distractions.

Access it from **Books** in the sidebar (or navigate to /books). Only Super Admins and Regional Secretaries can access Immerse at all — it is not available to dept_lead, pastor, or member roles. Within Immerse, Super Admins and Regional Secretaries have equal access to their own personal library (add, read, rename, and delete their own books). Super Admins additionally have an Admin panel for sharing books into other people''s libraries and managing reading-time credits — that part is Super Admin only, Regional Secretaries do not have it.',
    applicable_roles = ARRAY['super_admin', 'regional_secretary'],
    last_reviewed_at = now()
where slug = 'immerse-what';

update public.nova_kb_entries
set answer = 'Sharing a book into someone else''s Immerse library is a **Super Admin only** capability — Regional Secretaries can use Immerse fully for their own reading, but do not have the Share/Admin panel, even though they can otherwise access Books.

If you are a Super Admin: open the Admin panel from within Immerse, choose the book and the recipient, and it creates a full independent copy in that person''s library (it is not a live link — the recipient gets their own copy to read, highlight, and annotate separately from yours).

If you are a Regional Secretary and need a book shared with someone, ask a Super Admin to do it for you — there is currently no self-service way to request it from inside Immerse.',
    last_reviewed_at = now()
where slug = 'immerse-share';

update public.nova_kb_entries
set answer = 'For a book in **your own** library, hover over its card to reveal the rename/delete controls. Rename lets you type a new title; delete permanently removes it from your library (this cannot be undone). Both Super Admins and Regional Secretaries can do this for their own books equally — it is not an admin-only action, it is just how you manage anything already in your personal library.

Note this is different from **sharing** a book into someone else''s library, or managing reading-time credits — those two things are Super Admin only (see "How do I share a reading with someone in Immerse?").',
    last_reviewed_at = now()
where slug = 'immerse-manage';
