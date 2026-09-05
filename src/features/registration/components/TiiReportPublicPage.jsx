import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTiiReport } from '../hooks/useTiiReport';

const PAGE_BG = '#F4F1EA';
const PANEL_BG = '#FFFFFF';
const PANEL_BORDER = '#DDD7C8';
const TEXT = '#2C2C2A';
const MUTED = '#7B776F';
const HEADER_GRADIENT = 'linear-gradient(135deg, #2D1B69 0%, #4C2A92 50%, #6B3FAF 100%)';

function reachBand(pct) {
  if (pct >= 80) return { bg: '#D9F2E3', fg: '#1B5E3C', border: '#A8DBC0' };
  if (pct >= 65) return { bg: '#D4EEF0', fg: '#1B4E55', border: '#98CDD2' };
  if (pct >= 50) return { bg: '#FFF4CC', fg: '#7A5A00', border: '#EDD88A' };
  if (pct >= 35) return { bg: '#FEE8D6', fg: '#7A3210', border: '#F5C4A0' };
  return { bg: '#F8D7DA', fg: '#7A1C24', border: '#F0B0B6' };
}

function dateStamp(v) {
  const d = new Date(v);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ─── KPI TILE ──────────────────────────────────────────────────────────────────
function KpiTile({ label, value, bg, bd, circle, labelColor, valueColor }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, padding: '20px 18px', background: bg, border: `1px solid ${bd}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ position: 'absolute', right: -20, bottom: -28, width: 80, height: 80, borderRadius: 999, background: circle, opacity: 0.6 }} />
      <div style={{ position: 'relative', fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: labelColor, marginBottom: 8 }}>{label}</div>
      <div style={{ position: 'relative', fontSize: 32, fontWeight: 800, color: valueColor, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

// ─── SUBGROUP CARD ─────────────────────────────────────────────────────────────
function SubgroupCard({ subgroup, data }) {
  const exp = data.expected?.length ?? 0;
  const pres = data.present?.length ?? 0;
  const abs = data.absent?.length ?? 0;
  const pct = exp > 0 ? Math.round(pres / exp * 100) : 0;
  const band = reachBand(pct);
  return (
    <div style={{ background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ background: '#3D1A78', color: '#fff', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{subgroup}</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{pres} of {exp}</span>
          <span style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 999, padding: '4px 12px', fontSize: 13, fontWeight: 800 }}>{pct}%</span>
        </div>
      </div>
      {/* mini KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: `1px solid ${PANEL_BORDER}` }}>
        {[
          { label: 'Expected', value: exp, color: '#3D1A78' },
          { label: 'Present', value: pres, color: '#085041' },
          { label: 'Absent', value: abs, color: '#712B13' },
        ].map((k, i) => (
          <div key={k.label} style={{ padding: '12px 16px', textAlign: 'center', borderRight: i < 2 ? `0.5px solid ${PANEL_BORDER}` : 'none', background: '#FAFAF7' }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: MUTED }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, marginTop: 4, lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>
      {/* two-column present / absent */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <div style={{ borderRight: `0.5px solid ${PANEL_BORDER}` }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${PANEL_BORDER}`, background: '#F2FAF6', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#085041', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Present</span>
            <span style={{ background: '#085041', color: '#fff', borderRadius: 999, padding: '1px 8px', fontSize: 9, fontWeight: 700 }}>{pres}</span>
          </div>
          {(data.present ?? []).length === 0
            ? <div style={{ padding: '16px', fontSize: 12, color: MUTED, fontStyle: 'italic' }}>Full attendance</div>
            : (data.present ?? []).map((n, i) => (
              <div key={i} style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: i < (data.present?.length ?? 0) - 1 ? `0.5px solid #F0ECE4` : 'none' }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: '#2D8653', flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: TEXT }}>{typeof n === 'string' ? n : n.name}</span>
              </div>
            ))}
        </div>
        <div>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${PANEL_BORDER}`, background: '#FEF5F2', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#712B13', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Absent</span>
            <span style={{ background: '#712B13', color: '#fff', borderRadius: 999, padding: '1px 8px', fontSize: 9, fontWeight: 700 }}>{abs}</span>
          </div>
          {(data.absent ?? []).length === 0
            ? <div style={{ padding: '16px', fontSize: 12, color: MUTED, fontStyle: 'italic' }}>No absences</div>
            : (data.absent ?? []).map((n, i) => (
              <div key={i} style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: i < (data.absent?.length ?? 0) - 1 ? `0.5px solid #F0ECE4` : 'none' }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: '#C94830', flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: TEXT }}>{typeof n === 'string' ? n : n.name}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ─── SESSION ATTENDANCE TABLE ──────────────────────────────────────────────────
