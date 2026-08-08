/**
 * Adoption System Configuration
 * Central source of truth for onboarding steps, metrics definitions, adoption funnel stages,
 * and feature adoption thresholds.
 */

import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";

// ─── Onboarding Steps (Role-Aware) ─────────────────────────────────────────────

export interface OnboardingStep {
  key: string;
  title: string;
  description: string;
  completionEvent:
    | "profile_completed"
    | "dept_opened"
    | "task_viewed"
    | "task_updated"
    | "meeting_opened";
  actionUrl?: string;
  roles: string[];
}

export const ONBOARDING_STEPS: Record<string, OnboardingStep[]> = {
  member: [
    {
      key: "profile_complete",
      title: "Complete your profile",
      description: "Add a photo and update your contact info.",
      completionEvent: "profile_completed",
      actionUrl: "/settings",
      roles: ["member"],
    },
    {
      key: "dept_opened",
      title: "Open your department",
      description: "View your department's workspace and tasks.",
      completionEvent: "dept_opened",
      actionUrl: "/dashboard",
      roles: ["member"],
    },
    {
      key: "task_viewed",
      title: "View your assigned tasks",
      description: "Open a task to see details and updates.",
      completionEvent: "task_viewed",
      actionUrl: "/my-tasks",
      roles: ["member"],
    },
    {
      key: "task_updated",
      title: "Update one task",
      description: "Change a task status, add a comment, or update progress.",
      completionEvent: "task_updated",
      actionUrl: "/my-tasks",
      roles: ["member"],
    },
  ],

  dept_lead: [
    {
      key: "profile_complete",
      title: "Complete your profile",
      description: "Add a photo and leadership info.",
      completionEvent: "profile_completed",
      actionUrl: "/settings",
      roles: ["dept_lead"],
    },
    {
      key: "dept_opened",
      title: "Open your department",
      description: "View your department workspace.",
      completionEvent: "dept_opened",
      actionUrl: "/dashboard",
      roles: ["dept_lead"],
    },
    {
      key: "task_viewed",
      title: "View your team's tasks",
      description: "Open the task list to see team workload.",
      completionEvent: "task_viewed",
      actionUrl: "/my-tasks",
      roles: ["dept_lead"],
    },
    {
      key: "task_created_or_updated",
      title: "Create or update a task",
      description: "Demonstrate task management by creating or updating one.",
      completionEvent: "task_updated",
      actionUrl: "/my-tasks",
      roles: ["dept_lead"],
    },
  ],

  super_admin: [
    {
      key: "profile_complete",
      title: "Complete your profile",
      description: "Set up your admin profile.",
      completionEvent: "profile_completed",
      actionUrl: "/settings",
      roles: ["super_admin"],
    },
    {
      key: "dept_opened",
      title: "View a department",
      description: "Open a department to see operational state.",
      completionEvent: "dept_opened",
      actionUrl: "/spaces",
      roles: ["super_admin"],
    },
    {
      key: "task_viewed",
      title: "View your tasks",
      description: "Open a task to see details and updates.",
      completionEvent: "task_viewed",
      actionUrl: "/my-tasks",
      roles: ["super_admin"],
    },
    {
      key: "task_updated",
      title: "Update one task",
      description: "Change a task status, add a comment, or update progress.",
      completionEvent: "task_updated",
      actionUrl: "/my-tasks",
      roles: ["super_admin"],
    },
  ],
};

// Get steps for a specific role
export function getOnboardingStepsForRole(role: string): OnboardingStep[] {
  return ONBOARDING_STEPS[role] || [];
}

// Get total step count for a role (used for progress tracking)
export function getOnboardingStepCount(role: string): number {
  return getOnboardingStepsForRole(role).length;
}

// ─── Adoption Funnel Stages ───────────────────────────────────────────────────

export interface AdoptionFunnelStage {
  key: string;
  label: string;
  description: string;
  order: number;
}

export const ADOPTION_FUNNEL_STAGES: AdoptionFunnelStage[] = [
  {
    key: "invited",
    label: "Invited",
    description: "Invitation sent but not yet accepted",
    order: 1,
  },
  {
    key: "activated",
    label: "Account Created",
    description: "User created account after accepting invitation",
    order: 2,
  },
  {
    key: "profile_complete",
    label: "Profile Complete",
    description: "User completed their profile setup",
    order: 3,
  },
  {
    key: "first_task",
    label: "First Task Created",
    description: "User created or updated their first task",
    order: 4,
  },
  {
    key: "first_meeting",
    label: "First Meeting Attended",
    description: "User opened or attended their first meeting",
    order: 5,
  },
  {
    key: "week_active",
    label: "Active This Week",
    description: "User performed ≥1 meaningful action this week",
    order: 6,
  },
  {
    key: "month_active",
    label: "Active This Month",
    description: "User performed ≥1 meaningful action this month",
    order: 7,
  },
  {
    key: "power_user",
    label: "Power User",
    description: "Using ≥3 features + teaching others",
    order: 8,
  },
];

