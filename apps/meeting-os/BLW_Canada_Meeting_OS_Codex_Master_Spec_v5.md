# BLW Canada Meeting OS — Codex Master Build Spec v5

This file is intended to be handed directly to Codex as the source of truth for implementation.

## Codex Operating Instructions

1. Do not implement immediately.
2. First produce the Phase 0 Architecture Review.
3. After review, implement in the specified build order.
4. Keep the app single-page, but not single-file.
5. Preserve modular file separation.
6. Use `useReducer` + selectors.
7. Use `StorageAdapter`; never call `localStorage` directly from UI components.
8. Do not store derived state.
9. Do not persist PDFs or base64 background images.
10. Use custom modals, not browser-native `confirm()`.
11. Do not use `dangerouslySetInnerHTML`.
12. After each build phase, run or describe relevant tests before continuing.
13. If the existing project structure differs, adapt carefully while preserving these architecture rules.

## Required Project Structure

```text
src/
  App.jsx
  components/
    layout/
    common/
    modules/
      agenda/
      minutes/
      templates/
      actions/
  lib/
    storage/
    pdf/
    selectors/
    validators/
    services/
    utils/
  data/
    builtInTemplates.js
```

## Mandatory Phase 0 Architecture Review

Before writing any code, execute Phase 0 Architecture Review.

Do not begin implementation until all of the following are complete:

- Requirements Analysis
- Product Review
- Architecture Review
- Security Review
- Failure Mode Analysis
- Test Plan
- MVP Review
- Final Review

Implementation workflow is mandatory:

```text
PLAN
→ CRITIQUE
→ REVISE
→ TEST
→ CRITIQUE AGAIN
→ REVISE AGAIN
```

Repeat until:

- No major risks remain
- Architecture is stable
- Test coverage is sufficient
- Requirements are complete

Only after Phase 0 passes may implementation begin.

## Canonical Architecture Rules

- Centralized `useReducer` store.
- Reducer state includes `meetingMeta`, `agenda`, `minutes`, `templates`, `actions`, and `ui`.
- `activeModule` lives inside `ui`.
- Derived state computed through selectors in `src/lib/selectors/`.
- Storage behind `StorageAdapter` in `src/lib/storage/`.
- Version all persisted data.
- Draft recovery is required.
- Minutes submission creates immutable snapshots.
- PDF preview approximates output; PDF is the source of truth.
- Canva/background uploads use object URLs only and are not persisted.

---

Build a single-page React application called the
"BLW Canada Meeting OS". This is a complete meeting
management system for BLW Canada Sub-Region used by
4 people. It has four modules:

1. Agenda Builder
2. Minutes Capture
3. Template Manager
4. Action Items Dashboard

All modules live in one app. Navigation is a top
header bar with tabs for each module. No routing
library needed — render modules conditionally based
on activeModule state.

════════════════════════════════════════════════════
BRANDING
════════════════════════════════════════════════════

Primary colours:
  Black:  #000000
  Red:    #CC0000
  White:  #FFFFFF

Accent colours (PDF themes):
  Warm beige: #F5EFE6
  Tan:        #C4956A

Logo: Embed the BLW Canada Sub-Region logo as a
base64 PNG string. The logo has a black background,
red maple leaf merged with a white heart, and
"BLW CANADA SUB-REGION" text in white below.
Store as const BLW_LOGO_BASE64 at the top of the
file. Used in PDF headers and app top bar.

Fonts: Google Fonts via @import
  Montserrat — headings, labels, PDF headers
  Inter — body text, inputs, table content

════════════════════════════════════════════════════
GLOBAL STATE / DATA MODEL
════════════════════════════════════════════════════

Use a centralized `useReducer` store.

Do NOT build the application as one large parent-state component.

Reducer state:

meetingMeta: {
  meetingType: string,
  title: string,
  date: string,
  location: string,
  startTime: string,
  endTime: string,
  moderator: string,
  theme: 'classic' | 'minimal' | 'bold' | 'soft',
  canvaBackgroundObjectUrl: string | null,
  canvaBackgroundFileName: string | null
}

agenda: {
  agendaStep: 1 | 2 | 3,
  sourceTemplateId: string | null,
  sourceTemplateType: 'built-in' | 'custom' | 'blank',
  rows: [
    {
      id: string,
      segment: string,
      notes: string,
      anchor: string,
      duration: number,
      isIntroMusic: boolean
    }
  ]
}

