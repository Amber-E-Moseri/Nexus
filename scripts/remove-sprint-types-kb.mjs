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

try {
  const { error } = await supabase
    .from("nova_kb_entries")
    .delete()
    .eq("slug", "sprints-types");

  if (error) {
    console.error("Delete failed:", error);
    process.exit(1);
  }

  console.log("✓ Sprint types KB entry deleted");
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
}
