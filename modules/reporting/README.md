# Reporting — Growth Metrics & Organizational Dashboard

## Problem

The organization tracked service attendance weekly across multiple campuses, but aggregation was entirely manual: a coordinator collected figures from department leaders by email, built a spreadsheet, and sent a summary. Reporting was always at least a week behind, inconsistently formatted, and stored nowhere accessible to leadership. Separately, team leads had no single view of what their departments were working on — task status, sprint progress, attendance trends, and team member workload each lived in a different tool.

## Key Technical Decisions

**External data sync with status tracking.** Weekly attendance figures are pulled from an external reporting source by the `growth-reports-sync` edge function and stored in a Supabase table with per-campus status flags: `Reported`, `Merged`, `Did Not Meet`, `Missing`, `In Progress`. The sync runs on a schedule but can be manually triggered. Status flags let the UI show immediately which campuses have submitted their figures for the current week versus which are still outstanding — turning a coordinator's email-chasing workflow into a dashboard glance.

**Scheduled HTML report delivery.** The `weekly-growth-report` edge function generates a styled HTML report and delivers it via Resend on a cron schedule. The report uses inline HTML/CSS tables and SVG sparklines rather than image-embedded charts, for compatibility across email clients. Recipients receive a formatted snapshot without needing to log in.

**25-widget customizable dashboard.** The dashboard stores each user's layout as a JSONB array of widget configurations in the database, keyed by `user_id`. Widget order is drag-sortable via @dnd-kit and persisted on drop. Administrators can push default layouts to users as a starting point. Widget types include: task completion rates, sprint velocity, member activity heatmaps, attendance summaries, follow-up queues, weekly wins, personal reminders, org report exports, and more.

**Client-side PDF export.** The `OrgReportExport` widget uses jsPDF + html2canvas to capture the current DOM state — including rendered Recharts SVGs — and downloads it as a styled PDF. No server-side PDF rendering; the export reflects exactly what the user sees on screen.

## Schema Highlights

- Growth data table: `campus`, `week_date`, `attendance_count`, `status` enum, `sync_source`
- `dashboard_widget_preferences`: `user_id`, `widgets` JSONB (ordered array of `{type, config}` objects)
- Each widget fetches its own data slice independently via React Query; the dashboard grid passes only `config` and `widgetId` — no data is passed down as props

## Engineering Challenge: 25 Widget Types Without a Prop-Drilling Nightmare

With 25 widget types, passing data from a central dashboard fetch down to each widget would require the dashboard to know the data shape of every widget — coupling that would make adding a new widget type require changes in multiple files.

Each widget is instead a self-contained component that owns its own React Query fetch. The dashboard grid renders each widget with a `config` object (user-defined settings like size and data source) and a stable `widgetId`; it never passes data downward. Adding a new widget type means creating one new component and registering it in the widget type map — the grid renders it without any modification. This also means widgets that haven't rendered yet (off-screen or in the customize panel) don't issue data fetches, keeping the initial page load lean.
