# Reporting Module — Removed from Public Portfolio

This module has been removed from the public Nexus portfolio because its features are organization-specific and not generalizable.

The reporting features in Nexus were tightly coupled to the organization's internal metrics and workflow, including:
- Specific attendance tracking integrations
- Organization-specific reporting formats and cadences
- Custom dashboard widgets built around department-specific KPIs
- Historical data import from the organization's prior systems

For a genuine portfolio, it's more honest to exclude organization-specific features and focus on the generalizable architecture and the six core modules that would serve any distributed team:

- Core PM (task management, sprints, Kanban)
- Flock (contact tracking, call logging, workload management)
- Meetings (AI-powered meeting capture, transcription, action items)
- Immerse (document reader with AI text-to-speech)
- Comms (email campaigns, segmentation, RSVPs)
- Nova (role-aware AI assistant)

To include Reporting in a portfolio version, it would need to be heavily reworked to:
1. Remove references to specific metrics or departments
2. Generalize the widget system to show how extensibility works
3. Explain the architecture without relying on organization-specific data shapes

The decision to exclude it is deliberate: it's better to show depth in genuinely portable features than to pretend an organization-specific module is more general than it is.

**If you choose to restore Reporting later:** The module README exists at `modules/reporting/README.md` in the git history. The original implementation and design decisions can be recovered if the module is later generalized for portfolio inclusion.
