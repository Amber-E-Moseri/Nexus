import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Upload, Users, Plane, CheckCircle2, Circle, Filter, Download, RefreshCw, ChevronDown, ChevronRight, Settings, AlertCircle, Home, Church, Droplets, DoorOpen, Trash2, Plus, Crown } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ---------- brand tokens ----------
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

const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap';

const DEFAULT_EXEMPT = ['Manitoba', 'Winnipeg', 'CMU'];

// ---------- header normalization ----------
const ALIASES = {
  submittedAt: [/submitted/i, /timestamp/i],
  firstName: [/^first.?name/i],
  lastName: [/^last.?name/i],
  email: [/email/i],
  phone: [/phone/i],
  gender: [/gender/i],
  designation: [/designation/i],
  subgroup: [/subgroup/i, /unit/i],
  fellowship: [/fellowship/i],
  shirtSize: [/shirt/i],
  foundationStatus: [/foundation/i],
  baptism: [/baptis/i],
  allergies: [/allerg|diet/i],
  team: [/team/i],
  leadership: [/leader/i, /position/i, /role/i],
  arrivalDate: [/arrival.*date/i],
  arrivalFlight: [/arrival.*flight/i],
  arrivalTime: [/arrival.*time/i],
  departureDate: [/depart.*date/i],
  departureFlight: [/depart.*flight/i],
  departureTime: [/depart.*time/i],
};

function normalizeRow(row) {
  const out = {};
  const keys = Object.keys(row);
  for (const field in ALIASES) {
    const pats = ALIASES[field];
    const match = keys.find(k => pats.some(p => p.test(k)));
    out[field] = match ? (row[match] || '').toString().trim() : '';
  }
  out.email = out.email.toLowerCase();
  out.fullName = [out.firstName, out.lastName].filter(Boolean).join(' ');
  out._raw = row;
  return out;
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t').length > 1
    ? lines[0].split('\t')
    : lines[0].split(',');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.includes('\t')
      ? line.split('\t')
      : parseCSVLine(line);

    const row = {};
    headers.forEach((header, idx) => {
      row[header.trim()] = (values[idx] || '').trim();
    });

    rows.push(row);
  }

  return rows.map(normalizeRow).filter(r => r.email);
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

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

function isExempt(fellowship, exemptList) {
  if (!fellowship) return false;
  return exemptList.some(ex => fellowship.toLowerCase().includes(ex.toLowerCase()));
}

// ---------- storage helpers ----------
async function loadKey(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch { return fallback; }
}
async function saveKey(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.error('save failed', key, e); }
}

// ---------- UI atoms ----------
function Pill({ tone = 'mute', children }) {
  const map = {
    green: [C.greenBg, C.green], amber: [C.amberBg, C.amber], red: [C.redBg, C.red],
    blue: [C.blueBg, C.blue], mute: ['#F1EEF6', C.mute],
  };
  const [bg, fg] = map[tone];
  return <span style={{ background: bg, color: fg, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, letterSpacing: 0.2, whiteSpace: 'nowrap' }}>{children}</span>;
}

function ProgressBar({ pct, tone }) {
  const color = tone === 'green' ? C.green : tone === 'amber' ? C.amber : tone === 'red' ? C.red : C.purple;
  return (
    <div style={{ width: '100%', height: 6, background: '#EEE8F7', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, transition: 'width .4s ease' }} />
    </div>
  );
}

function statusTone(pct) { return pct >= 95 ? 'green' : pct >= 75 ? 'amber' : 'red'; }
function statusLabel(pct) { return pct >= 95 ? 'On track' : pct >= 75 ? 'Tracking' : 'Behind'; }

function Card({ children, style, ...rest }) {
  return <div {...rest} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20, ...style }}>{children}</div>;
}

function Btn({ children, onClick, tone = 'primary', small, disabled }) {
  const styles = {
    primary: { background: C.purple, color: '#fff', border: `1px solid ${C.purple}` },
    ghost: { background: '#fff', color: C.purple, border: `1px solid ${C.line}` },
    subtle: { background: '#F1EEF6', color: C.purpleDeep, border: '1px solid transparent' },
  }[tone];
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...styles, fontFamily: 'Inter', fontWeight: 600, fontSize: small ? 12.5 : 13.5,
      padding: small ? '6px 12px' : '9px 16px', borderRadius: 9, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'opacity .15s',
    }}>{children}</button>
  );
}

const TABS = [
  { key: 'overview', label: 'Overview', icon: Home },
  { key: 'working', label: 'Working List', icon: Users },
  { key: 'confirm', label: 'Confirmations', icon: CheckCircle2 },
  { key: 'transport', label: 'Transportation', icon: Plane },
  { key: 'discipleship', label: 'Foundation & Baptism', icon: Church },
  { key: 'compliance', label: 'Delegate Compliance', icon: AlertCircle },
  { key: 'rooms', label: 'Room Assignments', icon: DoorOpen },
  { key: 'import', label: 'Import Data', icon: Upload },
];

