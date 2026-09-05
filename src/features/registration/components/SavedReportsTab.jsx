import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, Share2, Edit2, Check, X, ChevronRight, FileText } from 'lucide-react';
import { useTiiReport } from '../hooks/useTiiReport';

function getReachColor(pct) {
  if (pct >= 80) return '#2D8653';
  if (pct >= 65) return '#1B4E55';
  if (pct >= 50) return '#7A5A00';
  if (pct >= 35) return '#7A3210';
  return '#7A1C24';
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Inline label editor ────────────────────────────────────────────────────────
function LabelEditor({ value, onSave, onCancel }) {
  const [draft, setDraft] = useState(value);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(draft); if (e.key === 'Escape') onCancel(); }}
        style={{ padding: '4px 8px', border: '1.5px solid #4C2A92', borderRadius: 6, fontSize: 14, fontWeight: 700, color: '#1A1220', minWidth: 200 }}
      />
      <button onClick={() => onSave(draft)} style={{ border: 'none', background: '#4C2A92', color: '#fff', borderRadius: 5, padding: '4px 8px', cursor: 'pointer' }}><Check size={13} /></button>
      <button onClick={onCancel} style={{ border: '1px solid #E7E2EE', background: '#fff', borderRadius: 5, padding: '4px 8px', cursor: 'pointer' }}><X size={13} /></button>
    </div>
  );
}

