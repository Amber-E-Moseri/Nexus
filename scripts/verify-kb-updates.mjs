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

// Check for new entries
const { data: newEntries } = await supabase
  .from("nova_kb_entries")
  .select("slug, question")
  .in("slug", ["calendar-sync-planner", "calendar-add-tasks-sprints", "mobile-best-practices"])
  .eq("status", "active");

console.log("✓ New KB entries added:");
newEntries?.forEach((e) => console.log(`  - ${e.slug}: ${e.question}`));

// Check that growth tracking is removed
const { data: growthTracking } = await supabase
  .from("nova_kb_entries")
  .select("slug")
  .eq("feature_area", "growth tracking")
  .eq("status", "active");

console.log(`\n✓ Growth tracking entries (active): ${growthTracking?.length || 0}`);
if (growthTracking?.length === 0) {
  console.log("  ✅ All growth tracking entries removed");
} else {
  console.log("  ⚠ Still have growth tracking entries:");
  growthTracking?.forEach((e) => console.log(`    - ${e.slug}`));
}

// Total KB count
const { data: total } = await supabase
  .from("nova_kb_entries")
  .select("id")
  .eq("status", "active");

console.log(`\n📊 Total KB entries: ${total?.length || 0}`);