export default function App() {
  const [tab, setTab] = useState('overview');
  const [roster, setRoster] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [flights, setFlights] = useState([]);
  const [confirmations, setConfirmations] = useState({}); // email -> {inState, notes}
  const [targets, setTargets] = useState({}); // subgroup -> {reg, flight}
  const [exempt, setExempt] = useState(DEFAULT_EXEMPT);
  const [loaded, setLoaded] = useState(false);
  const [lastImport, setLastImport] = useState({ roster: null, registrations: null, flights: null });
  const [subgroupFilter, setSubgroupFilter] = useState('All');
  const [rooms, setRooms] = useState([]);
  const [numRooms, setNumRooms] = useState(5);
  const [peoplePerRoom, setPeoplePerRoom] = useState(2);

  useEffect(() => {
    (async () => {
      const [r, reg, fl, conf, tg, ex, li] = await Promise.all([
        loadKey('roster', []), loadKey('registrations', []), loadKey('flights', []),
        loadKey('confirmations', {}), loadKey('targets', {}), loadKey('exempt-fellowships', DEFAULT_EXEMPT),
        loadKey('last-import', { roster: null, registrations: null, flights: null }),
      ]);

      // Fetch roster from Supabase
      let finalRoster = r;
      if (!r || r.length === 0) {
        try {
          const { data: dbRoster } = await supabase
            .from('roster')
            .select('*')
            .order('last_name', { ascending: true });
          finalRoster = (dbRoster || []).map(m => ({
            email: m.email,
            fullName: m.full_name,
            firstName: m.first_name,
            lastName: m.last_name,
            subgroup: m.subgroup,
            leadership: m.leadership || '',
          }));
        } catch (e) {
          console.error('Failed to fetch roster from Supabase:', e);
        }
      }

      // Load exempt fellowships from Supabase (overrides localStorage if present)
      let finalExempt = ex;
      try {
        const { data: configRow } = await supabase
          .from('registration_config')
          .select('value')
          .eq('key', 'exempt_fellowships')
          .maybeSingle();
        if (configRow?.value) finalExempt = configRow.value;
      } catch { /* table may not exist yet; use localStorage fallback */ }

      // Fetch registrations from Supabase if not already loaded from localStorage
      let finalReg = reg;
      if (!reg || reg.length === 0) {
        try {
          const { data: dbRegs } = await supabase
            .from('registrations')
            .select('*')
            .order('submitted_at', { ascending: false });
          // Rename snake_case columns to camelCase for compatibility
          finalReg = (dbRegs || []).map(r => ({
            email: r.email,
            fullName: r.full_name,
            firstName: r.first_name,
            lastName: r.last_name,
            gender: r.gender,
            subgroup: r.subgroup,
            fellowship: r.fellowship,
            phone: r.phone,
            designation: r.designation,
            shirtSize: r.shirt_size,
            foundationStatus: r.foundation_status,
            baptism: r.baptism,
            allergies: r.allergies,
            team: r.team,
            leadership: r.leadership,
            arrivalDate: r.arrival_date,
            arrivalTime: r.arrival_time,
            arrivalFlight: r.arrival_flight,
            departureDate: r.departure_date,
            departureTime: r.departure_time,
            departureFlight: r.departure_flight,
            submittedAt: r.submitted_at,
          }));
        } catch (e) {
          console.error('Failed to fetch registrations from Supabase:', e);
        }
      }

      setRoster(finalRoster); setRegistrations(finalReg); setFlights(fl); setConfirmations(conf); setTargets(tg); setExempt(finalExempt); setLastImport(li);

      // Load room assignments
      try {
        const stored = await loadKey('room-assignments', null);
        if (stored) {
          setRooms(stored.rooms || []);
          setNumRooms(stored.numRooms || 5);
          setPeoplePerRoom(stored.peoplePerRoom || 2);
        } else {
          initializeRooms(5, 2);
        }
      } catch (e) {
        initializeRooms(5, 2);
      }

      setLoaded(true);
    })();
  }, []);

  // ---------- derived: merged registrant records ----------
  const regByEmail = useMemo(() => Object.fromEntries(registrations.map(r => [r.email, r])), [registrations]);
  const flightByEmail = useMemo(() => Object.fromEntries(flights.map(f => [f.email, f])), [flights]);

  const merged = useMemo(() => registrations.map(r => {
    const flight = flightByEmail[r.email];
    const exemptFlag = isExempt(r.fellowship, exempt);
    const hasFlight = !!(flight && flight.arrivalDate);
    const conf = confirmations[r.email] || {};
    return {
      ...r,
      flight: flight || null,
      hasFlight,
      exempt: exemptFlag,
      needsFlight: !exemptFlag,
      inStateConfirmed: !!conf.inState,
      fullyConfirmed: exemptFlag ? !!conf.inState : hasFlight,
    };
  }), [registrations, flightByEmail, exempt, confirmations]);

  const subgroups = useMemo(() => {
    const s = new Set([...roster.map(r => r.subgroup), ...registrations.map(r => r.subgroup)]);
    return [...s].filter(Boolean).sort();
  }, [roster, registrations]);

  const bySubgroup = useMemo(() => {
    const out = {};
    subgroups.forEach(sg => { out[sg] = { total: 0, flights: 0, confirmed: 0 }; });
    merged.forEach(r => {
      if (!out[r.subgroup]) out[r.subgroup] = { total: 0, flights: 0, confirmed: 0 };
      out[r.subgroup].total++;
      if (r.hasFlight) out[r.subgroup].flights++;
      if (r.fullyConfirmed) out[r.subgroup].confirmed++;
    });
    return out;
  }, [merged, subgroups]);

  const totalRegs = registrations.length;
  const totalRegTarget = Object.values(targets).reduce((s, t) => s + (Number(t.reg) || 0), 0);
  const totalFlights = merged.filter(r => r.hasFlight).length;
  const totalFlightTarget = Object.values(targets).reduce((s, t) => s + (Number(t.flight) || 0), 0);

  const workingList = useMemo(() => {
    return roster.filter(p => !regByEmail[p.email]);
  }, [roster, regByEmail]);

  // ---------- persistence actions ----------
  const setTarget = useCallback((sg, field, val) => {
    setTargets(prev => {
      const next = { ...prev, [sg]: { ...(prev[sg] || {}), [field]: val } };
      saveKey('targets', next);
      return next;
    });
  }, []);

  const toggleConfirm = useCallback((email) => {
    setConfirmations(prev => {
      const cur = prev[email] || {};
      const next = { ...prev, [email]: { ...cur, inState: !cur.inState } };
      saveKey('confirmations', next);
      return next;
    });
  }, []);

  const updateExempt = useCallback(async (list) => {
    setExempt(list);
    saveKey('exempt-fellowships', list);
    try {
      await supabase.from('registration_config').upsert({ key: 'exempt_fellowships', value: list, updated_at: new Date().toISOString() });
    } catch { /* silent — localStorage still updated */ }
  }, []);

  function initializeRooms(count, capacity) {
    const newRooms = Array.from({ length: count }, (_, i) => ({
      id: `room-${Date.now()}-${i}`,
      name: `Room ${i + 1}`,
      capacity,
      people: [],
    }));
    setRooms(newRooms);
    saveKey('room-assignments', { rooms: newRooms, numRooms: count, peoplePerRoom: capacity });
  }

  function saveRoomData(roomsToSave, numR, perRoom) {
    saveKey('room-assignments', { rooms: roomsToSave, numRooms: numR, peoplePerRoom: perRoom });
  }

  function handleAddRoom(newRoomName, capacity) {
    const newRoom = {
      id: `room-${Date.now()}`,
      name: newRoomName || `Room ${rooms.length + 1}`,
      capacity: Math.max(1, Number(capacity) || peoplePerRoom),
      people: [],
    };
    const updated = [...rooms, newRoom];
    setRooms(updated);
    saveRoomData(updated, numRooms, peoplePerRoom);
  }

  function handleUpdateRoomCapacity(roomId, newCapacity) {
    const cap = Math.max(1, Number(newCapacity) || 1);
    const updated = rooms.map(r => r.id === roomId ? { ...r, capacity: cap } : r);
    setRooms(updated);
    saveRoomData(updated, numRooms, peoplePerRoom);
  }

  function handleSetRoomHead(roomId, personEmail) {
    const updated = rooms.map(r =>
      r.id === roomId ? { ...r, roomHead: r.roomHead === personEmail ? null : personEmail } : r
    );
    setRooms(updated);
    saveRoomData(updated, numRooms, peoplePerRoom);
  }

  function handleBulkCreateRooms(prefix, count, capacity) {
    const newRooms = Array.from({ length: count }, (_, i) => ({
      id: `room-${Date.now()}-${i}`,
      name: `${prefix} ${rooms.length + i + 1}`,
      capacity: Math.max(1, Number(capacity) || 2),
      people: [],
    }));
    const updated = [...rooms, ...newRooms];
    setRooms(updated);
    saveRoomData(updated, updated.length, peoplePerRoom);
  }

  function handleDeleteRoom(roomId) {
    const updated = rooms.filter(r => r.id !== roomId);
    setRooms(updated);
    saveRoomData(updated, numRooms, peoplePerRoom);
  }

  function handleAssignPerson(person, roomId) {
    const updated = rooms.map(r => ({
      ...r,
      people: r.people.filter(p => p.email !== person.email),
    }));
    const targetRoom = updated.find(r => r.id === roomId);
    if (targetRoom && targetRoom.people.length < targetRoom.capacity) {
      targetRoom.people.push(person);
    }
    setRooms(updated);
    saveRoomData(updated, numRooms, peoplePerRoom);
  }

  function handleRemovePersonFromRoom(person, roomId) {
    const updated = rooms.map(r =>
      r.id === roomId
        ? { ...r, people: r.people.filter(p => p.email !== person.email) }
        : r
    );
    setRooms(updated);
    saveRoomData(updated, numRooms, peoplePerRoom);
  }

  async function handleImport(kind, text) {
    if (!text || !text.trim()) return;
    const rows = parseCSV(text);
    const now = new Date().toISOString();
    if (kind === 'roster') { setRoster(rows); await saveKey('roster', rows); }
    if (kind === 'registrations') { setRegistrations(rows); await saveKey('registrations', rows); }
    if (kind === 'flights') { setFlights(rows); await saveKey('flights', rows); }
    const li = { ...lastImport, [kind]: now };
    setLastImport(li); await saveKey('last-import', li);
  }

  if (!loaded) {
    return <div style={{ padding: 60, fontFamily: 'Inter', color: C.mute }}>Loading…</div>;
  }

  return (
    <div style={{ background: C.cream, minHeight: '100%', fontFamily: 'Inter, sans-serif', color: C.ink }}>
      <style>{`
        @import url('${FONT_LINK}');
        * { box-sizing: border-box; }
        table { border-collapse: collapse; width: 100%; }
        th { text-align: left; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: 0.05em; text-transform: uppercase; color: ${C.mute}; font-weight: 600; padding: 8px 10px; border-bottom: 1px solid ${C.line}; }
        td { padding: 10px; border-bottom: 1px solid ${C.line}; font-size: 13px; }
        tr:hover td { background: #FAF8FE; }
        input[type=checkbox] { width: 17px; height: 17px; accent-color: ${C.purple}; cursor: pointer; }
        select, input[type=text], input[type=number], textarea { font-family: Inter; border: 1px solid ${C.line}; border-radius: 7px; padding: 6px 9px; font-size: 13px; background: #fff; }
        ::-webkit-scrollbar { height: 8px; width: 8px; }
        ::-webkit-scrollbar-thumb { background: ${C.line}; border-radius: 4px; }
      `}</style>

      {/* header */}
      <div style={{ background: C.purple, padding: '22px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 20, color: '#fff', letterSpacing: -0.3 }}>This Is It 2.0</div>
        </div>
        <div style={{ display: 'flex', gap: 18, fontFamily: 'JetBrains Mono', fontSize: 11, color: '#D8CCF0' }}>
          <span>roster: {lastImport.roster ? new Date(lastImport.roster).toLocaleDateString() : '—'}</span>
          <span>reg: {lastImport.registrations ? new Date(lastImport.registrations).toLocaleDateString() : '—'}</span>
          <span>flights: {lastImport.flights ? new Date(lastImport.flights).toLocaleDateString() : '—'}</span>
        </div>
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '14px 32px 0', borderBottom: `1px solid ${C.line}`, background: C.paper, overflowX: 'auto' }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', background: 'none', border: 'none',
              borderBottom: active ? `2px solid ${C.purple}` : '2px solid transparent', color: active ? C.purple : C.mute,
              fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'Inter', whiteSpace: 'nowrap',
            }}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ padding: 28, maxWidth: 1280, margin: '0 auto' }}>
        {tab === 'overview' && (
          <OverviewTab {...{ totalRegs, totalRegTarget, totalFlights, totalFlightTarget, subgroups, bySubgroup, targets, setTarget, merged, exempt, updateExempt }} />
        )}
        {tab === 'working' && <WorkingListTab {...{ workingList, subgroupFilter, setSubgroupFilter, subgroups }} />}
        {tab === 'confirm' && <ConfirmTab {...{ merged, subgroupFilter, setSubgroupFilter, subgroups, toggleConfirm }} />}
        {tab === 'transport' && <TransportTab {...{ merged, exempt }} />}
        {tab === 'discipleship' && <DiscipleshipTab {...{ merged, subgroupFilter, setSubgroupFilter, subgroups }} />}
        {tab === 'compliance' && <DelegateComplianceTab {...{ merged, subgroupFilter, setSubgroupFilter, subgroups }} />}
        {tab === 'rooms' && <RoomAssignmentTab {...{ merged, rooms, handleAddRoom, handleBulkCreateRooms, handleDeleteRoom, handleAssignPerson, handleRemovePersonFromRoom, handleUpdateRoomCapacity, handleSetRoomHead, peoplePerRoom }} />}
        {tab === 'import' && <ImportTab {...{ handleImport, roster, registrations, flights, exempt, updateExempt, lastImport }} />}
      </div>
    </div>
  );
}

