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
  const [eventName, setEventName] = useState('This Is It 2.0');

  useEffect(() => {
    supabase.from('event_configs').select('event_name').eq('is_active', true).maybeSingle()
      .then(({ data }) => { if (data?.event_name) setEventName(data.event_name); });
  }, []);

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
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 18, color: '#fff' }}>{eventName}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>Registration Overview — Read Only</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20 }}>
          Public View
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 12px', '@media (min-width: 640px)': { padding: '24px 16px' } }}>

        {/* ── Stats strip ───────────────────────────────────────────────── */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12, marginBottom: 16,
          background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 12px',
        }}>
          {[
            { key: 'not_registered',         color: C.red,   label: 'Not Reg.' },
            { key: 'registered_outstanding',  color: C.amber, label: 'Outst.' },
            { key: 'confirmed',              color: C.green, label: 'Conf.' },
          ].map(({ key, color, label }) => (
            <div
              key={key}
              onClick={() => setStatusFilter(f => f === key ? 'all' : key)}
              style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px' }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', color: statusFilter === key ? color : C.ink, lineHeight: 1, textAlign: 'center' }}>
                {stats[key]}
              </div>
              <div style={{ fontSize: '10px', color: C.mute, marginTop: 1, textAlign: 'center', lineHeight: 1.2 }}>{label}</div>
            </div>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px' }}>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '10px', color: C.mute, textAlign: 'center' }}>Total</div>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', color: C.ink }}>{stats.total}</div>
          </div>
        </div>

        {/* ── Status filter pills ───────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {[
            { key: 'all',                   label: `All`,                              count: stats.total, color: C.purple },
            { key: 'not_registered',        label: `Not Reg.`,         count: stats.not_registered, color: C.red },
            { key: 'registered_outstanding',label: `Outst.`,    count: stats.registered_outstanding, color: C.amber },
            { key: 'confirmed',             label: `Conf.`,                   count: stats.confirmed, color: C.green },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => setStatusFilter(p.key)}
              title={p.label}
              style={{
                padding: '6px 12px', borderRadius: 20, fontSize: '11px', fontWeight: 600,
                fontFamily: 'Inter', cursor: 'pointer', border: 'none', whiteSpace: 'nowrap',
                background: statusFilter === p.key ? p.color : '#F1EEF6',
                color: statusFilter === p.key ? '#fff' : p.color,
              }}
            >
              {p.label} ({p.count})
            </button>
          ))}
        </div>

        {/* ── Subgroup pills ────────────────────────────────────────────── */}
        {subgroups.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {['All', ...subgroups].map(sg => (
              <button
                key={sg}
                onClick={() => setSubgroupFilter(sg)}
                title={sg}
                style={{
                  padding: '6px 12px', borderRadius: 20, fontSize: '11px', fontWeight: 600,
                  fontFamily: 'Inter', cursor: 'pointer', border: 'none', whiteSpace: 'nowrap',
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
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              style={{
                flex: 1, minWidth: 0, padding: '8px 12px', borderRadius: 8,
                border: `1px solid ${C.line}`, fontFamily: 'Inter', fontSize: '13px', outline: 'none', color: C.ink,
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mute, fontSize: '18px', lineHeight: 1, padding: '4px' }}>×</button>
            )}
          </div>
          <select
            value={fellowshipFilter}
            onChange={e => setFellowshipFilter(e.target.value)}
            style={{
              padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.line}`,
              fontFamily: 'Inter', fontSize: '13px',
              color: fellowshipFilter === 'All' ? C.mute : C.ink,
              background: fellowshipFilter !== 'All' ? '#F1EEF6' : '#fff', cursor: 'pointer',
            }}
          >
            <option value="All">Fellowships</option>
            {fellowships.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          {fellowshipFilter !== 'All' && (
            <button onClick={() => setFellowshipFilter('All')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mute, fontSize: '18px', lineHeight: 1, padding: '4px' }}>×</button>
          )}
          <div style={{ fontSize: '12px', color: C.mute, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>{filtered.length} of {stats.total}</div>
        </div>

        {/* ── Table / Card View ─────────────────────────────────────────── */}
        {filtered.length === 0 ? (
          <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, padding: '32px 16px', textAlign: 'center' }}>
            <div style={{ color: C.mute, fontSize: '14px' }}>
              {statusFilter !== 'all' || subgroupFilter !== 'All' || fellowshipFilter !== 'All' || search.trim()
                ? <span>No people match the filters. <button onClick={() => { setStatusFilter('all'); setSubgroupFilter('All'); setFellowshipFilter('All'); setSearch(''); }} style={{ background: 'none', border: 'none', color: C.purple, fontWeight: 600, cursor: 'pointer', fontSize: '13px', fontFamily: 'Inter' }}>Clear all</button></span>
                : 'No data available yet.'}
            </div>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', display: 'none' }} className="sm:block">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      {['#', 'Name', 'Subgroup', 'Fellowship', 'Status'].map(h => (
                        <th key={h} style={{
                          textAlign: 'left', fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '10.5px', letterSpacing: '0.05em', textTransform: 'uppercase',
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
                          <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: C.mute, width: 36 }}>
                            {r.row_num}
                          </td>
                          <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontWeight: 600, fontSize: '13px' }}>
                            {r.full_name || '—'}
                          </td>
                          <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontSize: '12.5px', color: C.mute }}>
                            {r.subgroup || '—'}
                          </td>
                          <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, fontSize: '12.5px', color: C.mute }}>
                            {r.fellowship || '—'}
                          </td>
                          <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}` }}>
                            <StatusBadge status={r.registration_status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div style={{ display: 'grid', gap: 12 }} className="sm:hidden">
              {filtered.map(r => {
                const st = STATUS[r.registration_status] || STATUS.not_registered;
                return (
                  <div key={r.row_num} style={{ background: st.bg, border: `1px solid ${st.color}`, borderRadius: 12, padding: '12px', borderLeft: `4px solid ${st.color}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: C.ink, marginBottom: 2 }}>
                          {r.full_name || '—'}
                        </div>
                        <div style={{ fontSize: '12px', color: C.mute }}>
                          #{r.row_num}
                        </div>
                      </div>
                      <StatusBadge status={r.registration_status} />
                    </div>
                    {r.subgroup && (
                      <div style={{ fontSize: '12px', color: C.mute, marginBottom: 4 }}>
                        <strong>Subgroup:</strong> {r.subgroup}
                      </div>
                    )}
                    {r.fellowship && (
                      <div style={{ fontSize: '12px', color: C.mute }}>
                        <strong>Fellowship:</strong> {r.fellowship}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: C.mute }}>
          BLW Canada Nexus · {eventName} · Shared registration view
        </div>
      </div>
    </div>
  );
}
