import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

// ─── brand tokens (no CSS vars — page renders outside Shell) ─────────────────
const C = {
  ink:     '#1A1220',
  purple:  '#4C2A92',
  cream:   '#FAFAF8',
  paper:   '#FFFFFF',
  line:    '#E7E2EE',
  mute:    '#8A7F99',
  green:   '#1F8A4C',
  greenBg: '#E8F5EC',
  amber:   '#B8710A',
  amberBg: '#FBF0DE',
  red:     '#C4383A',
  redBg:   '#FBE9E9',
};

const STATUS = {
  not_registered:         { label: 'Not Registered', color: C.red,   bg: C.redBg },
  registered_outstanding: { label: 'Outstanding',    color: C.amber, bg: C.amberBg },
  confirmed:              { label: 'Confirmed',       color: C.green, bg: C.greenBg },
};

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.not_registered;
  return (
    <span style={{
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 700,
      padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
}

export default function RegistrationPublicPage() {
  const { token } = useParams();
  const [data,    setData]    = useState(null);   // null = loading, [] = loaded empty/invalid
  const [invalid, setInvalid] = useState(false);
  const [search,        setSearch]        = useState('');
  const [subgroupFilter,setSubgroupFilter] = useState('All');
  const [fellowshipFilter, setFellowshipFilter] = useState('All');
  const [statusFilter,  setStatusFilter]  = useState('all');

  useEffect(() => {
    if (!token) { setInvalid(true); return; }

    function fetchData() {
      supabase.rpc('get_public_registration_data', { p_token: token })
        .range(0, 9999)
        .then(({ data: rows, error }) => {
          if (error || !rows || rows.length === 0) {
            setInvalid(true);
            setData([]);
          } else {
            setData(rows);
          }
        });
    }

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [token]);

  const subgroups = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.map(r => r.subgroup).filter(Boolean))].sort();
  }, [data]);

  const fellowships = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.map(r => r.fellowship).filter(Boolean))].sort();
  }, [data]);

  const stats = useMemo(() => {
    if (!data) return { total: 0, not_registered: 0, registered_outstanding: 0, confirmed: 0 };
    const s = { total: 0, not_registered: 0, registered_outstanding: 0, confirmed: 0 };
    data.forEach(r => { s.total++; s[r.registration_status]++; });
    return s;
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data;
    if (statusFilter !== 'all')  rows = rows.filter(r => r.registration_status === statusFilter);
    if (subgroupFilter !== 'All') rows = rows.filter(r => r.subgroup === subgroupFilter);
    if (fellowshipFilter !== 'All') rows = rows.filter(r => r.fellowship === fellowshipFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        (r.full_name  || '').toLowerCase().includes(q) ||
        (r.fellowship || '').toLowerCase().includes(q) ||
        (r.subgroup   || '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [data, statusFilter, subgroupFilter, fellowshipFilter, search]);

  if (data === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.cream, fontFamily: 'Inter, sans-serif' }}>
        <div style={{ color: C.mute, fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  if (invalid || data.length === 0) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.cream, fontFamily: 'Inter, sans-serif' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Invalid or expired link</div>
          <div style={{ fontSize: 14, color: C.mute }}>
            This registration link is no longer valid. Contact the event administrator for an updated link.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.cream, fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ background: C.purple, padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 18, color: '#fff' }}>This Is It 2.0</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>Registration Overview — Read Only</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20 }}>
          Public View
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>

        {/* ── Stats strip ───────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20,
          background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, padding: '16px 22px',
        }}>
          {[
            { key: 'not_registered',         color: C.red,   label: 'Not Registered' },
            { key: 'registered_outstanding',  color: C.amber, label: 'Outstanding' },
            { key: 'confirmed',              color: C.green, label: 'Confirmed' },
          ].map(({ key, color, label }) => (
            <div
              key={key}
              onClick={() => setStatusFilter(f => f === key ? 'all' : key)}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 120 }}
            >
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 22, color: statusFilter === key ? color : C.ink, lineHeight: 1 }}>
                  {stats[key]}
                </div>
                <div style={{ fontSize: 11, color: C.mute, marginTop: 2 }}>{label}</div>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: C.mute }}>Total:</div>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 20, color: C.ink }}>{stats.total}</div>
          </div>
        </div>

        {/* ── Status filter pills ───────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {[
            { key: 'all',                   label: `All (${stats.total})`,                              color: C.purple },
            { key: 'not_registered',        label: `Not Registered (${stats.not_registered})`,         color: C.red },
            { key: 'registered_outstanding',label: `Outstanding (${stats.registered_outstanding})`,    color: C.amber },
            { key: 'confirmed',             label: `Confirmed (${stats.confirmed})`,                   color: C.green },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => setStatusFilter(p.key)}
              style={{
                padding: '5px 13px', borderRadius: 20, fontSize: 12.5, fontWeight: 600,
                fontFamily: 'Inter', cursor: 'pointer', border: 'none',
                background: statusFilter === p.key ? p.color : '#F1EEF6',
                color: statusFilter === p.key ? '#fff' : p.color,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* ── Subgroup pills ────────────────────────────────────────────── */}
        {subgroups.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {['All', ...subgroups].map(sg => (
              <button
                key={sg}
                onClick={() => setSubgroupFilter(sg)}
                style={{
                  padding: '5px 13px', borderRadius: 20, fontSize: 12.5, fontWeight: 600,
                  fontFamily: 'Inter', cursor: 'pointer', border: 'none',
                  background: subgroupFilter === sg ? C.purple : '#F1EEF6',
                  color: subgroupFilter === sg ? '#fff' : C.mute,
                }}
              >
                {sg}
              </button>
            ))}
          </div>
        )}

        {/* ── Search + fellowship ───────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, subgroup, fellowship…"
            style={{
              flex: 1, minWidth: 180, padding: '8px 12px', borderRadius: 8,
              border: `1px solid ${C.line}`, fontFamily: 'Inter', fontSize: 13, outline: 'none', color: C.ink,
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
              fontFamily: 'Inter', fontSize: 13,
              color: fellowshipFilter === 'All' ? C.mute : C.ink,
              background: fellowshipFilter !== 'All' ? '#F1EEF6' : '#fff', cursor: 'pointer',
            }}
          >
            <option value="All">All fellowships</option>
            {fellowships.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          {fellowshipFilter !== 'All' && (
            <button onClick={() => setFellowshipFilter('All')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mute, fontSize: 18, lineHeight: 1 }}>×</button>
          )}
          <div style={{ fontSize: 12, color: C.mute, whiteSpace: 'nowrap' }}>{filtered.length} of {stats.total}</div>
        </div>

        {/* ── Table ─────────────────────────────────────────────────────── */}
        <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {['#', 'Name', 'Subgroup', 'Fellowship', 'Status'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase',
                      color: C.mute, fontWeight: 600, padding: '8px 10px', borderBottom: `1px solid ${C.line}`,
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const st = STATUS[r.registration_status] || STATUS.not_registered;
                  return (
                    <tr key={r.row_num} style={{ background: st.bg, borderLeft: `4px solid ${st.color}` }}>
                      <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: C.mute, width: 36 }}>
                        {r.row_num}
                      </td>
                      <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontWeight: 600, fontSize: 13 }}>
                        {r.full_name || '—'}
                      </td>
                      <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontSize: 12.5, color: C.mute }}>
                        {r.subgroup || '—'}
                      </td>
                      <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontSize: 12.5, color: C.mute }}>
                        {r.fellowship || '—'}
                      </td>
                      <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}` }}>
                        <StatusBadge status={r.registration_status} />
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: C.mute, background: C.paper }}>
                      {statusFilter !== 'all' || subgroupFilter !== 'All' || fellowshipFilter !== 'All' || search.trim()
                        ? <span>No people match the current filters. <button onClick={() => { setStatusFilter('all'); setSubgroupFilter('All'); setFellowshipFilter('All'); setSearch(''); }} style={{ background: 'none', border: 'none', color: C.purple, fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: 'Inter' }}>Clear all filters</button></span>
                        : 'No data available yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: C.mute }}>
          BLW Canada Nexus · This Is It 2.0 · Shared registration view
        </div>
      </div>
    </div>
  );
}