// ============ OVERVIEW ============
function OverviewTab({ totalRegs, totalRegTarget, totalFlights, totalFlightTarget, subgroups, bySubgroup, targets, setTarget, merged, exempt, updateExempt }) {
  const [showSettings, setShowSettings] = useState(false);
  const regPct = totalRegTarget ? Math.round((totalRegs / totalRegTarget) * 100) : 0;
  const flightPct = totalFlightTarget ? Math.round((totalFlights / totalFlightTarget) * 100) : 0;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <SummaryCard label="Total registrations" current={totalRegs} target={totalRegTarget} pct={regPct} />
        <SummaryCard label="Flights purchased" current={totalFlights} target={totalFlightTarget} pct={flightPct} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, margin: 0 }}>By subgroup</h2>
        <Btn tone="ghost" small onClick={() => setShowSettings(s => !s)}><Settings size={13} /> Exempt fellowships</Btn>
      </div>

      {showSettings && (
        <Card style={{ marginBottom: 16, background: '#FAF8FE' }}>
          <div style={{ fontSize: 12.5, color: C.mute, marginBottom: 8 }}>Fellowships in this list don't need flights to count as fully confirmed (local/no-flight groups).</div>
          <ExemptEditor exempt={exempt} onChange={updateExempt} />
        </Card>
      )}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', minWidth: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Subgroup</th>
              <th>Registration target</th>
              <th>Registrations</th>
              <th>Flight target</th>
              <th>Flights</th>
              <th>Difference (reg)</th>
              <th>Difference (flights)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {subgroups.map(sg => {
              const s = bySubgroup[sg] || { total: 0, flights: 0 };
              const t = targets[sg] || {};
              const regTarget = Number(t.reg) || 0;
              const flightTarget = Number(t.flight) || 0;
              const regPctSg = regTarget ? Math.round((s.total / regTarget) * 100) : 0;
              const tone = statusTone(regPctSg);
              return (
                <tr key={sg}>
                  <td style={{ fontWeight: 600 }}>{sg}</td>
                  <td>
                    <input type="number" style={{ width: 60 }} value={t.reg ?? ''} placeholder="0"
                      onChange={e => setTarget(sg, 'reg', e.target.value)} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 110 }}>
                      <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12.5 }}>{s.total}</span>
                      <div style={{ flex: 1 }}><ProgressBar pct={regPctSg} tone={tone} /></div>
                    </div>
                  </td>
                  <td>
                    <input type="number" style={{ width: 60 }} value={t.flight ?? ''} placeholder="0"
                      onChange={e => setTarget(sg, 'flight', e.target.value)} />
                  </td>
                  <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12.5 }}>{s.flights}</td>
                  <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12.5, color: regTarget - s.total > 0 ? C.red : C.green }}>
                    {regTarget ? (regTarget - s.total > 0 ? `−${regTarget - s.total}` : `+${s.total - regTarget}`) : '—'}
                  </td>
                  <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12.5, color: flightTarget - s.flights > 0 ? C.red : C.green }}>
                    {flightTarget ? (flightTarget - s.flights > 0 ? `−${flightTarget - s.flights}` : `+${s.flights - flightTarget}`) : '—'}
                  </td>
                  <td><Pill tone={tone}>{statusLabel(regPctSg)}</Pill></td>
                </tr>
              );
            })}
            {subgroups.length === 0 && <tr><td colSpan={8} style={{ color: C.mute, textAlign: 'center', padding: 24 }}>Import registrations to see subgroup breakdown.</td></tr>}
          </tbody>
        </table>
        </div>
      </Card>

      <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Btn tone="ghost" small onClick={() => downloadCSV('subgroup-overview.csv', subgroups.map(sg => ({
          subgroup: sg, regTarget: targets[sg]?.reg || 0, regs: bySubgroup[sg]?.total || 0,
          flightTarget: targets[sg]?.flight || 0, flights: bySubgroup[sg]?.flights || 0,
        })), [
          { key: 'subgroup', label: 'Subgroup' }, { key: 'regTarget', label: 'Reg Target' }, { key: 'regs', label: 'Registrations' },
          { key: 'flightTarget', label: 'Flight Target' }, { key: 'flights', label: 'Flights' },
        ])}><Download size={13} /> Export overview</Btn>
      </div>
    </div>
  );
}