// ── Single saved report card ──────────────────────────────────────────────────
function ReportCard({ report, onOpen, onDelete, onRename, onCopyLink }) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const pct = report.reach_pct ?? 0;

  function handleCopy() {
    if (!report.share_token) return;
    navigator.clipboard.writeText(`${window.location.origin}/tii-report/${report.share_token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ border: '1px solid #E7E2EE', borderRadius: 12, overflow: 'hidden', background: '#fff', marginBottom: 10 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid #F0EDF6', flexWrap: 'wrap' }}>
        <FileText size={16} style={{ color: '#8A7F99', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingLabel ? (
            <LabelEditor
              value={report.label}
              onSave={label => { onRename(report.id, label); setEditingLabel(false); }}
              onCancel={() => setEditingLabel(false)}
            />
          ) : (
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1220' }}>{report.label}</span>
          )}
          <div style={{ fontSize: 11, color: '#8A7F99', marginTop: 2 }}>{formatDate(report.created_at)}</div>
        </div>
        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {!editingLabel && (
            <button onClick={() => setEditingLabel(true)} title="Rename" style={{ border: '1px solid #E7E2EE', background: '#fff', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: '#8A7F99', display: 'flex', alignItems: 'center' }}>
              <Edit2 size={13} />
            </button>
          )}
          {report.share_token && (
            <button onClick={handleCopy} title="Copy share link" style={{ border: '1px solid #E7E2EE', background: copied ? '#E8F5EC' : '#fff', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: copied ? '#1F8A4C' : '#8A7F99', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <Share2 size={13} />{copied ? 'Copied!' : ''}
            </button>
          )}
          {confirmDelete ? (
            <>
              <span style={{ fontSize: 12, color: '#C94830' }}>Delete?</span>
              <button onClick={() => { onDelete(report.id); setConfirmDelete(false); }} style={{ border: 'none', background: '#C94830', color: '#fff', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Yes</button>
              <button onClick={() => setConfirmDelete(false)} style={{ border: '1px solid #E7E2EE', background: '#fff', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>No</button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} title="Delete" style={{ border: '1px solid #E7E2EE', background: '#fff', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: '#C94830', display: 'flex', alignItems: 'center' }}>
              <Trash2 size={13} />
            </button>
          )}
          <button onClick={() => onOpen(report)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#4C2A92', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            View <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 0 }}>
        {[
          { label: 'Expected', value: report.expected_count ?? 0, color: '#4A4A4A' },
          { label: 'Present', value: report.attended_count ?? 0, color: '#1F8A4C' },
          { label: 'Absent', value: report.absent_count ?? 0, color: '#C94830' },
          { label: 'Walk-ins', value: report.unexpected_count ?? 0, color: '#B8710A' },
        ].map((k, i) => (
          <div key={k.label} style={{ flex: 1, padding: '10px 0', textAlign: 'center', borderRight: i < 3 ? '1px solid #F0EDF6' : 'none', background: '#FAFAF8' }}>
            <div style={{ fontSize: 9, color: '#8A7F99', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>{k.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: k.color, marginTop: 2 }}>{k.value}</div>
          </div>
        ))}
        <div style={{ flex: 1, padding: '10px 0', textAlign: 'center', background: '#FAFAF8' }}>
          <div style={{ fontSize: 9, color: '#8A7F99', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>Reach</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: getReachColor(pct), marginTop: 2 }}>{pct.toFixed(1)}%</div>
        </div>
      </div>
    </div>
  );
}

// ── Saved report detail view (editable) ───────────────────────────────────────
function SavedReportDetail({ report: initial, onBack, onSaved }) {
  const { updateReport } = useTiiReport();
  const [report, setReport] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Extract session_labels + session_attendance from by_session (stored there by saveReport)
  const sessionLabels = report.by_session?.session_labels || [];
  const sessionAttendance = report.by_session?.session_attendance || {};
  const bySubgroup = report.by_subgroup || {};
  const subgroupKeys = Object.keys(bySubgroup).sort((a, b) => a === 'Unknown' ? 1 : b === 'Unknown' ? -1 : a.localeCompare(b));
  const pct = report.reach_pct ?? 0;

  async function handleSave() {
    setSaving(true);
    try {
      await updateReport(report.id, {
        label: report.label,
        expected_count: report.expected_count,
        attended_count: report.attended_count,
        absent_count: report.absent_count,
        unexpected_count: report.unexpected_count,
        reach_pct: report.reach_pct,
        present_names: report.present_names,
        absent_names: report.absent_names,
        by_subgroup: report.by_subgroup,
        by_session: report.by_session,
      });
      setDirty(false);
      onSaved && onSaved(report);
    } catch (e) { console.error(e); } finally { setSaving(false); }
  }

  // Move a person between present/absent within a subgroup
  function movePerson(sg, name, fromList, toList) {
    setReport(prev => {
      const newSg = JSON.parse(JSON.stringify(prev.by_subgroup));
      newSg[sg][fromList] = (newSg[sg][fromList] || []).filter(n => n !== name);
      if (!newSg[sg][toList]) newSg[sg][toList] = [];
      newSg[sg][toList].push(name);
      // Recalculate KPIs
      let expT = 0, presT = 0, absT = 0, wiT = 0;
      Object.values(newSg).forEach(d => {
        expT += d.expected?.length ?? 0; presT += d.present?.length ?? 0;
        absT += d.absent?.length ?? 0; wiT += d.walkIns?.length ?? 0;
      });
      return {
        ...prev,
        by_subgroup: newSg,
        expected_count: expT, attended_count: presT + wiT,
        absent_count: absT, unexpected_count: wiT,
        reach_pct: expT > 0 ? Math.round((presT + wiT) / expT * 1000) / 10 : 0,
      };
    });
    setDirty(true);
  }

  return (
    <div style={{ padding: '20px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <button onClick={onBack} style={{ padding: '7px 14px', background: '#fff', border: '1px solid #E7E2EE', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}>← Back</button>
        <input
          value={report.label}
          onChange={e => { setReport(p => ({ ...p, label: e.target.value })); setDirty(true); }}
          style={{ flex: 1, fontSize: 16, fontWeight: 700, color: '#1A1220', border: '1.5px solid #E7E2EE', borderRadius: 7, padding: '6px 10px' }}
        />
        {dirty && (
          <button onClick={handleSave} disabled={saving} style={{ padding: '7px 16px', background: '#4C2A92', color: '#fff', border: 'none', borderRadius: 7, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </div>

      <div style={{ fontSize: 11, color: '#8A7F99', marginBottom: 18 }}>Saved {formatDate(report.created_at)}</div>

      {/* KPI tiles */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        {[
          { label: 'Expected', value: report.expected_count ?? 0, color: '#2A5FA5' },
          { label: 'Present', value: report.attended_count ?? 0, color: '#1F8A4C' },
          { label: 'Absent', value: report.absent_count ?? 0, color: '#C4383A' },
          { label: 'Walk-ins', value: report.unexpected_count ?? 0, color: '#B8710A' },
        ].map(k => (
          <div key={k.label} style={{ flex: '1 1 100px', border: '1px solid #E7E2EE', borderRadius: 10, padding: '14px 12px', background: '#fff', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#8A7F99', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
        <div style={{ flex: '1 1 100px', border: '1px solid #E7E2EE', borderRadius: 10, padding: '14px 12px', background: '#fff', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#8A7F99', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Reach</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: getReachColor(pct) }}>{pct.toFixed(1)}%</div>
        </div>
      </div>

      {/* Subgroup breakdown — editable */}
      <div style={{ fontSize: 11, color: '#8A7F99', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
        By Subgroup <span style={{ fontWeight: 400, color: '#B0A8C4' }}>· click a name to toggle present ↔ absent</span>
      </div>

      {subgroupKeys.map(sg => {
        const d = bySubgroup[sg];
        const exp = d.expected?.length ?? 0, pres = d.present?.length ?? 0, wi = d.walkIns?.length ?? 0;
        const abs = d.absent?.length ?? 0;
        const sgPct = exp > 0 ? Math.round((pres + wi) / exp * 100) : 0;
        return (
          <div key={sg} style={{ border: '1px solid #E7E2EE', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ background: '#3D1A78', color: '#fff', padding: '11px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{sg}</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>{pres} of {exp}{wi > 0 ? ` +${wi} walk-in${wi !== 1 ? 's' : ''}` : ''}</span>
                <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 999, padding: '2px 10px', fontWeight: 800 }}>{sgPct}%</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              {/* Present */}
              <div style={{ borderRight: '1px solid #E7E2EE' }}>
                <div style={{ padding: '7px 14px', background: '#F2FAF6', borderBottom: '1px solid #E7E2EE', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#085041' }}>
                  Present <span style={{ background: '#085041', color: '#fff', borderRadius: 999, padding: '1px 6px', fontSize: 9, marginLeft: 4 }}>{pres + wi}</span>
                </div>
                {(d.present ?? []).map((n, i) => (
                  <div key={i} onClick={() => movePerson(sg, n, 'present', 'absent')}
                    style={{ padding: '7px 14px', fontSize: 12.5, color: '#1A1220', borderBottom: '1px solid #F7F5FB', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}
                    title="Click to mark absent">
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: '#2D8653', flexShrink: 0 }} />{n}
                  </div>
                ))}
                {(d.walkIns ?? []).map((n, i) => (
                  <div key={`wi-${i}`} style={{ padding: '7px 14px', fontSize: 12.5, color: '#B8710A', borderBottom: '1px solid #F7F5FB', display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: '#B8710A', flexShrink: 0 }} />{n}
                    <span style={{ fontSize: 10, opacity: 0.7 }}>(walk-in)</span>
                  </div>
                ))}
                {!d.present?.length && !d.walkIns?.length && <div style={{ padding: '12px 14px', fontSize: 12, color: '#8A7F99', fontStyle: 'italic' }}>—</div>}
              </div>
              {/* Absent */}
              <div>
                <div style={{ padding: '7px 14px', background: '#FEF5F2', borderBottom: '1px solid #E7E2EE', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#712B13' }}>
                  Absent <span style={{ background: '#712B13', color: '#fff', borderRadius: 999, padding: '1px 6px', fontSize: 9, marginLeft: 4 }}>{abs}</span>
                </div>
                {(d.absent ?? []).map((n, i) => (
                  <div key={i} onClick={() => movePerson(sg, n, 'absent', 'present')}
                    style={{ padding: '7px 14px', fontSize: 12.5, color: '#1A1220', borderBottom: '1px solid #F7F5FB', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}
                    title="Click to mark present">
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: '#C94830', flexShrink: 0 }} />{n}
                  </div>
                ))}
                {!d.absent?.length && <div style={{ padding: '12px 14px', fontSize: 12, color: '#8A7F99', fontStyle: 'italic' }}>No absences</div>}
              </div>
            </div>
          </div>
        );
      })}

      {/* Session grid (read-only) */}
      {sessionLabels.length > 0 && Object.keys(sessionAttendance).length > 0 && (
        <>
          <div style={{ fontSize: 11, color: '#8A7F99', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', margin: '20px 0 10px' }}>Session Attendance</div>
          <div style={{ overflowX: 'auto', border: '1px solid #E7E2EE', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F7F5FB' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#1A1220', borderBottom: '2px solid #E7E2EE' }}>Name</th>
                  {sessionLabels.map(lbl => (
                    <th key={lbl} style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 600, color: '#8A7F99', fontSize: 10, borderBottom: '2px solid #E7E2EE', whiteSpace: 'nowrap' }}>{lbl}</th>
                  ))}
                  <th style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 700, color: '#4C2A92', fontSize: 12, borderBottom: '2px solid #E7E2EE' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(sessionAttendance).map(([name, data], i) => (
                  <tr key={name} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAF8' }}>
                    <td style={{ padding: '8px 14px', fontWeight: 600, color: '#1A1220', borderBottom: '1px solid #F0EDF6' }}>{name}</td>
                    {sessionLabels.map(lbl => (
                      <td key={lbl} style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #F0EDF6' }}>
                        {data.sessions?.[lbl]
                          ? <span style={{ color: '#2D8653', fontWeight: 700 }}>✓</span>
                          : <span style={{ color: '#E0D8EE' }}>—</span>}
                      </td>
                    ))}
                    <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800, borderBottom: '1px solid #F0EDF6', color: data.count === sessionLabels.length ? '#2D8653' : '#4C2A92' }}>
                      {data.count}/{sessionLabels.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main exported component ───────────────────────────────────────────────────
export default function SavedReportsTab({ eventId }) {
  const { fetchReports, deleteReport, updateReport } = useTiiReport();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openReport, setOpenReport] = useState(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const data = await fetchReports(eventId);
    setReports(data);
    setLoading(false);
  }, [eventId, fetchReports]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id) {
    try {
      await deleteReport(id);
      setReports(p => p.filter(r => r.id !== id));
      if (openReport?.id === id) setOpenReport(null);
    } catch (e) { console.error(e); }
  }

  async function handleRename(id, label) {
    try {
      await updateReport(id, { label });
      setReports(p => p.map(r => r.id === id ? { ...r, label } : r));
      if (openReport?.id === id) setOpenReport(p => ({ ...p, label }));
    } catch (e) { console.error(e); }
  }

  if (openReport) {
    return (
      <SavedReportDetail
        report={openReport}
        onBack={() => { setOpenReport(null); load(); }}
        onSaved={updated => setOpenReport(updated)}
      />
    );
  }

  if (loading) return <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: '#8A7F99' }}>Loading saved reports…</div>;

  if (!reports.length) return (
    <div style={{ padding: '60px 0', textAlign: 'center' }}>
      <FileText size={32} style={{ color: '#C8C2D8', marginBottom: 12 }} />
      <div style={{ fontSize: 15, fontWeight: 600, color: '#8A7F99', marginBottom: 6 }}>No saved reports yet</div>
      <div style={{ fontSize: 13, color: '#B0A8C4' }}>Generate a report and click Save & Share to save it here.</div>
    </div>
  );

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#8A7F99' }}>{reports.length} saved report{reports.length !== 1 ? 's' : ''}</div>
        <button onClick={load} style={{ border: '1px solid #E7E2EE', background: '#fff', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: '#8A7F99' }}>Refresh</button>
      </div>
      {reports.map(r => (
        <ReportCard
          key={r.id}
          report={r}
          onOpen={setOpenReport}
          onDelete={handleDelete}
          onRename={handleRename}
        />
      ))}
    </div>
  );
}
