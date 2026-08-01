import React, { useState, useMemo, useEffect } from 'react';
import { CheckCircle2, XCircle, Pencil, Download, ChevronUp, ChevronDown, Link2, Copy, RefreshCw, Trash2, X } from 'lucide-react';
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
  registered_outstanding:{ label: 'Outstanding',    color: C.amber, bg: C.amberBg, tone: 'amber' },
  confirmed:             { label: 'Confirmed',       color: C.green, bg: C.greenBg, tone: 'green' },
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

  const gradient = `conic-gradient(
    ${C.red}   0%          ${rPct}%,
    ${C.amber} ${rPct}%    ${rPct + aPct}%,
    ${C.green} ${rPct + aPct}% 100%
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function RegistrationDataTab({
  workingListDb,
  merged,
  paymentByEmail,
  hasFinanceAccess,
  subgroups,
  isLimited,
  onSaveReg,
}) {
  const [statusFilter,    setStatusFilter]    = useState('all');
  const [subgroupFilter,  setSubgroupFilter]  = useState('All');
  const [fellowshipFilter,setFellowshipFilter] = useState('All');
  const [search,          setSearch]           = useState('');
  const [sortField,       setSortField]        = useState('name');
  const [sortDir,         setSortDir]          = useState('asc');
  const [editingReg,      setEditingReg]       = useState(null);
  const [publicToken,     setPublicToken]      = useState(null);
  const [showShareModal,  setShowShareModal]   = useState(false);
  const [copyLabel,       setCopyLabel]        = useState('Copy link');
  const [tokenLoading,    setTokenLoading]     = useState(false);

  const showFees = hasFinanceAccess || isLimited;

  // Load existing share token on mount
  useEffect(() => {
    supabase.from('registration_config')
      .select('value').eq('key', 'tii2_public_token').maybeSingle()
      .then(({ data }) => { if (data?.value) setPublicToken(data.value); });
  }, []);

  async function handleGenerateToken() {
    setTokenLoading(true);
    const token = crypto.randomUUID();
    await supabase.from('registration_config')
      .upsert({ key: 'tii2_public_token', value: token, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setPublicToken(token);
    setTokenLoading(false);
  }

  async function handleRemoveToken() {
    setTokenLoading(true);
    await supabase.from('registration_config').delete().eq('key', 'tii2_public_token');
    setPublicToken(null);
    setTokenLoading(false);
  }

  function copyPublicUrl() {
    const url = `${window.location.origin}/registration/public/${publicToken}`;
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

  // ── unified people list ────────────────────────────────────────────────────
  const allPeople = useMemo(() => {
    const byEmail = {};

    // Seed from working list (authoritative roster)
    workingListDb.forEach(p => {
      const reg     = mergedByEmail[p.email];
      const pay     = paymentByEmail[p.email];
      const hasPaid = pay
        ? (Number(pay.amount_paid) || 0) > 0 &&
          Number(pay.amount_paid) >= Number(pay.amount_expected)
        : false;
      const isRegistered = !!reg;
      const isConfirmed  = reg?.fullyConfirmed || false;

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
        registrationStatus: !isRegistered
          ? 'not_registered'
          : isConfirmed
            ? 'confirmed'
            : 'registered_outstanding',
      };
    });

    // Gap-fill: registrants not on working list
    merged.forEach(r => {
      if (!byEmail[r.email]) {
        byEmail[r.email] = {
          ...r,
          full_name: r.fullName || '',
          hasPaid: r.hasPaid,
          isRegistered: true,
          isConfirmed: r.fullyConfirmed,
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

  // ── stats (always from full list, not filtered) ───────────────────────────
  const stats = useMemo(() => {
    const s = { total: 0, not_registered: 0, registered_outstanding: 0, confirmed: 0 };
    allPeople.forEach(p => { s.total++; s[p.registrationStatus]++; });
    return s;
  }, [allPeople]);

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
    { key: 'email', label: 'Email' },
  ];

  const statusPills = [
    { key: 'all',                  label: `All (${stats.total})` },
    { key: 'not_registered',       label: `Not Registered (${stats.not_registered})`,         color: C.red },
    { key: 'registered_outstanding',label: `Outstanding (${stats.registered_outstanding})`,   color: C.amber },
    { key: 'confirmed',            label: `Confirmed (${stats.confirmed})`,                    color: C.green },
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
            { key: 'registered_outstanding', color: C.amber, label: 'Outstanding' },
            { key: 'confirmed',             color: C.green, label: 'Confirmed' },
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

      {/* ── Status pill filters ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
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

      {/* ── Subgroup pill filters ────────────────────────────────────── */}
      {subgroups.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {['All', ...subgroups].map(sg => {
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
        <Btn tone="ghost" small onClick={() => downloadCSV('registration-data.csv', filtered, exportCols)}>
          <Download size={13} /> Export
        </Btn>
        <Btn tone="ghost" small onClick={() => setShowShareModal(true)}>
          <Link2 size={13} /> Share
        </Btn>
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
                <th style={{ width: 40, borderBottom: `1px solid ${C.line}` }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const st = STATUS[p.registrationStatus];
                const regObj = mergedByEmail[p.email] || null;
                return (
                  <tr
                    key={p.email}
                    style={{
                      background: st.bg,
                      borderLeft: `4px solid ${st.color}`,
                    }}
                  >
                    {/* # */}
                    <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: C.mute, width: 36 }}>
                      {p._rowNum}
                    </td>
                    {/* Name */}
                    <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontWeight: 600, fontSize: 13 }}>
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
                      {p.phone || <span style={{ color: C.mute }}>—</span>}
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
                    {/* Edit — always visible; stub for not-yet-registered rows */}
                    <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.line}`, width: 40 }}>
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
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={showFees ? 9 : 8} style={{ padding: 32, textAlign: 'center', color: C.mute, background: C.paper }}>
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
                  <div style={{ background: '#F1EEF6', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: C.ink, wordBreak: 'break-all', marginBottom: 16, border: `1px solid ${C.line}` }}>
                    {`${window.location.origin}/registration/public/${publicToken}`}
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