function SummaryCard({ label, current, target, pct }) {
  const tone = statusTone(pct);
  return (
    <Card>
      <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: C.mute, textTransform: 'uppercase', letterSpacing: 0.06 }}>{label}</div>
      <div style={{ fontFamily: 'Space Grotesk', fontSize: 30, fontWeight: 700, margin: '6px 0 10px' }}>
        {current} <span style={{ color: C.mute, fontWeight: 500, fontSize: 18 }}>/ {target || '—'}</span>
      </div>
      <ProgressBar pct={pct} tone={tone} />
      <div style={{ marginTop: 8, fontSize: 12, color: C.mute }}>{target ? `${pct}% of target` : 'Set targets in the table below'}</div>
    </Card>
  );
}

function ExemptEditor({ exempt, onChange }) {
  const [text, setText] = useState(exempt.join(', '));
  const [saved, setSaved] = useState(false);
  useEffect(() => setText(exempt.join(', ')), [exempt]);
  function handleSave() {
    onChange(text.split(',').map(s => s.trim()).filter(Boolean));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="text" style={{ flex: 1 }} value={text} onChange={e => { setText(e.target.value); setSaved(false); }} onKeyDown={e => e.key === 'Enter' && handleSave()} />
      <Btn small onClick={handleSave}>{saved ? '✓ Saved' : 'Save'}</Btn>
    </div>
  );
}