function SessionAttendanceTable({ report }) {
  // session_labels and session_attendance are stored inside by_session when the report was saved
  const sessionLabels = report?.by_session?.session_labels || report?.session_labels || [];
  const sessionAttendance = report?.by_session?.session_attendance || report?.session_attendance || {};
  if (!Object.keys(sessionAttendance).length || !sessionLabels.length) return null;

  // Group by subgroup; Unknown last
  const grouped = {};
  Object.entries(sessionAttendance).forEach(([name, data]) => {
    const sg = data.subgroup || 'Unknown';
    if (!grouped[sg]) grouped[sg] = [];
    grouped[sg].push([name, data]);
  });
  Object.values(grouped).forEach(arr => arr.sort((a, b) => (b[1]?.count ?? 0) - (a[1]?.count ?? 0)));
  const sgOrder = Object.keys(grouped).sort((a, b) => a === 'Unknown' ? 1 : b === 'Unknown' ? -1 : a.localeCompare(b));
  let rowIdx = 0;

  return (
    <div style={{ background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ background: '#3D1A78', color: '#fff', padding: '12px 18px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em' }}>Session Attendance</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 400 }}>
          <thead>
            <tr style={{ background: '#FAFAF7' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: TEXT, borderBottom: `1px solid ${PANEL_BORDER}` }}>Name</th>
              {sessionLabels.map(lbl => (
                <th key={lbl} style={{ padding: '10px 10px', textAlign: 'center', fontSize: 10, color: MUTED, fontWeight: 700, borderBottom: `1px solid ${PANEL_BORDER}`, maxWidth: 90, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lbl}</th>
              ))}
              <th style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 700, color: '#3D1A78', borderBottom: `1px solid ${PANEL_BORDER}` }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {sgOrder.map(sg => {
              const entries = grouped[sg];
              const colSpan = sessionLabels.length + 2;
              return (
                <React.Fragment key={sg}>
                  <tr>
                    <td colSpan={colSpan} style={{ padding: '8px 16px', background: '#3D1A78', color: '#fff', fontWeight: 700, fontSize: 11, borderBottom: `1px solid #2A1258` }}>
                      {sg}
                      <span style={{ marginLeft: 10, fontWeight: 400, opacity: 0.7 }}>
                        {entries.filter(([, d]) => d.count > 0).length} attending · {entries.length} total
                      </span>
                    </td>
                  </tr>
                  {entries.map(([name, data]) => {
                    const isWalkIn = name.endsWith(' ★');
                    const bg = rowIdx++ % 2 === 0 ? '#fff' : '#FAFAF7';
                    return (
                      <tr key={name} style={{ background: bg }}>
                        <td style={{ padding: '9px 16px', fontWeight: 600, color: isWalkIn ? '#B8710A' : TEXT, borderBottom: `0.5px solid ${PANEL_BORDER}` }}>
                          {name}{isWalkIn && <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 400 }}>(walk-in)</span>}
                        </td>
                        {sessionLabels.map(lbl => (
                          <td key={lbl} style={{ padding: '9px 10px', textAlign: 'center', borderBottom: `0.5px solid ${PANEL_BORDER}` }}>
                            {data.sessions?.[lbl]
                              ? <span style={{ color: '#2D8653', fontWeight: 700 }}>✓</span>
                              : <span style={{ color: '#D8D0E8' }}>—</span>}
                          </td>
                        ))}
                        <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 800, color: data.count === sessionLabels.length ? '#1B5E3C' : '#3D1A78', borderBottom: `0.5px solid ${PANEL_BORDER}` }}>
                          {data.count}/{sessionLabels.length}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── PRINT STYLES ──────────────────────────────────────────────────────────────
const PRINT_STYLES = `
@media print {
  @page { margin: 0.75in; size: A4 portrait; }
  html, body {
    background: white !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .tii-print-hide { display: none !important; }
  .tii-public-page { background: white !important; padding: 0 !important; }
  .tii-header { background: linear-gradient(135deg, #2D1B69 0%, #4C2A92 50%, #6B3FAF 100%) !important; }
  table { width: 100% !important; font-size: 11pt !important; }
  thead { display: table-header-group !important; }
  tbody tr { page-break-inside: avoid !important; }
  th, td { border: 1px solid #DDD7C8 !important; padding: 7px 10px !important; }
  th { background: #F9F8F6 !important; font-weight: 600 !important; }
}
`;

export default function TiiReportPublicPage() {
  const { shareToken } = useParams();
  const { fetchReportByToken } = useTiiReport();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await fetchReportByToken(shareToken);
        if (active) {
          if (!data) setError('Report not found or this link has expired.');
          else setReport(data);
        }
      } catch {
        if (active) setError('Something went wrong loading this report.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [shareToken]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: PAGE_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: 14 }}>
        Loading report…
      </div>
    );
  }

  if (error || !report) {
    return (
      <div style={{ minHeight: '100vh', background: HEADER_GRADIENT, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', color: '#fff', maxWidth: 440 }}>
          <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 10 }}>{error ? "Couldn't load this report" : 'Report not found'}</div>
          <div style={{ fontSize: 14, color: '#D9D0F2', lineHeight: 1.6, marginBottom: 18 }}>
            {error || 'This report may have been deleted or the link is incorrect.'}
          </div>
          <a href="/" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '10px 16px', borderRadius: 10, background: '#fff', color: '#2D1B69', fontWeight: 700, textDecoration: 'none' }}>
            Go to BLW CAN NEXUS
          </a>
        </div>
      </div>
    );
  }

  const reachPct = Math.round(report.reach_pct ?? 0);
  const band = reachBand(reachPct);
  const bySubgroup = report.by_subgroup || {};
  const subgroupKeys = Object.keys(bySubgroup).sort((a, b) => {
    if (a === 'Central East Subgroup A') return 1;
    if (b === 'Central East Subgroup A') return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="tii-public-page" style={{ minHeight: '100vh', background: PAGE_BG, overflowX: 'hidden' }}>
      <style>{PRINT_STYLES}</style>

      {/* Header */}
      <header className="tii-header" style={{ background: HEADER_GRADIENT, padding: '40px 28px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', margin: '0 0 6px 0', lineHeight: 1.2 }}>{report.label || 'TII Report'}</h1>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>
                Generated on {dateStamp(report.created_at)}
              </div>
            </div>
            <div className="tii-print-hide" style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => window.print()} style={{ padding: '9px 16px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Print / Save PDF
              </button>
            </div>
          </div>
          {report.expected_pool_filter && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 12px', border: '1px solid rgba(255,255,255,0.2)' }}>
              Roster: {{confirmed_only:'Confirmed Only', confirmed_registered:'Confirmed + Registered', registered_only:'All Registered'}[report.expected_pool_filter] || report.expected_pool_filter}
            </div>
          )}
        </div>
      </header>

      <main style={{ padding: '40px 28px', maxWidth: 900, margin: '0 auto' }}>
        {/* KPI tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 32 }}>
          <KpiTile label="Expected" value={report.expected_count ?? 0} bg="#F4F1EA" bd="#EDE8DC" circle="rgba(76,42,146,.12)" labelColor="#9E9488" valueColor="#2D2A22" />
          <KpiTile label="Present" value={report.attended_count ?? 0} bg="#EEF6F1" bd="#C3E0CC" circle="rgba(45,134,83,.15)" labelColor="#2D8653" valueColor="#1B5E3C" />
          <KpiTile label="Absent" value={report.absent_count ?? 0} bg="#FEF0ED" bd="#F5C4B8" circle="rgba(201,72,48,.15)" labelColor="#C94830" valueColor="#7A1C24" />
          <KpiTile label="Walk-ins" value={report.unexpected_count ?? 0} bg="#FBF0DE" bd="#F0D09A" circle="rgba(184,113,10,.15)" labelColor="#B8710A" valueColor="#7A5A00" />
          <KpiTile label="Reach" value={`${reachPct}%`} bg={band.bg} bd={band.border} circle={`${band.fg}22`} labelColor={band.fg} valueColor={band.fg} />
        </div>

        {/* Subgroup overview table */}
        {subgroupKeys.length > 1 && (
          <div style={{ background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ background: '#3D1A78', color: '#fff', padding: '12px 18px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em' }}>Subgroup Overview</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Subgroup', 'Expected', 'Present', 'Absent', 'Reach'].map((h, i) => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: i === 4 ? 'right' : 'left', fontSize: 11, color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: `1px solid ${PANEL_BORDER}`, background: '#FAFAF7' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subgroupKeys.map((sg, i) => {
                  const d = bySubgroup[sg];
                  const exp = d.expected?.length ?? 0, pres = d.present?.length ?? 0, abs = d.absent?.length ?? 0;
                  const p = exp > 0 ? Math.round(pres / exp * 100) : 0;
                  const sb = reachBand(p);
                  return (
                    <tr key={sg} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAF7' }}>
                      <td style={{ padding: '11px 16px', fontWeight: 700, fontSize: 13, color: TEXT, borderBottom: `0.5px solid ${PANEL_BORDER}` }}>{sg}</td>
                      <td style={{ padding: '11px 16px', fontSize: 13, color: '#4A4A4A', borderBottom: `0.5px solid ${PANEL_BORDER}` }}>{exp}</td>
                      <td style={{ padding: '11px 16px', fontSize: 13, color: '#085041', fontWeight: 600, borderBottom: `0.5px solid ${PANEL_BORDER}` }}>{pres}</td>
                      <td style={{ padding: '11px 16px', fontSize: 13, color: abs > 0 ? '#712B13' : '#4A4A4A', fontWeight: abs > 0 ? 600 : 400, borderBottom: `0.5px solid ${PANEL_BORDER}` }}>{abs}</td>
                      <td style={{ padding: '11px 16px', textAlign: 'right', borderBottom: `0.5px solid ${PANEL_BORDER}` }}>
                        <span style={{ display: 'inline-block', borderRadius: 999, padding: '3px 10px', fontSize: 11, color: sb.fg, background: sb.bg, border: `1px solid ${sb.border}`, fontWeight: 700 }}>{p}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Per-subgroup cards */}
        {subgroupKeys.map(sg => (
          <SubgroupCard key={sg} subgroup={sg} data={bySubgroup[sg]} />
        ))}

        {/* Session attendance */}
        <SessionAttendanceTable report={report} />
      </main>

      <footer style={{ padding: '28px', textAlign: 'center', background: 'rgba(0,0,0,0.02)', borderTop: `1px solid ${PANEL_BORDER}` }}>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>
          BLW CAN NEXUS · TII Attendance Report
        </div>
        {report?.id && (
          <div style={{ fontSize: 11, color: '#B4AFA3', letterSpacing: '.05em', fontFamily: 'monospace' }}>
            {report.id.slice(0, 8).toUpperCase()}
          </div>
        )}
      </footer>
    </div>
  );
}
