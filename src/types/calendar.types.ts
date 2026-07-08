// Calendar System Types
// BLW Canada Ministry Calendar & Sprint Management

export type CalendarEventStatus = 'pending' | 'approved' | 'rejected' | 'draft' | 'confirmed' | 'cancelled' | 'completed';
export type EventPriority = 'high' | 'medium' | 'low';
export type EventType = 'conference' | 'program' | 'training' | 'prayer' | 'graduation' | 'event' | 'deadline' | 'leave';
export type SyncDirection = 'to_google' | 'from_google' | 'both';
export type SubscriptionScope = 'all' | 'department';

// Calendar Event
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  event_type: EventType;
  start_date: string; // ISO 8601 datetime
  end_date?: string; // ISO 8601 datetime
  all_day: boolean;
  location?: string;
  space_id: string; // references departments (Programs or Admin)
  sprint_id?: string;
  priority: EventPriority;
  duration_days: number;
  status: CalendarEventStatus;
  is_org_wide: boolean;
  recurrence_rule?: string; // RFC 5545 format
  department_id?: string;
  approved_by?: string;
  approved_at?: string;
  rejection_note?: string;
  created_by: string;
  created_at: string;
  updated_at?: string;

  // Google Calendar sync fields
  google_event_id?: string;
  google_calendar_id?: string;
  synced_to_google: boolean;
  synced_from_google: boolean;
  last_sync_at?: string;
}

// Google Calendar Sync Configuration
export interface GoogleCalendarSync {
  id: string;
  org_id: string;
  space_id: string;
  google_calendar_id: string;
  sync_enabled: boolean;
  sync_direction: SyncDirection;
  last_sync_at?: string;
  connected_by: string;
  connected_at: string;
  updated_at: string;
}

// Calendar Subscription (iCal Feed)
export interface CalendarSubscription {
  id: string;
  user_id: string;
  token: string; // Unique token for public iCal feed
  org_id?: string;
  space_id?: string;
  name?: string;
  description?: string;
  scope: SubscriptionScope;
  dept_id?: string;
  filter_priority?: EventPriority;
  filter_status?: CalendarEventStatus;
  is_public: boolean;
  allowed_roles?: string[];
  created_at: string;
  last_accessed_at?: string;
  access_count: number;
}

// Calendar Permissions
export interface CalendarPermission {
  id: string;
  user_id: string;
  org_id?: string;
  space_id: string;
  can_manage: boolean; // true = Manager, false = Viewer
  granted_by?: string;
  granted_at: string;
}

// User's Calendar Role
export type UserCalendarRole = 'super_admin' | 'manager' | 'viewer' | null;

// Calendar RSVP
export interface CalendarRSVP {
  id: string;
  event_id: string;
  user_id: string;
  response: 'going' | 'maybe' | 'not_going';
  created_at: string;
  updated_at: string;
}

// Calendar Notification
export interface CalendarNotification {
  id: string;
  event_id: string;
  user_id: string;
  type: 'reminder' | 'approval_request' | 'approval_result';
  sent_at: string;
  read: boolean;
}

// Google OAuth Response
export interface GoogleOAuthToken {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

// Sync Status Response
export interface SyncStatus {
  connected: boolean;
  sync_enabled: boolean;
  last_sync_at?: string;
  next_sync?: string;
  synced_events: number;
  sync_direction: SyncDirection;
}

// Sync Result
export interface SyncResult {
  synced_events: number;
  created: number;
  updated: number;
  deleted: number;
  last_sync_at: string;
  errors: SyncError[];
}

export interface SyncError {
  event_id?: string;
  google_event_id?: string;
  error: string;
  timestamp: string;
}

// Create/Update Event Request
export interface CreateEventRequest {
  title: string;
  description?: string;
  event_type: EventType;
  start_date: string;
  end_date?: string;
  all_day: boolean;
  location?: string;
  space_id: string;
  sprint_id?: string;
  priority?: EventPriority;
  duration_days?: number;
  is_org_wide?: boolean;
  recurrence_rule?: string;
}

export interface UpdateEventRequest extends Partial<CreateEventRequest> {
  status?: CalendarEventStatus;
  rejection_note?: string;
}

// Create Subscription Request
export interface CreateSubscriptionRequest {
  name?: string;
  description?: string;
  space_id: string;
  filter_priority?: EventPriority;
  filter_status?: CalendarEventStatus;
  is_public?: boolean;
  allowed_roles?: string[];
}

// Approval Request
export interface ApprovalRequest {
  event_id: string;
  approved: boolean;
  rejection_note?: string;
}

// Activity Log Entry
export interface ActivityLogEntry {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// Dashboard Overview
export interface CalendarDashboard {
  upcoming_events: CalendarEvent[];
  pending_approvals: CalendarEvent[];
  sync_status: SyncStatus;
  subscription_count: number;
  recent_activity: ActivityLogEntry[];
}

// Export Statistics
export interface CalendarStats {
  total_events: number;
  approved_events: number;
  pending_events: number;
  synced_to_google: number;
  subscriptions_active: number;
  avg_approval_time: number; // in minutes
}

// iCal Event for feed generation
export interface iCalEvent {
  uid: string;
  dtstart: string; // ISO 8601
  dtend: string; // ISO 8601
  summary: string;
  description?: string;
  location?: string;
  status: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  priority: number; // 0-9, where 0 is undefined, 1-4 is high, 5 is medium, 6-9 is low
  dtstamp: string; // ISO 8601
}

// Pagination
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

// Filter options for calendar queries
export interface CalendarEventFilter {
  space_id?: string;
  status?: CalendarEventStatus;
  priority?: EventPriority;
  event_type?: EventType;
  start_date?: string;
  end_date?: string;
  created_by?: string;
  is_org_wide?: boolean;
  synced_to_google?: boolean;
}