Important:
- Do not store S/N as state.
- Do not store timing as state.
- S/N and timing must be computed through selectors.

minutes: {
  captureMode: 'zoom' | 'in-person',
  attendees: string,
  noteTaker: string,
  summary: string,
  transcript: string,
  segments: [
    {
      agendaRowId: string,
      segment: string,
      discussionNotes: string,
      decisions: string,
      actionItems: [
        {
          id: string,
          action: string,
          owner: string,
          dueDate: string,
          status: 'Open'
        }
      ]
    }
  ],
  submittedSnapshotId: string | null
}

templates: {
  customTemplates: [
    {
      id: string,
      name: string,
      sourceTemplate: string,
      createdDate: string,
      lastUsedDate: string,
      updatedAt: string,
      meetingType: string,
      defaultStartTime: string,
      defaultRuntime: number,
      rows: agenda.rows[]
    }
  ]
}

actions: {
  items: [
    {
      id: string,
      date: string,
      meetingType: string,
      captureMode: string,
      action: string,
      owner: string,
      dueDate: string,
      status: 'Open' | 'In Progress' | 'Done' | 'Carried Forward',
      carriedFromId: string | null,
      meetingRef: string,
      sourceSnapshotId: string | null,
      notes: string,
      createdAt: string,
      updatedAt: string
    }
  ]
}

ui: {
  activeModule: 'agenda' | 'minutes' | 'templates' | 'actions',
  toasts: [],
  modals: {},
  loading: {
    pdf: boolean,
    webhook: boolean,
    templateImport: boolean
  },
  draftRecoveryPromptVisible: boolean
}

Derived state must be computed through selectors in `src/lib/selectors/`.

Do not store derived values such as:
- overdue counts
- filtered action items
- meeting duration totals
- timing calculations
- minutes-over-budget values
- table row numbers after reordering

These must be computed dynamically.

════════════════════════════════════════════════════
MODULE 1 — AGENDA BUILDER
════════════════════════════════════════════════════

Three internal steps rendered conditionally:
agendaStep: 1 | 2 | 3

────────────────────────────────────────────────────
STEP 1 — MEETING SETUP
────────────────────────────────────────────────────

Fields:

Meeting Type (dropdown):
  Sunday Service
  Regional Meeting
  Dream Team Meeting
  ORS Meeting
  Blank
  ── Custom ──
  [list of saved custom templates]

Visual Theme (4 radio cards with colour swatch):
  BLW Classic
    headerBg: #000000
    headerText: #FFFFFF
    accent: #CC0000
    rowAlt: #F5F5F5
    tableHeaderBg: #CC0000
    tableHeaderText: #FFFFFF

  Clean Minimal
    headerBg: #FFFFFF
    headerText: #111111
    accent: #CCCCCC
    rowAlt: #FAFAFA
    tableHeaderBg: #111111
    tableHeaderText: #FFFFFF

  Bold Sunday
    headerBg: #CC0000
    headerText: #FFFFFF
    accent: #000000
    rowAlt: #FFF5F5
    tableHeaderBg: #000000
    tableHeaderText: #FFFFFF

  Soft Meeting
    headerBg: #F5EFE6
    headerText: #3B2A1A
    accent: #C4956A
    rowAlt: #FDF8F3
    tableHeaderBg: #C4956A
    tableHeaderText: #FFFFFF

Canva Background Upload:
  Accepts PNG/JPG/WEBP
  Maximum file size: 2 MB
  Store preview using an object URL
  Do not persist background images in localStorage
  Background applies only to the current meeting draft
  Shows filename + Remove button when uploaded
  Preview thumbnail (80x50px) shown inline
  If file is too large, show toast:
    "Background image must be 2 MB or smaller."

Title: text input, pre-filled by meeting type:
  Sunday Service → "Sunday Service"
  Regional Meeting → "Regional Meeting"
  Dream Team Meeting → "Dream Team Meeting"
  ORS Meeting → "ORS Meeting"
  Blank → "" (empty)
  Custom → template name