// ============ WORKING LIST ============
function WorkingListTab({ workingList, subgroupFilter, setSubgroupFilter, subgroups }) {
  const filtered = workingList.filter(p => subgroupFilter === 'All' || p.subgroup === subgroupFilter);
  const byGroup = useMemo(() => {
    const g = {};
    filtered.forEach(p => { (g[p.subgroup || 'Unassigned'] ||= []).push(p); });
    return g;
  }, [filtered]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, margin: 0 }}>Working list</h2>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3 }}>On the roster but not yet registered — {filtered.length} people to follow up with.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <SubgroupSelect value={subgroupFilter} onChange={setSubgroupFilter} subgroups={subgroups} />
          <Btn tone="ghost" small onClick={() => downloadCSV('working-list.csv', filtered, [
            { key: 'firstName', label: 'First Name' }, { key: 'lastName', label: 'Last Name' },
            { key: 'subgroup', label: 'Subgroup' }, { key: 'leadership', label: 'Leadership Position' }, { key: 'email', label: 'Email' },
          ])}><Download size={13} /> Export</Btn>
        </div>
      </div>

      {Object.keys(byGroup).length === 0 && <Card><div style={{ color: C.mute, textAlign: 'center', padding: 20 }}>Nobody outstanding — either everyone on the roster has registered, or the roster hasn't been imported yet.</div></Card>}

      {Object.entries(byGroup).sort().map(([sg, people]) => (
        <Card key={sg} style={{ marginBottom: 14, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: '#FAF8FE', borderBottom: `1px solid ${C.line}`, fontWeight: 600, fontSize: 13.5, display: 'flex', justifyContent: 'space-between' }}>
            <span>{sg}</span><Pill tone="mute">{people.length} outstanding</Pill>
          </div>
          <table>
            <thead><tr><th>Name</th><th>Leadership</th><th>Email</th></tr></thead>
            <tbody>
              {people.map((p, i) => (
                <tr key={i}><td>{p.fullName || `${p.firstName} ${p.lastName}`}</td><td>{p.leadership || '—'}</td><td style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>{p.email}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}

function SubgroupSelect({ value, onChange, subgroups }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      <option value="All">All subgroups</option>
      {subgroups.map(sg => <option key={sg} value={sg}>{sg}</option>)}
    </select>
  );
}

// ============ CONFIRMATIONS ============
function ConfirmTab({ merged, subgroupFilter, setSubgroupFilter, subgroups, toggleConfirm }) {
  const filtered = merged.filter(r => subgroupFilter === 'All' || r.subgroup === subgroupFilter);
  const confirmedCount = filtered.filter(r => r.fullyConfirmed).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, margin: 0 }}>Confirmations</h2>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3 }}>
            In-state = manual checkbox. Out-of-state = confirmed automatically once a flight is on file. {confirmedCount}/{filtered.length} fully confirmed.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <SubgroupSelect value={subgroupFilter} onChange={setSubgroupFilter} subgroups={subgroups} />
          <Btn tone="ghost" small onClick={() => downloadCSV('confirmations.csv', filtered, [
            { key: 'fullName', label: 'Name' }, { key: 'subgroup', label: 'Subgroup' }, { key: 'fellowship', label: 'Fellowship' },
            { key: 'email', label: 'Email' }, { get: r => r.exempt ? 'In-state / exempt' : 'Out-of-state', label: 'Type' },
            { get: r => r.hasFlight ? 'Yes' : 'No', label: 'Flight on file' }, { get: r => r.fullyConfirmed ? 'Yes' : 'No', label: 'Fully confirmed' },
          ])}><Download size={13} /> Export</Btn>
        </div>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead><tr><th>Name</th><th>Subgroup</th><th>Fellowship</th><th>Type</th><th>Flight on file</th><th>Confirmed</th></tr></thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{r.fullName}</td>
                <td>{r.subgroup}</td>
                <td>{r.fellowship}</td>
                <td>{r.exempt ? <Pill tone="blue">In-state / exempt</Pill> : <Pill tone="mute">Out-of-state</Pill>}</td>
                <td>{r.exempt ? <span style={{ color: C.mute }}>n/a</span> : (r.hasFlight ? <Pill tone="green">On file</Pill> : <Pill tone="red">Missing</Pill>)}</td>
                <td>
                  {r.exempt ? (
                    <button onClick={() => toggleConfirm(r.email)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: r.inStateConfirmed ? C.green : C.mute, fontWeight: 600, fontSize: 12.5 }}>
                      {r.inStateConfirmed ? <CheckCircle2 size={16} /> : <Circle size={16} />} {r.inStateConfirmed ? 'Confirmed' : 'Mark confirmed'}
                    </button>
                  ) : (
                    r.fullyConfirmed ? <Pill tone="green">Confirmed (flight purchased)</Pill> : <Pill tone="red">Awaiting flight</Pill>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} style={{ color: C.mute, textAlign: 'center', padding: 24 }}>No registrations imported yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ============ TRANSPORTATION ============
function TransportTab({ merged, exempt }) {
  const flyers = useMemo(() => merged.filter(r => r.hasFlight && r.flight?.arrivalDate)
    .sort((a, b) => (a.flight.arrivalDate + a.flight.arrivalTime).localeCompare(b.flight.arrivalDate + b.flight.arrivalTime)), [merged]);

  const batches = useMemo(() => {
    const g = {};
    flyers.forEach(r => { (g[r.flight.arrivalDate] ||= []).push(r); });
    return g;
  }, [flyers]);

  const missingFlights = merged.filter(r => !r.exempt && !r.hasFlight);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, margin: 0 }}>Transportation batching</h2>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3 }}>Grouped by arrival date so pickups can be batched. {flyers.length} people with flights on file.</div>
        </div>
        <Btn tone="ghost" small onClick={() => downloadCSV('transportation-batches.csv', flyers, [
          { key: 'fullName', label: 'Name' }, { key: 'subgroup', label: 'Subgroup' }, { key: 'phone', label: 'Phone' },
          { get: r => r.flight.arrivalDate, label: 'Arrival Date' }, { get: r => r.flight.arrivalTime, label: 'Arrival Time' }, { get: r => r.flight.arrivalFlight, label: 'Arrival Flight #' },
          { get: r => r.flight.departureDate, label: 'Departure Date' }, { get: r => r.flight.departureTime, label: 'Departure Time' }, { get: r => r.flight.departureFlight, label: 'Departure Flight #' },
        ])}><Download size={13} /> Export batches</Btn>
      </div>

      {Object.entries(batches).sort().map(([date, people]) => (
        <Card key={date} style={{ marginBottom: 14, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: '#FAF8FE', borderBottom: `1px solid ${C.line}`, fontWeight: 600, fontSize: 13.5, display: 'flex', justifyContent: 'space-between' }}>
            <span>{date || 'Date unknown'}</span><Pill tone="blue">{people.length} arriving</Pill>
          </div>
          <table>
            <thead><tr><th>Name</th><th>Subgroup</th><th>Time</th><th>Flight #</th><th>Departure</th><th>Phone</th></tr></thead>
            <tbody>
              {people.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{r.fullName}</td><td>{r.subgroup}</td>
                  <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12.5 }}>{r.flight.arrivalTime || '—'}</td>
                  <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12.5 }}>{r.flight.arrivalFlight || '—'}</td>
                  <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12.5 }}>{r.flight.departureDate || '—'} {r.flight.departureTime || ''}</td>
                  <td>{r.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
      {flyers.length === 0 && <Card><div style={{ color: C.mute, textAlign: 'center', padding: 20 }}>No flights imported yet.</div></Card>}

      <Card style={{ marginTop: 8, background: C.redBg, borderColor: '#F0C9CA' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: C.red, marginBottom: 6, fontSize: 13 }}>
          <AlertCircle size={15} /> {missingFlights.length} out-of-state registrants still need to submit flights
        </div>
      </Card>
    </div>
  );
}

