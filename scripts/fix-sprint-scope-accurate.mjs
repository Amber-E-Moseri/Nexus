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
  answer: `Sprint scopes control **where sprint tasks appear** and **who can access** the sprint. There are three options:

**1. Single Department (Private)**
- Sprint and tasks visible only within your department
- Only department members can view, join, or contribute
- Tasks don't appear in other department spaces
- Use for: Department-specific work, confidential initiatives, internal planning

**2. Multi-Dept Collaboration (Cross-Departmental)**
- Sprint visible across all departments
- Any platform user can view and join
- Sprint tasks ARE visible in other department spaces (they "encroach")
- Use for: Organization-wide initiatives (e.g., "New Member Onboarding" across all depts)
- Best for: Bringing existing departments together around shared goals

**3. Custom (Contained, No Auto-Teams)**
- Sprint is department-scoped (like Single Department)
- You manually add specific people or teams by hand
- Tasks stay contained—don't leak into other department spaces
- Use for: Event planning, temporary project teams, adhoc collaborations
- Best for: New teams that need isolation but cross-dept membership
- Example: Planning committee for a one-time event with people from multiple depts

**The Key Difference:**
- **Multi-Dept Collaboration**: Tasks visible across all depts (good for org-wide initiatives)
- **Custom**: Tasks contained to the sprint (good for isolated projects with hand-picked members)

**To set or change scope:**
When creating a sprint, choose based on your needs:
- Department work → Single Department
- Org initiative across existing depts → Multi-Dept Collaboration  
- New team or event → Custom`,
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

  console.log("✓ Sprint scope KB entry updated with accurate task visibility behavior");
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
}
