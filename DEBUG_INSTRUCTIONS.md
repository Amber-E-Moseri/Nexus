# Debugging due_time not persisting

## What's been done
1. ✅ Added `dueTime → due_time` mapping in `buildTaskPayload()` 
2. ✅ Verified the migration was applied (20260716000003)
3. ✅ Verified the `due_time` column exists
4. ✅ Added console logging to trace the payload flow

## How to debug

### Step 1: Open Browser DevTools
- Open the app at http://localhost:5173
- Press F12 or Ctrl+Shift+I to open DevTools
- Go to the **Console** tab

### Step 2: Create or Edit a Task with Time
1. Create a new task OR edit an existing task
2. Set a due date (e.g., 2026-07-25)
3. Set a time (e.g., 14:30)
4. Click "Save changes"

### Step 3: Check Console Logs
Look for these log messages in the console:

**Before save:**
```
[TaskModal] payload before save: {
  mode: "update",
  dueDate: "2026-07-25",
  dueTime: "14:30",
  payload: { ... due_time: "14:30" ... }
}

[TaskModal] updating task with payload: {
  taskId: "...",
  dueDate: "2026-07-25",
  dueTime: "14:30",
  payload: { ... due_time: "14:30" ... }
}

[updateTask] patch to send: {
  taskId: "...",
  patch: { ... due_time: "14:30" ... }
}
```

**After response:**
```
[updateTask] response data: {
  taskId: "...",
  due_time: "14:30"
}

[TaskModal] update response: {
  due_time: "14:30"
}
```

### Step 4: Verify in Database
1. Close the task modal
2. Reopen the same task
3. Check if the time field still shows the value you entered

## What to report
Copy the console logs and include:
1. What time you entered
2. Whether `due_time` appears in the `payload` object
3. Whether the response data shows the `due_time` value
4. Whether reopening the task shows the time (or if it reverts to empty)

This will tell us where the value is getting lost.