// ============ FOUNDATION SCHOOL & BAPTISM ============
function DiscipleshipTab({ merged, subgroupFilter, setSubgroupFilter, subgroups }) {
  const [needFoundation, setNeedFoundation] = useState(true);
  const [needBaptism, setNeedBaptism] = useState(true);
  const [mode, setMode] = useState('either'); // either | both

  const filtered = useMemo(() => merged.filter(r => {
    if (subgroupFilter !== 'All' && r.subgroup !== subgroupFilter) return false;
    const fsGraduated = /grad/i.test(r.foundationStatus);
    const baptismFlag = /no|not sure/i.test(r.baptism);
    const flagFoundation = needFoundation && !fsGraduated;
    const flagBaptism = needBaptism && baptismFlag;
    if (mode === 'both') return flagFoundation && flagBaptism;
    return flagFoundation || flagBaptism;
  }), [merged, subgroupFilter, needFoundation, needBaptism, mode]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, margin: 0 }}>Foundation School &amp; baptism</h2>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3 }}>{filtered.length} people flagged.</div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 6, fontSize: 12.5, alignItems: 'center' }}><input type="checkbox" checked={needFoundation} onChange={e => setNeedFoundation(e.target.checked)} /> Needs Foundation School</label>
          <label style={{ display: 'flex', gap: 6, fontSize: 12.5, alignItems: 'center' }}><input type="checkbox" checked={needBaptism} onChange={e => setNeedBaptism(e.target.checked)} /> Needs baptism</label>
          <select value={mode} onChange={e => setMode(e.target.value)}>
            <option value="either">Match either</option>
            <option value="both">Match both</option>
          </select>
          <SubgroupSelect value={subgroupFilter} onChange={setSubgroupFilter} subgroups={subgroups} />
          <Btn tone="ghost" small onClick={() => downloadCSV('foundation-baptism.csv', filtered, [
            { key: 'fullName', label: 'Name' }, { key: 'subgroup', label: 'Subgroup' }, { key: 'email', label: 'Email' },
            { key: 'foundationStatus', label: 'Foundation School' }, { key: 'baptism', label: 'Baptised' },
          ])}><Download size={13} /> Export</Btn>
        </div>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead><tr><th>Name</th><th>Subgroup</th><th>Email</th><th><Droplets size={11} style={{ verticalAlign: -2 }} /> Foundation School</th><th>Baptised</th></tr></thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{r.fullName}</td><td>{r.subgroup}</td>
                <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>{r.email}</td>
                <td>{/grad/i.test(r.foundationStatus) ? <Pill tone="green">{r.foundationStatus || 'Graduated'}</Pill> : <Pill tone="amber">{r.foundationStatus || 'Not started'}</Pill>}</td>
                <td>{/yes/i.test(r.baptism) ? <Pill tone="green">Yes</Pill> : <Pill tone="amber">{r.baptism || 'No'}</Pill>}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} style={{ color: C.mute, textAlign: 'center', padding: 24 }}>Nobody matches the current filters.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ============ IMPORT ============
