import React, { useEffect, useState } from 'react';
import { AlertCircle, Download, Printer } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useTiiReport } from '../hooks/useTiiReport';

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

export default function TiiReportPublicPage() {
  const { shareToken } = useParams();
  const { fetchReportByToken, getReachColor } = useTiiReport();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchReportByToken(shareToken);
        if (!data) {
          setError('Report not found');
        } else {
          setReport(data);
        }
      } catch (err) {
        console.error('Error loading report:', err);
        setError('Error loading report');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [shareToken, fetchReportByToken]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div
        style={{
          padding: '40px',
          textAlign: 'center',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <p style={{ color: C.mute }}>Loading report...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div
        style={{
          padding: '40px',
          textAlign: 'center',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <AlertCircle size={32} color={C.red} style={{ margin: '0 auto 16px' }} />
        <p style={{ color: C.red, fontSize: '16px', fontWeight: '600' }}>
          {error || 'Report not found'}
        </p>
        <p style={{ color: C.mute, marginTop: '8px' }}>
          This report link may have expired or does not exist.
        </p>
      </div>
    );
  }

  const reachColor = getReachColor(report.reach_pct || 0);

  return (
    <div style={{ padding: '24px', fontFamily: 'Inter, sans-serif', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          paddingBottom: '16px',
          borderBottom: `1px solid ${C.line}`,
          '@media print': {
            borderBottom: 'none',
          },
        }}
      >
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: C.ink, margin: '0 0 4px 0' }}>
            {report.label}
          </h1>
          <p style={{ fontSize: '12px', color: C.mute, margin: 0 }}>
            Generated on {new Date(report.created_at).toLocaleDateString()}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handlePrint}
            style={{
              padding: '8px 16px',
              background: C.paper,
              border: `1px solid ${C.line}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Printer size={16} />
            Print
          </button>
        </div>
      </div>

      {/* KPI Section */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
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
              pageBreakInside: 'avoid',
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
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: C.ink }}>
            Attendance Details
          </h2>
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
                      pageBreakInside: 'avoid',
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

      {/* Per-Session Breakdown */}
      {report.by_session && Object.keys(report.by_session).length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: C.ink }}>
            Per-Session Breakdown
          </h2>
          {Object.entries(report.by_session).map(([sessionId, session]) => (
            <div
              key={sessionId}
              style={{
                padding: '12px',
                background: C.paper,
                border: `1px solid ${C.line}`,
                borderRadius: '8px',
                marginBottom: '8px',
                pageBreakInside: 'avoid',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: '600', color: C.ink, marginBottom: '8px' }}>
                {session.session_name} — {session.session_date}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '8px',
                  fontSize: '12px',
                }}
              >
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

      {/* Per-Subgroup Summary */}
      {report.by_subgroup && Object.keys(report.by_subgroup).length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: C.ink }}>
            By Subgroup
          </h2>
          {Object.entries(report.by_subgroup).map(([subgroup, data]) => (
            <div
              key={subgroup}
              style={{
                padding: '12px',
                background: C.paper,
                border: `1px solid ${C.line}`,
                borderRadius: '8px',
                marginBottom: '8px',
                pageBreakInside: 'avoid',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: '600', color: C.ink, marginBottom: '8px' }}>
                {subgroup}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '8px',
                  fontSize: '12px',
                }}
              >
                <div>
                  <span style={{ color: C.mute }}>Expected</span>
                  <div style={{ fontWeight: '600', fontSize: '14px' }}>{data.expected}</div>
                </div>
                <div>
                  <span style={{ color: C.mute }}>Present</span>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: C.green }}>
                    {data.present}
                  </div>
                </div>
                <div>
                  <span style={{ color: C.mute }}>Absent</span>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: C.red }}>
                    {data.absent}
                  </div>
                </div>
                <div>
                  <span style={{ color: C.mute }}>Reach</span>
                  <div
                    style={{
                      fontWeight: '600',
                      fontSize: '14px',
                      color: getReachColor(data.reach_pct),
                    }}
                  >
                    {data.reach_pct?.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @media print {
          body { background: white; }
          button { display: none !important; }
          div { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
