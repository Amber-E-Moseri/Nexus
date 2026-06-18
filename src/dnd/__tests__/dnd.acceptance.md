1. Desktop board: drag task from Not Started to In Progress.
   Expected: task moves column immediately.
   Status: N-A

2. Refresh: task remains In Progress.
   Expected: Supabase row has status = 'in_progress'.
   Status: N-A

3. Desktop board: reorder two tasks in same column.
   Expected: sort_order changes, order persists on refresh.
   Status: N-A

4. Desktop list: reorder rows and refresh.
   Expected: sort_order persists.
   Status: N-A

5. Mobile board: tap card opens task detail.
   Expected: task drawer opens, no drag initiated.
   Status: N-A

6. Mobile board: drag handle moves card.
   Expected: after 180ms press on handle, card drags.
   Status: N-A

7. Mobile list: tap row opens task detail.
   Expected: task drawer opens.
   Status: N-A

8. Mobile list: drag handle reorders.
   Expected: row moves, sort_order persists.
   Status: N-A

9. Empty column accepts dropped task.
   Expected: task moves to empty column, status updates.
   Status: N-A

10. Unauthorized user sees rollback.
    Expected: handleBoardDrop catches RLS error, reverts task, shows toast.
    Status: N-A

11. No duplicate tasks appear during drag.
    Expected: DragOverlay renders overlay, original fades (0.35 opacity) -
    only one visual card per task at any time.
    Status: N-A

12. Filters remain active after drag.
    Expected: active search/filter is unchanged after a successful drop.
    Status: N-A

Also confirm:
- Zero raw HTML5 draggable / onDragStart / onDrop attributes remain in src/
  (grep result: FAIL - repo still contains DndContext handler props, file-upload dropzones, and older DeptSpace/Kanban paths outside the three wired surfaces)
- sort_order column exists on tasks table (confirmed: PASS - `supabase/migrations/20260724000000_task_sort_order.sql`)
- RLS allows current user to UPDATE tasks.status and tasks.sort_order (confirmed: N-A - update policies exist in migrations, but runtime policy execution was not exercised locally)

Notes:
- Local build verification passed on June 17, 2026 via `npm run build`.
- This checklist reflects code and migration inspection in the local workspace, not manual browser/device testing.
