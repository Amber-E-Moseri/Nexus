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
  slug: "sprints-scopes",
  question: "What are sprint scopes?",
  answer: `Sprint scopes control **visibility and access** for your sprint. There are three scope options:

**1. Single Department (Private)**
- Visible only within your department
- Only department members can view tasks and join
- Use for department-specific initiatives or confidential work
- Example: Pastors running an internal pastoral training sprint

**2. Multi-Dept Collaboration (Organization-wide)**
- Visible across all departments
- Any platform user can view and join
- Cross-departmental collaboration encouraged
- Example: Platform-wide initiative like "New Member Onboarding"

**3. Custom (No Auto-Teams)**
- Department-scoped like "Single Department"
- You manually add specific people or teams (no auto-inclusion)
- For fine-grained control over sprint membership
- Example: A secret planning sprint with handpicked attendees

**Why scopes matter:**
- Scopes control who sees sprint details (dates, tasks, attendance)
- Privacy: department-scoped sprints don't leak sensitive work across ministries
- Governance: RLS policies enforce scope restrictions at the database layer
- Team clarity: "Single Department" shows org structure; "Multi-Dept" signals cross-functional work

**To set or change scope:**
When creating a sprint, choose the scope that fits your team. If the sprint needs to stay private to your department, pick "Single Department" or "Custom". If you're building something org-wide, pick "Multi-Dept Collaboration".`,
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

  console.log("✓ Sprint scope KB entry updated to match actual UI!");
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
}