function ImportTab({ handleImport, roster, registrations, flights, exempt, updateExempt, lastImport }) {
  return (
    <div>
      <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, marginTop: 0 }}>Import from Google Sheets</h2>
      <div style={{ fontSize: 12.5, color: C.mute, marginBottom: 18, maxWidth: 640 }}>
        In each sheet: File → Download → Comma-separated values (.csv), open the file, select all, copy, and paste below.
        Column headers are matched automatically (first/last name, email, subgroup, arrival/departure date & time, etc.) —
        exact header wording doesn't need to match. Re-paste any time; confirmations are kept by email across re-imports.
      </div>

      <ImportBlock title="Roster (who we're working on)" hint="First Name, Last Name, Subgroup, Leadership Position, Email"
        count={roster.length} last={lastImport.roster} onImport={t => handleImport('roster', t)} />
      <ImportBlock title="Registrations" hint="Your registration form export"
        count={registrations.length} last={lastImport.registrations} onImport={t => handleImport('registrations', t)} />
      <ImportBlock title="Flights" hint="Your flights form export"
        count={flights.length} last={lastImport.flights} onImport={t => handleImport('flights', t)} />

      <Card style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>Exempt fellowships</div>
        <div style={{ fontSize: 12.5, color: C.mute, marginBottom: 10 }}>These fellowships don't need flights — comma-separated, matched as substrings (case-insensitive).</div>
        <ExemptEditor exempt={exempt} onChange={updateExempt} />
      </Card>
    </div>
  );
}

// ============ DELEGATE COMPLIANCE ============
function DelegateComplianceTab({ merged, subgroupFilter, setSubgroupFilter, subgroups }) {
  const filtered = useMemo(() => merged.filter(r => {
    if (subgroupFilter !== 'All' && r.subgroup !== subgroupFilter) return false;
    const val = r.allergies?.trim().toLowerCase()
    return val && val !== '' && !['no', 'none', 'n/a', 'na', 'nil', 'nope', 'nope!'].includes(val)
  }), [merged, subgroupFilter]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, margin: 0 }}>Delegate Compliance</h2>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3 }}>{filtered.length} people with allergies or diet restrictions.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <SubgroupSelect value={subgroupFilter} onChange={setSubgroupFilter} subgroups={subgroups} />
          <Btn tone="ghost" small onClick={() => downloadCSV('delegate-compliance.csv', filtered, [
            { key: 'fullName', label: 'Name' }, { key: 'subgroup', label: 'Subgroup' }, { key: 'email', label: 'Email' },
            { key: 'allergies', label: 'Allergies / Diet Restrictions' },
          ])}><Download size={13} /> Export</Btn>
        </div>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead><tr><th>Name</th><th>Subgroup</th><th>Email</th><th>Phone</th><th>Allergies / Diet Restrictions</th></tr></thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{r.fullName}</td>
                <td>{r.subgroup}</td>
                <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>{r.email}</td>
                <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>{r.phone || '—'}</td>
                <td style={{ background: '#FBF0DE', fontWeight: 500 }}>{r.allergies}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} style={{ color: C.mute, textAlign: 'center', padding: 24 }}>No registrations with allergies or diet restrictions.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ImportBlock({ title, hint, count, last, onImport }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(count === 0);
  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</span>
          <Pill tone={count ? 'green' : 'mute'}>{count} rows loaded</Pill>
        </div>
        <span style={{ fontSize: 11.5, color: C.mute, fontFamily: 'JetBrains Mono' }}>{last ? `updated ${new Date(last).toLocaleString()}` : 'never imported'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11.5, color: C.mute, marginBottom: 6 }}>{hint}</div>
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Paste CSV here, including the header row…"
            style={{ width: '100%', height: 140, fontFamily: 'JetBrains Mono', fontSize: 11.5, resize: 'vertical' }} />
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <Btn small onClick={() => { onImport(text); setText(''); setOpen(false); }} disabled={!text.trim()}><RefreshCw size={13} /> Import &amp; replace</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