Date: date input
Location: text input (placeholder: "e.g. ZOOM MEETING")
Start Time: custom 12-hour time input with AM/PM
End Time: custom 12-hour time input with AM/PM
Store canonical time values internally in a consistent machine-readable format.
Program Moderator: text input

Validation:
  If Start Time >= End Time:
    Show red inline error on End Time field
    Disable "Next →" button

"Next →" button advances to Step 2
Loads correct template rows into agendaRows state

────────────────────────────────────────────────────
STEP 2 — AGENDA TABLE
────────────────────────────────────────────────────

COLUMNS (left to right):
  [drag handle]
  S/N
  Segment
  Topic / Notes
  Anchor
  Timing (read-only)
  Duration (mins)
  [delete button]

INTRO MUSIC ROW (always row 0, pinned):
  S/N: displays "—"
  Segment: "Intro Music" (editable)
  Notes: editable
  Anchor: "Technical" (editable)
  Timing: displays "Pre-start"
  Duration: input visible but greyed out, value = 0
  isIntroMusic: true
  Cannot be dragged. Cannot be deleted.
  Styled with a subtle left border in accent colour
  to distinguish it visually.

NUMBERED ROWS (all other rows):
  S/N: auto-increments from 1, updates on reorder
  All fields editable
  Timing: auto-calculated (read-only, styled muted)
  Duration: number input, positive integers only
    If blank: treat as 0, show yellow ⚠ icon on row

TIMING CALCULATION:
  Start from meetingMeta.startTime
  Chain forward: each row start = previous row end
  Intro Music excluded from chain
  Format: "10:00 AM – 10:15 AM"
  Recalculate entire chain on:
    Any duration edit
    Any row reorder
    Start time change

DRAG AND DROP:
  Use @dnd-kit/core and @dnd-kit/sortable
  Drag handle icon on left of each row
  Intro Music row has no drag handle, cannot move
  On drop: renumber S/N, recalculate all timings
  Smooth animation on reorder

ROW CONTROLS:
  Each row: drag handle (left) + delete ✕ (right)
  Duplicate row: appears on row hover
  "＋ Add Row" button below table
    Appends blank row with default 10 min duration

OVERTIME SYSTEM:
  Calculate: totalDuration = sum of all row durations
             (excluding intro music)
  Calculate: meetingWindow = endTime - startTime (mins)
  Calculate: minutesOver = totalDuration - meetingWindow

  Progress bar below table:
    Shows: "[totalDuration] / [meetingWindow] mins used"
    Fills green up to 100%
    Fills red beyond 100% (overflow shown in red)

  If minutesOver > 0:
    Red warning banner above table:
    "⚠ You are [X] minutes over time"
    Clears automatically when back under budget

  If a duration field is blank (treated as 0):
    Yellow ⚠ icon on that row (not a blocker)

SAVE ACTIONS (top right of builder):
  "Save as Template" button always visible

  If current source is a BUILT-IN template:
    Only option: "Save as New Template"
    Modal:
      Name field (pre-filled: "[Source] — Copy")
      Max 40 chars
      No duplicate names (inline error if clash)
      Meeting type category selector
      Default start time
      Default runtime (mins)
      [Save] [Cancel]

  If current source is a CUSTOM template:
    Two options in dropdown:
      "Save as New Template" (fork — same modal above)
      "Update [Template Name]"
        Confirm: "This will overwrite [name]. Continue?"
        On confirm: overwrites via StorageAdapter

  On successful save:
    Toast: "Template '[name]' saved successfully"
    New template immediately available in dropdown

  Built-in templates:
    CANNOT be overwritten under any circumstances
    Can only be forked into a new custom template

"← Back" returns to Step 1
"Preview PDF →" advances to Step 3

────────────────────────────────────────────────────
PRE-LOADED TEMPLATES
────────────────────────────────────────────────────

SUNDAY SERVICE
defaultStartTime: "10:00 AM"
defaultRuntime: 120

