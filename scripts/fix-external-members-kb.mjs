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

const updatedEntry = {
  slug: "sprints-members",
  question: "How do external members work in sprints?",
  answer: `External members are people who **temporarily join a sprint** to contribute but don't belong to the sprint's home department. Nexus makes it easy to invite guest contributors without giving them permanent department access.

**What are external members?**
- People added to a specific sprint from outside departments
- Have time-limited access (auto-expire at sprint end)
- Can view sprint tasks, mark attendance, and participate
- Cannot see other sprints or departments (privacy)

**When to use external members:**
- Cross-departmental projects (e.g., IT working with Admin on a shared initiative)
- Temporary consultants or guest speakers
- Event staffing (e.g., inviting Media to cover a Ministry sprint)
- Vendor or partner collaboration

**How to add external members:**
1. Go to sprint settings → Members tab
2. Click "Add External Member"
3. Search for the person by name or email
4. Set their role: **Contributor** (can see/edit tasks) or **Observer** (read-only)
5. **Optional:** Add them to a team during the invite (they'll join that team for the sprint)
6. Expiration is automatic at sprint end (no cleanup needed)

**Important:** External members still see all sprint tasks and details—there's no task-level privacy filtering. Only invite people you trust with the full sprint scope.

**Re-inviting:** If an external member needs to return after sprint end, simply add them again; Nexus treats them as a fresh invite.`,
  feature_area: "sprints",
  status: "active",
  applicable_roles: ["super_admin", "regional_secretary", "dept_lead", "pastor", "member"],
};

try {
  const { data, error } = await supabase
    .from("nova_kb_entries")
    .upsert([updatedEntry], { onConflict: "slug" });

  if (error) {
    console.error("Update failed:", error);
    process.exit(1);
  }

  console.log("✓ External members KB entry updated with team assignment info");
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
}
