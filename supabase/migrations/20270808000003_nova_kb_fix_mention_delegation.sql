-- Nova KB fix: notif-mentions and tasks-comment both described @mention as
-- a notification-only action ("they will receive a notification"). Verified
-- against src/features/tasks/components/TaskComments.jsx and the
-- assign_via_mention / assign_subtask_via_mention RPCs
-- (20270730000001_assign_via_mention.sql): @mentioning someone in a task or
-- subtask comment actually adds them to task_assignees first — the
-- notification is a separate, secondary step that can be skipped (self-
-- mention, muted prefs) without skipping the assignment. The old wording
-- also claimed mentions work in "meeting notes, or other Nexus text field" —
-- no Tiptap mention extension or equivalent exists outside task/subtask
-- comments, so that scope was wrong too.

update public.nova_kb_entries
set answer = 'Type @ followed by their name in a task or subtask comment, then post it. This does two things:

1. **It assigns them to the task.** Every person you @mention is added to the task''s assignee list — this happens whether or not they get notified. Mentioning someone already assigned is harmless (it just doesn''t duplicate them).
2. **It (usually) notifies them.** They get an Inbox notification with the commenter''s name, the task title, and a preview of your comment, plus a desktop/push notification if they''ve enabled that. Two exceptions: mentioning yourself never sends a notification (nothing to tell yourself), and if someone has muted mention notifications, they won''t be notified — but they are still assigned either way.

**Who can @mention-assign:** you need to already be able to assign the task — the task''s creator, a Super Admin/Regional Secretary, or the Dept Lead of that task''s department. For personal tasks, only the task owner or a Super Admin can do it.

Note: this assign-on-mention behavior is specific to **task and subtask comments**. Nexus doesn''t currently support @mentions in meeting notes or other text fields.',
    source_docs = ARRAY['src/features/tasks/components/TaskComments.jsx','supabase/migrations/20270730000001_assign_via_mention.sql'],
    last_reviewed_at = now()
where slug = 'notif-mentions';

update public.nova_kb_entries
set answer = 'Open the task by clicking its name. Scroll to the **Comments** section at the bottom of the task panel. Click in the comment input box and type your message. Press the send button (or Ctrl+Enter on Windows, Cmd+Enter on Mac) to post.

**@mentioning someone:** Type @ followed by their name in your comment. This does more than notify them — it actually assigns them to the task (added to the task''s assignee list), and separately sends them a notification with the comment context, unless they''ve muted mention notifications or you mentioned yourself. The mention appears as a highlighted name in the comment. You need assign-permission on the task for this to work (creator, Super Admin/Regional Secretary, or that department''s Dept Lead).

**Rich text:** You can bold text (**bold**), use bullet points, and paste links into comments. The comment box supports basic markdown-style formatting.

**Editing and deleting:** You can edit or delete your own comments by hovering over the comment and clicking the three-dot (⋯) menu. Other people''s comments can only be edited or deleted by that person or by a super admin.',
    source_docs = ARRAY['src/features/tasks/components/TaskComments.jsx','supabase/migrations/20270730000001_assign_via_mention.sql'],
    last_reviewed_at = now()
where slug = 'tasks-comment';
