import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, Circle, AlertCircle, Pencil, Download, ChevronUp, ChevronDown, Link2, Copy, RefreshCw, Trash2, X, Plus, UserX } from 'lucide-react';
import RegistrationEditModal from './RegistrationEditModal';
import { supabase } from '../../lib/supabase';

// ─── brand tokens (mirrors RegistrationEcosystem) ───────────────────────────
const C = {
  ink: '#1A1220',
  purple: '#4C2A92',
  purpleDeep: '#37206C',
  cream: '#FAFAF8',
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

const STATUS = {
  not_registered:        { label: 'Not Registered', color: C.red,   bg: C.redBg,   tone: 'red' },
  registered_outstanding:{ label: 'Confirming',     color: C.amber, bg: C.amberBg, tone: 'amber' },
  confirmed:             { label: 'Confirmed',       color: C.green, bg: C.greenBg, tone: 'green' },
  absent:                { label: 'Absent',          color: C.mute,  bg: '#F5F4F7', tone: 'mute' },
};

// ─── UI atoms ────────────────────────────────────────────────────────────────
function Pill({ tone = 'mute', children }) {
  const map = {
    green: [C.greenBg, C.green], amber: [C.amberBg, C.amber], red: [C.redBg, C.red],
    blue: [C.blueBg, C.blue], mute: ['#F1EEF6', C.mute],
  };
  const [bg, fg] = map[tone] || map.mute;
  return (
    <span style={{ background: bg, color: fg, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, letterSpacing: 0.2, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function Btn({ children, onClick, tone = 'primary', small, disabled }) {
  const styles = {
    primary: { background: C.purple, color: '#fff', border: `1px solid ${C.purple}` },
    ghost:   { background: '#fff', color: C.purple, border: `1px solid ${C.line}` },
    subtle:  { background: '#F1EEF6', color: C.purpleDeep, border: '1px solid transparent' },
  }[tone];
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...styles, fontFamily: 'Inter', fontWeight: 600, fontSize: small ? 12.5 : 13.5,
      padding: small ? '6px 12px' : '9px 16px', borderRadius: 9, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'opacity .15s',
    }}>
      {children}
    </button>
  );
}

// ─── CSV export ──────────────────────────────────────────────────────────────
function toCSV(rows, columns) {
  const header = columns.map(c => c.label).join(',');
  const lines = rows.map(r => columns.map(c => {
    const v = (typeof c.get === 'function' ? c.get(r) : r[c.key]) ?? '';
    const s = String(v).replace(/"/g, '""');
    return /[,"\n]/.test(s) ? `"${s}"` : s;
  }).join(','));
  return [header, ...lines].join('\n');
}
function downloadCSV(filename, rows, columns) {
  const csv = toCSV(rows, columns);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Donut chart (pure CSS conic-gradient, no library) ───────────────────────
function DonutChart({ stats }) {
  const total = stats.total || 1;
  const rPct  = (stats.not_registered         / total) * 100;
  const aPct  = (stats.registered_outstanding / total) * 100;
  const gPct  = (stats.confirmed              / total) * 100;
  const mPct  = ((stats.absent || 0)          / total) * 100;

  const gradient = `conic-gradient(
    ${C.red}   0%                      ${rPct}%,
    ${C.amber} ${rPct}%                ${rPct + aPct}%,
    ${C.green} ${rPct + aPct}%         ${rPct + aPct + gPct}%,
    ${C.mute}  ${rPct + aPct + gPct}%  100%
  )`;

  return (
    <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: stats.total === 0 ? C.line : gradient,
        WebkitMask: 'radial-gradient(transparent 28px, black 29px)',
        mask:        'radial-gradient(transparent 28px, black 29px)',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 13, color: C.ink,
      }}>
        {stats.total}
      </div>
    </div>
  );
}

// ─── Sort header cell ─────────────────────────────────────────────────────────
function SortTh({ label, field, sortField, sortDir, onSort, style }) {
  const active = sortField === field;
  return (
    <th
      onClick={() => onSort(field)}
      style={{
        cursor: 'pointer', userSelect: 'none',
        textAlign: 'left', fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase',
        color: active ? C.purple : C.mute, fontWeight: 600,
        padding: '8px 10px', borderBottom: `1px solid ${C.line}`,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {label}
        {active
          ? (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
          : <ChevronDown size={11} style={{ opacity: 0.3 }} />}
      </span>
    </th>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const TITLE_RE = /\b(pastor|bro|brother|sis|sister|dr|rev|reverend|mr|mrs|ms|evangelist|evang)\b\.?/gi;
function normWlName(n) {
  return (n || '').replace(TITLE_RE, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function RegistrationDataTab({
  workingListDb,
  merged,
  paymentByEmail,
  hasFinanceAccess,
  subgroups,
  isLimited,
  role,
  onSaveReg,
  onDeleteReg,
  onMarkAbsent,
  onAddPerson,
  onEditPerson,
  onRemove,
  onConfirm,
  highlightEmail,
  onClearHighlight,
  sprintEditAccess = false,
  publicTokenKey = 'tii2_public_token',
}) {
  // sprintEditAccess = Registration team members can edit even when scoped
  const canEdit = sprintEditAccess || (
    !isLimited && (role === 'super_admin' || role === 'regional_secretary' || role === 'dept_lead' || role === 'pastor')
  );

  const [statusFilter,    setStatusFilter]    = useState('all');
  const [subgroupFilter,  setSubgroupFilter]  = useState('All');
  const [fellowshipFilter,setFellowshipFilter] = useState('All');

  // For scoped users, auto-select their subgroup once data loads
  useEffect(() => {
    if (isLimited && subgroups.length > 0 && subgroupFilter === 'All') {
      setSubgroupFilter(subgroups[0])
    }
  }, [isLimited, subgroups]);
  const [search,          setSearch]           = useState('');
  const [sortField,       setSortField]        = useState('name');
  const [sortDir,         setSortDir]          = useState('asc');
  const highlightRowRef = useRef(null);

  // absent inline row state
  const [absentExpandedEmail, setAbsentExpandedEmail] = useState(null);
  const [absentReason,        setAbsentReason]        = useState('');
  // full view toggle
  const [showFullView,        setShowFullView]        = useState(false);
  // add-person modal
  const [showAddModal,  setShowAddModal]  = useState(false);
  // link-registration modal
  const [linkingPerson, setLinkingPerson] = useState(null);

  useEffect(() => {
    if (!highlightEmail) return;
    setStatusFilter('all');
    setSubgroupFilter('All');
    setFellowshipFilter('All');
    setSearch('');
    setSortField('name');
    setSortDir('asc');
    setTimeout(() => {
      highlightRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }, [highlightEmail]);
  const [editingReg,      setEditingReg]       = useState(null);
  const [publicToken,     setPublicToken]      = useState(null);
  const [showShareModal,  setShowShareModal]   = useState(false);
  const [copyLabel,       setCopyLabel]        = useState('Copy link');
  const [tokenLoading,    setTokenLoading]     = useState(false);

  const showFees = hasFinanceAccess || role === 'pastor';

  // bulk email sender
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState({ not_registered: false, registered_outstanding: false, confirmed: false });

  function toggleStatus(status) {
    setSelectedStatuses(prev => ({ ...prev, [status]: !prev[status] }));
  }

  // Load existing share token on mount
  useEffect(() => {
    supabase.from('registration_config')
      .select('value').eq('key', publicTokenKey).maybeSingle()
      .then(({ data }) => { if (data?.value) setPublicToken(data.value); });
  }, [publicTokenKey]);

  async function handleGenerateToken() {
    setTokenLoading(true);
    const token = crypto.randomUUID();
    await supabase.from('registration_config')
      .upsert({ key: publicTokenKey, value: token, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setPublicToken(token);
    setTokenLoading(false);
  }

  async function handleRemoveToken() {
    setTokenLoading(true);
    await supabase.from('registration_config').delete().eq('key', publicTokenKey);
    setPublicToken(null);
    setTokenLoading(false);
  }

  const siteOrigin = (import.meta.env.VITE_FRONTEND_URL || window.location.origin).replace(/\/$/, '');
  const isLocalhost = /localhost|127\.0\.0\.1/.test(siteOrigin);

  function copyPublicUrl() {
    const url = `${siteOrigin}/registration/public/${publicToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopyLabel('Copied!');
      setTimeout(() => setCopyLabel('Copy link'), 2500);
    });
  }

  // ── build mergedByEmail lookup once ────────────────────────────────────────
  const mergedByEmail = useMemo(
    () => Object.fromEntries(merged.map(m => [m.email, m])),
    [merged],
  );

  // Normalize a name for fuzzy comparison: lowercase, strip honorifics, collapse spaces
  function normName(s = '') {
    return s.toLowerCase()
      .replace(/\b(pastor|sis|brother|bro|sister|dr|rev|pastor|prolific)\b/g, '')
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ── unified people list ────────────────────────────────────────────────────
  const allPeople = useMemo(() => {
    const byEmail = {};

    // Track registration emails already claimed by a linked working-list entry
    // so we don't gap-fill a duplicate row for them
    const claimedRegEmails = new Set(
      workingListDb
        .map(p => p.linked_registration_email?.toLowerCase())
        .filter(Boolean),
    );

    // Seed from working list (authoritative roster)
    workingListDb.forEach(p => {
      // If this person was manually linked to a different registration email, use that
      const regLookup = p.linked_registration_email?.toLowerCase() || p.email;
      const reg     = mergedByEmail[regLookup] || mergedByEmail[p.email];
      const pay     = paymentByEmail[regLookup] || paymentByEmail[p.email];
      const hasPaid = pay
        ? (Number(pay.amount_paid) || 0) > 0 &&
          Number(pay.amount_paid) >= Number(pay.amount_expected)
        : false;
      const isRegistered = !!reg;
      const isConfirmed  = reg?.fullyConfirmed || false;
      const isAbsent     = !!p.absent;

      byEmail[p.email] = {
        ...(reg || {}),
        full_name:  reg?.fullName  || p.full_name  || '',
        fellowship: reg?.fellowship || p.fellowship || '',
        phone:      reg?.phone      || '',
        subgroup:   reg?.subgroup   || p.subgroup   || '',
        email: p.email,
        hasPaid,
        isRegistered,
        isConfirmed,
        // WL-specific fields
        absent:                   isAbsent,
        absent_reason:            p.absent_reason || '',
        manually_added:           !!p.manually_added,
        wl_phone:                 p.phone_number  || '',
        on_working_list:          true,
        linked_registration_email: p.linked_registration_email || null,
        _fuzzyMatched:            false,
        _fuzzyMatchedEmail:       null,
        registrationStatus: isAbsent
          ? 'absent'
          : !isRegistered
            ? 'not_registered'
            : isConfirmed
              ? 'confirmed'
              : 'registered_outstanding',
      };
    });

    // Name-based fallback: for working-list entries still showing not_registered,
    // try matching by normalized full name against unmatched registrations
    const unmatchedRegs = merged.filter(
      r => !byEmail[r.email] && !claimedRegEmails.has(r.email?.toLowerCase()),
    );
    const regByNormName = new Map(
      unmatchedRegs.map(r => [normName(r.fullName || ''), r]),
    );
    Object.keys(byEmail).forEach(wlEmail => {
      const entry = byEmail[wlEmail];
      if (entry.isRegistered || entry.absent) return;
      const norm = normName(entry.full_name);
      if (!norm) return;
      const match = regByNormName.get(norm);
      if (!match) return;
      // Merge: update the working-list entry with the registration data
      const pay = paymentByEmail[match.email] || paymentByEmail[wlEmail];
      const hasPaid = pay
        ? (Number(pay.amount_paid) || 0) > 0 &&
          Number(pay.amount_paid) >= Number(pay.amount_expected)
        : false;
      byEmail[wlEmail] = {
        ...entry,
        ...(match || {}),
        full_name: match.fullName || entry.full_name,
        phone: match.phone || entry.phone || '',
        email: wlEmail,
        hasPaid,
        isRegistered: true,
        isConfirmed: match.fullyConfirmed || false,
        // preserve WL fields
        absent:              entry.absent,
        absent_reason:       entry.absent_reason,
        manually_added:      entry.manually_added,
        wl_phone:            entry.wl_phone,
        on_working_list:     entry.on_working_list,
        linked_registration_email: entry.linked_registration_email,
        _fuzzyMatched:       true,
        _fuzzyMatchedEmail:  match.email,
        registrationStatus: match.fullyConfirmed ? 'confirmed' : 'registered_outstanding',
      };
      // Claim this registration so it doesn't gap-fill as a separate row
      claimedRegEmails.add(match.email?.toLowerCase());
      regByNormName.delete(norm);
    });

    // Gap-fill: registrants not on working list and not name-matched above
    merged.forEach(r => {
      if (!byEmail[r.email] && !claimedRegEmails.has(r.email?.toLowerCase())) {
        byEmail[r.email] = {
          ...r,
          full_name: r.fullName || '',
          hasPaid: r.hasPaid,
          isRegistered: true,
          isConfirmed: r.fullyConfirmed,
          // not on working list
          absent:                   false,
          absent_reason:            '',
          manually_added:           false,
          wl_phone:                 '',
          on_working_list:          false,
          linked_registration_email: null,
          _fuzzyMatched:            false,
          _fuzzyMatchedEmail:       null,
          registrationStatus: r.fullyConfirmed ? 'confirmed' : 'registered_outstanding',
        };
      }
    });

    // Sort alphabetically and assign fixed row numbers
    const sorted = Object.values(byEmail)
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    sorted.forEach((p, i) => { p._rowNum = i + 1; });
    return sorted;
  }, [workingListDb, merged, mergedByEmail, paymentByEmail]);

  // ── fellowship list (sorted unique values) ────────────────────────────────
  const fellowships = useMemo(() => {
    const s = new Set(allPeople.map(p => p.fellowship).filter(Boolean));
    return [...s].sort();
  }, [allPeople]);

  // ── stats scoped to active subgroup filter ────────────────────────────────
  const statsSource = useMemo(() =>
    subgroupFilter === 'All' ? allPeople : allPeople.filter(p => p.subgroup === subgroupFilter),
    [allPeople, subgroupFilter]);

  const stats = useMemo(() => {
    const s = { total: 0, not_registered: 0, registered_outstanding: 0, confirmed: 0, absent: 0 };
    statsSource.forEach(p => { s.total++; s[p.registrationStatus] = (s[p.registrationStatus] || 0) + 1; });
    return s;
  }, [statsSource]);

  const not_registered = useMemo(() => statsSource.filter(r => r.registrationStatus === 'not_registered').length, [statsSource]);
  const registered_outstanding = useMemo(() => statsSource.filter(r => r.registrationStatus === 'registered_outstanding').length, [statsSource]);
  const confirmed = useMemo(() => statsSource.filter(r => r.registrationStatus === 'confirmed').length, [statsSource]);
  const statusCounts = { not_registered, registered_outstanding, confirmed };
  const totalToEmail = Object.entries(selectedStatuses).reduce((sum, [status, selected]) => sum + (selected ? statusCounts[status] : 0), 0);

  // ── filtered + sorted view ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = allPeople;
    if (statusFilter !== 'all')
      rows = rows.filter(p => p.registrationStatus === statusFilter);
    if (subgroupFilter !== 'All')
      rows = rows.filter(p => p.subgroup === subgroupFilter);
    if (fellowshipFilter !== 'All')
      rows = rows.filter(p => p.fellowship === fellowshipFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(p =>
        (p.full_name  || '').toLowerCase().includes(q) ||
        (p.phone      || '').toLowerCase().includes(q) ||
        (p.email      || '').toLowerCase().includes(q) ||
        (p.fellowship || '').toLowerCase().includes(q)
      );
    }
    if (sortField !== 'name' || sortDir !== 'asc') {
      const getVal = p => ({
        name:       p.full_name   || '',
        fellowship: p.fellowship  || '',
        phone:      p.phone       || '',
        registered: p.isRegistered ? 1 : 0,
        fees:       p.hasPaid     ? 1 : 0,
      })[sortField];
      rows = [...rows].sort((a, b) => {
        const av = getVal(a), bv = getVal(b);
        const cmp = typeof av === 'number' ? av - bv : av.localeCompare(bv);
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return rows;
  }, [allPeople, statusFilter, subgroupFilter, fellowshipFilter, search, sortField, sortDir]);

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  // ── export columns ────────────────────────────────────────────────────────
  const exportCols = [
    { key: '_rowNum',   label: '#' },
    { key: 'full_name', label: 'Name' },
    { key: 'subgroup',  label: 'Subgroup' },
    { key: 'fellowship',label: 'Fellowship' },
    { key: 'phone',     label: 'Phone' },
    { get: r => r.isRegistered ? 'Yes' : 'No', label: 'Registered' },
    ...(showFees ? [{ get: r => r.hasPaid ? 'Yes' : 'No', label: 'Fees Paid' }] : []),
    { get: r => STATUS[r.registrationStatus]?.label || r.registrationStatus, label: 'Status' },
    { get: r => r.absent_reason || '', label: 'Absent Reason' },
    { key: 'email', label: 'Email' },
  ];

  const statusPills = [
    { key: 'all',                  label: `All (${stats.total})` },
    { key: 'not_registered',       label: `Not Registered (${stats.not_registered})`,         color: C.red },
    { key: 'registered_outstanding',label: `Confirming (${stats.registered_outstanding})`,    color: C.amber },
    { key: 'confirmed',            label: `Confirmed (${stats.confirmed})`,                    color: C.green },
    { key: 'absent',               label: `Absent (${stats.absent || 0})`,                    color: C.mute },
  ];

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: C.ink }}>

      {/* ── Stats bar + donut ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14,
        padding: '16px 22px', marginBottom: 18, gap: 24,
      }}>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', flex: 1 }}>
          {[
            { key: 'not_registered',        color: C.red,   label: 'Not Registered' },
            { key: 'registered_outstanding', color: C.amber, label: 'Confirming' },
            { key: 'confirmed',             color: C.green, label: 'Confirmed' },
            { key: 'absent',                color: C.mute,  label: 'Absent' },
          ].map(({ key, color, label }) => (
            <div
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 22, lineHeight: 1, color: statusFilter === key ? color : C.ink }}>
                  {stats[key]}
                </div>
                <div style={{ fontSize: 11, color: C.mute, marginTop: 2 }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
        <DonutChart stats={stats} />
      </div>

      {/* ── Status pill filters + Email button ────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {statusPills.map(p => {
            const active = statusFilter === p.key;
            return (
              <button
                key={p.key}
                onClick={() => setStatusFilter(p.key)}
                style={{
                  padding: '5px 13px', borderRadius: 20, fontSize: 12.5, fontWeight: 600,
                  fontFamily: 'Inter', cursor: 'pointer', border: 'none',
                  background: active ? (p.color || C.purple) : '#F1EEF6',
                  color: active ? '#fff' : (p.color || C.mute),
                  transition: 'background .15s, color .15s',
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <button onClick={() => setEmailModalOpen(true)} style={{ background: C.purple, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
          Email
        </button>
      </div>

      {emailModalOpen && (
        <BulkEmailSender
          selectedStatuses={selectedStatuses}
          statusCounts={statusCounts}
          merged={allPeople}
          onClose={() => setEmailModalOpen(false)}
          onToggleStatus={toggleStatus}
        />
      )}

      {/* ── Subgroup pill filters ────────────────────────────────────── */}
      {subgroups.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {(isLimited ? subgroups : ['All', ...subgroups]).map(sg => {
            const active = subgroupFilter === sg;
            return (
              <button
                key={sg}
                onClick={() => setSubgroupFilter(sg)}
                style={{
                  padding: '5px 13px', borderRadius: 20, fontSize: 12.5, fontWeight: 600,
                  fontFamily: 'Inter', cursor: 'pointer', border: 'none',
                  background: active ? C.purple : '#F1EEF6',
                  color: active ? '#fff' : C.mute,
                  transition: 'background .15s, color .15s',
                }}
              >
                {sg}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Search + fellowship filter + export ─────────────────────── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, phone, email…"
          style={{
            flex: 1, minWidth: 180, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.line}`,
            fontFamily: 'Inter', fontSize: 13, outline: 'none', color: C.ink,
          }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mute, fontSize: 18, lineHeight: 1 }}>×</button>
        )}
        <select
          value={fellowshipFilter}
          onChange={e => setFellowshipFilter(e.target.value)}
          style={{
            padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.line}`,
            fontFamily: 'Inter', fontSize: 13, color: fellowshipFilter === 'All' ? C.mute : C.ink,
            background: fellowshipFilter !== 'All' ? '#F1EEF6' : '#fff', cursor: 'pointer',
          }}
        >
          <option value="All">All fellowships</option>
          {fellowships.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        {fellowshipFilter !== 'All' && (
          <button onClick={() => setFellowshipFilter('All')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mute, fontSize: 18, lineHeight: 1 }}>×</button>
        )}
        <div style={{ fontSize: 12, color: C.mute, whiteSpace: 'nowrap' }}>
          {filtered.length} of {stats.total}
        </div>
        <Btn tone="ghost" small onClick={() => downloadCSV('registration-data.csv', filtered.map((r, i) => ({ ...r, _rowNum: i + 1 })), exportCols)}>
          <Download size={13} /> Export ({filtered.length})
        </Btn>
        <Btn tone="ghost" small onClick={() => setShowShareModal(true)}>
          <Link2 size={13} /> Share
        </Btn>
        {canEdit && (
          <Btn tone="subtle" small onClick={() => setShowAddModal(true)}>
            <Plus size={13} /> Add Person
          </Btn>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.mute, fontWeight: 600, padding: '8px 10px', borderBottom: `1px solid ${C.line}`, width: 36 }}>#</th>
                <SortTh label="Name"       field="name"       sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <th style={{ textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.mute, fontWeight: 600, padding: '8px 10px', borderBottom: `1px solid ${C.line}` }}>Subgroup</th>
                <SortTh label="Fellowship" field="fellowship" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortTh label="Phone"      field="phone"      sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortTh label="Reg"        field="registered" sortField={sortField} sortDir={sortDir} onSort={toggleSort} style={{ width: 50 }} />
                {showFees && (
                  <SortTh label="Fees" field="fees" sortField={sortField} sortDir={sortDir} onSort={toggleSort} style={{ width: 50 }} />
                )}
                <th style={{ textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.mute, fontWeight: 600, padding: '8px 10px', borderBottom: `1px solid ${C.line}` }}>Status</th>
                <th style={{ textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.mute, fontWeight: 600, padding: '8px 10px', borderBottom: `1px solid ${C.line}`, cursor: 'pointer' }} onClick={() => setShowFullView(!showFullView)} title="Toggle extra columns">
                  {showFullView ? '✕' : '+'}
                </th>
                {showFullView && (
                  <>
                    <th style={{ textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.mute, fontWeight: 600, padding: '8px 10px', borderBottom: `1px solid ${C.line}` }}>Baptism</th>
                    <th style={{ textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.mute, fontWeight: 600, padding: '8px 10px', borderBottom: `1px solid ${C.line}` }}>Foundation</th>
                    <th style={{ textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.mute, fontWeight: 600, padding: '8px 10px', borderBottom: `1px solid ${C.line}` }}>Department</th>
                    <th style={{ textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.mute, fontWeight: 600, padding: '8px 10px', borderBottom: `1px solid ${C.line}` }}>Designation</th>
                    <th style={{ textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.mute, fontWeight: 600, padding: '8px 10px', borderBottom: `1px solid ${C.line}` }}>Shirt</th>
                    <th style={{ textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.mute, fontWeight: 600, padding: '8px 10px', borderBottom: `1px solid ${C.line}` }}>Dietary</th>
                  </>
                )}
                <th style={{ borderBottom: `1px solid ${C.line}`, minWidth: 100 }} />
                <th style={{ width: 40, borderBottom: `1px solid ${C.line}` }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const st = STATUS[p.registrationStatus] || STATUS.not_registered;
                // For fuzzy/linked matches the WL email ≠ registration email — fall back to the real reg email
                const regObj = mergedByEmail[p.email]
                  || (p._fuzzyMatchedEmail ? mergedByEmail[p._fuzzyMatchedEmail] : null)
                  || (p.linked_registration_email ? mergedByEmail[p.linked_registration_email] : null)
                  || null;
                const isAbsentExpanded = absentExpandedEmail === p.email;
                const colCount = (showFees ? 10 : 9) + 1 + 1 + (showFullView ? 6 : 0);
                return (
                  <React.Fragment key={p.email}>
                  <tr
                    ref={p.email === highlightEmail ? highlightRowRef : null}
                    onClick={p.email === highlightEmail ? onClearHighlight : undefined}
                    style={{
                      background: p.email === highlightEmail ? '#EDE9FF' : st.bg,
                      borderLeft: `4px solid ${p.email === highlightEmail ? C.purple : st.color}`,
                      outline: p.email === highlightEmail ? `2px solid ${C.purple}` : 'none',
                      outlineOffset: -2,
                      cursor: p.email === highlightEmail ? 'default' : undefined,
                      opacity: p.absent ? 0.7 : 1,
                    }}
                  >
                    {/* # */}
                    <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: C.mute, width: 36 }}>
                      {p._rowNum}
                    </td>
                    {/* Name */}
                    <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontWeight: 600, fontSize: 13, textDecoration: p.absent ? 'line-through' : 'none' }}>
                      {p.full_name || '—'}
                    </td>
                    {/* Subgroup */}
                    <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontSize: 12.5, color: C.mute }}>
                      {p.subgroup || '—'}
                    </td>
                    {/* Fellowship */}
                    <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontSize: 12.5, color: C.mute }}>
                      {p.fellowship || '—'}
                    </td>
                    {/* Phone */}
                    <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: C.ink }}>
                      {p.phone || p.wl_phone || <span style={{ color: C.mute }}>—</span>}
                    </td>
                    {/* Reg */}
                    <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, width: 50 }}>
                      {p.isRegistered
                        ? <CheckCircle2 size={16} color={C.green} />
                        : <XCircle      size={16} color={C.red} />}
                    </td>
                    {/* Fees */}
                    {showFees && (
                      <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, width: 50 }}>
                        {p.isRegistered
                          ? (p.hasPaid
                              ? <CheckCircle2 size={16} color={C.green} />
                              : <XCircle      size={16} color={C.amber} />)
                          : <span style={{ color: C.mute, fontSize: 13 }}>—</span>}
                      </td>
                    )}
                    {/* Status */}
                    <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}` }}>
                      <Pill tone={st.tone}>{st.label}</Pill>
                    </td>
                    {/* Actions */}
                    <td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.line}` }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                          {/* Confirm button + flight flag — pastors and above */}
                          {p.isRegistered && onConfirm && (canEdit || role === 'pastor' || role === 'super_admin' || role === 'regional_secretary') && (
                            p.isConfirmed ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <button
                                  onClick={() => onConfirm(p.email)}
                                  title="Click to un-confirm"
                                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px', borderRadius: 5, border: `1px solid ${C.green}`, background: C.greenBg, color: C.green, cursor: 'pointer', fontFamily: 'Inter', fontWeight: 600, whiteSpace: 'nowrap' }}
                                >
                                  <CheckCircle2 size={12} /> Confirmed
                                </button>
                                {!p.hasFlightInfo && !/manitoba|winnipeg/i.test(p.fellowship || '') && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FFF3CD', color: '#B8710A', border: '1px solid #F5C842', borderRadius: 12, fontSize: 11, fontWeight: 600, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                                    <AlertCircle size={11} /> No flights
                                  </span>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => onConfirm(p.email)}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px', borderRadius: 5, border: `1px solid ${C.line}`, background: 'transparent', color: C.mute, cursor: 'pointer', fontFamily: 'Inter', whiteSpace: 'nowrap' }}
                              >
                                <Circle size={12} /> Confirm
                              </button>
                            )
                          )}
                          {!p.absent && p.on_working_list && p.registrationStatus === 'not_registered' && (
                            <button
                              onClick={() => { setAbsentExpandedEmail(p.email); setAbsentReason(''); }}
                              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: `1px solid ${C.amber}`, background: 'transparent', color: C.amber, cursor: 'pointer', fontFamily: 'Inter', whiteSpace: 'nowrap' }}
                            >
                              Mark absent
                            </button>
                          )}
                          {p.absent && (
                            <button
                              onClick={() => onMarkAbsent?.(p.email, false, '')}
                              style={{ fontSize: 9, padding: '1px 4px', border: 'none', background: 'transparent', color: C.mute, cursor: 'pointer', fontFamily: 'Inter', whiteSpace: 'nowrap', opacity: 0.45, textDecoration: 'underline' }}
                            >
                              undo absent
                            </button>
                          )}
                          {canEdit && p._fuzzyMatched && p._fuzzyMatchedEmail && !p.linked_registration_email && (
                            <button
                              onClick={() => onEditPerson?.(p.email, { linked_registration_email: p._fuzzyMatchedEmail })}
                              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: `1px solid ${C.green}`, background: C.greenBg, color: C.green, cursor: 'pointer', fontFamily: 'Inter', fontWeight: 600, whiteSpace: 'nowrap' }}
                            >
                              ✓ Validate match
                            </button>
                          )}
                          {canEdit && p.manually_added && (
                            <button
                              onClick={() => { if (confirm(`Remove ${p.full_name} from the working list?`)) onRemove?.(p.email); }}
                              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid #F44', background: 'transparent', color: '#D00', cursor: 'pointer', fontFamily: 'Inter', whiteSpace: 'nowrap' }}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    {/* Toggle button */}
                    <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.line}`, width: 36, textAlign: 'center', color: C.mute, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                      —
                    </td>
                    {showFullView && (
                      <>
                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontSize: 12.5, color: C.ink }}>
                          {regObj?.baptism || '—'}
                        </td>
                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontSize: 12.5, color: C.ink }}>
                          {regObj?.foundationStatus || '—'}
                        </td>
                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontSize: 12.5, color: C.ink }}>
                          {regObj?.team || '—'}
                        </td>
                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontSize: 12.5, color: C.ink }}>
                          {regObj?.designation || '—'}
                        </td>
                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontSize: 12.5, color: C.ink }}>
                          {regObj?.shirtSize || '—'}
                        </td>
                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontSize: 12.5, color: C.ink, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {regObj?.allergies || '—'}
                        </td>
                      </>
                    )}
                    {/* Edit pencil + delete */}
                    <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.line}`, width: 64 }}>
                      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        {canEdit && p.isRegistered && regObj && (
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete ${p.full_name || 'this person'}'s registration? This cannot be undone.`)) {
                                onDeleteReg?.(regObj.id, regObj.email);
                              }
                            }}
                            title="Delete registration"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DDB8B8', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 6 }}
                            onMouseEnter={e => e.currentTarget.style.color = C.red}
                            onMouseLeave={e => e.currentTarget.style.color = '#DDB8B8'}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => setEditingReg(regObj || {
                            email: p.email,
                            fullName: p.full_name,
                            subgroup: p.subgroup,
                            fellowship: p.fellowship,
                            phone: p.phone,
                          })}
                          title="Edit record"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mute, display: 'flex', alignItems: 'center', padding: 4, borderRadius: 6 }}
                          onMouseEnter={e => e.currentTarget.style.color = C.purple}
                          onMouseLeave={e => e.currentTarget.style.color = C.mute}
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* Inline absent reason row */}
                  {isAbsentExpanded && (
                    <tr style={{ background: '#FFF8E6' }}>
                      <td colSpan={colCount} style={{ padding: '8px 14px', borderBottom: `1px solid ${C.line}` }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>Reason for absence:</span>
                          <input
                            autoFocus
                            value={absentReason}
                            onChange={e => setAbsentReason(e.target.value)}
                            placeholder="e.g. travelling, health, work"
                            onKeyDown={e => {
                              if (e.key === 'Enter') { onMarkAbsent?.(p.email, true, absentReason); setAbsentExpandedEmail(null); }
                              if (e.key === 'Escape') setAbsentExpandedEmail(null);
                            }}
                            style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.line}`, fontFamily: 'Inter', fontSize: 12.5 }}
                          />
                          <Btn tone="primary" small onClick={() => { onMarkAbsent?.(p.email, true, absentReason); setAbsentExpandedEmail(null); }}>Confirm</Btn>
                          <Btn tone="ghost" small onClick={() => setAbsentExpandedEmail(null)}>Cancel</Btn>
                        </div>
                      </td>
                    </tr>
                  )}
                  {/* Absent reason display row */}
                  {p.absent && p.absent_reason && !isAbsentExpanded && (
                    <tr style={{ background: '#FAFAFA' }}>
                      <td colSpan={colCount} style={{ padding: '3px 14px 7px', fontSize: 12, color: C.mute, fontStyle: 'italic', borderBottom: `1px solid ${C.line}` }}>
                        Reason: {p.absent_reason}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={(showFees ? 10 : 9) + (canEdit ? 1 : 0)} style={{ padding: 32, textAlign: 'center', color: C.mute, background: C.paper }}>
                    {stats.total === 0
                      ? 'No data yet — import the working list and registrations first.'
                      : 'No people match the current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Edit modal ────────────────────────────────────────────────── */}
      {editingReg && (
        <RegistrationEditModal
          registration={editingReg}
          onClose={() => setEditingReg(null)}
          onSave={updated => { onSaveReg?.(updated); setEditingReg(null); }}
        />
      )}

      {/* ── Add person modal ──────────────────────────────────────────── */}
      {showAddModal && (
        <AddPersonModal
          subgroups={subgroups}
          onSave={async person => { await onAddPerson?.(person); setShowAddModal(false); }}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* ── Link registration modal ───────────────────────────────────── */}
      {linkingPerson && createPortal(
        <LinkRegistrationModal
          person={linkingPerson}
          registrations={merged}
          onLink={regEmail => { onEditPerson?.(linkingPerson.email, { linked_registration_email: regEmail }); setLinkingPerson(null); }}
          onClose={() => setLinkingPerson(null)}
        />,
        document.body,
      )}

      {/* ── Share modal ───────────────────────────────────────────────── */}
      {showShareModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowShareModal(false)}
        >
          <div
            style={{ background: C.paper, borderRadius: 14, width: '90%', maxWidth: 500, boxShadow: '0 20px 50px rgba(0,0,0,0.2)', fontFamily: 'Inter, sans-serif' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Share registration data</div>
                <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>Anyone with the link can view — no login required</div>
              </div>
              <button onClick={() => setShowShareModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.mute, display: 'flex', alignItems: 'center' }}>
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px' }}>
              {publicToken ? (
                <>
                  {isLocalhost && (
                    <div style={{ background: '#FBF0DE', border: `1px solid ${C.amber}`, borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: C.amber, fontWeight: 600 }}>
                      ⚠ Dev server detected — this URL only works on your machine. The link will use the correct production URL once deployed to Vercel.
                    </div>
                  )}
                  <div style={{ background: '#F1EEF6', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: C.ink, wordBreak: 'break-all', marginBottom: 16, border: `1px solid ${C.line}` }}>
                    {`${siteOrigin}/registration/public/${publicToken}`}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={copyPublicUrl}
                      style={{ flex: 1, padding: '9px 14px', borderRadius: 8, border: 'none', background: C.purple, color: '#fff', fontFamily: 'Inter', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                      <Copy size={14} /> {copyLabel}
                    </button>
                    <button
                      onClick={handleGenerateToken}
                      disabled={tokenLoading}
                      title="Invalidates the old link and creates a new one"
                      style={{ padding: '9px 14px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontFamily: 'Inter', fontWeight: 600, fontSize: 13, cursor: tokenLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: tokenLoading ? 0.6 : 1 }}
                    >
                      <RefreshCw size={14} /> Regenerate
                    </button>
                    <button
                      onClick={handleRemoveToken}
                      disabled={tokenLoading}
                      title="Disables public access"
                      style={{ padding: '9px 14px', borderRadius: 8, border: `1px solid ${C.redBg}`, background: C.redBg, color: C.red, fontFamily: 'Inter', fontWeight: 600, fontSize: 13, cursor: tokenLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: tokenLoading ? 0.6 : 1 }}
                    >
                      <Trash2 size={14} /> Remove access
                    </button>
                  </div>
                  <div style={{ marginTop: 14, fontSize: 11.5, color: C.mute }}>
                    The link shows: name, subgroup, fellowship, and registration status only. No phone numbers or email addresses are shared.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ textAlign: 'center', padding: '16px 0 20px' }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>🔗</div>
                    <div style={{ fontSize: 14, color: C.ink, fontWeight: 600, marginBottom: 6 }}>No public link yet</div>
                    <div style={{ fontSize: 13, color: C.mute, marginBottom: 20 }}>
                      Generate a secret link to share the registration data with people outside Nexus. They'll see names, subgroups, fellowships and statuses — no contact details.
                    </div>
                    <button
                      onClick={handleGenerateToken}
                      disabled={tokenLoading}
                      style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: C.purple, color: '#fff', fontFamily: 'Inter', fontWeight: 600, fontSize: 14, cursor: tokenLoading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, opacity: tokenLoading ? 0.6 : 1 }}
                    >
                      <Link2 size={16} /> {tokenLoading ? 'Generating…' : 'Generate link'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add person modal ─────────────────────────────────────────────────────────
function AddPersonModal({ subgroups, onSave, onClose }) {
  const [form, setForm] = useState({ full_name: '', email: '', subgroup: '', fellowship: '', phone_number: '' });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const valid = form.full_name.trim() && form.email.trim();
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 420, maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,.18)', fontFamily: 'Inter, sans-serif' }}>
        <h3 style={{ fontFamily: 'Space Grotesk', margin: '0 0 18px', fontSize: 16, color: C.ink }}>Add person to working list</h3>
        {[
          { k: 'full_name', label: 'Full Name *' },
          { k: 'email',     label: 'Email *' },
          { k: 'fellowship',label: 'Fellowship' },
          { k: 'phone_number', label: 'Phone' },
        ].map(({ k, label }) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.mute, marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
            <input value={form[k]} onChange={set(k)} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1px solid ${C.line}`, fontFamily: 'Inter', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
        ))}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.mute, marginBottom: 4, textTransform: 'uppercase' }}>Subgroup</div>
          <select value={form.subgroup} onChange={set('subgroup')} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1px solid ${C.line}`, fontFamily: 'Inter', fontSize: 13, boxSizing: 'border-box' }}>
            <option value="">— Select —</option>
            {subgroups.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn tone="ghost" small onClick={onClose}>Cancel</Btn>
          <Btn tone="primary" small disabled={!valid} onClick={() => onSave(form)}>Add</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Link registration modal ──────────────────────────────────────────────────
function LinkRegistrationModal({ person, registrations, onLink, onClose }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return registrations.slice(0, 50);
    return registrations.filter(r =>
      (r.fullName || '').toLowerCase().includes(q) ||
      (r.email    || '').toLowerCase().includes(q) ||
      (r.subgroup || '').toLowerCase().includes(q)
    ).slice(0, 50);
  }, [registrations, search]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: 480, maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,.18)', fontFamily: 'Inter, sans-serif' }}>
        <h3 style={{ fontFamily: 'Space Grotesk', margin: '0 0 4px', fontSize: 16, color: C.ink }}>Link to registration</h3>
        <div style={{ fontSize: 12.5, color: C.mute, marginBottom: 14 }}>Linking <strong>{person.full_name}</strong> — select their matching registration below.</div>
        <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email or subgroup…" style={{ padding: '8px 10px', borderRadius: 7, border: `1px solid ${C.line}`, fontFamily: 'Inter', fontSize: 13, marginBottom: 10 }} />
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 && <div style={{ color: C.mute, padding: 16, textAlign: 'center' }}>No matches</div>}
          {filtered.map((r, i) => (
            <div key={i} onClick={() => onLink(r.email)}
              style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, border: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F5F0FF'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.fullName}</div>
                <div style={{ fontSize: 12, color: C.mute }}>{r.subgroup} · {r.email}</div>
              </div>
              <Pill tone="green">Select</Pill>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Btn tone="ghost" small onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

// ============ BULK EMAIL SENDER ============
function BulkEmailSender({ selectedStatuses, statusCounts, merged, onClose, onToggleStatus }) {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      const { data } = await supabase
        .from('absence_email_templates')
        .select('id, name, subject, body')
        .order('is_default', { ascending: false })
        .order('updated_at', { ascending: false });
      setTemplates(data || []);
      if (data?.length) setSelectedTemplate(data[0].id);
    } catch (err) {
      setError('Failed to load templates: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  const recipientEmails = useMemo(() => {
    return merged
      .filter(r => {
        if (!r.email) return false;
        if (selectedStatuses.not_registered && r.registrationStatus === 'not_registered') return true;
        if (selectedStatuses.registered_outstanding && r.registrationStatus === 'registered_outstanding') return true;
        if (selectedStatuses.confirmed && r.registrationStatus === 'confirmed') return true;
        return false;
      })
      .map(r => ({ email: r.email, name: r.fullName, id: r.id }));
  }, [merged, selectedStatuses]);

  const template = templates.find(t => t.id === selectedTemplate);

  async function handleSend() {
    if (!template || recipientEmails.length === 0) return;
    setSending(true);
    setError(null);

    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('registration-bulk-email', {
        body: {
          recipients: recipientEmails,
          templateId: template.id,
          subject: template.subject,
          body: template.body,
        },
      });

      if (invokeErr) throw invokeErr;
      if (data?.error) throw new Error(data.error);

      // Update email_status to confirming for sent recipients
      const registrationIds = recipientEmails.map(r => r.id).filter(Boolean);
      if (registrationIds.length > 0) {
        await supabase
          .from('registrations')
          .update({ email_status: 'confirming' })
          .in('id', registrationIds);
      }

      alert(`✓ Email sent to ${recipientEmails.length} people`);
      onClose();
    } catch (err) {
      setError('Failed to send: ' + err.message);
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: C.paper, borderRadius: 14, width: '90%', maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, margin: 0, fontWeight: 700 }}>Send bulk email</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 24, cursor: 'pointer', color: C.mute, padding: 0 }}>×</button>
        </div>

        {/* Status filters */}
        <div style={{ padding: '14px 24px', borderBottom: `1px solid ${C.line}`, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.mute, textTransform: 'uppercase' }}>Send to:</div>
          {[
            { key: 'not_registered', label: 'Not Registered', count: statusCounts.not_registered, tone: 'red' },
            { key: 'registered_outstanding', label: 'Confirming', count: statusCounts.registered_outstanding, tone: 'amber' },
            { key: 'confirmed', label: 'Confirmed', count: statusCounts.confirmed, tone: 'green' },
          ].map(({ key, label, count, tone }) => (
            <label key={key} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={selectedStatuses[key]} onChange={() => onToggleStatus(key)} style={{ cursor: 'pointer', accentColor: C.purple }} />
              <span style={{ fontWeight: 600 }}>{label}</span>
              <span style={{ background: tone === 'red' ? '#FBE9E9' : tone === 'amber' ? '#FBF0DE' : '#E8F5EC', color: tone === 'red' ? '#C4383A' : tone === 'amber' ? '#B8710A' : '#1F8A4C', fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 12 }}>{count}</span>
            </label>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.mute, textTransform: 'uppercase', marginBottom: 8 }}>Template</div>
            {loading ? (
              <div style={{ color: C.mute, fontSize: 13 }}>Loading templates...</div>
            ) : templates.length === 0 ? (
              <div style={{ color: C.red, fontSize: 13 }}>No email templates found. Create one in Communications → Email Templates first.</div>
            ) : (
              <select value={selectedTemplate || ''} onChange={e => setSelectedTemplate(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1px solid ${C.line}`, fontFamily: 'Inter', fontSize: 13, marginBottom: 16 }}>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            {template && (
              <div style={{ background: C.cream, borderRadius: 8, padding: 12, fontSize: 12 }}>
                <div style={{ fontWeight: 600, color: C.ink, marginBottom: 4 }}>Preview:</div>
                <div style={{ color: C.mute, fontSize: 11 }}>Subject: {template.subject}</div>
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.mute, textTransform: 'uppercase', marginBottom: 8 }}>Recipients ({recipientEmails.length})</div>
            <div style={{ background: C.cream, borderRadius: 8, padding: 12, maxHeight: 200, overflowY: 'auto' }}>
              {recipientEmails.length === 0 ? (
                <div style={{ color: C.mute, fontSize: 13 }}>No recipients selected</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {recipientEmails.map((r, i) => (
                    <div key={i} style={{ fontSize: 12, color: C.ink }}>
                      {r.name} <span style={{ color: C.mute, fontFamily: 'JetBrains Mono', fontSize: 11 }}>({r.email})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ padding: '12px 24px', background: '#FBE9E9', borderTop: `1px solid ${C.line}`, color: C.red, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ padding: '12px 24px', borderTop: `1px solid ${C.line}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ background: '#fff', color: C.purple, border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSend} disabled={sending || !template || recipientEmails.length === 0} style={{ background: sending || !template || recipientEmails.length === 0 ? '#CCC' : C.purple, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: sending || !template || recipientEmails.length === 0 ? 'not-allowed' : 'pointer' }}>
            {sending ? 'Sending…' : `Send to ${recipientEmails.length}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
