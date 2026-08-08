-- Nova KB: How to Use Nova entries
--
-- Comprehensive how-to guide for Nova features, answering common questions
-- about Daily Brief, Meeting Prep, Project Analysis, Report, and Ask Nexus.

insert into public.nova_kb_entries
  (slug, question, answer, feature_area, applicable_roles)
values

(
  'nova-what-is',
  'What is Nova?',
  'Nova is your AI assistant for BLW CAN NEXUS. It helps you stay on top of your work by:
- Summarizing your day (Daily Brief)
- Preparing for meetings (Meeting Prep)
- Analyzing projects and suggesting actions (Project Analysis)
- Creating reports from your data (Report)
- Answering questions about your work (Ask Nexus)

Use Nova to save time on busy days and get insights you might miss.',
  'nova',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'nova-daily-brief',
  'How do I use Daily Brief?',
  'Daily Brief summarizes your day in Nexus:
- Tasks due today or overdue
- Upcoming meetings
- Sprint status and priorities
- Key alerts

Click the **Daily Brief** bubble in Nova to see your personalized summary. It updates throughout the day as things change. Use it first thing in the morning to plan your day.',
  'nova',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'nova-meeting-prep',
  'How do I use Meeting Prep?',
  'Meeting Prep generates a brief before your meeting to help you prepare:
- Meeting overview (attendees, time, type)
- Agenda items
- Open tasks to discuss
- Decisions from the last meeting in that series
- Active sprint status

**Best way to use it:** Go to the specific meeting page in Nexus, then click the **Prepare with Nova** button. Nova will create a focused brief for that meeting.

You can also ask Nova directly: "Prepare for the Board Meeting" — but for reliable results, use the button on the meeting page.',
  'nova',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'nova-meeting-extract',
  'How do I extract decisions from a meeting?',
  'After a meeting is recorded or transcribed, Nova can extract decisions and action items:
- Key decisions made
- Action items with owners and due dates
- Follow-ups needed

On the meeting page, click the **Extract Decisions** button next to "Prepare with Nova." Nova will analyze the meeting notes or transcript and pull out what matters.

You can then create tasks directly from the extracted action items.',
  'nova',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'nova-project-analysis',
  'How do I use Project Analysis?',
  'Project Analysis helps you understand your project status and what needs attention:
- Task breakdown (open, overdue, at risk)
- Resource allocation
- Bottlenecks and blockers
- Suggested next actions

Click the **Project Analysis** bubble and describe which project or area you want analyzed. Nova will pull relevant data and give you insights to act on.',
  'nova',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'nova-report',
  'How do I use Report?',
  'Report generates summaries of your work for sharing or record-keeping:
- Sprint reports (what was completed, what wasn''t)
- Team reports (who did what, progress)
- Project status reports
- Custom summaries

Click the **Report** bubble and describe what you need. Nova will compile data and format it as a report you can share, copy, or save.',
  'nova',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'nova-ask-nexus',
  'How do I use Ask Nexus?',
  'Ask Nexus is a general-purpose Q&A mode for questions about your work:
- "What am I working on this week?"
- "Who''s assigned to the website redesign?"
- "What''s overdue in the ORS department?"
- "When is the next board meeting?"

Click the **Ask Nexus** bubble and ask your question. Nova will search your Nexus data and give you an answer. If Nova doesn''t know, it will tell you.',
  'nova',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'nova-bubble-selector',
  'Why do I have to scroll to change Nova modes?',
  'The Nova mode bubbles (Daily Brief, Meeting Prep, etc.) should be visible at the top of the Nova panel. If you find yourself scrolling to access them, that''s a UI issue worth reporting.

**Workaround:** Try refreshing the page or switching between different sections of Nexus and back to Nova. If the bubbles are still hidden, report it to your admin.',
  'nova',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'nova-couldnt-find-meeting',
  'Why does Nova say "I couldn''t find the meeting you''re referring to"?',
  'This happens when you ask Nova about a meeting outside of the meeting page, and Nova can''t match the name you typed.

**Solution:** Go directly to the meeting in Nexus and click **Prepare with Nova** from the meeting page. That way Nova knows exactly which meeting to prepare for — no name-matching needed.

Alternatively, be very specific with the meeting name: "Prepare for the Board Meeting on August 7" works better than just "Prepare for Board Meeting."',
  'nova',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'nova-not-processing',
  'Why does Nova say "could not process that request"?',
  'Nova is designed for specific intents (prep, analysis, briefs, reports, questions). If you ask something outside those categories — like "how do I use Nova?" — it might not have a handler and returns an error.

**Solution:**
- Be specific about what you want: "Prepare for the Monday meeting" or "What''s my priority this week?"
- Use one of the main modes: Daily Brief, Meeting Prep, Project Analysis, Report, or Ask Nexus
- If you need help with Nova, check this Knowledge Base or ask your admin

Try rephrasing your question to be more specific about what data or summary you need.',
  'nova',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
)
on conflict (slug) do update set
  question = excluded.question,
  answer = excluded.answer,
  feature_area = excluded.feature_area,
  applicable_roles = excluded.applicable_roles;
