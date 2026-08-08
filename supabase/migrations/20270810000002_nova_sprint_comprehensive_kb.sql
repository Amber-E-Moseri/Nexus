-- Nova KB entries for sprint documentation (comprehensive coverage)
-- Covers: scopes, types/categories, archival, external members, meeting linkage

insert into nova_kb_entries (
  slug, question, answer, feature_area, status, applicable_roles, related_slugs
) values
  (
    'sprints-what-is',
    'What is a sprint?',
    'A sprint is a fixed time-box (usually 1-4 weeks) where your team commits to completing a set of tasks. Sprints help organize work, track progress, and create clear boundaries for planning and delivery.

In Nexus, sprints:
- Group related tasks for your team
- Have start and end dates
- Track attendance and participation
- Can link to meetings where sprint planning or reviews happen
- Show real-time progress as tasks move through your status workflow
- Support external members who join temporarily for specific work

Each sprint belongs to a department/space and has its own settings, member roster, and task list.',
    'sprints',
    'active',
    ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
    ARRAY['sprints-scopes','sprints-types','sprints-members','sprints-archive']
  ),
  (
    'sprints-scopes',
    'What are sprint scopes?',
    'Sprint scopes define the **visibility and access** for your sprint. There are two scope levels:

**1. Department Scope (Private)**
- Visible only within your department
- Only department members can view tasks and attend
- Use for department-specific initiatives or confidential work
- Good for: ministry team sprints, budget planning, internal projects

**2. Organization Scope (Shared)**
- Visible across all departments
- Any platform user can view and join
- Cross-departmental collaboration is encouraged
- Good for: platform-wide initiatives, training, all-hands projects

**Why scopes matter:**
- Scopes control who sees sprint details (dates, tasks, attendance)
- Privacy: department-scoped sprints don''t leak sensitive work
- Collaboration: org-scoped sprints invite input from across the ministry
- Governance: RLS policies enforce scope restrictions at the database level

**To set or change scope:**
When creating a sprint, choose "Department" or "Organization" from the scope dropdown. Existing sprints can have their scope changed in sprint settings (super_admin only).',
    'sprints',
    'active',
    ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
    ARRAY['sprints-what-is']
  ),
  (
    'sprints-types',
    'What are sprint types and categories?',
    'Sprint types are labels that categorize the kind of work your sprint focuses on. Categories help teams quickly understand a sprint''s purpose and coordinate across departments.

**Common sprint types:**
- **Planning**: Sprint for strategic planning or roadmapping
- **Development**: Feature work or product improvement
- **Training**: Team learning or skill-building initiatives
- **Operations**: Maintenance, support, or process improvement
- **Events**: Work organized around a specific event or deadline
- **Review**: Retrospectives, audits, or evaluation sprints

**How to use types:**
- Types are optional but recommended for discoverability
- When creating a sprint, select from the dropdown or leave blank
- Types are visible in the sprint list and details
- Use the same type across related sprints to group them conceptually

**Why types matter:**
- Quick filtering: find all "Training" sprints or "Events" sprints at a glance
- Context: new team members see what kinds of work your department does
- Coordination: if another department is also running a "Training" sprint, you know to compare notes

**Example workflow:**
A sprint named "Q3 Discipleship Curriculum" might be typed "Training" so it stands out from "Planning" or "Operations" sprints in the same quarter.',
    'sprints',
    'active',
    ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
    ARRAY['sprints-what-is']
  ),
  (
    'sprints-members',
    'How do external members work in sprints?',
    'External members are people who **temporarily join a sprint** to contribute but don''t belong to the sprint''s home department. Nexus makes it easy to invite guest contributors without giving them permanent department access.

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
5. Expiration is automatic at sprint end (no cleanup needed)

**Important:** External members still see all sprint tasks and details—there''s no task-level privacy filtering. Only invite people you trust with the full sprint scope.

**Re-inviting:** If an external member needs to return after sprint end, simply add them again; Nexus treats them as a fresh invite.',
    'sprints',
    'active',
    ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
    ARRAY['sprints-what-is','sprints-scopes']
  ),
  (
    'sprints-archive',
    'How do I archive a completed sprint?',
    'Archiving a sprint moves it out of the active view and into a historical record. Archived sprints stay in the system for reporting and audit trails but don''t clutter the active sprint list.

**Why archive?**
- Keeps the active sprint list focused on current and upcoming work
- Preserves a complete audit trail for reporting
- Prevents accidental edits to completed work
- Still searchable if you need historical data

**How to archive:**
1. Go to the completed sprint → Settings
2. Click "Archive Sprint"
3. Confirm the action (this is not reversible from the UI)
4. The sprint moves to Archives (or historical section, depending on your view)

**What happens after archiving?**
- Sprint tasks become read-only (no edits)
- The sprint is hidden from the main sprint list
- Sprint attendance and progress are preserved
- Super admins can still access archived sprints via Reports or Search

**Can I unarchive?**
Not through the UI. If you archive by mistake, contact a super_admin who can restore it via the database. Archive carefully!

**When to archive:**
- Immediately after sprint completion (end of sprint meeting is ideal)
- After final sign-off and retrospective completion
- When you''re certain no more edits are needed

**Example:** After your "Q3 Planning Sprint" wraps up and the roadmap is locked, archive it so the sprint list focuses on "Q4 Execution" and ongoing sprints.',
    'sprints',
    'active',
    ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
    ARRAY['sprints-what-is']
  ),
  (
    'sprints-meetings',
    'How do I link meetings to a sprint?',
    'Linking a meeting to a sprint connects sprint work with the discussions and decisions that drive it. When a meeting is linked, both the meeting and sprint track the relationship.

**Why link meetings?**
- **Context:** See which meetings shaped sprint decisions
- **Attendance:** One attendance record covers both meeting and sprint participation
- **Continuity:** Sprint review or planning meetings become part of the sprint record
- **Reporting:** Generate sprint reports that include meeting notes and decisions

**Linked meeting types:**
- **Sprint Planning:** Kick-off meeting where team commits to sprint tasks
- **Sprint Review:** Showcase meeting where team presents completed work
- **Sprint Retrospective:** Debrief where team reflects on process and improvements
- **Standup:** Regular check-ins (optional, but useful for high-visibility sprints)
- **Other:** Any meeting that discusses sprint work (stakeholder updates, client reviews, etc.)

**How to link a meeting:**
1. Go to the sprint → Meetings tab (or Linked Meetings section)
2. Click "Link Meeting" or "Add Meeting"
3. Search for an existing meeting, or create a new one
4. Confirm the link

**How to link from the meeting side:**
1. Create or open a meeting in the Calendar or Meetings app
2. Scroll to "Related Sprint" (or "Linked Sprint")
3. Search and select the sprint to link

**Who can link meetings?**
- Sprint owners and managers can link meetings
- Super admins can link meetings to any sprint

**Once linked:**
- Meeting attendees automatically appear in sprint attendance (optional sync)
- Sprint tasks may be discussed in meeting notes
- Reports can show "Sprint ABC connected to Meeting XYZ on [date]"

**Example workflow:**
1. Create a sprint "Q4 Donor Outreach" on Sept 1
2. Schedule a "Donor Outreach Planning" meeting for Sept 1 at 10 AM
3. Link the meeting to the sprint
4. After the planning meeting, team goes into sprint task board and starts work
5. At sprint end, link a "Donor Outreach Review" meeting to show progress and decisions',
    'sprints',
    'active',
    ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
    ARRAY['sprints-what-is','meetings-create']
  )
on conflict (slug) do update set
  question = excluded.question,
  answer = excluded.answer,
  feature_area = excluded.feature_area,
  status = excluded.status,
  applicable_roles = excluded.applicable_roles,
  related_slugs = excluded.related_slugs;