// ============ ROOM ASSIGNMENTS ============
function RoomAssignmentTab({ merged, rooms, handleAddRoom, handleBulkCreateRooms, handleDeleteRoom, handleAssignPerson, handleRemovePersonFromRoom, handleUpdateRoomCapacity, handleSetRoomHead, peoplePerRoom }) {
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomCapacity, setNewRoomCapacity] = useState(peoplePerRoom);
  const [bulkPrefix, setBulkPrefix] = useState('Room');
  const [bulkCount, setBulkCount] = useState(5);
  const [bulkCapacity, setBulkCapacity] = useState(2);
  const [draggedPerson, setDraggedPerson] = useState(null);

  const assignedEmails = new Set(rooms.flatMap(r => r.people.map(p => p.email)));
  const unassigned = merged.filter(m => !assignedEmails.has(m.email));
  const byGender = { male: [], female: [] };
  unassigned.forEach(p => {
    const g = (p.gender || '').toLowerCase();
    if (g.includes('female') || g === 'f') byGender.female.push(p);
    else byGender.male.push(p);
  });

  return (
    <div>
      <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, marginTop: 0 }}>Room Assignments</h2>
      <div style={{ fontSize: 12.5, color: C.mute, marginBottom: 16 }}>Drag registrants to assign them to rooms.</div>

      {/* Unassigned registrants by gender */}
      <div style={{ marginBottom: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {['male', 'female'].map(gender => (
          <Card key={gender} style={{ background: gender === 'male' ? '#E8F0FF' : '#FFE8F0' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, textTransform: 'capitalize' }}>{gender} ({byGender[gender].length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {byGender[gender].map(person => (
                <div
                  key={person.email}
                  draggable
                  onDragStart={() => setDraggedPerson(person)}
                  style={{ padding: '8px 10px', background: '#fff', border: '1px solid #ddd', borderRadius: 5, fontSize: 12, cursor: 'grab', userSelect: 'none' }}
                >
                  {person.fullName} ({person.subgroup})
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Room cards */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Rooms ({rooms.length})</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12, marginBottom: 16 }}>
          {rooms.map(room => (
            <Card
              key={room.id}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                if (draggedPerson && room.people.length < room.capacity) {
                  handleAssignPerson(draggedPerson, room.id);
                  setDraggedPerson(null);
                }
              }}
              style={{
                background: room.people.length >= room.capacity ? C.redBg : C.cream,
                border: `2px solid ${room.people.length >= room.capacity ? C.red : C.line}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{room.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                    <span style={{ fontSize: 11.5, color: C.mute }}>{room.people.length} /</span>
                    <input
                      type="number"
                      min={room.people.length || 1}
                      value={room.capacity}
                      onChange={e => handleUpdateRoomCapacity(room.id, e.target.value)}
                      style={{ width: 44, fontSize: 12, padding: '2px 5px', borderRadius: 5, border: `1px solid ${C.line}` }}
                      title="Capacity"
                    />
                  </div>
                </div>
                <button onClick={() => handleDeleteRoom(room.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mute, padding: 4 }} title="Delete room">
                  <Trash2 size={14} />
                </button>
              </div>
              {room.people.length >= room.capacity && (
                <div style={{ fontSize: 11, color: C.red, marginBottom: 8, fontWeight: 600 }}>Room is full</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {room.people.map(person => {
                  const isHead = room.roomHead === person.email;
                  return (
                    <div
                      key={person.email}
                      style={{ padding: '6px 8px', background: isHead ? '#FFF8E1' : '#fff', border: `1px solid ${isHead ? '#F5C842' : '#ddd'}`, borderRadius: 4, fontSize: 11.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}
                    >
                      <span style={{ flex: 1, fontWeight: isHead ? 600 : 400 }}>{person.fullName}</span>
                      <button
                        onClick={() => handleSetRoomHead(room.id, person.email)}
                        title={isHead ? 'Remove as room head' : 'Set as room head'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: isHead ? '#B8920A' : C.mute, padding: 0, display: 'flex', alignItems: 'center' }}
                      >
                        <Crown size={12} fill={isHead ? '#F5C842' : 'none'} />
                      </button>
                      <button onClick={() => handleRemovePersonFromRoom(person, room.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mute, padding: 0, fontSize: 11 }} title="Remove from room">✕</button>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Add rooms */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Single room */}
        <Card>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Add single room</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={newRoomName}
              onChange={e => setNewRoomName(e.target.value)}
              placeholder="Room name (optional)"
              style={{ flex: 1, minWidth: 120 }}
              onKeyDown={e => { if (e.key === 'Enter') { handleAddRoom(newRoomName, newRoomCapacity); setNewRoomName(''); } }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap' }}>
              Cap:
              <input type="number" min={1} value={newRoomCapacity} onChange={e => setNewRoomCapacity(e.target.value)} style={{ width: 50, fontSize: 13, padding: '5px 7px' }} />
            </div>
            <Btn small onClick={() => { handleAddRoom(newRoomName, newRoomCapacity); setNewRoomName(''); }} disabled={rooms.length >= 50}>
              <Plus size={13} /> Add
            </Btn>
          </div>
        </Card>

        {/* Bulk create */}
        <Card>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Bulk create rooms</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={bulkPrefix}
              onChange={e => setBulkPrefix(e.target.value)}
              placeholder="Prefix (e.g. Room)"
              style={{ flex: 1, minWidth: 100 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap' }}>
              Count:
              <input type="number" min={1} max={50} value={bulkCount} onChange={e => setBulkCount(e.target.value)} style={{ width: 50, fontSize: 13, padding: '5px 7px' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap' }}>
              Cap:
              <input type="number" min={1} value={bulkCapacity} onChange={e => setBulkCapacity(e.target.value)} style={{ width: 50, fontSize: 13, padding: '5px 7px' }} />
            </div>
            <Btn small onClick={() => handleBulkCreateRooms(bulkPrefix, Number(bulkCount), bulkCapacity)} disabled={rooms.length >= 50 || !bulkCount}>
              <Plus size={13} /> Create {bulkCount || ''}
            </Btn>
          </div>
          <div style={{ fontSize: 11, color: C.mute, marginTop: 8 }}>
            Creates "{bulkPrefix} {rooms.length + 1}", "{bulkPrefix} {rooms.length + 2}", … each with capacity {bulkCapacity}
          </div>
        </Card>
      </div>
    </div>
  );
}
