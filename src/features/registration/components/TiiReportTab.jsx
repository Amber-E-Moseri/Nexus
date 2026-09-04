import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AlertCircle, Copy, Eye, EyeOff, Filter, RefreshCw, Share2, Printer, Download, FileText } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useTiiReport } from '../hooks/useTiiReport';

// Export report to CSV
function exportReportToCSV(report, reportLabel) {
  if (!report) return;

  const rows = [
    [reportLabel, ''],
    ['', ''],
    ['Report Summary', ''],
    ['Expected', report.expected_count],
    ['Present', report.attended_count],
    ['Absent', report.absent_count],
    ['Unexpected (Walk-ins)', report.unexpected_count],
    ['Reach %', `${report.reach_pct}%`],
    ['', ''],
    ['Present Names', ''],
    ...report.present_names.map(name => [name, '']),
    ['', ''],
    ['Absent Names', ''],
    ...report.absent_names.map(name => [name, '']),
    ['', ''],
    ['Unexpected Names', ''],
    ...report.unexpected_names.map(name => [name, '']),
  ];

  const csv = rows.map(row => row.map(cell => `"${cell || ''}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${reportLabel.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
}

const C = {
  ink: '#1A1220',
  paper: '#FFFFFF',
  line: '#E7E2EE',
  mute: '#8A7F99',
  green: '#1F8A4C',
  greenBg: '#E8F5EC',
  amber: '#B8710A',
  amberBg: '#FBF0DE',
  red: '#C4383A',
  redBg: '#FBE9E9',
  blue: '#2A5FA5',
  blueBg: '#E9F0FA',
};

export default function TiiReportTab({
  registrations = [],
  eventId,
  eventConfig = {},
}) {
  const {
    fetchEventAttendance,
    buildReport,
    saveReport,
    fetchTiiSessions,
    getReachColor,
    findChronicAbsentees,
  } = useTiiReport();

  const [view, setView] = useState('generate'); // 'generate' | 'summary' | 'by_session' | 'by_subgroup'
  const [expectedPoolFilter, setExpectedPoolFilter] = useState('confirmed_registered');
  const [subgroupFilter, setSubgroupFilter] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [sessions_, setSessions] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [showShareToken, setShowShareToken] = useState(false);
  const [reportLabel, setReportLabel] = useState(`TII ${new Date().getFullYear()}`);
  const [showCmpImport, setShowCmpImport] = useState(false);
  const [cmpServices, setCmpServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [cmpLoading, setCmpLoading] = useState(false);

  // Fetch sessions and attendance on mount
  useEffect(() => {
    const load = async () => {
      const [sessionsData, attendanceData] = await Promise.all([
        fetchTiiSessions(eventId),
        fetchEventAttendance(eventId),
      ]);
      setSessions(sessionsData);
      setAttendance(attendanceData);
    };
    load();
  }, [eventId, fetchTiiSessions, fetchEventAttendance]);

  // Fetch CMP services for import
  const handleFetchCmpServices = useCallback(async () => {
    setCmpLoading(true);
    try {
      // Call service-attendees edge function to list services
      const { data, error } = await supabase.functions.invoke('service-attendees', {
        body: { action: 'list' },
      });

      if (error) throw error;
      setCmpServices(data?.services || []);
    } catch (error) {
      console.error('Error fetching CMP services:', error);
      alert('Error loading CMP services. Make sure the edge function is deployed.');
    } finally {
      setCmpLoading(false);
    }
  }, []);

  // Import attendance from selected CMP service
  const handleImportFromCmp = useCallback(async () => {
    if (!selectedService) {
      alert('Please select a service');
      return;
    }

    setCmpLoading(true);
    try {
      // Fetch attendees from selected service
      const { data, error } = await supabase.functions.invoke('service-attendees', {
        body: {
          action: 'attendees',
          cmpServiceId: selectedService.id,
        },
      });

      if (error) throw error;

      // Add attendees to current attendance
      const newAttendees = (data?.attendees || []).map(name => ({
        full_name: name,
        email: null,
        status: 'present',
        created_at: new Date().toISOString(),
      }));

      setAttendance(prev => [...prev, ...newAttendees]);
      alert(`Imported ${newAttendees.length} attendees from ${selectedService.name}`);
      setShowCmpImport(false);
      setSelectedService(null);
    } catch (error) {
      console.error('Error importing from CMP:', error);
      alert('Error importing attendance from CMP');
    } finally {
      setCmpLoading(false);
    }
  }, [selectedService]);

  // Generate report
  const handleGenerateReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const reportData = await buildReport(
        {
          eventId,
          expectedPoolFilter,
          subgroupFilter: subgroupFilter.length > 0 ? subgroupFilter : undefined,
        },
        registrations,
        attendance
      );
      setReport(reportData);
      setView('summary');
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Error generating report');
    } finally {
      setIsLoading(false);
    }
  }, [eventId, expectedPoolFilter, subgroupFilter, registrations, attendance, buildReport]);

  // Save report
  const handleSaveReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const saved = await saveReport(
        eventId,
        reportLabel,
        report,
        expectedPoolFilter,
        subgroupFilter
      );
      alert(`Report saved: ${saved.label}`);
    } catch (error) {
      console.error('Error saving report:', error);
      alert('Error saving report');
    } finally {
      setIsLoading(false);
    }
  }, [eventId, report, reportLabel, expectedPoolFilter, subgroupFilter, saveReport]);

  // Get unique subgroups
  const uniqueSubgroups = useMemo(() => {
    const groups = new Set(registrations.map((r) => r.subgroup).filter(Boolean));
    return Array.from(groups).sort();
  }, [registrations]);

  // Calculate reach color
  const reachColor = getReachColor(report?.reach_pct || 0);

  // Find chronic absentees
  const chronicAbsentees = useMemo(() => {
    if (!report || !sessions_ || !registrations) return [];
    return findChronicAbsentees(attendance, sessions_, registrations);
  }, [report, sessions_, registrations, attendance, findChronicAbsentees]);

  return (
    <div style={{ padding: '24px', fontFamily: 'Inter, sans-serif' }}>
      {/* GENERATE TAB */}
      {view === 'generate' && (
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '20px', color: C.ink }}>
            Generate TII Report
          </h2>

          {/* Expected Pool Filter */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: C.ink }}>
              Expected Attendees
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { value: 'confirmed_only', label: 'Confirmed Only' },
                { value: 'confirmed_registered', label: 'Confirmed + Registered' },
                { value: 'registered_only', label: 'All Registered' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setExpectedPoolFilter(option.value)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: expectedPoolFilter === option.value ? `2px solid ${C.blue}` : `1px solid ${C.line}`,
                    background: expectedPoolFilter === option.value ? C.blueBg : C.paper,
                    color: C.ink,
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '12px', color: C.mute, marginTop: '8px' }}>
              Determines which registrations count toward the expected pool (affects reach % calculation)
            </p>
          </div>

          {/* Subgroup Filter */}
          {uniqueSubgroups.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: C.ink }}>
                Filter by Subgroup (optional)
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setSubgroupFilter([])}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: subgroupFilter.length === 0 ? `2px solid ${C.blue}` : `1px solid ${C.line}`,
                    background: subgroupFilter.length === 0 ? C.blueBg : C.paper,
                    color: C.ink,
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  All
                </button>
                {uniqueSubgroups.map((sg) => (
                  <button
                    key={sg}
                    onClick={() =>
                      setSubgroupFilter((prev) =>
                        prev.includes(sg) ? prev.filter((x) => x !== sg) : [...prev, sg]
                      )
                    }
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: subgroupFilter.includes(sg) ? `2px solid ${C.blue}` : `1px solid ${C.line}`,
                      background: subgroupFilter.includes(sg) ? C.blueBg : C.paper,
                      color: C.ink,
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    {sg}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Import from CMP */}
          <div style={{ marginBottom: '20px', padding: '16px', background: C.blueBg, borderRadius: '8px', border: `1px solid ${C.blue}` }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: C.blue, marginTop: 0, marginBottom: '12px' }}>
              📊 Import Attendance from CMP
            </h3>
            {!showCmpImport ? (
              <button
                onClick={() => { setShowCmpImport(true); handleFetchCmpServices(); }}
                disabled={cmpLoading}
                style={{
                  padding: '8px 16px',
                  background: C.blue,
                  color: C.paper,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: cmpLoading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  opacity: cmpLoading ? 0.6 : 1,
                }}
              >
                {cmpLoading ? 'Loading...' : 'Load CMP Services'}
              </button>
            ) : (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '8px', color: C.ink }}>
                  Select a service/meeting
                </label>
                <select
                  value={selectedService?.id || ''}
                  onChange={(e) => {
                    const service = cmpServices.find(s => s.id === e.target.value);
                    setSelectedService(service);
                  }}
                  style={{
                    padding: '8px 12px',
                    border: `1px solid ${C.line}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                    width: '100%',
                    marginBottom: '8px',
                  }}
                >
                  <option value="">-- Select a service --</option>
                  {cmpServices.map(service => (
                    <option key={service.id} value={service.id}>
                      {service.name} ({service.date})
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleImportFromCmp}
                    disabled={cmpLoading || !selectedService}
                    style={{
                      padding: '8px 16px',
                      background: C.green,
                      color: C.paper,
                      border: 'none',
                      borderRadius: '6px',
                      cursor: cmpLoading || !selectedService ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      opacity: cmpLoading || !selectedService ? 0.6 : 1,
                    }}
                  >
                    {cmpLoading ? 'Importing...' : 'Import Attendance'}
                  </button>
                  <button
                    onClick={() => setShowCmpImport(false)}
                    style={{
                      padding: '8px 16px',
                      background: C.paper,
                      border: `1px solid ${C.line}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Report Label */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: C.ink }}>
              Report Label
            </label>
            <input
              type="text"
              value={reportLabel}
              onChange={(e) => setReportLabel(e.target.value)}
              style={{
                padding: '8px 12px',
                border: `1px solid ${C.line}`,
                borderRadius: '6px',
                fontSize: '14px',
                width: '100%',
              }}
            />
          </div>

          {/* Attendance Summary */}
          {attendance.length > 0 && (
            <div style={{ marginBottom: '20px', padding: '12px', background: C.greenBg, borderRadius: '6px', fontSize: '13px', color: C.green }}>
              <strong>{attendance.length}</strong> attendees loaded from CMP
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={handleGenerateReport}
            disabled={isLoading}
            style={{
              padding: '10px 24px',
              background: C.blue,
              color: C.paper,
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {isLoading ? 'Generating...' : 'Generate Report'}
          </button>
        </div>
      )}

      {/* SUMMARY TAB */}
      {view === 'summary' && report && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: C.ink }}>
              {reportLabel}
            </h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setView('generate')}
                style={{
                  padding: '8px 16px',
                  background: C.paper,
                  border: `1px solid ${C.line}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Back
              </button>
              <button
                onClick={() => exportReportToCSV(report, reportLabel)}
                style={{
                  padding: '8px 16px',
                  background: C.paper,
                  border: `1px solid ${C.line}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Download size={16} />
                Export CSV
              </button>
              <button
                onClick={handleSaveReport}
                disabled={isLoading}
                style={{
                  padding: '8px 16px',
                  background: C.green,
                  color: C.paper,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                <Share2 size={16} />
                Save & Share
              </button>
            </div>
          </div>

          {/* KPI Tiles */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '12px',
              marginBottom: '24px',
            }}
          >
            {[
              { label: 'Expected', value: report.expected_count, color: C.blue },
              { label: 'Present', value: report.attended_count, color: C.green },
              { label: 'Absent', value: report.absent_count, color: C.red },
              { label: 'Unexpected', value: report.unexpected_count, color: C.amber },
              {
                label: 'Reach %',
                value: `${report.reach_pct?.toFixed(1)}%`,
                color: reachColor,
                highlight: true,
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  padding: '16px',
                  background: C.paper,
                  border: `1px solid ${C.line}`,
                  borderRadius: '8px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '12px', color: C.mute, marginBottom: '4px', fontWeight: '500' }}>
                  {kpi.label}
                </div>
                <div
                  style={{
                    fontSize: kpi.highlight ? '28px' : '24px',
                    fontWeight: '700',
                    color: kpi.color,
                  }}
                >
                  {kpi.value}
                </div>
              </div>
            ))}
          </div>

          {/* Attendance Lists */}
          {(report.present_names?.length > 0 ||
            report.absent_names?.length > 0 ||
            report.unexpected_names?.length > 0) && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: C.ink }}>
                Attendance Details
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '12px',
                }}
              >
                {[
                  {
                    title: 'Present',
                    names: report.present_names,
                    color: C.green,
                    bgColor: C.greenBg,
                  },
                  {
                    title: 'Absent',
                    names: report.absent_names,
                    color: C.red,
                    bgColor: C.redBg,
                  },
                  {
                    title: 'Unexpected (Walk-ins)',
                    names: report.unexpected_names,
                    color: C.amber,
                    bgColor: C.amberBg,
                  },
                ].map(
                  (section) =>
                    section.names?.length > 0 && (
                      <div
                        key={section.title}
                        style={{
                          padding: '12px',
                          background: section.bgColor,
                          borderRadius: '8px',
                          border: `1px solid ${section.color}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: '12px',
                            fontWeight: '600',
                            color: section.color,
                            marginBottom: '8px',
                          }}
                        >
                          {section.title} ({section.names.length})
                        </div>
                        <div
                          style={{
                            fontSize: '13px',
                            color: C.ink,
                            lineHeight: '1.5',
                          }}
                        >
                          {section.names.join(', ')}
                        </div>
                      </div>
                    )
                )}
              </div>
            </div>
          )}

          {/* Chronic Absentees */}
          {chronicAbsentees.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h3
                style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  marginBottom: '12px',
                  color: C.red,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={18} />
                Chronic Absence (3+ sessions missed)
              </h3>
              <div style={{ padding: '12px', background: C.redBg, borderRadius: '8px' }}>
                {chronicAbsentees.map((person) => (
                  <div
                    key={`${person.name}-${person.email}`}
                    style={{
                      fontSize: '13px',
                      color: C.ink,
                      marginBottom: '6px',
                      padding: '6px',
                      background: C.paper,
                      borderRadius: '4px',
                    }}
                  >
                    <strong>{person.name}</strong>
                    {person.email && <span style={{ color: C.mute, marginLeft: '8px' }}>({person.email})</span>}
                    <span style={{ color: C.mute, fontSize: '12px', marginLeft: '8px' }}>
                      Missed {person.absenceDays.length} sessions
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-Session Breakdown */}
          {report.by_session && Object.keys(report.by_session).length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: C.ink }}>
                Per-Session Breakdown
              </h3>
              {Object.entries(report.by_session).map(([sessionId, session]) => (
                <div
                  key={sessionId}
                  style={{
                    padding: '12px',
                    background: C.paper,
                    border: `1px solid ${C.line}`,
                    borderRadius: '8px',
                    marginBottom: '8px',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: '600', color: C.ink, marginBottom: '8px' }}>
                    {session.session_name} — {session.session_date}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '12px' }}>
                    <div>
                      <span style={{ color: C.mute }}>Expected</span>
                      <div style={{ fontWeight: '600', fontSize: '14px' }}>{session.expected}</div>
                    </div>
                    <div>
                      <span style={{ color: C.mute }}>Present</span>
                      <div style={{ fontWeight: '600', fontSize: '14px', color: C.green }}>
                        {session.present}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: C.mute }}>Absent</span>
                      <div style={{ fontWeight: '600', fontSize: '14px', color: C.red }}>
                        {session.absent}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: C.mute }}>Reach</span>
                      <div
                        style={{
                          fontWeight: '600',
                          fontSize: '14px',
                          color: getReachColor(session.reach_pct),
                        }}
                      >
                        {session.reach_pct?.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!report && view !== 'generate' && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: C.mute, marginBottom: '16px' }}>No report generated yet</p>
          <button
            onClick={() => setView('generate')}
            style={{
              padding: '8px 16px',
              background: C.blue,
              color: C.paper,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Create a Report
          </button>
        </div>
      )}
    </div>
  );
}
