import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf8");
const envVars = {};
envContent.split("\n").forEach((line) => {
  const [key, value] = line.split("=");
  if (key && value) {
    envVars[key.trim()] = value.trim();
  }
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// 1. Delete all growth tracking entries
console.log("Removing growth tracking entries...");
const { error: deleteError } = await supabase
  .from("nova_kb_entries")
  .delete()
  .eq("feature_area", "growth tracking");

if (deleteError) {
  console.error("Delete failed:", deleteError);
  process.exit(1);
}

// 2. Add new entries
const newEntries = [
  {
    slug: "calendar-sync-planner",
    question: "How do I sync my calendar with the planner?",
    answer: `You can sync your calendar with the Time-Blocking Planner to see your scheduled events alongside your tasks and sprints.

**Why sync your calendar?**
- See your meetings and blocked time when planning your week
- Avoid double-booking yourself
- Balance task time with meeting commitments
- Get a complete picture of your schedule

**How to sync your calendar:**
1. Open the Time-Blocking Planner (Sidebar → Planner)
2. Look for the calendar settings or sync option
3. Connect your Google Calendar or other calendar source
4. Calendar events will appear as blocks in your planner view
5. You can toggle calendar visibility on/off to focus on tasks or see everything

**What appears in the planner:**
- Your meetings and calendar events
- Tasks assigned to you or in your sprints
- Your blocked/unavailable time
- Weekly wins logged
- Your sprint schedule

**Note:** Calendar sync is read-only from the planner—you create new events in your calendar app, not in Nexus.`,
    feature_area: "personal planning",
    status: "active",
    applicable_roles: ["super_admin", "regional_secretary", "dept_lead", "pastor", "member"],
  },
  {
    slug: "calendar-add-tasks-sprints",
    question: "How do I add my tasks or sprint to my calendar?",
    answer: `You can export your tasks and sprint schedules to your personal calendar so they appear alongside your other commitments.

**Why add tasks to your calendar?**
- See task deadlines in your calendar view
- Get reminders for upcoming task due dates
- Plan your time blocks around task deadlines
- Keep all your commitments in one place

**How to add tasks to your calendar:**
1. Open a task or sprint you want to add
2. Look for "Add to Calendar" or calendar icon button
3. Choose your calendar destination (Google Calendar, etc.)
4. Set the time and any reminders you want
5. The task/sprint deadline will now appear in your calendar

**Calendar feeds:**
Some features support subscribing to a task or sprint feed so tasks automatically sync. Check the task or sprint details for an iCal or subscription link.

**Note:** Adding tasks to your calendar keeps them in sync—when you update the task due date, your calendar event updates automatically (when synced).`,
    feature_area: "calendar",
    status: "active",
    applicable_roles: ["super_admin", "regional_secretary", "dept_lead", "pastor", "member"],
  },
  {
    slug: "mobile-best-practices",
    question: "What are best practices for using Nexus on mobile?",
    answer: `Nexus works great on your phone. Here are tips to get the most out of it on mobile.

**Install Nexus to your home screen:**
- iPhone: Open Nexus in Safari → Tap Share → "Add to Home Screen"
- Android: Open Nexus in Chrome → Tap Menu (⋮) → "Install app" or "Add to home screen"
- Once installed, Nexus opens like a native app—faster and easier to access
- It stays updated automatically

**Enable notifications:**
1. Open Settings (Sidebar → Settings)
2. Go to Notifications or Push Notifications
3. Enable "Desktop Notifications" or "Mobile Notifications"
4. Choose which events to notify you about: mentions, task assignments, sprint updates, etc.
5. Allow notifications when prompted by your phone
6. You'll get alerts even when you're away from Nexus

**Mobile tips:**
- Use "My Tasks" to focus on what's due today/tomorrow
- Swipe left/right to switch between tasks and sprints
- Tap the search icon to find tasks or people quickly
- Use the Inbox to catch up on mentions and activity
- Enable notifications so you don't miss important updates

**Performance:**
- Nexus caches data, so it works offline for recently viewed content
- Photos and attachments load on-demand to save bandwidth
- Use WiFi when syncing large files

**Accessibility:**
- Zoom in Settings if text is too small
- Use dark mode to reduce eye strain (if available)
- Enable larger touch targets in Accessibility settings`,
    feature_area: "general",
    status: "active",
    applicable_roles: ["super_admin", "regional_secretary", "dept_lead", "pastor", "member"],
  },
];

console.log("Adding new KB entries...");
const { error: insertError } = await supabase
  .from("nova_kb_entries")
  .upsert(newEntries, { onConflict: "slug" });

if (insertError) {
  console.error("Insert failed:", insertError);
  process.exit(1);
}

console.log("✓ Removed growth tracking entries");
console.log("✓ Added calendar syncing (planner) entry");
console.log("✓ Added add tasks/sprints to calendar entry");
console.log("✓ Added mobile best practices entry");
