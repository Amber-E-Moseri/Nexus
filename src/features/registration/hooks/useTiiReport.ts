import { useCallback, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';

export interface TiiSession {
  id: string;
  session_date: string;
  session_name: string;
  sort_order: number;
  active: boolean;
}

export interface TiiAttendanceRecord {
  id: string;
  session_id: string;
  registration_id: string | null;
  full_name: string;
  email: string | null;
  status: 'present' | 'absent' | 'excused' | 'late';
  checked_in_at: string | null;
  cmp_attendance_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TiiAttendanceReport {
  id: string;
  label: string;
  event_id: string;
  report_type: string;
  expected_count: number;
  attended_count: number;
  absent_count: number;
  excused_count: number;
  unexpected_count: number;
  reach_pct: number;
  present_names: string[];
  absent_names: string[];
  excused_names: string[];
  unexpected_names: string[];
  by_session: Record<string, any>;
  by_subgroup: Record<string, any>;
  expected_pool_filter: 'confirmed_only' | 'confirmed_registered' | 'registered_only';
  share_token: string | null;
  attendance_source: Record<string, any> | null;
  subgroup_filter: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface Registration {
  id: string;
  email: string;
  full_name: string;
  subgroup: string;
  manually_confirmed: boolean;
  confirmed_at: string | null;
  submitted_at: string | null;
}

interface TiiReportInput {
  eventId: string;
  expectedPoolFilter: 'confirmed_only' | 'confirmed_registered' | 'registered_only';
  subgroupFilter?: string[];
}

/**
 * Hook for building and managing TII (This Is It) attendance reports
 * Handles report generation, CMP sync, and persistence
 */
export function useTiiReport() {
  /**
   * Fetch all TII sessions for an event
   */
  const fetchTiiSessions = useCallback(async (eventId: string): Promise<TiiSession[]> => {
    try {
      const { data, error } = await supabase
        .from('tii_sessions')
        .select('*')
        .eq('event_id', eventId)
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('session_date', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching TII sessions:', error);
      return [];
    }
  }, []);

  /**
   * Fetch attendance records for a session
   */
  const fetchSessionAttendance = useCallback(
    async (sessionId: string): Promise<TiiAttendanceRecord[]> => {
      try {
        const { data, error } = await supabase
          .from('tii_attendance')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
      } catch (error) {
        console.error('Error fetching session attendance:', error);
        return [];
      }
    },
    []
  );

  /**
   * Fetch all attendance records for an event (across all sessions)
   */
  const fetchEventAttendance = useCallback(async (eventId: string): Promise<TiiAttendanceRecord[]> => {
    try {
      const { data, error } = await supabase
        .from('tii_attendance')
        .select(`
          id, session_id, registration_id, full_name, email, status,
          checked_in_at, cmp_attendance_id, created_by, created_at, updated_at,
          tii_sessions!inner(event_id)
        `)
        .eq('tii_sessions.event_id', eventId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching event attendance:', error);
      return [];
    }
  }, []);

  /**
   * Add attendees to a session manually or from CSV
   * @param sessionId - Session to add attendees to
   * @param attendees - Array of {full_name, email?}
   */
  const addAttendancesToSession = useCallback(
    async (
      sessionId: string,
      attendees: Array<{ full_name: string; email?: string; status?: string }>
    ) => {
      try {
        const records = attendees.map((a) => ({
          session_id: sessionId,
          full_name: a.full_name.trim(),
          email: a.email ? a.email.toLowerCase() : null,
          status: a.status || 'present',
          created_by: (await supabase.auth.getUser())?.data?.user?.id,
        }));

        const { error } = await supabase.from('tii_attendance').insert(records);
        if (error) throw error;
      } catch (error) {
        console.error('Error adding attendance records:', error);
        throw error;
      }
    },
    []
  );

  /**
   * Sync attendance from CMP via edge function
   * @param sessionId - Session to sync
   * @param cmpServiceId - CMP service ID to fetch data from
   */
  const syncFromCmp = useCallback(
    async (sessionId: string, cmpServiceId: string) => {
      try {
        const { data, error } = await supabase.functions.invoke('service-attendees', {
          body: {
            action: 'attendees',
            cmpServiceId,
          },
        });

        if (error) throw error;

        // Parse attendees from CMP response and add to session
        const attendees = (data?.attendees || []).map((name: string) => ({
          full_name: name,
          email: null,
          status: 'present',
        }));

        if (attendees.length > 0) {
          await addAttendancesToSession(sessionId, attendees);
        }

        return attendees.length;
      } catch (error) {
        console.error('Error syncing from CMP:', error);
        throw error;
      }
    },
    [addAttendancesToSession]
  );

  /**
   * Build aggregated report from attendance data
   * Uses Supabase RPC function for heavy lifting
   */
  const buildReport = useCallback(
    async (params: TiiReportInput): Promise<Partial<TiiAttendanceReport>> => {
      try {
        // Call RPC function to build report
        const { data, error } = await supabase.rpc('build_tii_report', {
          event_id_param: params.eventId,
          expected_pool_filter_param: params.expectedPoolFilter || 'confirmed_registered',
          subgroup_filter_param: params.subgroupFilter || null,
        });

        if (error) throw error;

        if (!data || data.length === 0) {
          return {
            expected_count: 0,
            attended_count: 0,
            absent_count: 0,
            excused_count: 0,
            unexpected_count: 0,
            reach_pct: 0,
            present_names: [],
            absent_names: [],
            excused_names: [],
            unexpected_names: [],
            by_session: {},
            by_subgroup: {},
          };
        }

        const report = data[0];
        return {
          expected_count: report.expected_count,
          attended_count: report.attended_count,
          absent_count: report.absent_count,
          excused_count: report.excused_count,
          unexpected_count: report.unexpected_count,
          reach_pct: report.reach_pct,
          present_names: report.present_names || [],
          absent_names: report.absent_names || [],
          excused_names: report.excused_names || [],
          unexpected_names: report.unexpected_names || [],
          by_session: report.by_session || {},
          by_subgroup: report.by_subgroup || {},
        };
      } catch (error) {
        console.error('Error building TII report:', error);
        throw error;
      }
    },
    []
  );

  /**
   * Save a generated report to the database
   */
  const saveReport = useCallback(
    async (
      eventId: string,
      label: string,
      reportData: Partial<TiiAttendanceReport>,
      expectedPoolFilter: string,
      subgroupFilter?: string[]
    ): Promise<TiiAttendanceReport | null> => {
      try {
        const user = await supabase.auth.getUser();
        if (!user?.data?.user?.id) throw new Error('Not authenticated');

        // Generate share token
        const shareToken = crypto.randomUUID();

        const { data, error } = await supabase
          .from('tii_attendance_reports')
          .insert({
            event_id: eventId,
            label,
            expected_count: reportData.expected_count || 0,
            attended_count: reportData.attended_count || 0,
            absent_count: reportData.absent_count || 0,
            excused_count: reportData.excused_count || 0,
            unexpected_count: reportData.unexpected_count || 0,
            reach_pct: reportData.reach_pct || 0,
            present_names: reportData.present_names || [],
            absent_names: reportData.absent_names || [],
            excused_names: reportData.excused_names || [],
            unexpected_names: reportData.unexpected_names || [],
            by_session: reportData.by_session || {},
            by_subgroup: reportData.by_subgroup || {},
            expected_pool_filter: expectedPoolFilter,
            share_token: shareToken,
            attendance_source: {
              type: 'tii_event',
              sync_date: new Date().toISOString(),
            },
            subgroup_filter: subgroupFilter || [],
            created_by: user.data.user.id,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      } catch (error) {
        console.error('Error saving TII report:', error);
        throw error;
      }
    },
    []
  );

  /**
   * Fetch a saved report by ID
   */
  const fetchReport = useCallback(async (reportId: string): Promise<TiiAttendanceReport | null> => {
    try {
      const { data, error } = await supabase
        .from('tii_attendance_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching report:', error);
      return null;
    }
  }, []);

  /**
   * Fetch a report by share token (public access)
   */
  const fetchReportByToken = useCallback(async (shareToken: string): Promise<TiiAttendanceReport | null> => {
    try {
      const { data, error } = await supabase
        .from('tii_attendance_reports')
        .select('*')
        .eq('share_token', shareToken)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching report by token:', error);
      return null;
    }
  }, []);

  /**
   * Calculate reach percentage with color coding
   */
  const getReachColor = useCallback((reachPct: number): string => {
    if (reachPct >= 80) return '#2D8653'; // Green
    if (reachPct >= 65) return '#1B4E55'; // Blue
    if (reachPct >= 50) return '#7A5A00'; // Orange
    if (reachPct >= 35) return '#7A3210'; // Dark Orange
    return '#7A1C24'; // Red
  }, []);

  /**
   * Detect chronic absence: people who were absent 3+ sessions
   */
  const findChronicAbsentees = useCallback(
    (
      attendance: TiiAttendanceRecord[],
      sessions: TiiSession[],
      registrations: Registration[]
    ): Array<{ name: string; email?: string; absenceDays: string[] }> => {
      const absenceMap: Record<string, string[]> = {};

      // Build map of absences per person
      registrations.forEach((reg) => {
        const key = reg.email?.toLowerCase() || reg.full_name.toLowerCase();
        absenceMap[key] = [];

        // For each session, check if person attended
        sessions.forEach((session) => {
          const attended = attendance.some(
            (a) =>
              a.session_id === session.id &&
              (a.email?.toLowerCase() === key || a.full_name.toLowerCase() === key) &&
              a.status === 'present'
          );

          if (!attended) {
            absenceMap[key].push(session.session_date);
          }
        });
      });

      // Filter to only those with 3+ absences
      return Object.entries(absenceMap)
        .filter(([_, absenceDays]) => absenceDays.length >= 3)
        .map(([nameKey, absenceDays]) => {
          const reg = registrations.find(
            (r) => r.email?.toLowerCase() === nameKey || r.full_name.toLowerCase() === nameKey
          );
          return {
            name: reg?.full_name || nameKey,
            email: reg?.email,
            absenceDays,
          };
        });
    },
    []
  );

  return {
    fetchTiiSessions,
    fetchSessionAttendance,
    fetchEventAttendance,
    addAttendancesToSession,
    syncFromCmp,
    buildReport,
    saveReport,
    fetchReport,
    fetchReportByToken,
    getReachColor,
    findChronicAbsentees,
  };
}