// ─── Feature Adoption Thresholds ──────────────────────────────────────────────

export interface FeatureAdoptionThreshold {
  feature: string;
  label: string;
  description: string;
  eventTypes: string[]; // Which analytics_events.event values count?
  period: "week" | "month"; // Measurement period
  minCount: number; // Minimum # of events to count as "using"
}

export const FEATURE_ADOPTION_THRESHOLDS: FeatureAdoptionThreshold[] = [
  {
    feature: "tasks",
    label: "Tasks",
    description: "Creating, updating, or completing tasks",
    eventTypes: ["task_created", "task_updated", "task_status_changed"],
    period: "week",
    minCount: 1,
  },
  {
    feature: "meetings",
    label: "Meetings",
    description: "Scheduling, attending, or recording meetings",
    eventTypes: [
      "meeting_created",
      "meeting_opened",
      "meeting_minutes_updated",
      "agenda_item_created",
    ],
    period: "week",
    minCount: 1,
  },
  {
    feature: "nova",
    label: "Nova",
    description: "Asking Nova questions or using guidance",
    eventTypes: ["nova_query_answered"],
    period: "week",
    minCount: 1,
  },
  {
    feature: "reports",
    label: "Reports",
    description: "Generating or viewing reports",
    eventTypes: ["report_generated", "report_viewed"],
    period: "week",
    minCount: 1,
  },
  {
    feature: "communications",
    label: "Communications",
    description: "Sending messages or campaigns",
    eventTypes: ["comms_message_sent", "campaign_created"],
    period: "week",
    minCount: 1,
  },
];

// ─── Meaningful Activity Events ───────────────────────────────────────────────

export const MEANINGFUL_ACTIVITY_EVENTS = [
  "task_created",
  "task_updated",
  "task_status_changed",
  "task_completed",
  "task_assigned",
  "comment_created",
  "meeting_created",
  "meeting_opened",
  "meeting_minutes_updated",
  "agenda_item_created",
  "action_item_created",
  "action_item_completed",
  "profile_updated",
];

// ─── Achievement Badges (Non-Gamified) ────────────────────────────────────────

export interface Achievement {
  key: string;
  label: string;
  description: string;
  icon: string;
  earnedBy: string; // Description of how it's earned
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    key: "profile_complete",
    label: "Profile Complete",
    description: "Set up your profile",
    icon: "✓",
    earnedBy: "Completing profile information",
  },
  {
    key: "first_task",
    label: "First Task",
    description: "Created your first task",
    icon: "✓",
    earnedBy: "Creating a task",
  },
  {
    key: "first_meeting",
    label: "First Meeting",
    description: "Attended your first meeting",
    icon: "✓",
    earnedBy: "Opening a meeting",
  },
  {
    key: "meeting_recorder",
    label: "Meeting Recorder",
    description: "Recorded meeting minutes",
    icon: "✓",
    earnedBy: "Creating meeting minutes 5+ times",
  },
  {
    key: "nova_explorer",
    label: "Nova Explorer",
    description: "Asked Nova a question",
    icon: "✓",
    earnedBy: "Using Nova chat",
  },
  {
    key: "dept_contributor",
    label: "Contributor",
    description: "Updated tasks in your department",
    icon: "✓",
    earnedBy: "Updating 5+ tasks",
  },
  {
    key: "onboarding_complete",
    label: "All Set",
    description: "Completed onboarding",
    icon: "✓",
    earnedBy: "Completing all onboarding steps",
  },
];

// ─── Confidence Thresholds ────────────────────────────────────────────────────
// Used by health score calculator and adoption metrics to assess data reliability.

export const CONFIDENCE_THRESHOLDS = {
  high: 30, // >30 data points in period = high confidence
  medium: 10, // 10-30 data points = medium confidence
  low: 1, // <10 data points = low confidence
  minimal: 0, // 0 data points = no score
};

export function getConfidenceLevel(
  dataPoints: number
): "high" | "medium" | "low" | "minimal" {
  if (dataPoints > CONFIDENCE_THRESHOLDS.high) return "high";
  if (dataPoints >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  if (dataPoints >= CONFIDENCE_THRESHOLDS.low) return "low";
  return "minimal";
}

// ─── Health Component Configuration ───────────────────────────────────────────
// Default weights; can be overridden via health_components table.

export const DEFAULT_HEALTH_COMPONENTS = [
  {
    name: "task_execution",
    weight: 60,
    enabled: true,
    label: "Task Execution",
    description:
      "Percentage of tasks completed on time, overdue %, stale task %",
  },
  {
    name: "action_followthrough",
    weight: 20,
    enabled: true,
    label: "Action Follow-Through",
    description: "Meeting action items completed on time",
  },
  {
    name: "adoption",
    weight: 20,
    enabled: true,
    label: "Adoption",
    description: "Team members actively using Nexus this week",
  },
];

// Sum should equal 100
export const validateHealthWeights = (): boolean => {
  const sum = DEFAULT_HEALTH_COMPONENTS.reduce((acc, c) => acc + c.weight, 0);
  return sum === 100;
};
