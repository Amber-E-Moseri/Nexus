import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Users, Database, X, Download, Share2, AlertCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useTiiReport } from '../hooks/useTiiReport';

function getReachColor(pct) {
  if (pct >= 80) return '#2D8653';
  if (pct >= 65) return '#1B4E55';
  if (pct >= 50) return '#7A5A00';
  if (pct >= 35) return '#7A3210';
  return '#7A1C24';
}

function formatServiceDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isTiiService(s) {
  const name = (s.service_name || s.name || '').toLowerCase();
  return name.includes('tii') || name.includes('this is it');
}

// Normalize a name or email key for matching
function nameKey(str) {
  return (str || '').toLowerCase().trim();
}

// Levenshtein edit distance
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Fuzzy name similarity score 0–1 (word-overlap + edit distance)
function fuzzyScore(a, b) {
  const clean = s => (s || '').toLowerCase().replace(/[^a-z\s]/g, '').trim();
  const na = clean(a), nb = clean(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1.0;
  // Full-string containment
  if (na.includes(nb) || nb.includes(na)) return 0.88;
  const wa = na.split(/\s+/), wb = nb.split(/\s+/);
  // Word-level overlap with prefix matching (Jon ↔ Jonathan)
  let shared = 0;
  wa.forEach(w => {
    if (wb.some(v => {
      if (v === w) return true;
      if (w.length > 2 && (v.startsWith(w) || w.startsWith(v))) return true;
      // Edit distance ≤ 1 on the shorter word (typo tolerance)
      if (Math.abs(v.length - w.length) <= 2 && levenshtein(w, v) <= 1) return true;
      return false;
    })) shared++;
  });
  const wordScore = shared / Math.max(wa.length, wb.length);
  // Full-string edit distance fallback for very short names
  const maxLen = Math.max(na.length, nb.length);
  const editScore = maxLen > 0 ? 1 - levenshtein(na, nb) / maxLen : 0;
  // Weighted: word overlap is more reliable
  return Math.max(wordScore * 0.8 + editScore * 0.2, wordScore);
}

function exportReportToCSV(report, label) {
  if (!report) return;
  const sessionLabels = report.session_labels || [];
  const rows = [
    [label],
    ['Expected', report.expected_count, 'Present', report.attended_count, 'Absent', report.absent_count, 'Walk-ins', report.unexpected_count, 'Reach %', `${report.reach_pct ?? 0}%`],
    [],
    ['SUBGROUP BREAKDOWN'],
    ['Subgroup', 'Expected', 'Present', 'Absent', 'Reach %'],
    ...Object.entries(report.by_subgroup || {}).map(([sg, d]) => {
      const exp = d.expected?.length ?? 0, pres = d.present?.length ?? 0;
      return [sg, exp, pres, d.absent?.length ?? 0, exp > 0 ? `${Math.round(pres / exp * 100)}%` : '—'];
    }),
    [],
    ['SESSION ATTENDANCE'],
    ['Name', 'Subgroup', 'Sessions Attended', ...sessionLabels],
    ...Object.entries(report.session_attendance || {}).map(([name, data]) => [
      name, data.subgroup || '', data.count,
      ...sessionLabels.map(lbl => data.sessions?.[lbl] ? '✓' : '—'),
    ]),
  ];
  const csv = rows.map(r => r.map(c => `"${c ?? ''}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(label || 'TII_Report').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── KPI TILE ─────────────────────────────────────────────────────────────────
function KpiTile({ label, value, color }) {
  return (
    <div style={{ flex: '1 1 120px', border: '1px solid #E7E2EE', borderRadius: 10, padding: '16px 14px', background: '#fff', textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#8A7F99', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || '#1A1220' }}>{value}</div>
    </div>
  );
}

// ─── SESSION ATTENDANCE GRID ───────────────────────────────────────────────────
function SessionAttendanceGrid({ report }) {
  const sessionLabels = report?.session_labels || [];
  const sessionAttendance = report?.session_attendance || {};
  const entries = Object.entries(sessionAttendance).sort((a, b) => (b[1]?.count ?? 0) - (a[1]?.count ?? 0));
  if (!entries.length || !sessionLabels.length) return (
    <div style={{ color: '#8A7F99', fontSize: 13, textAlign: 'center', padding: '28px 0' }}>No multi-session data available.</div>
  );
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 500 }}>
        <thead>
          <tr style={{ background: '#F7F5FB' }}>
            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#1A1220', borderBottom: '2px solid #E7E2EE', whiteSpace: 'nowrap' }}>Name</th>
            <th style={{ padding: '10px 10px', textAlign: 'left', fontWeight: 600, color: '#8A7F99', fontSize: 11, borderBottom: '2px solid #E7E2EE', whiteSpace: 'nowrap' }}>Subgroup</th>
            {sessionLabels.map(lbl => (
              <th key={lbl} style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 600, color: '#8A7F99', fontSize: 10, borderBottom: '2px solid #E7E2EE', maxWidth: 80, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {lbl}
              </th>
            ))}
            <th style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 700, color: '#4C2A92', fontSize: 12, borderBottom: '2px solid #E7E2EE' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, data], i) => (
            <tr key={name} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAF8' }}>
              <td style={{ padding: '9px 14px', fontWeight: 600, color: '#1A1220', borderBottom: '1px solid #F0EDF6', whiteSpace: 'nowrap' }}>{name}</td>
              <td style={{ padding: '9px 10px', fontSize: 11.5, color: '#8A7F99', borderBottom: '1px solid #F0EDF6', whiteSpace: 'nowrap' }}>{data.subgroup || '—'}</td>
              {sessionLabels.map(lbl => (
                <td key={lbl} style={{ padding: '9px 10px', textAlign: 'center', borderBottom: '1px solid #F0EDF6' }}>
                  {data.sessions?.[lbl]
                    ? <span style={{ color: '#2D8653', fontWeight: 700, fontSize: 15 }}>✓</span>
                    : <span style={{ color: '#E0D8EE', fontSize: 15 }}>—</span>}
                </td>
              ))}
              <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 800, borderBottom: '1px solid #F0EDF6', color: data.count === sessionLabels.length ? '#2D8653' : '#4C2A92' }}>
                {data.count}/{sessionLabels.length}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── SUBGROUP SECTION (summary view) ──────────────────────────────────────────
function SubgroupSection({ subgroup, data }) {
  const exp = data.expected?.length ?? 0;
  const pres = data.present?.length ?? 0;
  const abs = data.absent?.length ?? 0;
  const walkIns = data.walkIns?.length ?? 0;
  const pct = exp > 0 ? Math.round(pres / exp * 100) : 0;

  return (
    <div style={{ border: '1px solid #E7E2EE', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ background: '#3D1A78', color: '#fff', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{subgroup}</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12 }}>
          <span style={{ color: 'rgba(255,255,255,0.7)' }}>{pres} of {exp}</span>
          {walkIns > 0 && <span style={{ color: 'rgba(255,196,60,0.9)', fontSize: 11 }}>+{walkIns} walk-in{walkIns !== 1 ? 's' : ''}</span>}
          <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 999, padding: '3px 10px', fontWeight: 800 }}>{pct}%</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {/* Present */}
        <div style={{ borderRight: '1px solid #E7E2EE' }}>
          <div style={{ padding: '8px 14px', background: '#F2FAF6', borderBottom: '1px solid #E7E2EE', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#085041', display: 'flex', justifyContent: 'space-between' }}>
            <span>Present</span><span style={{ background: '#085041', color: '#fff', borderRadius: 999, padding: '1px 6px', fontSize: 9 }}>{pres + walkIns}</span>
          </div>
          {(data.present ?? []).map((n, i) => (
            <div key={i} style={{ padding: '7px 14px', fontSize: 12.5, color: '#1A1220', borderBottom: '1px solid #F7F5FB', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: '#2D8653', flexShrink: 0 }} />
              {typeof n === 'string' ? n : n.name}
            </div>
          ))}
          {(data.walkIns ?? []).map((n, i) => (
            <div key={`wi-${i}`} style={{ padding: '7px 14px', fontSize: 12.5, color: '#B8710A', borderBottom: '1px solid #F7F5FB', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: '#B8710A', flexShrink: 0 }} />
              {n} <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.7 }}>(walk-in)</span>
            </div>
          ))}
          {!data.present?.length && !data.walkIns?.length && <div style={{ padding: '12px 14px', fontSize: 12, color: '#8A7F99', fontStyle: 'italic' }}>—</div>}
        </div>
        {/* Absent */}
        <div>
          <div style={{ padding: '8px 14px', background: '#FEF5F2', borderBottom: '1px solid #E7E2EE', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#712B13', display: 'flex', justifyContent: 'space-between' }}>
            <span>Absent</span><span style={{ background: '#712B13', color: '#fff', borderRadius: 999, padding: '1px 6px', fontSize: 9 }}>{abs}</span>
          </div>
          {(data.absent ?? []).map((n, i) => (
            <div key={i} style={{ padding: '7px 14px', fontSize: 12.5, color: '#1A1220', borderBottom: '1px solid #F7F5FB', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: '#C94830', flexShrink: 0 }} />
              {typeof n === 'string' ? n : n.name}
            </div>
          ))}
          {!data.absent?.length && <div style={{ padding: '12px 14px', fontSize: 12, color: '#8A7F99', fontStyle: 'italic' }}>No absences</div>}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function TiiReportTab({ registrations = [], eventId, eventConfig = {} }) {
  const { saveReport, fetchTiiSessions, fetchEventAttendance } = useTiiReport();

  // ── state ──────────────────────────────────────────────────────────────────
  const [view, setView] = useState('generate');
  const [summaryTab, setSummaryTab] = useState('subgroups');
  const [inputMode, setInputMode] = useState('cmp');
  const [expectedPool, setExpectedPool] = useState('confirmed_registered');
  const [subgroupFilter, setSubgroupFilter] = useState([]);
  const [reportLabel, setReportLabel] = useState(`TII ${new Date().getFullYear()}`);

  // CMP state
  const [cmpServices, setCmpServices] = useState([]);
  const [cmpLoading, setCmpLoading] = useState(false);
  const [cmpError, setCmpError] = useState(null);
  const [selectedServiceKeys, setSelectedServiceKeys] = useState(new Set()); // set of service key strings
  const [loadedSessions, setLoadedSessions] = useState([]); // [{ label, names[], key }]
  const [loadingKeys, setLoadingKeys] = useState(new Set()); // keys currently fetching

  const [report, setReport] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [shareToken, setShareToken] = useState(null);
  const [copied, setCopied] = useState(false);

  // Walk-in mapper
  // walkInMappings[name] = { type: 'subgroup', value: 'SubgroupName' }
  //                      | { type: 'registration', value: registrationObject }
  const [walkInMappings, setWalkInMappings] = useState({});
  const [showMapper, setShowMapper] = useState(false);
  const [mapperSearch, setMapperSearch] = useState({}); // { [name]: searchStr } for reg filter

  // ── derived ──────────────────────────────────────────────────────────────
  const uniqueSubgroups = useMemo(() => {
    return [...new Set(registrations.map(r => r.subgroup).filter(Boolean))].sort();
  }, [registrations]);

  // Build full registrations lookup by name and email (for subgroup resolution)
  const regLookup = useMemo(() => {
    const map = {};
    registrations.forEach(r => {
      const nk = nameKey(r.fullName || r.full_name);
      const ek = nameKey(r.email);
      if (nk) map[nk] = r;
      if (ek) map[ek] = r;
    });
    return map;
  }, [registrations]);

  // Best fuzzy-match registration per Unknown walk-in (score ≥ 0.6 = candidate)
  const walkInSuggestions = useMemo(() => {
    const unknownWalkIns = report?.by_subgroup?.['Unknown']?.walkIns ?? [];
    const result = {};
    unknownWalkIns.forEach(cmpName => {
      let best = null, bestScore = 0;
      registrations.forEach(reg => {
        const regName = reg.fullName || reg.full_name || '';
        const score = fuzzyScore(cmpName, regName);
        if (score > bestScore) { bestScore = score; best = reg; }
      });
      if (bestScore >= 0.6 && best) result[cmpName] = { registration: best, score: bestScore };
    });
    return result;
  }, [report?.by_subgroup, registrations]);

  const totalUniqueAttendees = useMemo(() => {
    const seen = new Set();
    loadedSessions.forEach(s => s.names.forEach(n => seen.add(nameKey(n))));
    return seen.size;
  }, [loadedSessions]);

  function serviceKey(s) {
    return `${s.date}\x00${s.service_name || s.name}\x00${s.host_unit || s.unit || ''}`;
  }

  // ── auto-fetch CMP services ─────────────────────────────────────────────
  useEffect(() => {
    if (inputMode === 'cmp' && !cmpServices.length && !cmpLoading && !cmpError) {
      fetchCmpServices();
    }
  }, [inputMode]);

  async function fetchCmpServices() {
    setCmpLoading(true);
    setCmpError(null);
    const { data, error } = await supabase.functions.invoke('service-attendees', { body: { action: 'list' } });
    if (error || data?.error) {
      setCmpError('Unable to load services from CMP.');
    } else {
      setCmpServices(data?.services ?? []);
    }
    setCmpLoading(false);
  }

  async function fetchServiceAttendees(service) {
    const { data, error } = await supabase.functions.invoke('service-attendees', {
      body: { action: 'attendees', date: service.date, service_name: service.service_name || service.name, host_unit: service.host_unit || service.unit },
    });
    if (error || data?.error) throw new Error('Failed to load attendees');
    return data?.names ?? data?.attendees ?? [];
  }

  async function toggleServiceSelection(service) {
    const key = serviceKey(service);
    if (selectedServiceKeys.has(key)) {
      // Deselect
      setSelectedServiceKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
      setLoadedSessions(prev => prev.filter(s => s.key !== key));
      return;
    }
    // Select and load
    setSelectedServiceKeys(prev => new Set([...prev, key]));
    setLoadingKeys(prev => new Set([...prev, key]));
    try {
      const names = await fetchServiceAttendees(service);
      const label = `${service.service_name || service.name} (${formatServiceDate(service.date)})`;
      setLoadedSessions(prev => [...prev.filter(s => s.key !== key), { key, label, names, service }]);
    } catch {
      // deselect on error
      setSelectedServiceKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
    setLoadingKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
  }

  function clearAllSelections() {
    setSelectedServiceKeys(new Set());
    setLoadedSessions([]);
  }

  // ── generate report ────────────────────────────────────────────────────────
  async function handleGenerate() {
    setIsGenerating(true);
    try {
      // Expected pool (camelCase fields from RegistrationEcosystem)
      let expectedPool_ = registrations.filter(r => r.manuallyConfirmed);
      if (expectedPool === 'confirmed_registered') {
        expectedPool_ = registrations.filter(r => r.submittedAt || r.manuallyConfirmed);
      } else if (expectedPool === 'registered_only') {
        expectedPool_ = registrations.filter(r => r.submittedAt);
      }
      if (subgroupFilter.length) {
        expectedPool_ = expectedPool_.filter(r => subgroupFilter.includes(r.subgroup));
      }

      // Build roster lookup: nameKey → registration
      const rosterByKey = {};
      expectedPool_.forEach(r => {
        const nk = nameKey(r.fullName || r.full_name);
        const ek = nameKey(r.email);
        if (nk) rosterByKey[nk] = r;
        if (ek) rosterByKey[ek] = r;
      });
      const rosterKeys = new Set(Object.keys(rosterByKey));

      // Session labels in the order they were loaded
      const sessionLabels = loadedSessions.map(s => s.label);

      // Per-person session tracking from CMP data
      const personSessions = {}; // normalizedKey → { displayName, sessions: {label: bool}, count }
      loadedSessions.forEach(({ label, names }) => {
        names.forEach(raw => {
          const k = nameKey(raw);
          if (!personSessions[k]) personSessions[k] = { displayName: raw, sessions: {}, count: 0 };
          personSessions[k].sessions[label] = true;
          personSessions[k].count += 1;
        });
      });
      const attendedKeys = new Set(Object.keys(personSessions));

      // Classify expected pool
      const presentNames = [], absentNames = [];
      expectedPool_.forEach(r => {
        const nk = nameKey(r.fullName || r.full_name);
        const ek = nameKey(r.email);
        const attended = attendedKeys.has(nk) || (ek && attendedKeys.has(ek));
        if (attended) presentNames.push(r.fullName || r.full_name);
        else absentNames.push(r.fullName || r.full_name);
      });

      // Walk-ins: attended but NOT in expected pool
      const unexpectedNames = [];
      attendedKeys.forEach(k => {
        if (!rosterKeys.has(k)) unexpectedNames.push(personSessions[k].displayName);
      });

      const expected_count = expectedPool_.length;
      const attended_count = presentNames.length + unexpectedNames.length;
      const absent_count = absentNames.length;
      const unexpected_count = unexpectedNames.length;
      const reach_pct = expected_count > 0 ? Math.round(presentNames.length / expected_count * 1000) / 10 : 0;

      // ── by_subgroup ──────────────────────────────────────────────────────────
      // For expected pool: group by their registered subgroup
      const subgroups = {};
      expectedPool_.forEach(r => {
        const sg = r.subgroup || 'Unknown';
        if (!subgroups[sg]) subgroups[sg] = { expected: [], present: [], absent: [], walkIns: [] };
        subgroups[sg].expected.push(r.fullName || r.full_name);
        const nk = nameKey(r.fullName || r.full_name);
        const ek = nameKey(r.email);
        if (attendedKeys.has(nk) || (ek && attendedKeys.has(ek))) {
          subgroups[sg].present.push(r.fullName || r.full_name);
        } else {
          subgroups[sg].absent.push(r.fullName || r.full_name);
        }
      });

      // Walk-ins: try to match to any registration (even if not in expected pool) for subgroup
      unexpectedNames.forEach(name => {
        const k = nameKey(name);
        const reg = regLookup[k];
        const sg = reg?.subgroup || 'Unknown';
        if (!subgroups[sg]) subgroups[sg] = { expected: [], present: [], absent: [], walkIns: [] };
        subgroups[sg].walkIns.push(name);
      });

      // ── session_attendance ────────────────────────────────────────────────────
      const session_attendance = {};
      // Confirmed people
      expectedPool_.forEach(r => {
        const displayName = r.fullName || r.full_name;
        const nk = nameKey(displayName);
        const ek = nameKey(r.email);
        const ps = personSessions[nk] || (ek && personSessions[ek]);
        session_attendance[displayName] = {
          count: ps?.count ?? 0,
          sessions: ps?.sessions ?? {},
          subgroup: r.subgroup || '',
        };
      });
      // Walk-ins
      unexpectedNames.forEach(name => {
        const k = nameKey(name);
        const ps = personSessions[k];
        const reg = regLookup[k];
        session_attendance[`${name} ★`] = {
          count: ps?.count ?? 0,
          sessions: ps?.sessions ?? {},
          subgroup: reg?.subgroup || 'Unknown',
        };
      });

      setReport({
        label: reportLabel,
        expected_count, attended_count, absent_count, unexpected_count, reach_pct,
        present_names: presentNames,
        absent_names: absentNames,
        unexpected_names: unexpectedNames,
        by_subgroup: subgroups,
        session_labels: sessionLabels,
        session_attendance,
      });
      setView('summary');
    } catch (e) {
      console.error('Report generation error:', e);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave() {
    if (!report) return;
    setIsSaving(true);
    try {
      const saved = await saveReport(eventId, reportLabel, report, expectedPool, subgroupFilter);
      setShareToken(saved?.share_token ?? null);
    } catch (e) { console.error(e); } finally { setIsSaving(false); }
  }

  function handleCopy() {
    if (!shareToken) return;
    navigator.clipboard.writeText(`${window.location.origin}/tii-report/${shareToken}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Move walk-ins from Unknown: either match to a registration or assign to a subgroup
  function applyWalkInMappings() {
    if (!report) return;
    const newBySubgroup = JSON.parse(JSON.stringify(report.by_subgroup));
    const newSessionAttendance = { ...report.session_attendance };
    const stillUnknown = [];

    (newBySubgroup['Unknown']?.walkIns ?? []).forEach(cmpName => {
      const mapping = walkInMappings[cmpName];
      if (!mapping) { stillUnknown.push(cmpName); return; }

      const sessionKey = `${cmpName} ★`;
      const sessionData = newSessionAttendance[sessionKey];

      if (mapping.type === 'registration') {
        // ── Match to a real registration ──────────────────────────────────────
        const reg = mapping.value;
        const regName = reg.fullName || reg.full_name || cmpName;
        const sg = reg.subgroup || 'Unknown';

        if (!newBySubgroup[sg]) newBySubgroup[sg] = { expected: [], present: [], absent: [], walkIns: [] };

        // Was this person expected but counted absent? Move them to present.
        const absentList = newBySubgroup[sg].absent ?? [];
        const absentIdx = absentList.indexOf(regName);
        if (absentIdx > -1) {
          newBySubgroup[sg].absent.splice(absentIdx, 1);
          if (!newBySubgroup[sg].present) newBySubgroup[sg].present = [];
          newBySubgroup[sg].present.push(regName);
          // Fix session_attendance: replace stub walk-in entry with proper name entry
          if (sessionData) {
            delete newSessionAttendance[sessionKey];
            // Merge into existing entry (if it had count 0 because name mismatch) or create
            newSessionAttendance[regName] = {
              count: sessionData.count,
              sessions: sessionData.sessions,
              subgroup: sg,
            };
          }
        } else {
          // Not in expected pool — still a walk-in but now correctly placed
          if (!newBySubgroup[sg].walkIns) newBySubgroup[sg].walkIns = [];
          newBySubgroup[sg].walkIns.push(cmpName);
          if (sessionData) {
            delete newSessionAttendance[sessionKey];
            newSessionAttendance[`${cmpName} ★`] = { ...sessionData, subgroup: sg };
          }
        }

      } else if (mapping.type === 'subgroup') {
        // ── Assign to a subgroup (stays as walk-in) ──────────────────────────
        const targetSg = mapping.value;
        if (!newBySubgroup[targetSg]) newBySubgroup[targetSg] = { expected: [], present: [], absent: [], walkIns: [] };
        if (!newBySubgroup[targetSg].walkIns) newBySubgroup[targetSg].walkIns = [];
        newBySubgroup[targetSg].walkIns.push(cmpName);
        if (sessionData) newSessionAttendance[sessionKey] = { ...sessionData, subgroup: targetSg };

      } else {
        stillUnknown.push(cmpName);
      }
    });

    // Clean up Unknown
    if (newBySubgroup['Unknown']) {
      newBySubgroup['Unknown'].walkIns = stillUnknown;
      const u = newBySubgroup['Unknown'];
      if (!u.expected?.length && !u.present?.length && !u.absent?.length && !stillUnknown.length) {
        delete newBySubgroup['Unknown'];
      }
    }

    // Recompute top-level KPI stats from the updated subgroup data
    let expTotal = 0, presTotal = 0, absTotal = 0, wiTotal = 0;
    Object.values(newBySubgroup).forEach(d => {
      expTotal += d.expected?.length ?? 0;
      presTotal += d.present?.length ?? 0;
      absTotal += d.absent?.length ?? 0;
      wiTotal += d.walkIns?.length ?? 0;
    });
    const reach_pct = expTotal > 0 ? Math.round(presTotal / expTotal * 1000) / 10 : 0;

    setReport(prev => ({
      ...prev,
      by_subgroup: newBySubgroup,
      session_attendance: newSessionAttendance,
      expected_count: expTotal,
      attended_count: presTotal + wiTotal,
      absent_count: absTotal,
      unexpected_count: wiTotal,
      reach_pct,
    }));
    setWalkInMappings({});
    setMapperSearch({});
    setShowMapper(false);
  }

  // ── PDF PRINT ─────────────────────────────────────────────────────────────────
  function printReport() {
    if (!report) return;
    const pct = report.reach_pct ?? 0;
    function band(p) {
      if (p >= 80) return { bg: '#D9F2E3', fg: '#1B5E3C', border: '#A8DBC0' };
      if (p >= 65) return { bg: '#D4EEF0', fg: '#1B4E55', border: '#98CDD2' };
      if (p >= 50) return { bg: '#FFF4CC', fg: '#7A5A00', border: '#EDD88A' };
      if (p >= 35) return { bg: '#FEE8D6', fg: '#7A3210', border: '#F5C4A0' };
      return { bg: '#F8D7DA', fg: '#7A1C24', border: '#F0B0B6' };
    }
    const rb = band(pct);
    const bySubgroup = report.by_subgroup || {};
    const sgKeys = Object.keys(bySubgroup).sort((a, b) => a === 'Unknown' ? 1 : b === 'Unknown' ? -1 : a.localeCompare(b));
    const sessionLabels = report.session_labels || [];
    const sessionEntries = Object.entries(report.session_attendance || {}).sort((a, b) => (b[1]?.count ?? 0) - (a[1]?.count ?? 0));

    const kpiHtml = (label, value, bg, bd, labelColor, valueColor) =>
      `<div style="border-radius:10px;padding:18px 14px;background:${bg};border:1px solid ${bd};flex:1 1 110px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${labelColor};margin-bottom:6px;">${label}</div>
        <div style="font-size:30px;font-weight:800;color:${valueColor};line-height:1;">${value}</div>
      </div>`;

    const nameRowHtml = (n, dotColor) =>
      `<div style="padding:7px 14px;display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:#2C2C2A;border-bottom:0.5px solid #F0ECE4;">
        <span style="width:5px;height:5px;border-radius:50%;background:${dotColor};flex-shrink:0;display:inline-block;"></span>
        ${typeof n === 'string' ? n : n.name}
      </div>`;

    const sgCardsHtml = sgKeys.map(sg => {
      const d = bySubgroup[sg];
      const exp = d.expected?.length ?? 0, pres = d.present?.length ?? 0, abs = d.absent?.length ?? 0, wi = d.walkIns?.length ?? 0;
      const p = exp > 0 ? Math.round(pres / exp * 100) : 0;
      const presentHtml = [...(d.present ?? []).map(n => nameRowHtml(n, '#2D8653')), ...(d.walkIns ?? []).map(n => nameRowHtml(n + ' ★', '#B8710A'))].join('') || `<div style="padding:14px;font-size:12px;color:#7B776F;font-style:italic;">—</div>`;
      const absentHtml = (d.absent ?? []).map(n => nameRowHtml(n, '#C94830')).join('') || `<div style="padding:14px;font-size:12px;color:#7B776F;font-style:italic;">No absences</div>`;
      return `<div style="background:#fff;border:1px solid #DDD7C8;border-radius:12px;overflow:hidden;margin-bottom:16px;">
        <div style="background:#3D1A78;color:#fff;padding:13px 18px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:14px;font-weight:800;">${sg}</span>
          <div style="display:flex;gap:10px;align-items:center;">
            <span style="font-size:11px;color:rgba(255,255,255,0.65);">${pres} of ${exp}${wi > 0 ? ` +${wi} walk-in${wi !== 1 ? 's' : ''}` : ''}</span>
            <span style="background:rgba(255,255,255,0.18);border-radius:999px;padding:3px 11px;font-size:12px;font-weight:800;">${p}%</span>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid #DDD7C8;">
          ${['Expected:' + exp + ':#3D1A78', 'Present:' + (pres + wi) + ':#085041', 'Absent:' + abs + ':#712B13'].map(s => {
            const [lbl, val, col] = s.split(':');
            return `<div style="padding:10px 14px;text-align:center;background:#FAFAF7;border-right:0.5px solid #DDD7C8;"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#7B776F;">${lbl}</div><div style="font-size:20px;font-weight:800;color:${col};margin-top:3px;">${val}</div></div>`;
          }).join('')}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;">
          <div style="border-right:0.5px solid #DDD7C8;">
            <div style="padding:9px 14px;background:#F2FAF6;border-bottom:1px solid #DDD7C8;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#085041;display:flex;justify-content:space-between;align-items:center;">
              <span>Present</span><span style="background:#085041;color:#fff;border-radius:999px;padding:1px 7px;font-size:9px;">${pres + wi}</span>
            </div>${presentHtml}
          </div>
          <div>
            <div style="padding:9px 14px;background:#FEF5F2;border-bottom:1px solid #DDD7C8;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#712B13;display:flex;justify-content:space-between;align-items:center;">
              <span>Absent</span><span style="background:#712B13;color:#fff;border-radius:999px;padding:1px 7px;font-size:9px;">${abs}</span>
            </div>${absentHtml}
          </div>
        </div>
      </div>`;
    }).join('');

    const sessionTableHtml = sessionLabels.length && sessionEntries.length ? `
      <div style="background:#fff;border:1px solid #DDD7C8;border-radius:12px;overflow:hidden;margin-bottom:16px;">
        <div style="background:#3D1A78;color:#fff;padding:12px 18px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;">Session Attendance</div>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr style="background:#FAFAF7;">
              <th style="padding:9px 14px;text-align:left;font-weight:700;color:#2C2C2A;border-bottom:1px solid #DDD7C8;">Name</th>
              ${sessionLabels.map(lbl => `<th style="padding:9px 8px;text-align:center;font-size:10px;color:#7B776F;font-weight:700;border-bottom:1px solid #DDD7C8;white-space:nowrap;">${lbl}</th>`).join('')}
              <th style="padding:9px 8px;text-align:center;font-weight:700;color:#3D1A78;border-bottom:1px solid #DDD7C8;">Total</th>
            </tr></thead>
            <tbody>${sessionEntries.map(([name, data], i) =>
              `<tr style="background:${i % 2 === 0 ? '#fff' : '#FAFAF7'};">
                <td style="padding:8px 14px;font-weight:600;color:#2C2C2A;border-bottom:0.5px solid #DDD7C8;">${name}</td>
                ${sessionLabels.map(lbl => `<td style="padding:8px 8px;text-align:center;border-bottom:0.5px solid #DDD7C8;color:${data.sessions?.[lbl] ? '#2D8653' : '#D8D0E8'};font-weight:700;">${data.sessions?.[lbl] ? '✓' : '—'}</td>`).join('')}
                <td style="padding:8px 8px;text-align:center;font-weight:800;color:${data.count === sessionLabels.length ? '#1B5E3C' : '#3D1A78'};border-bottom:0.5px solid #DDD7C8;">${data.count}/${sessionLabels.length}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : '';

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${report.label || 'TII Report'}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F4F1EA;color:#2C2C2A;}
    @media print{@page{margin:0.6in;size:A4 portrait;}body{background:#fff!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}.no-print{display:none!important;}header{background:linear-gradient(135deg,#2D1B69 0%,#4C2A92 50%,#6B3FAF 100%)!important;}tr{page-break-inside:avoid;}}
    </style></head><body>
    <header style="background:linear-gradient(135deg,#2D1B69 0%,#4C2A92 50%,#6B3FAF 100%);padding:36px 28px;">
      <div style="max-width:860px;margin:0 auto;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
        <div>
          <h1 style="font-size:26px;font-weight:800;color:#fff;line-height:1.2;">${report.label || 'TII Report'}</h1>
          <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:6px;">Generated ${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
        <button class="no-print" onclick="window.print()" style="padding:9px 16px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);border-radius:8px;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">Print / Save PDF</button>
      </div>
    </header>
    <main style="padding:32px 28px;max-width:860px;margin:0 auto;">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:28px;">
        ${kpiHtml('Expected', report.expected_count ?? 0, '#F4F1EA', '#EDE8DC', '#9E9488', '#2D2A22')}
        ${kpiHtml('Present', report.attended_count ?? 0, '#EEF6F1', '#C3E0CC', '#2D8653', '#1B5E3C')}
        ${kpiHtml('Absent', report.absent_count ?? 0, '#FEF0ED', '#F5C4B8', '#C94830', '#7A1C24')}
        ${kpiHtml('Walk-ins', report.unexpected_count ?? 0, '#FBF0DE', '#F0D09A', '#B8710A', '#7A5A00')}
        ${kpiHtml('Reach', `${Math.round(pct)}%`, rb.bg, rb.border, rb.fg, rb.fg)}
      </div>
      ${sgCardsHtml}
      ${sessionTableHtml}
    </main>
    <footer style="padding:22px 28px;text-align:center;border-top:1px solid #DDD7C8;">
      <div style="font-size:12px;color:#7B776F;">BLW CAN NEXUS · TII Attendance Report</div>
    </footer></body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups to print the report.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 700);
  }

  // ── Quick auto-match: apply all suggestions with score ≥ 0.8 in one click ─────
  function quickAutoMatch() {
    const toApply = Object.entries(walkInSuggestions).filter(([, { score }]) => score >= 0.8);
    if (!toApply.length) return;
    const newBySubgroup = JSON.parse(JSON.stringify(report.by_subgroup));
    const newSessionAttendance = { ...report.session_attendance };
    const stillUnknown = (newBySubgroup['Unknown']?.walkIns ?? []).filter(
      name => !toApply.find(([n]) => n === name)
    );

    toApply.forEach(([cmpName, { registration: reg }]) => {
      const regName = reg.fullName || reg.full_name || cmpName;
      const sg = reg.subgroup || 'Unknown';
      if (!newBySubgroup[sg]) newBySubgroup[sg] = { expected: [], present: [], absent: [], walkIns: [] };
      const absentIdx = (newBySubgroup[sg].absent ?? []).indexOf(regName);
      const sd = newSessionAttendance[`${cmpName} ★`];
      if (absentIdx > -1) {
        newBySubgroup[sg].absent.splice(absentIdx, 1);
        newBySubgroup[sg].present.push(regName);
        if (sd) { delete newSessionAttendance[`${cmpName} ★`]; newSessionAttendance[regName] = { count: sd.count, sessions: sd.sessions, subgroup: sg }; }
      } else {
        if (!newBySubgroup[sg].walkIns) newBySubgroup[sg].walkIns = [];
        newBySubgroup[sg].walkIns.push(cmpName);
        if (sd) newSessionAttendance[`${cmpName} ★`] = { ...sd, subgroup: sg };
      }
    });

    if (newBySubgroup['Unknown']) {
      newBySubgroup['Unknown'].walkIns = stillUnknown;
      const u = newBySubgroup['Unknown'];
      if (!u.expected?.length && !u.present?.length && !u.absent?.length && !stillUnknown.length) delete newBySubgroup['Unknown'];
    }

    let expTotal = 0, presTotal = 0, absTotal = 0, wiTotal = 0;
    Object.values(newBySubgroup).forEach(d => { expTotal += d.expected?.length ?? 0; presTotal += d.present?.length ?? 0; absTotal += d.absent?.length ?? 0; wiTotal += d.walkIns?.length ?? 0; });
    const reach_pct = expTotal > 0 ? Math.round(presTotal / expTotal * 1000) / 10 : 0;

    setReport(prev => ({ ...prev, by_subgroup: newBySubgroup, session_attendance: newSessionAttendance, expected_count: expTotal, attended_count: presTotal + wiTotal, absent_count: absTotal, unexpected_count: wiTotal, reach_pct }));
  }

  // ── GENERATE VIEW ─────────────────────────────────────────────────────────
  if (view === 'generate') {
    return (
      <div style={{ padding: '24px 0', maxWidth: 720 }}>
        {/* Report Label */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#1A1220' }}>Report Label</label>
          <input value={reportLabel} onChange={e => setReportLabel(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #E7E2EE', borderRadius: 7, fontSize: 14, width: '100%', boxSizing: 'border-box' }} />
        </div>

        {/* Expected Pool */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#1A1220' }}>Expected Attendees</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { value: 'confirmed_only', label: 'Confirmed Only' },
              { value: 'confirmed_registered', label: 'Confirmed + Registered' },
              { value: 'registered_only', label: 'All Registered' },
            ].map(opt => (
              <button key={opt.value} onClick={() => setExpectedPool(opt.value)} style={{
                padding: '7px 14px', borderRadius: 7,
                border: expectedPool === opt.value ? '2px solid #4C2A92' : '1px solid #E7E2EE',
                background: expectedPool === opt.value ? '#F0EBFC' : '#fff',
                color: '#1A1220', cursor: 'pointer', fontSize: 13, fontWeight: expectedPool === opt.value ? 600 : 400,
              }}>{opt.label}</button>
            ))}
          </div>
          <p style={{ fontSize: 12, color: '#8A7F99', margin: '6px 0 0' }}>Confirmed registrations serve as the roster. Subgroups are pulled from their registration data.</p>
        </div>

        {/* Subgroup Filter */}
        {uniqueSubgroups.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#1A1220' }}>
              Filter by Subgroup <span style={{ fontWeight: 400, color: '#8A7F99' }}>(optional)</span>
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setSubgroupFilter([])} style={{ padding: '6px 14px', borderRadius: 7, border: !subgroupFilter.length ? '2px solid #4C2A92' : '1px solid #E7E2EE', background: !subgroupFilter.length ? '#F0EBFC' : '#fff', color: '#1A1220', cursor: 'pointer', fontSize: 13 }}>All</button>
              {uniqueSubgroups.map(sg => (
                <button key={sg} onClick={() => setSubgroupFilter(p => p.includes(sg) ? p.filter(x => x !== sg) : [...p, sg])} style={{ padding: '6px 14px', borderRadius: 7, border: subgroupFilter.includes(sg) ? '2px solid #4C2A92' : '1px solid #E7E2EE', background: subgroupFilter.includes(sg) ? '#F0EBFC' : '#fff', color: '#1A1220', cursor: 'pointer', fontSize: 13 }}>{sg}</button>
              ))}
            </div>
          </div>
        )}

        {/* Mark Attendance */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#1A1220' }}>Mark Attendance</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { key: 'checkin', icon: <Users size={16} />, title: 'Check In', sub: 'Tap names from roster' },
              { key: 'cmp', icon: <Database size={16} />, title: 'Ministry Platform', sub: 'Pull from CMP service' },
            ].map(mode => {
              const active = inputMode === mode.key;
              return (
                <button key={mode.key} onClick={() => setInputMode(mode.key)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, border: active ? '2px solid #4C2A92' : '1.5px solid #E7E2EE', background: active ? '#F0EBFC' : '#fff', cursor: 'pointer', flex: '1 1 160px', textAlign: 'left' }}>
                  <span style={{ width: 32, height: 32, borderRadius: 999, background: active ? '#4C2A92' : '#F0EBFC', color: active ? '#fff' : '#4C2A92', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{mode.icon}</span>
                  <span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#2D2A22', display: 'block' }}>{mode.title}</span>
                    <span style={{ fontSize: 10.5, color: '#9E9488', display: 'block' }}>{mode.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* CMP service list */}
        {inputMode === 'cmp' && (
          <div style={{ border: '1.5px solid #E7E2EE', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
            {/* Loaded summary banner */}
            {loadedSessions.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#E8F5EC', borderBottom: '1px solid #C6E8D2' }}>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#1F8A4C' }}>
                  {totalUniqueAttendees} unique attendees across {loadedSessions.length} selected session{loadedSessions.length !== 1 ? 's' : ''}
                </span>
                <button onClick={clearAllSelections} style={{ border: 'none', background: 'transparent', color: '#1F8A4C', cursor: 'pointer', display: 'flex', padding: 2 }}>
                  <X size={15} />
                </button>
              </div>
            )}

            {cmpLoading ? (
              <div style={{ padding: '28px 14px', textAlign: 'center', fontSize: 12.5, color: '#9E9488' }}>Fetching services…</div>
            ) : cmpError ? (
              <div style={{ padding: '18px 14px', color: '#C94830', fontSize: 12.5 }}>
                {cmpError}{' '}
                <button onClick={fetchCmpServices} style={{ color: '#4C2A92', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0 }}>Retry</button>
              </div>
            ) : cmpServices.length === 0 ? (
              <div style={{ padding: '28px 14px', textAlign: 'center', fontSize: 12.5, color: '#9E9488' }}>No services found in the last 60 days.</div>
            ) : (
              <>
                <div style={{ padding: '8px 14px', background: '#F7F5FB', borderBottom: '1px solid #E7E2EE', fontSize: 11, color: '#8A7F99', fontWeight: 600 }}>
                  Select one or more sessions to include in the report
                </div>
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  {cmpServices.map((service, i) => {
                    const key = serviceKey(service);
                    const isSelected = selectedServiceKeys.has(key);
                    const isLoading = loadingKeys.has(key);
                    return (
                      <button key={key} onClick={() => toggleServiceSelection(service)} disabled={isLoading}
                        style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: isSelected ? '#F0EBFC' : '#fff', border: 'none', borderBottom: i < cmpServices.length - 1 ? '1px solid #F0EDF6' : 'none', cursor: isLoading ? 'wait' : 'pointer' }}>
                        {/* Checkbox */}
                        <span style={{ width: 20, height: 20, borderRadius: 5, border: isSelected ? '2px solid #4C2A92' : '2px solid #C8C2D8', background: isSelected ? '#4C2A92' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.12s' }}>
                          {isSelected && <span style={{ color: '#fff', fontSize: 13, lineHeight: 1, fontWeight: 900 }}>✓</span>}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: isSelected ? '#4C2A92' : '#1A1220', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {service.service_name || service.name}
                          </span>
                          <span style={{ fontSize: 11.5, color: '#8A7F99', display: 'block' }}>
                            {service.host_unit || service.unit} · {formatServiceDate(service.date)}
                          </span>
                        </span>
                        {isLoading ? (
                          <span style={{ fontSize: 11, color: '#4C2A92' }}>Loading…</span>
                        ) : (
                          <span style={{ minWidth: 28, height: 28, borderRadius: 999, background: isSelected ? '#4C2A92' : '#F0EBFC', color: isSelected ? '#fff' : '#4C2A92', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                            {service.count ?? service.attendee_count ?? ''}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {inputMode === 'checkin' && (
          <div style={{ padding: '20px', border: '1.5px solid #E7E2EE', borderRadius: 10, marginBottom: 20, textAlign: 'center', color: '#8A7F99', fontSize: 13 }}>
            Manual check-in coming soon. Use Ministry Platform to import from CMP.
          </div>
        )}

        <button onClick={handleGenerate} disabled={isGenerating || !loadedSessions.length} style={{ padding: '11px 28px', background: '#4C2A92', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: isGenerating || !loadedSessions.length ? 'not-allowed' : 'pointer', opacity: isGenerating || !loadedSessions.length ? 0.6 : 1 }}>
          {isGenerating ? 'Generating…' : 'Generate Report'}
        </button>
        {!loadedSessions.length && inputMode === 'cmp' && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#8A7F99' }}>Check one or more sessions above to load attendance first.</p>
        )}
      </div>
    );
  }

  // ── SUMMARY VIEW ──────────────────────────────────────────────────────────
  const pct = report?.reach_pct ?? 0;
  const subgroups = report?.by_subgroup ?? {};
  const subgroupKeys = Object.keys(subgroups).sort((a, b) => {
    if (a === 'Unknown') return 1;
    if (b === 'Unknown') return -1;
    return a.localeCompare(b);
  });

  return (
    <div style={{ padding: '24px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1A1220', flex: 1 }}>{reportLabel}</h2>
        <button onClick={() => setView('generate')} style={{ padding: '7px 14px', background: '#fff', border: '1px solid #E7E2EE', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}>Back</button>
        <button onClick={() => exportReportToCSV(report, reportLabel)} style={{ padding: '7px 14px', background: '#fff', border: '1px solid #E7E2EE', borderRadius: 7, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Download size={14} /> CSV
        </button>
        <button onClick={printReport} style={{ padding: '7px 14px', background: '#fff', border: '1px solid #E7E2EE', borderRadius: 7, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
          🖨 Print / PDF
        </button>
        {shareToken ? (
          <button onClick={handleCopy} style={{ padding: '7px 14px', background: copied ? '#E8F5EC' : '#fff', border: '1px solid #E7E2EE', borderRadius: 7, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5, color: copied ? '#1F8A4C' : '#1A1220' }}>
            <Share2 size={14} /> {copied ? 'Copied!' : 'Copy Link'}
          </button>
        ) : (
          <button onClick={handleSave} disabled={isSaving} style={{ padding: '7px 14px', background: '#4C2A92', color: '#fff', border: 'none', borderRadius: 7, cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5, opacity: isSaving ? 0.7 : 1 }}>
            <Share2 size={14} /> {isSaving ? 'Saving…' : 'Save & Share'}
          </button>
        )}
      </div>

      {/* KPI tiles */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <KpiTile label="Expected" value={report?.expected_count ?? 0} color="#2A5FA5" />
        <KpiTile label="Present" value={report?.attended_count ?? 0} color="#1F8A4C" />
        <KpiTile label="Absent" value={report?.absent_count ?? 0} color="#C4383A" />
        <KpiTile label="Walk-ins" value={report?.unexpected_count ?? 0} color="#B8710A" />
        <div style={{ flex: '1 1 120px', border: '1px solid #E7E2EE', borderRadius: 10, padding: '16px 14px', background: '#fff', textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#8A7F99', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Reach %</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: getReachColor(pct) }}>{pct.toFixed(1)}%</div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #E7E2EE', marginBottom: 20 }}>
        {[{ key: 'subgroups', label: 'By Subgroup' }, { key: 'sessions', label: 'Session Attendance' }].map(t => (
          <button key={t.key} onClick={() => setSummaryTab(t.key)} style={{ padding: '9px 18px', fontSize: 13, fontWeight: summaryTab === t.key ? 700 : 500, border: 'none', background: 'transparent', cursor: 'pointer', color: summaryTab === t.key ? '#4C2A92' : '#8A7F99', borderBottom: summaryTab === t.key ? '3px solid #4C2A92' : '3px solid transparent', marginBottom: -2 }}>{t.label}</button>
        ))}
      </div>

      {summaryTab === 'subgroups' && (
        <>
          {/* ── Walk-in mapper callout ─────────────────────────────────────────── */}
          {(subgroups['Unknown']?.walkIns?.length ?? 0) > 0 && (
            <div style={{ border: '1.5px solid #F0C040', borderRadius: 10, marginBottom: 18, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#FFFBEA' }}>
                <AlertCircle size={16} style={{ color: '#B8710A', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: '#7A5200', fontWeight: 600 }}>
                  {subgroups['Unknown'].walkIns.length} unregistered attendee{subgroups['Unknown'].walkIns.length !== 1 ? 's' : ''}
                  {Object.keys(walkInSuggestions).length > 0 && (
                    <span style={{ fontWeight: 400, color: '#5A4000' }}> · {Object.keys(walkInSuggestions).length} fuzzy matched</span>
                  )}
                </span>
                {/* Quick-apply high-confidence matches */}
                {Object.entries(walkInSuggestions).filter(([, { score }]) => score >= 0.8).length > 0 && !showMapper && (
                  <button
                    onClick={quickAutoMatch}
                    style={{ padding: '5px 12px', borderRadius: 6, border: '1.5px solid #4C2A92', background: '#F0EBFC', color: '#4C2A92', cursor: 'pointer', fontSize: 11.5, fontWeight: 700 }}>
                    ✦ Quick Match ({Object.entries(walkInSuggestions).filter(([, { score }]) => score >= 0.8).length})
                  </button>
                )}
                <button
                  onClick={() => {
                    if (showMapper) { setShowMapper(false); setWalkInMappings({}); setMapperSearch({}); return; }
                    // Pre-populate with fuzzy suggestions
                    const initial = {};
                    Object.entries(walkInSuggestions).forEach(([name, { registration }]) => {
                      initial[name] = { type: 'registration', value: registration, autoSuggested: true };
                    });
                    setWalkInMappings(initial);
                    setShowMapper(true);
                  }}
                  style={{ padding: '6px 14px', borderRadius: 7, border: '1.5px solid #D4A020', background: showMapper ? '#FFF0B0' : '#fff', color: '#7A5200', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
                  {showMapper ? 'Cancel' : `Assign Walk-ins${Object.keys(walkInSuggestions).length > 0 ? ` (${Object.keys(walkInSuggestions).length} auto-matched)` : ''}`}
                </button>
              </div>

              {showMapper && (
                <div style={{ background: '#fff', borderTop: '1px solid #F0C040', padding: '14px 16px' }}>
                  <p style={{ margin: '0 0 12px', fontSize: 12, color: '#8A7F99' }}>
                    For each person: match them to an existing registration (fixes name mismatch) or assign to a subgroup. Unset rows stay in Unknown.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 400, overflowY: 'auto', marginBottom: 14 }}>
                    {(subgroups['Unknown'].walkIns ?? []).map(cmpName => {
                      const mapping = walkInMappings[cmpName];
                      const mode = mapping?.type ?? null;
                      const isAutoSuggested = mapping?.autoSuggested === true;
                      const suggestion = walkInSuggestions[cmpName];
                      const searchStr = mapperSearch[cmpName] || '';
                      const filteredRegs = registrations.filter(r => {
                        const n = (r.fullName || r.full_name || '').toLowerCase();
                        return !searchStr || n.includes(searchStr.toLowerCase());
                      });
                      const rowBg = isAutoSuggested ? '#F8F5FF' : '#FAFAF7';
                      const rowBorder = isAutoSuggested ? '1px solid #C8B8F0' : '1px solid #E7E2EE';
                      return (
                        <div key={cmpName} style={{ border: rowBorder, borderRadius: 8, overflow: 'hidden' }}>
                          {/* Name row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: rowBg, borderBottom: mode ? '1px solid #E7E2EE' : 'none' }}>
                            <span style={{ flex: 1, fontSize: 13, color: '#1A1220', fontWeight: 600 }}>
                              {cmpName} <span style={{ color: '#B8710A', fontSize: 11, fontWeight: 400 }}>★ walk-in</span>
                              {isAutoSuggested && (
                                <span style={{ marginLeft: 6, fontSize: 10, background: '#4C2A92', color: '#fff', borderRadius: 4, padding: '1px 6px', fontWeight: 600, verticalAlign: 'middle' }}>
                                  Auto-matched · {Math.round((suggestion?.score ?? 0) * 100)}%
                                </span>
                              )}
                            </span>
                            {/* Mode toggle buttons */}
                            <button
                              onClick={() => setWalkInMappings(prev => {
                                if (mode === 'registration') { const n = { ...prev }; delete n[cmpName]; return n; }
                                return { ...prev, [cmpName]: { type: 'registration', value: null } };
                              })}
                              style={{ padding: '4px 11px', borderRadius: 6, border: mode === 'registration' ? '2px solid #4C2A92' : '1px solid #C8C2D8', background: mode === 'registration' ? '#F0EBFC' : '#fff', color: mode === 'registration' ? '#4C2A92' : '#5A5270', cursor: 'pointer', fontSize: 11.5, fontWeight: mode === 'registration' ? 700 : 400 }}>
                              Match person
                            </button>
                            <button
                              onClick={() => setWalkInMappings(prev => {
                                if (mode === 'subgroup') { const n = { ...prev }; delete n[cmpName]; return n; }
                                return { ...prev, [cmpName]: { type: 'subgroup', value: '' } };
                              })}
                              style={{ padding: '4px 11px', borderRadius: 6, border: mode === 'subgroup' ? '2px solid #4C2A92' : '1px solid #C8C2D8', background: mode === 'subgroup' ? '#F0EBFC' : '#fff', color: mode === 'subgroup' ? '#4C2A92' : '#5A5270', cursor: 'pointer', fontSize: 11.5, fontWeight: mode === 'subgroup' ? 700 : 400 }}>
                              Assign subgroup
                            </button>
                          </div>

                          {/* Registration match panel */}
                          {mode === 'registration' && (
                            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                              <input
                                placeholder="Search registrations by name…"
                                value={searchStr}
                                onChange={e => setMapperSearch(prev => ({ ...prev, [cmpName]: e.target.value }))}
                                style={{ padding: '6px 10px', border: '1px solid #C8C2D8', borderRadius: 6, fontSize: 12.5, width: '100%', boxSizing: 'border-box' }}
                              />
                              <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #E7E2EE', borderRadius: 6 }}>
                                {filteredRegs.length === 0 && (
                                  <div style={{ padding: '10px 12px', fontSize: 12, color: '#8A7F99' }}>No registrations match.</div>
                                )}
                                {filteredRegs.slice(0, 50).map(reg => {
                                  const rn = reg.fullName || reg.full_name;
                                  const isSelected = mapping?.value?.fullName === rn || mapping?.value?.full_name === rn;
                                  return (
                                    <button
                                      key={reg.id || rn}
                                      onClick={() => setWalkInMappings(prev => ({ ...prev, [cmpName]: { type: 'registration', value: reg, autoSuggested: false } }))}
                                      style={{ width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', borderBottom: '1px solid #F0EDF6', background: isSelected ? '#F0EBFC' : '#fff', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ fontSize: 13, color: isSelected ? '#4C2A92' : '#1A1220', fontWeight: isSelected ? 700 : 400 }}>{rn}</span>
                                      <span style={{ fontSize: 11, color: '#8A7F99', marginLeft: 8 }}>{reg.subgroup || '—'}</span>
                                    </button>
                                  );
                                })}
                                {filteredRegs.length > 50 && (
                                  <div style={{ padding: '7px 12px', fontSize: 11, color: '#8A7F99', fontStyle: 'italic' }}>
                                    Showing first 50 of {filteredRegs.length} — type to narrow
                                  </div>
                                )}
                              </div>
                              {mapping?.value && (
                                <div style={{ fontSize: 12, color: '#4C2A92', fontWeight: 600 }}>
                                  ✓ Matched to: {mapping.value.fullName || mapping.value.full_name} ({mapping.value.subgroup || 'no subgroup'})
                                </div>
                              )}
                            </div>
                          )}

                          {/* Subgroup assign panel */}
                          {mode === 'subgroup' && (
                            <div style={{ padding: '10px 12px' }}>
                              <select
                                value={mapping?.value || ''}
                                onChange={e => setWalkInMappings(prev => ({ ...prev, [cmpName]: { type: 'subgroup', value: e.target.value } }))}
                                style={{ padding: '6px 10px', border: '1px solid #C8C2D8', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' }}>
                                <option value="">— Select subgroup —</option>
                                {uniqueSubgroups.map(sg => <option key={sg} value={sg}>{sg}</option>)}
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => { setWalkInMappings({}); setMapperSearch({}); setShowMapper(false); }}
                      style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid #E7E2EE', background: '#fff', color: '#1A1220', cursor: 'pointer', fontSize: 13 }}>
                      Cancel
                    </button>
                    <button
                      onClick={applyWalkInMappings}
                      disabled={!Object.values(walkInMappings).some(m => m?.value)}
                      style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: Object.values(walkInMappings).some(m => m?.value) ? '#4C2A92' : '#C8C2D8', color: '#fff', cursor: Object.values(walkInMappings).some(m => m?.value) ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700 }}>
                      Apply Assignments
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Subgroup overview table */}
          {subgroupKeys.length > 1 && (
            <div style={{ border: '1px solid #E7E2EE', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ background: '#3D1A78', color: '#fff', padding: '10px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em' }}>Subgroup Overview</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#FAFAF7' }}>
                    {['Subgroup', 'Expected', 'Present', 'Walk-ins', 'Absent', 'Reach'].map((h, i) => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: i === 5 ? 'right' : 'left', fontSize: 11, color: '#8A7F99', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid #E7E2EE' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subgroupKeys.map((sg, i) => {
                    const d = subgroups[sg];
                    const exp = d.expected?.length ?? 0, pres = d.present?.length ?? 0, abs = d.absent?.length ?? 0, wi = d.walkIns?.length ?? 0;
                    const p = exp > 0 ? Math.round(pres / exp * 100) : 0;
                    return (
                      <tr key={sg} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAF7' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13, color: '#1A1220', borderBottom: '.5px solid #E7E2EE' }}>{sg}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: '#4A4A4A', borderBottom: '.5px solid #E7E2EE' }}>{exp}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: '#085041', fontWeight: 600, borderBottom: '.5px solid #E7E2EE' }}>{pres}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: wi > 0 ? '#B8710A' : '#4A4A4A', fontWeight: wi > 0 ? 600 : 400, borderBottom: '.5px solid #E7E2EE' }}>{wi}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: abs > 0 ? '#712B13' : '#4A4A4A', fontWeight: abs > 0 ? 600 : 400, borderBottom: '.5px solid #E7E2EE' }}>{abs}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '.5px solid #E7E2EE' }}>
                          <span style={{ display: 'inline-block', borderRadius: 999, padding: '2px 10px', fontSize: 11, color: getReachColor(p), background: '#F0EBFC', fontWeight: 700 }}>{p}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {subgroupKeys.map(sg => (
            <SubgroupSection key={sg} subgroup={sg} data={subgroups[sg]} />
          ))}
        </>
      )}

      {summaryTab === 'sessions' && <SessionAttendanceGrid report={report} />}
    </div>
  );
}