rows: [
  { isIntroMusic:true, segment:"Intro Music",
    anchor:"Technical", duration:0 },
  { segment:"Praise",
    anchor:"Technical", duration:10 },
  { segment:"Opening Prayers",
    anchor:"Assigned Leader", duration:15 },
  { segment:"Rhapsody of Realities",
    notes:"Mon–Sat: daily article. Sun: full article.",
    anchor:"Assigned Leader", duration:10 },
  { segment:"Affirmations",
    anchor:"Assigned Leader", duration:5 },
  { segment:"Exhortation",
    anchor:"Pastor / Service Center Coordinator",
    duration:30 },
  { segment:"Oblations",
    notes:"Offerings, Tithes, Special Seeds, Partnership",
    anchor:"Assigned Leader", duration:5 },
  { segment:"Altar Call, Recognition of First-Timers & Announcements",
    anchor:"Assigned Leader", duration:3 },
  { segment:"Benediction",
    anchor:"Assigned Leader", duration:2 }
]

REGIONAL MEETING
defaultStartTime: "8:00 PM"
defaultRuntime: 125

rows: [
  { isIntroMusic:true, segment:"Intro Music",
    anchor:"Technical", duration:0 },
  { segment:"Opening Prayer",
    anchor:"Assigned Leader", duration:15 },
  { segment:"Testimonies",
    anchor:"Assigned Leader", duration:20 },
  { segment:"Exhortation",
    anchor:"Assigned Leader", duration:60 },
  { segment:"Giving Opportunity",
    notes:"Giving towards an assigned target set by Pastor towards a specific ministry arm",
    anchor:"Assigned Leader", duration:10 },
  { segment:"Announcements & Closing",
    anchor:"Assigned Leader", duration:5 }
]

DREAM TEAM MEETING → load as Blank
ORS MEETING → load as Blank

BLANK:
rows: [
  { isIntroMusic:true, segment:"Intro Music",
    anchor:"Technical", duration:0 },
  { segment:"", anchor:"", duration:10 }
]

────────────────────────────────────────────────────
STEP 3 — PREVIEW & EXPORT
────────────────────────────────────────────────────

Render a styled preview div (not auto-generated PDF).
Preview should closely approximate the PDF layout. Pixel-perfect parity is not required. PDF output remains the source of truth.
Two buttons: "← Back to Edit" and "⬇ Download PDF"

PDF GENERATION (jsPDF + jsPDF-AutoTable):

Page background:
  If current draft has a valid canvaBackgroundObjectUrl:
    Draw uploaded background image full-bleed on every page
    Draw white rectangle at 85% opacity
    over content area (below header strip)
    For PDF export, convert the current background file to a data URL in memory at export time only.
    Do not persist the converted data.
  Else:
    Use theme headerBg for header strip
    White body

Header (repeated every page):
  Left: BLW_LOGO_BASE64 image, height 60px
  Right (stacked text block):
    Line 1: meetingMeta.title
             (Montserrat bold, 16pt, theme headerText)
    Line 2: meetingMeta.date + " | " + meetingMeta.location
             (Inter, 10pt, muted)
    Line 3: meetingMeta.startTime + " – " + meetingMeta.endTime
             (Inter, 10pt, muted)
    Line 4: "Program Moderator: " + meetingMeta.moderator
             (Inter, 10pt, muted)
  Rule line below header: 2pt, theme accent colour

Table columns:
  S/N         width: 8%
  Segment & Notes  width: 35%
  Anchor      width: 20%
  Timing      width: 22%
  Duration    width: 15%

