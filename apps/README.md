# BLW Canada Nexus — Apps

Self-contained feature apps and tools for event planning, analytics, and team coordination.

---

## Event Setup Guide

**Access:** Apps → Event Setup Guide (super_admin only)  
**Route:** `/app/registration-guide`

Comprehensive guide for planning and launching a new regional event in Nexus, from CMP data import through event wrap-up.

**What it covers:**
- Pre-launch decision checklist (12 items)
- 8-step setup process with time estimates
- Sprint creation and team setup in Nexus
- 6 code files to update for a new event
- Google Sheet Apps Script integration
- API key management
- User access grants (finance, rooms, team memberships)
- Troubleshooting

**Time estimates:**
- First-time setup: ~1.5–2 hours
- Repeat event: 45 min–1 hour
- Minimal SQL: 5 code changes (event name, team list, form URLs)

The guide includes interactive checkboxes for tracking progress and expandable sections for detailed content.

**Reference:**
- Detailed markdown version: [`registration-guide.md`](./registration-guide.md)
- Source code: [`src/pages/apps/RegistrationGuideContent.jsx`](../src/pages/apps/RegistrationGuideContent.jsx)

---

## Meeting OS Codex

**Access:** Apps → Meeting OS (appears for relevant roles)

Administrative documentation and setup guides for the meeting module. Contains specification, policies, and operational reference material.

**Location:** [`apps/meeting-os/BLW_Canada_Meeting_OS_Codex_Master_Spec_v5.md`](./meeting-os/)

---

## Structure

Each app is either:
1. **Integrated into Nexus** — a route at `/app/*` with role-based access control via `ProtectedRoute`
2. **Standalone documentation** — a markdown guide or external resource linked from Nexus

Apps are discoverable from **Apps** → available to users based on their role (super_admin, regional_secretary, dept_lead, etc.).

---

## Adding a new app

1. Create a folder in `apps/` with a descriptive name
2. If it's a React component:
   - Create `src/pages/apps/YourAppName.jsx`
   - Add a lazy-loaded route in `src/App.jsx`
   - Add an app card to `src/pages/apps/AppsPage.jsx` with role gating
3. If it's documentation:
   - Add a `.md` file in `apps/`
   - Link from AppsPage or docs

All apps should be discoverable and role-gated at the entry point.
