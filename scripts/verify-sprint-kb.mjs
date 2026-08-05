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

const { data, error } = await supabase
  .from("nova_kb_entries")
  .select("slug, question, feature_area")
  .eq("feature_area", "sprints")
  .eq("status", "active");

if (error) {
  console.error("Query failed:", error);
  process.exit(1);
}

console.log(`Found ${data?.length || 0} sprint KB entries:`);
data?.forEach((e) => console.log(`  - ${e.slug}: ${e.question}`));