Table styles:
  Header row: tableHeaderBg, tableHeaderText, Montserrat bold
  Alternating rows: white and rowAlt
  Cell padding: 6pt
  Font: Inter 10pt
  Segment text: bold
  Notes text: below segment, Inter 9pt, muted (#666666)
  Intro Music row: S/N = "—", Timing = "Pre-start",
                   Duration = "—"
  If anchor is empty: display "Assigned Leader" in PDF
                      (not in the input, only PDF)

Footer (every page):
  Left: "Program Moderator: " + moderator
  Centre: "BLW Canada Sub-Region"
  Right: "Page X of Y"
  All: Inter 8pt, muted

Download filename:
  "BLW_[MeetingType]_Agenda_[YYYY-MM-DD].pdf"
  Spaces replaced with underscores

Error handling:
  Wrap PDF generation in try/catch
  On failure: toast "Export failed — please try again"

════════════════════════════════════════════════════
MODULE 2 — MINUTES CAPTURE
════════════════════════════════════════════════════

Accessible from top nav tab.
If no agenda has been built yet (agendaRows empty):
  Show message: "Build an agenda first to capture minutes."
  Show "Go to Agenda Builder →" button

If agenda exists, show minutes form.

────────────────────────────────────────────────────
MINUTES FORM HEADER
────────────────────────────────────────────────────

Fields (pre-filled from meetingMeta where possible):
  Capture Mode toggle: [Zoom] [In-Person]
    Zoom: blue highlight
    In-Person: green highlight
  Attendees: text input (comma separated names)
  Note Taker: text input
  Meeting Summary: large textarea (placeholder:
    "Paste Zoom AI Companion summary here, or
     write your own summary...")

────────────────────────────────────────────────────
AGENDA ITEMS & NOTES TABLE
────────────────────────────────────────────────────

For each row in agendaRows (including intro music):
  Card-style block showing:
    Top: segment name (bold) + timing (muted, right)
    Three fields below:
      Discussion Notes (textarea, auto-expanding)
      Decisions Made (textarea, auto-expanding)
      Action Items section:
        List of action item inputs
        Each action item:
          Action (text input)
          Owner (text input)
          Due Date (date input)
          [✕ remove]
        [＋ Add Action Item] button per segment

────────────────────────────────────────────────────
ZOOM TRANSCRIPT APPENDIX
────────────────────────────────────────────────────

Large textarea at bottom of form:
  Label: "Zoom Transcript / Raw Notes (optional)"
  Placeholder: "Paste full Zoom transcript or
                additional raw notes here..."
  Auto-expanding, no character limit

────────────────────────────────────────────────────
SUBMIT MINUTES
────────────────────────────────────────────────────

"Submit Minutes" button at bottom.

On click:
  1. Generate minutes PDF (jsPDF, same branding)
  2. Collect all action items into actionItems state
     Each item gets:
       id: uuid
       date: meetingMeta.date
       meetingType: meetingMeta.meetingType
       captureMode: minutesData.captureMode
       action, owner, dueDate from form
       status: 'Open'
       carriedFromId: null
       meetingRef: meetingMeta.title + " " + meetingMeta.date
       notes: ""
  3. Persist action items through StorageAdapter
  4. Send webhook to n8n (fetch POST, fire and forget)
     URL: stored in const N8N_WEBHOOK_URL = ""
          (empty string by default, webhook is optional)
     Payload:
     {
       meetingType, date, location, captureMode,
       attendees, noteTaker, summary, moderator,
       segments: [{
         segment, discussionNotes, decisions,
         actionItems: [{action, owner, dueDate}]
       }],
       transcript,
       agendaRows: [full agenda array]
     }
     If N8N_WEBHOOK_URL is empty: skip silently
     If fetch fails: log error, show toast warning
       "Minutes saved locally. Drive sync failed —
        check n8n connection."
     If fetch succeeds: toast "Minutes saved and
       synced to Drive successfully"
  5. Create immutable meetingSnapshot:
     {
       id: uuid,
       submittedAt: string,
       meetingMeta: full copy,
       agendaRows: full copy with computed timings,
       summary: minutesData.summary,
       segments: full minutes segments,
       actionItems: extracted action items
     }

     Persist snapshots through StorageAdapter.

     Future agenda edits must not modify this historical snapshot.

  6. Clear draft meeting data through StorageAdapter.

  7. Show confirmation screen with:
     "Minutes submitted successfully"
     Summary of action items created (count + list)
     [Download Minutes PDF] button
     [Go to Action Items] button

After submission:
  The submitted minutes snapshot is read-only.
  Starting a new meeting must create a fresh working draft state.

────────────────────────────────────────────────────
MINUTES PDF STRUCTURE (jsPDF)
────────────────────────────────────────────────────

Same header and footer as agenda PDF.

Section 1 — Meeting metadata block:
  Type | Date | Location | Mode | Attendees | Note Taker

Section 2 — Summary:
  Label: "Meeting Summary"
  Body: minutesData.summary

Section 3 — Agenda items & notes table:
  Columns: Segment | Discussion Notes | Decisions

Section 4 — Action items table (this meeting):
  Columns: Action | Owner | Due Date | Status
  Status pre-filled as "Open" for all

Section 5 — Appendix:
  Label: "Transcript / Raw Notes"
  Body: minutesData.transcript (if not empty)

Filename: "BLW_[Type]_Minutes_[YYYY-MM-DD].pdf"

════════════════════════════════════════════════════
MODULE 3 — TEMPLATE MANAGER
════════════════════════════════════════════════════

Accessible from top nav tab.
Two sections: Built-in Templates, Custom Templates

────────────────────────────────────────────────────
BUILT-IN TEMPLATES
────────────────────────────────────────────────────

Four cards (Sunday Service, Regional Meeting,
Dream Team Meeting, ORS Meeting):
  Each card shows:
    Template name (bold)
    Row count
    Default runtime (mins)
    Default start time
    Buttons: [Preview] [Fork]

  Preview: opens a modal showing all rows in a
           read-only table (S/N, Segment, Anchor,
           Duration)

  Fork: loads template into agenda builder with
        "Save as New Template" modal pre-opened
        Name pre-filled: "[Source] — Copy"

────────────────────────────────────────────────────
CUSTOM TEMPLATES
────────────────────────────────────────────────────

Grid of cards for each saved custom template.
Each card shows:
  Template name (bold)
  "Forked from: [sourceTemplate]" (muted, italic)
  Created: [date]
  Last used: [date]
  Rows: [count]
  Runtime: [mins] mins
  Buttons: [Preview] [Edit] [Export] [Fork] [✕ Delete]

Preview: same read-only modal as built-ins

Edit: loads template into agenda builder
      in Step 2 directly (skip Step 1)
      with "Update [name]" save option available

Export: downloads [name].json file
  JSON structure:
  {
    blwTemplateVersion: "1.0",
    name, sourceTemplate, createdDate,
    meetingType, defaultStartTime,
    defaultRuntime, rows: [agendaRows array]
  }
  Supported template version: "1.0"
  If template version is unsupported: reject import and show toast "Unsupported template version"

Fork: same as built-in fork
  Name pre-filled: "[Source] — Copy"

Delete: confirm dialog
  "Delete '[name]'? This cannot be undone."
  On confirm: remove via StorageAdapter + reducer state

[Import Template] button (top right of custom section):
  Opens file picker (accepts .json only)
  Validates JSON structure:
    Must have blwTemplateVersion field
    Must have name and rows fields
    Rows must be valid agendaRow objects
  If invalid: toast "Invalid template file"
  If name conflict:
    Modal: "A template called '[name]' already
            exists. Rename or replace?"
    Input field pre-filled with "[name] — Imported"
    [Rename & Import] [Replace] [Cancel]
  If at limit (12 custom templates):
    Toast: "Maximum of 12 custom templates reached.
            Delete one to import."
  On success: toast "Template '[name]' imported"

[＋ Create New Template] button:
  Loads blank template into agenda builder Step 2
  with "Save as New Template" modal pre-opened
  on first save

────────────────────────────────────────────────────
TEMPLATE RULES (enforce strictly)
────────────────────────────────────────────────────

Built-in templates:
  NEVER overwritten
  NEVER deleted
  Can only be previewed or forked

Custom templates:
  Max 12 stored through StorageAdapter
  Can be overwritten (with confirm)
  Can be forked
  Can be deleted (with confirm)
  Can be exported as JSON
  Can be imported from JSON

Duplicate name protection:
  On save: check all template names
  If duplicate: inline error
  "A template with this name already exists"

Name constraints:
  Max 40 characters
  No leading/trailing spaces (trim on save)

════════════════════════════════════════════════════
MODULE 4 — ACTION ITEMS DASHBOARD
════════════════════════════════════════════════════

Accessible from top nav tab.
Loads action items through StorageAdapter on app mount.

────────────────────────────────────────────────────
DASHBOARD HEADER
────────────────────────────────────────────────────

Four summary metric cards:
  Total Open (count, red if > 0)
  In Progress (count, amber)
  Done This Month (count, green)
  Overdue (count, where dueDate < today
            AND status != Done, red bold)

────────────────────────────────────────────────────
FILTERS BAR
────────────────────────────────────────────────────

Filter by Status (dropdown):
  All | Open | In Progress | Done | Carried Forward

Filter by Meeting Type (dropdown):
  All | Sunday Service | Regional Meeting |
  Dream Team | ORS | [custom types]

Filter by Owner (dropdown):
  All | [list of unique owners in data]

Search (text input):
  Searches action text and owner fields

Sort by (dropdown):
  Due Date (default) | Date Created | Meeting Type | Owner

────────────────────────────────────────────────────
ACTION ITEMS TABLE
────────────────────────────────────────────────────

Columns:
  # | Date | Meeting | Mode | Action | Owner |
  Due Date | Status | Notes | Source

Each row:
  Status is a dropdown (editable inline):
    Open → In Progress → Done → Carried Forward
    On change: updates reducer state and persists through StorageAdapter immediately
    Toast: "Status updated"

  Notes: click to expand inline text input
    On blur: persists through StorageAdapter

  Source: shows meetingRef as text
    (Drive link column — empty until n8n populates it)

  If status = Carried Forward:
    Row shows muted styling
    "Carried from #[originalId]" link
    clicking highlights the original row

  If dueDate < today AND status not Done:
    Due Date cell highlighted red
    Row has subtle red left border

  If status = Done:
    Row shows muted/strikethrough styling

────────────────────────────────────────────────────
CARRIED FORWARD LOGIC
────────────────────────────────────────────────────

"Mark as Carried Forward" button on each Open row.
On click:
  Confirm: "Carry '[action]' forward to next meeting?"
  On confirm:
    Original row: status → "Carried Forward"
    New row created:
      All fields copied from original
      id: new uuid
      status: "Open"
      carriedFromId: original row id
      date: today
      notes: "Carried forward from " + original.meetingRef
    Both rows saved through StorageAdapter
    Toast: "Action item carried forward"

────────────────────────────────────────────────────
ADD ACTION ITEM (manual)
────────────────────────────────────────────────────

[＋ Add Action Item] button at top of dashboard.
Opens modal:
  Action (text, required)
  Owner (text, required)
  Due Date (date, required)
  Meeting Type (dropdown)
  Notes (optional textarea)
[Save] [Cancel]

On save: adds to reducer state and persists through StorageAdapter
Toast: "Action item added"

────────────────────────────────────────────────────
EXPORT ACTION ITEMS
────────────────────────────────────────────────────

[Export to CSV] button.
Exports all visible (filtered) action items as CSV.
Filename: "BLW_Action_Items_[YYYY-MM-DD].csv"
Columns match table columns.

════════════════════════════════════════════════════
NAVIGATION
════════════════════════════════════════════════════

Top header bar:
  Left: BLW Canada logo (small, 32px height) +
        "Meeting OS" text
  Right: four tab buttons:
    [📋 Agenda] [📝 Minutes] [📁 Templates] [✅ Actions]
  Active tab: red underline + bold text
  If action items has overdue items:
    Red dot badge on Actions tab

════════════════════════════════════════════════════
LIBRARIES
════════════════════════════════════════════════════

React (functional components + hooks only)
@dnd-kit/core + @dnd-kit/sortable (drag and drop)
jsPDF (PDF generation)
jsPDF-AutoTable (table in PDF)
Tailwind CSS (styling)
uuid (row and action item IDs)
Google Fonts: Montserrat + Inter via CSS @import

No other external libraries.
No routing library.
No backend.
No authentication.

════════════════════════════════════════════════════
STORAGE ARCHITECTURE
════════════════════════════════════════════════════

Create a `StorageAdapter` abstraction.

UI components must never directly access `localStorage`.

Required interface:

interface StorageAdapter {
  loadTemplates()
  saveTemplates()
  loadActions()
  saveActions()
  loadSnapshots()
  saveSnapshots()
  loadDraftMeeting()
  saveDraftMeeting()
  clearDraftMeeting()
  preserveCorruptBackup()
}

Phase 1:
  Use localStorage behind the adapter.

Phase 2:
  Allow migration to IndexedDB.

Only files in `src/lib/storage/` may call localStorage.

Persisted data must be versioned.

Persisted payload format:
{
  "schemaVersion": "1.0",
  "data": {}
}

Storage keys:
  blw_custom_templates
  blw_action_items
  blw_meeting_snapshots
  blw_draft_meeting

On load:
  Validate schemaVersion.
  Validate data shape.
  If unsupported or corrupt:
    Preserve backup under a timestamped backup key.
    Show warning toast:
      "Stored data version is unsupported or corrupted. A backup was preserved."
    Continue with safe defaults.

Never persist:
  PDF binaries
  Base64 background images
  Uploaded background files across sessions
  Derived state
  Computed timings
  Computed dashboard metrics

DRAFT RECOVERY:
  Autosave draft meeting data every 15 seconds while the draft is dirty.
  Also save draft data on page hide / tab close when possible.

  Persist:
    meetingMeta
    agenda.rows
    minutes

  On app load, if draft exists:
    Show modal:
      "Resume previous meeting draft?"
      [Resume] [Discard]

  Discard removes draft data.
  Successful minutes submission clears the draft.

════════════════════════════════════════════════════
ERROR STATES & TOASTS
════════════════════════════════════════════════════

Toast system:
  Fixed bottom-right corner
  Auto-dismiss after 4 seconds
  Types: success (green) | warning (amber) | error (red)
  Max 3 toasts visible at once

Error states:
  Start >= End Time: inline red error, disable Next
  Duration blank: yellow ⚠ icon on row (not blocking)
  PDF generation fail: error toast
  n8n webhook fail: warning toast (not blocking)
  Import invalid JSON: error toast
  Template name duplicate: inline error on input
  Custom template limit reached: error toast

════════════════════════════════════════════════════
UX REQUIREMENTS
════════════════════════════════════════════════════

Mobile responsive:
  Agenda table scrolls horizontally on small screens
  All forms stack vertically on mobile
  Touch-friendly drag handles (min 44px tap target)

Topic/Notes textarea: auto-expands as user types
Duration inputs: positive integers only (min 0)
Time inputs: custom 12-hour UI with AM/PM backed by canonical internal time values
Empty anchor in PDF: display "Assigned Leader"
  (not in the input — only on PDF export)

Confirm dialogs: use custom modal components
  Never use browser native confirm()

Loading states:
  PDF generation: "Generating PDF..." overlay
  Webhook submit: "Syncing to Drive..." spinner
  Template import: "Importing..." indicator

Transitions:
  Step changes: fade in/out (150ms)
  Module switches: fade in/out (150ms)
  Toast appear/dismiss: slide up/fade (200ms)

════════════════════════════════════════════════════
N8N WEBHOOK CONFIGURATION
════════════════════════════════════════════════════

const N8N_WEBHOOK_URL = ""

If empty string: all webhook calls skipped silently.
User fills this in after setting up n8n.

Webhook payload sent on "Submit Minutes":
POST application/json
{
  meetingType: string,
  date: string,
  location: string,
  captureMode: "zoom" | "in-person",
  attendees: string,
  noteTaker: string,
  moderator: string,
  summary: string,
  transcript: string,
  segments: [
    {
      segment: string,
      discussionNotes: string,
      decisions: string,
      actionItems: [
        { action: string, owner: string, dueDate: string }
      ]
    }
  ],
  agendaRows: [full agendaRows array],
  totalDuration: number,
  meetingWindow: number
}

════════════════════════════════════════════════════
OUT OF SCOPE — DO NOT BUILD
════════════════════════════════════════════════════

User authentication or login
Cloud sync or real-time collaboration
Roster or contacts lookup for Anchor field
Bilingual / French support
Any server, API, or database
Zoom API integration (n8n handles this externally)
Google Drive API (n8n handles this externally)
Automatic overdue detection (n8n handles this)
Email sending (n8n handles this)
Persistence of uploaded background files across sessions

════════════════════════════════════════════════════
BUILD ORDER (implement in this sequence)
════════════════════════════════════════════════════

1. Phase 0 Architecture Review
2. Project structure
3. Reducer and initial state
4. Built-in templates
5. Selectors
6. StorageAdapter with versioning
7. Draft recovery
8. Navigation shell
9. Toast system
10. Agenda Builder — Step 1
11. Agenda Builder — Step 2
12. Timing selector and overtime selector
13. Agenda Builder — Step 3
14. Basic agenda PDF export
15. Template Manager
16. Minutes Capture
17. Minutes immutable snapshot creation
18. Minutes PDF export
19. Action item extraction
20. Action Items Dashboard
21. CSV export
22. Optional n8n webhook
23. Mobile polish
24. Failure testing
25. Final QA pass
