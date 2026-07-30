import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Upload, Users, Plane, CheckCircle2, Circle, Filter, Download, RefreshCw, ChevronDown, ChevronRight, Settings, AlertCircle, Home, Church, Droplets, DoorOpen, Trash2, Plus, Crown, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

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

const DEFAULT_EXEMPT = ['BLW University of Manitoba', 'BLW University of Winnipeg'];

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

// ---------- storage helpers (Supabase-backed) ----------
async function loadKey(key, fallback) {
  try {
    const { data } = await supabase
      .from('registration_config')
      .select('value')
      .eq('key', key)
      .single()
    return data ? data.value : fallback
  } catch { return fallback; }
}
async function saveKey(key, value) {
  try {
    await supabase
      .from('registration_config')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  } catch (e) { console.error('save failed', key, e); }
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

const ALL_TABS = [
  { key: 'overview', label: 'Overview', icon: Home },
  { key: 'working', label: 'Working List', icon: Users },
  { key: 'confirm', label: 'Confirmations', icon: CheckCircle2 },
  { key: 'transport', label: 'Transportation', icon: Plane },
  { key: 'discipleship', label: 'Foundation & Baptism', icon: Church },
  { key: 'compliance', label: 'Delegate Compliance', icon: AlertCircle },
  { key: 'rooms', label: 'Room Assignments', icon: DoorOpen },
  { key: 'finance', label: 'Finance', icon: DollarSign, restricted: true },
  { key: 'import', label: 'Import Data', icon: Upload },
];

export default function App() {
  const { profile, role } = useAuth();
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
  const [workingListDb, setWorkingListDb] = useState([]);
  const [workingListLoading, setWorkingListLoading] = useState(false);
  const [hasFinanceAccess, setHasFinanceAccess] = useState(false);
  const [payments, setPayments] = useState([]); // from event_payments table

  // Finance access: regional_secretary / super_admin always; others need finance_data_access grant
  useEffect(() => {
    if (!profile?.id) return;
    if (['regional_secretary', 'super_admin'].includes(role)) { setHasFinanceAccess(true); return; }
    supabase.from('user_grants')
      .select('id')
      .eq('user_id', profile.id)
      .eq('grant_type', 'finance_data_access')
      .maybeSingle()
      .then(({ data }) => { if (data) setHasFinanceAccess(true); })
      .catch(() => {});
  }, [profile?.id, role]);

  useEffect(() => {
    (async () => {
      const [r, reg, fl, conf, tg, ex, li] = await Promise.all([
        loadKey('roster', []), loadKey('registrations', []), loadKey('flights', []),
        loadKey('confirmations', {}), loadKey('targets', {}), loadKey('exempt-fellowships', DEFAULT_EXEMPT),
        loadKey('last-import', { roster: null, registrations: null, flights: null }),
      ]);

      // Always fetch roster from Supabase (authoritative source)
      let finalRoster = r;
      try {
        const { data: dbRoster } = await supabase
          .from('roster')
          .select('*')
          .order('last_name', { ascending: true });
        if (dbRoster?.length) {
          finalRoster = dbRoster.map(m => ({
            email: m.email,
            fullName: m.full_name,
            firstName: m.first_name,
            lastName: m.last_name,
            subgroup: m.subgroup,
            leadership: m.leadership || '',
          }));
        }
      } catch (e) {
        console.error('Failed to fetch roster from Supabase:', e);
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

      // Fetch working list from Supabase
      try {
        const { data: dbWl } = await supabase
          .from('working_list')
          .select('*')
          .order('subgroup', { ascending: true });
        if (dbWl?.length) setWorkingListDb(dbWl);
      } catch (e) {
        console.error('Failed to fetch working list from Supabase:', e);
      }

      // Fetch payments (RLS enforces access — returns empty for non-finance users)
      try {
        const { data: dbPay } = await supabase
          .from('event_payments')
          .select('*')
          .order('subgroup', { ascending: true });
        if (dbPay?.length) setPayments(dbPay);
      } catch (e) {
        console.error('Failed to fetch payments from Supabase:', e);
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
    subgroups.forEach(sg => { out[sg] = { total: 0, flights: 0, confirmed: 0, needsFlight: 0 }; });
    merged.forEach(r => {
      if (!out[r.subgroup]) out[r.subgroup] = { total: 0, flights: 0, confirmed: 0, needsFlight: 0 };
      out[r.subgroup].total++;
      if (r.hasFlight) out[r.subgroup].flights++;
      if (r.fullyConfirmed) out[r.subgroup].confirmed++;
      if (r.needsFlight) out[r.subgroup].needsFlight++;
    });
    return out;
  }, [merged, subgroups]);

  const totalRegs = registrations.length;
  const totalRegTarget = Object.values(targets).reduce((s, t) => s + (Number(t.reg) || 0), 0);
  const totalFlights = merged.filter(r => r.hasFlight).length;
  const totalFlightTarget = merged.filter(r => r.needsFlight).length;

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

  function handleRenameRoom(roomId, newName) {
    if (!newName.trim()) return;
    const updated = rooms.map(r => r.id === roomId ? { ...r, name: newName.trim() } : r);
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
          <span>roster: {roster.length > 0 ? roster.length : '—'}</span>
          <span>reg: {registrations.length > 0 ? registrations.length : '—'}</span>
          <span>flights: {flights.length > 0 ? flights.length : '—'}</span>
        </div>
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '14px 32px 0', borderBottom: `1px solid ${C.line}`, background: C.paper, overflowX: 'auto' }}>
        {ALL_TABS.filter(t => !t.restricted || hasFinanceAccess).map(t => {
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
        {tab === 'working' && <WorkingListTab {...{ workingList, workingListDb, workingListLoading, regByEmail, subgroupFilter, setSubgroupFilter, subgroups }} />}
        {tab === 'confirm' && <ConfirmTab {...{ merged, subgroupFilter, setSubgroupFilter, subgroups, toggleConfirm }} />}
        {tab === 'transport' && <TransportTab {...{ merged, exempt }} />}
        {tab === 'discipleship' && <DiscipleshipTab {...{ merged, subgroupFilter, setSubgroupFilter, subgroups }} />}
        {tab === 'compliance' && <DelegateComplianceTab {...{ merged, subgroupFilter, setSubgroupFilter, subgroups }} />}
        {tab === 'rooms' && <RoomAssignmentTab {...{ merged, rooms, handleAddRoom, handleBulkCreateRooms, handleDeleteRoom, handleAssignPerson, handleRemovePersonFromRoom, handleUpdateRoomCapacity, handleSetRoomHead, handleRenameRoom, peoplePerRoom }} />}
        {tab === 'finance' && hasFinanceAccess && <FinanceTab {...{ registrations, payments, setPayments, userId: profile?.id }} />}
        {tab === 'import' && <ImportTab {...{ handleImport, roster, registrations, flights, exempt, updateExempt, lastImport }} />}
      </div>
    </div>
  );
}

// ============ OVERVIEW ============
function OverviewTab({ totalRegs, totalRegTarget, totalFlights, totalFlightTarget, subgroups, bySubgroup, targets, setTarget, merged, exempt, updateExempt }) {
  const [showSettings, setShowSettings] = useState(false);
  const [waitingOpen, setWaitingOpen] = useState(false);
  const regPct = totalRegTarget ? Math.round((totalRegs / totalRegTarget) * 100) : 0;
  const flightPct = totalFlightTarget ? Math.round((totalFlights / totalFlightTarget) * 100) : 0;

  const waitingList = useMemo(
    () => merged.filter(r => r.needsFlight && !r.hasFlight).sort((a, b) => (a.subgroup || '').localeCompare(b.subgroup || '')),
    [merged],
  );

  const confirmedCount = useMemo(() => merged.filter(r => r.fullyConfirmed).length, [merged]);

  return (
    <div>
      {waitingOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setWaitingOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 14, width: '90%', maxWidth: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,.18)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '18px 24px', borderBottom: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 16 }}>Waiting on flights</div>
                <div style={{ fontSize: 12.5, color: C.mute, marginTop: 2 }}>{waitingList.length} registrant{waitingList.length !== 1 ? 's' : ''} need a flight but don't have one on file yet</div>
              </div>
              <button onClick={() => setWaitingOpen(false)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: C.mute, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', padding: 16 }}>
              {waitingList.length === 0 ? (
                <div style={{ textAlign: 'center', color: C.mute, padding: 32 }}>Everyone who needs a flight has one on file.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', fontFamily: 'JetBrains Mono', fontSize: 10.5, color: C.mute, textTransform: 'uppercase', padding: '8px 10px', borderBottom: `1px solid ${C.line}` }}>Name</th>
                      <th style={{ textAlign: 'left', fontFamily: 'JetBrains Mono', fontSize: 10.5, color: C.mute, textTransform: 'uppercase', padding: '8px 10px', borderBottom: `1px solid ${C.line}` }}>Subgroup</th>
                      <th style={{ textAlign: 'left', fontFamily: 'JetBrains Mono', fontSize: 10.5, color: C.mute, textTransform: 'uppercase', padding: '8px 10px', borderBottom: `1px solid ${C.line}` }}>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitingList.map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: '9px 10px', fontSize: 13, borderBottom: `1px solid ${C.line}` }}>{r.fullName || `${r.firstName} ${r.lastName}`}</td>
                        <td style={{ padding: '9px 10px', fontSize: 13, borderBottom: `1px solid ${C.line}`, color: C.mute }}>{r.subgroup}</td>
                        <td style={{ padding: '9px 10px', fontSize: 12, borderBottom: `1px solid ${C.line}`, fontFamily: 'JetBrains Mono' }}>{r.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.line}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn tone="ghost" small onClick={() => downloadCSV('waiting-on-flights.csv', waitingList, [
                { key: 'fullName', label: 'Name' }, { key: 'subgroup', label: 'Subgroup' },
                { key: 'fellowship', label: 'Fellowship' }, { key: 'email', label: 'Email' },
              ])}><Download size={13} /> Export</Btn>
              <Btn small onClick={() => setWaitingOpen(false)}>Close</Btn>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
        <SummaryCard label="Total registrations" current={totalRegs} target={totalRegTarget} pct={regPct} />
        <SummaryCard label="Confirmed" current={confirmedCount} target={totalRegs} pct={totalRegs ? Math.round((confirmedCount / totalRegs) * 100) : 0} />
        <SummaryCard label="Flights purchased" current={totalFlights} target={totalFlightTarget} pct={flightPct}
          onTargetClick={totalFlightTarget > 0 ? () => setWaitingOpen(true) : undefined}
          targetHint={waitingList.length > 0 ? `${waitingList.length} waiting` : undefined} />
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

      <Card style={{ padding: 0, overflowX: 'auto' }}>
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
              const s = bySubgroup[sg] || { total: 0, flights: 0, needsFlight: 0 };
              const t = targets[sg] || {};
              const regTarget = Number(t.reg) || 0;
              const flightTarget = s.needsFlight || 0;
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
                  <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12.5, color: C.mute }}>{flightTarget || '—'}</td>
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
          flightTarget: bySubgroup[sg]?.needsFlight || 0, flights: bySubgroup[sg]?.flights || 0,
        })), [
          { key: 'subgroup', label: 'Subgroup' }, { key: 'regTarget', label: 'Reg Target' }, { key: 'regs', label: 'Registrations' },
          { key: 'flightTarget', label: 'Flight Target (out-of-state)' }, { key: 'flights', label: 'Flights' },
        ])}><Download size={13} /> Export overview</Btn>
      </div>
    </div>
  );
}

function SummaryCard({ label, current, target, pct, onTargetClick, targetHint }) {
  const tone = statusTone(pct);
  return (
    <Card>
      <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: C.mute, textTransform: 'uppercase', letterSpacing: 0.06 }}>{label}</div>
      <div style={{ fontFamily: 'Space Grotesk', fontSize: 30, fontWeight: 700, margin: '6px 0 10px', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        {current}
        <span style={{ color: C.mute, fontWeight: 500, fontSize: 18 }}>/ {target || '—'}</span>
        {onTargetClick && (
          <button onClick={onTargetClick} style={{ fontSize: 11, fontWeight: 600, fontFamily: 'Inter', background: C.amberBg, color: C.amber, border: 'none', borderRadius: 20, padding: '2px 9px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {targetHint || 'View waiting'}
          </button>
        )}
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
function WorkingListTab({ workingList, workingListDb, workingListLoading, regByEmail, subgroupFilter, setSubgroupFilter, subgroups }) {
  // Prefer synced DB data; fall back to roster-derived list
  const useDb = workingListDb.length > 0;

  const source = useMemo(() => {
    if (useDb) {
      return workingListDb.map(p => ({
        full_name: p.full_name,
        subgroup: p.subgroup,
        leadership_category: p.leadership_category,
        email: p.email,
        registered: !!regByEmail[p.email],
      }));
    }
    return workingList.map(p => ({
      full_name: p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
      subgroup: p.subgroup,
      leadership_category: p.leadership || '',
      email: p.email,
      registered: false,
    }));
  }, [useDb, workingListDb, workingList, regByEmail]);

  const filtered = source.filter(p => subgroupFilter === 'All' || p.subgroup === subgroupFilter);

  const byGroup = useMemo(() => {
    const g = {};
    filtered.forEach(p => { (g[p.subgroup || 'Unassigned'] ||= []).push(p); });
    return g;
  }, [filtered]);

  const notRegistered = filtered.filter(p => !p.registered).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, margin: 0 }}>Working list</h2>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3 }}>
            {useDb
              ? <>{filtered.length} people · <span style={{ color: notRegistered > 0 ? C.amber : C.green }}>{notRegistered} not yet registered</span></>
              : <>On the roster but not yet registered — {filtered.length} people to follow up with.</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <SubgroupSelect value={subgroupFilter} onChange={setSubgroupFilter} subgroups={subgroups} />
          <Btn tone="ghost" small onClick={() => downloadCSV('working-list.csv', filtered, [
            { key: 'full_name', label: 'Full Name' },
            { key: 'subgroup', label: 'Subgroup' },
            { key: 'leadership_category', label: 'Leadership Category' },
            { key: 'email', label: 'Email' },
            { key: 'registered', label: 'Registered', get: r => r.registered ? 'Yes' : 'No' },
          ])}><Download size={13} /> Export</Btn>
        </div>
      </div>

      {Object.keys(byGroup).length === 0 && (
        <Card>
          <div style={{ color: C.mute, textAlign: 'center', padding: 20 }}>
            {useDb ? 'Working list is empty — sync the "Working List" sheet tab.' : 'Nobody outstanding — roster may not be imported yet.'}
          </div>
        </Card>
      )}

      {Object.entries(byGroup).sort().map(([sg, people]) => {
        const notReg = people.filter(p => !p.registered).length;
        return (
          <Card key={sg} style={{ marginBottom: 14, padding: 0, overflowX: 'auto' }}>
            <div style={{ padding: '12px 16px', background: '#FAF8FE', borderBottom: `1px solid ${C.line}`, fontWeight: 600, fontSize: 13.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span>{sg}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {useDb && notReg > 0 && <Pill tone="amber">{notReg} outstanding</Pill>}
                <Pill tone="mute">{people.length} total</Pill>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Leadership Category</th>
                  <th>Email</th>
                  {useDb && <th>Registered</th>}
                </tr>
              </thead>
              <tbody>
                {people.map((p, i) => (
                  <tr key={i} style={useDb && !p.registered ? { background: '#FFFBF4' } : undefined}>
                    <td>{p.full_name}</td>
                    <td>{p.leadership_category || '—'}</td>
                    <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>{p.email}</td>
                    {useDb && <td>{p.registered ? <Pill tone="green">Yes</Pill> : <Pill tone="amber">No</Pill>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        );
      })}
    </div>
  );
}

// ============ FINANCE TAB ============
// Early-bird cutoff: $250 until Aug 5, $350 after
const EARLY_CUTOFF = new Date('2026-08-06T00:00:00');
function getDefaultFee() { return new Date() < EARLY_CUTOFF ? 250 : 350; }

function FinanceTab({ registrations, payments, setPayments, userId }) {
  const defaultFee = getDefaultFee();
  const payByEmail = useMemo(() => Object.fromEntries(payments.map(p => [p.email, p])), [payments]);

  const rows = useMemo(() => registrations.map(r => {
    const pay = payByEmail[r.email] || {};
    const fee = Number(pay.amount_expected) || defaultFee;
    const paid = Number(pay.amount_paid) || 0;
    return {
      email: r.email,
      fullName: r.fullName || `${r.firstName || ''} ${r.lastName || ''}`.trim(),
      subgroup: r.subgroup || '',
      amount_expected: fee,
      amount_paid: paid,
      payment_date: pay.payment_date || null,
      payment_notes: pay.payment_notes || '',
    };
  }).sort((a, b) => a.subgroup.localeCompare(b.subgroup) || a.fullName.localeCompare(b.fullName)),
  [registrations, payByEmail, defaultFee]);

  const totalExpected = rows.length * defaultFee;
  const totalPaid    = rows.reduce((s, r) => s + r.amount_paid, 0);
  const countPaid    = rows.filter(r => r.amount_paid >= r.amount_expected && r.amount_paid > 0).length;
  const countPartial = rows.filter(r => r.amount_paid > 0 && r.amount_paid < r.amount_expected).length;
  const countUnpaid  = rows.filter(r => r.amount_paid === 0).length;

  const [saving, setSaving] = useState({});
  // partial editing: email -> draft amount string
  const [partialDraft, setPartialDraft] = useState({});

  async function upsertPayment(email, fullName, subgroup, amountExpected, amountPaid, paymentDate, notes) {
    setSaving(prev => ({ ...prev, [email]: true }));
    try {
      const payload = {
        email,
        full_name: fullName,
        subgroup,
        amount_expected: amountExpected,
        amount_paid: amountPaid,
        payment_date: paymentDate || new Date().toISOString().split('T')[0],
        payment_notes: notes || '',
        recorded_by: userId || null,
      };
      const { error } = await supabase.from('event_payments').upsert(payload, { onConflict: 'email' });
      if (!error) {
        setPayments(prev => [...prev.filter(p => p.email !== email), payload]);
      } else {
        alert('Save failed: ' + error.message);
      }
    } finally {
      setSaving(prev => { const n = { ...prev }; delete n[email]; return n; });
    }
  }

  function markPaid(r) {
    upsertPayment(r.email, r.fullName, r.subgroup, r.amount_expected, r.amount_expected, null, r.payment_notes);
  }

  function markUnpaid(r) {
    upsertPayment(r.email, r.fullName, r.subgroup, r.amount_expected, 0, null, r.payment_notes);
  }

  function savePartial(r) {
    const amt = Number(partialDraft[r.email]);
    if (!amt || amt <= 0) return;
    upsertPayment(r.email, r.fullName, r.subgroup, r.amount_expected, amt, null, r.payment_notes);
    setPartialDraft(prev => { const n = { ...prev }; delete n[r.email]; return n; });
  }

  const fmt = n => `$${Number(n).toFixed(2)}`;
  const earlyBirdActive = new Date() < EARLY_CUTOFF;

  return (
    <div>
      {/* fee banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: earlyBirdActive ? C.greenBg : C.amberBg, border: `1px solid ${earlyBirdActive ? '#B7DFC5' : '#F0D4A0'}`, borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: 13 }}>
        <span style={{ fontWeight: 700, color: earlyBirdActive ? C.green : C.amber }}>
          {earlyBirdActive ? '🟢 Early bird rate active — $250' : '🟡 Standard rate — $350'}
        </span>
        <span style={{ color: C.mute }}>{earlyBirdActive ? '(until Aug 5)' : '(early bird closed Aug 5)'}</span>
      </div>

      {/* summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total collected', value: fmt(totalPaid), sub: `of ${fmt(totalExpected)}`, tone: totalPaid >= totalExpected && totalExpected > 0 ? 'green' : 'mute' },
          { label: 'Paid in full', value: countPaid, sub: `${rows.length} total`, tone: 'green' },
          { label: 'Partial', value: countPartial, sub: 'paid something', tone: countPartial > 0 ? 'amber' : 'mute' },
          { label: 'Unpaid', value: countUnpaid, sub: 'nothing received', tone: countUnpaid > 0 ? 'red' : 'green' },
        ].map(s => (
          <Card key={s.label}>
            <div style={{ fontSize: 10.5, fontFamily: 'JetBrains Mono', color: C.mute, textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontFamily: 'Space Grotesk', fontSize: 26, fontWeight: 700, color: s.tone === 'green' ? C.green : s.tone === 'amber' ? C.amber : s.tone === 'red' ? C.red : C.ink, lineHeight: 1.1 }}>{s.value}</div>
            <div style={{ fontSize: 11.5, color: C.mute, marginTop: 3 }}>{s.sub}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, margin: 0 }}>Payment tracker</h2>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3 }}>Check off each person as they pay. Use "partial" to record a lower amount.</div>
        </div>
        <Btn tone="ghost" small onClick={() => downloadCSV('finance-payments.csv', rows, [
          { key: 'fullName', label: 'Name' }, { key: 'subgroup', label: 'Subgroup' }, { key: 'email', label: 'Email' },
          { key: 'amount_expected', label: 'Expected ($)' }, { key: 'amount_paid', label: 'Paid ($)' },
          { key: 'payment_date', label: 'Payment Date' }, { key: 'payment_notes', label: 'Notes' },
        ])}><Download size={13} /> Export</Btn>
      </div>

      <Card style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Subgroup</th>
              <th>Fee</th>
              <th>Paid</th>
              <th>Date</th>
              <th style={{ textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const isPaid = r.amount_paid >= r.amount_expected && r.amount_paid > 0;
              const isPartial = r.amount_paid > 0 && r.amount_paid < r.amount_expected;
              const isSaving = saving[r.email];
              const showPartialInput = partialDraft[r.email] !== undefined;

              return (
                <tr key={r.email} style={{ background: isPaid ? '#F0FAF4' : undefined }}>
                  <td style={{ fontWeight: 600 }}>{r.fullName}</td>
                  <td style={{ color: C.mute, fontSize: 12.5 }}>{r.subgroup}</td>
                  <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12.5 }}>{fmt(r.amount_expected)}</td>
                  <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12.5 }}>
                    {r.amount_paid > 0 ? fmt(r.amount_paid) : '—'}
                  </td>
                  <td style={{ color: C.mute, fontSize: 12.5 }}>{r.payment_date || '—'}</td>
                  <td>
                    {isPaid ? (
                      /* Paid — show checkmark + undo link */
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Pill tone="green">✓ Paid</Pill>
                        <button onClick={() => markUnpaid(r)} disabled={isSaving}
                          style={{ fontSize: 11, color: C.mute, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                          undo
                        </button>
                      </div>
                    ) : showPartialInput ? (
                      /* Partial amount entry */
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, color: C.mute }}>$</span>
                        <input
                          type="number" min="1" max={r.amount_expected} step="0.01"
                          autoFocus
                          style={{ width: 70, padding: '4px 6px', fontSize: 13 }}
                          value={partialDraft[r.email]}
                          onChange={e => setPartialDraft(prev => ({ ...prev, [r.email]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') savePartial(r); if (e.key === 'Escape') setPartialDraft(prev => { const n = { ...prev }; delete n[r.email]; return n; }); }}
                        />
                        <Btn small onClick={() => savePartial(r)} disabled={isSaving}>Save</Btn>
                        <button onClick={() => setPartialDraft(prev => { const n = { ...prev }; delete n[r.email]; return n; })}
                          style={{ fontSize: 11, color: C.mute, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                      </div>
                    ) : (
                      /* Unpaid / partial — show action buttons */
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {isPartial && <Pill tone="amber">Partial {fmt(r.amount_paid)}</Pill>}
                        <Btn small onClick={() => markPaid(r)} disabled={isSaving} style={{ background: C.green, color: '#fff' }}>
                          {isSaving ? '…' : `✓ Mark paid ${fmt(r.amount_expected)}`}
                        </Btn>
                        <button
                          onClick={() => setPartialDraft(prev => ({ ...prev, [r.email]: '' }))}
                          style={{ fontSize: 11.5, color: C.mute, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                          partial
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: C.mute, padding: 24 }}>No registrations yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
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
  const [bypassConfirmed, setBypassConfirmed] = useState({}); // email -> true if manually confirmed without flight

  const filtered = merged.filter(r => subgroupFilter === 'All' || r.subgroup === subgroupFilter);
  const confirmedCount = filtered.filter(r => r.fullyConfirmed || bypassConfirmed[r.email]).length;
  const bypassCount = filtered.filter(r => bypassConfirmed[r.email] && !r.fullyConfirmed).length;

  function toggleBypassConfirm(email) {
    setBypassConfirmed(prev => ({ ...prev, [email]: !prev[email] }));
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, margin: 0 }}>Confirmations</h2>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3 }}>
            In-state = manual checkbox. Out-of-state = confirmed automatically (with flight) or via bypass (flagged).
            {confirmedCount}/{filtered.length} fully confirmed{bypassCount > 0 ? ` (${bypassCount} flagged bypasses)` : ''}.
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

      <Card style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Name</th><th>Subgroup</th><th>Fellowship</th><th>Type</th><th>Flight on file</th><th>Confirmed</th></tr></thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{r.fullName}</td>
                <td>{r.subgroup}</td>
                <td>{r.fellowship}</td>
                <td>{r.exempt ? <Pill tone="blue">In-state / exempt</Pill> : <Pill tone="mute">Out-of-state</Pill>}</td>
                <td>{r.exempt ? <span style={{ color: C.mute }}>n/a</span> : (r.hasFlight ? <Pill tone="green">On file</Pill> : bypassConfirmed[r.email] ? <span style={{ color: C.amber, fontWeight: 600 }}>Bypassed</span> : <Pill tone="red">Missing</Pill>)}</td>
                <td>
                  {r.exempt ? (
                    <button onClick={() => toggleConfirm(r.email)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: r.inStateConfirmed ? C.green : C.mute, fontWeight: 600, fontSize: 12.5 }}>
                      {r.inStateConfirmed ? <CheckCircle2 size={16} /> : <Circle size={16} />} {r.inStateConfirmed ? 'Confirmed' : 'Mark confirmed'}
                    </button>
                  ) : (
                    r.fullyConfirmed ? (
                      <Pill tone="green">Confirmed (flight)</Pill>
                    ) : bypassConfirmed[r.email] ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Pill tone="amber">Confirmed (no flight)</Pill>
                        <button onClick={() => toggleBypassConfirm(r.email)} style={{ fontSize: 11, color: C.mute, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>undo</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Pill tone="red">Awaiting flight</Pill>
                        <button onClick={() => toggleBypassConfirm(r.email)} style={{ fontSize: 11, color: C.mute, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>bypass</button>
                      </div>
                    )
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
        <Card key={date} style={{ marginBottom: 14, padding: 0, overflowX: 'auto' }}>
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
  const [dismissed, setDismissed] = useState(new Set());

  const dismiss = (key) => setDismissed(prev => new Set([...prev, key]));

  const filtered = useMemo(() => merged.filter(r => {
    if (subgroupFilter !== 'All' && r.subgroup !== subgroupFilter) return false;
    if (dismissed.has(r.email || r.fullName)) return false;
    const fsGraduated = /grad/i.test(r.foundationStatus);
    const baptismFlag = /no|not sure/i.test(r.baptism);
    const flagFoundation = needFoundation && !fsGraduated;
    const flagBaptism = needBaptism && baptismFlag;
    if (mode === 'both') return flagFoundation && flagBaptism;
    return flagFoundation || flagBaptism;
  }), [merged, subgroupFilter, needFoundation, needBaptism, mode, dismissed]);

  function fsPill(status) {
    if (/grad/i.test(status)) return <Pill tone="green">{status || 'Graduated'}</Pill>;
    if (/complet/i.test(status)) return <Pill tone="blue">{status}</Pill>;
    return <Pill tone="amber">{status || 'Not started'}</Pill>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, margin: 0 }}>Foundation School &amp; baptism</h2>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3 }}>{filtered.length} people flagged{dismissed.size > 0 ? ` · ${dismissed.size} verified & hidden` : ''}.</div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 6, fontSize: 12.5, alignItems: 'center' }}><input type="checkbox" checked={needFoundation} onChange={e => setNeedFoundation(e.target.checked)} /> Needs Foundation School</label>
          <label style={{ display: 'flex', gap: 6, fontSize: 12.5, alignItems: 'center' }}><input type="checkbox" checked={needBaptism} onChange={e => setNeedBaptism(e.target.checked)} /> Needs baptism</label>
          <select value={mode} onChange={e => setMode(e.target.value)}>
            <option value="either">Match either</option>
            <option value="both">Match both</option>
          </select>
          {dismissed.size > 0 && <Btn tone="ghost" small onClick={() => setDismissed(new Set())}>Restore {dismissed.size} hidden</Btn>}
          <SubgroupSelect value={subgroupFilter} onChange={setSubgroupFilter} subgroups={subgroups} />
          <Btn tone="ghost" small onClick={() => downloadCSV('foundation-baptism.csv', filtered, [
            { key: 'fullName', label: 'Name' }, { key: 'subgroup', label: 'Subgroup' }, { key: 'email', label: 'Email' },
            { key: 'foundationStatus', label: 'Foundation School' }, { key: 'baptism', label: 'Baptised' },
          ])}><Download size={13} /> Export</Btn>
        </div>
      </div>

      <Card style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Name</th><th>Subgroup</th><th>Email</th><th><Droplets size={11} style={{ verticalAlign: -2 }} /> Foundation School</th><th>Baptised</th><th style={{ width: 32 }}></th></tr></thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{r.fullName}</td><td>{r.subgroup}</td>
                <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>{r.email}</td>
                <td>{fsPill(r.foundationStatus)}</td>
                <td>{/yes/i.test(r.baptism) ? <Pill tone="green">Yes</Pill> : <Pill tone="amber">{r.baptism || 'No'}</Pill>}</td>
                <td>
                  <button onClick={() => dismiss(r.email || r.fullName)} title="Verified — hide from list"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mute, fontSize: 16, lineHeight: 1, padding: '2px 4px' }}>×</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} style={{ color: C.mute, textAlign: 'center', padding: 24 }}>Nobody matches the current filters.</td></tr>}
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

      <Card style={{ padding: 0, overflowX: 'auto' }}>
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
function RoomAssignmentTab({ merged, rooms, handleAddRoom, handleBulkCreateRooms, handleDeleteRoom, handleAssignPerson, handleRemovePersonFromRoom, handleUpdateRoomCapacity, handleSetRoomHead, handleRenameRoom, peoplePerRoom }) {
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomCapacity, setNewRoomCapacity] = useState(peoplePerRoom);
  const [bulkPrefix, setBulkPrefix] = useState('Room');
  const [bulkCount, setBulkCount] = useState(5);
  const [bulkCapacity, setBulkCapacity] = useState(2);
  const [draggedPerson, setDraggedPerson] = useState(null);
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [editingRoomName, setEditingRoomName] = useState('');

  function commitRename(roomId) {
    handleRenameRoom(roomId, editingRoomName);
    setEditingRoomId(null);
  }

  function printRooms() {
    const win = window.open('', '_blank');
    const rows = rooms.map(room => {
      const head = room.people.find(p => p.email === room.roomHead);
      const genders = new Set(room.people.map(p => {
        const g = (p.gender || '').toLowerCase();
        return (g.includes('female') || g === 'f') ? 'female' : 'male';
      }));
      const isMixed = genders.size > 1;
      const isAllFemale = !isMixed && genders.has('female') && room.people.length > 0;
      const isAllMale = !isMixed && genders.has('male') && room.people.length > 0;
      const bg = isAllFemale ? '#FFE8F4' : isAllMale ? '#E8F0FF' : isMixed ? '#FBF0DE' : '#F8F8F8';
      const accent = isAllFemale ? '#C0507A' : isAllMale ? '#2A5FA5' : isMixed ? '#B8710A' : '#6B5C8F';
      const people = room.people.map(p =>
        `<li style="padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.07);font-size:13px;display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <span style="font-weight:${p.email === room.roomHead ? 700 : 400}">${p.fullName}</span>
            ${p.designation ? `<div style="font-size:10px;color:#888;margin-top:2px">${p.designation}</div>` : ''}
          </div>
          ${p.email === room.roomHead ? '<span style="font-weight:700;color:' + accent + ';font-size:11px">HEAD</span>' : ''}
        </li>`
      ).join('');
      return `
        <div style="break-inside:avoid;border:2px solid ${accent};border-radius:10px;background:${bg};padding:16px;margin-bottom:16px">
          <div style="border-bottom:1px solid ${accent}33;padding-bottom:10px;margin-bottom:10px">
            <div style="font-weight:700;font-size:16px;color:${accent};margin-bottom:4px">${room.name}</div>
            <div style="font-size:12px;color:#888">${room.people.length} / ${room.capacity} ${room.people.length === 1 ? 'person' : 'people'}${head ? ` · Head: ${head.fullName}` : ''}${isMixed ? ' · Mixed gender' : ''}</div>
          </div>
          <ol style="margin:0;padding-left:18px">${people || '<li style="color:#aaa;font-size:12px">Empty</li>'}</ol>
        </div>`;
    }).join('');
    win.document.write(`<!doctype html><html><head><title>Room Assignments</title>
      <style>body{font-family:sans-serif;padding:24px;max-width:860px;margin:0 auto}
      h1{font-size:22px;margin-bottom:4px;color:#1A1220}p{color:#888;font-size:13px;margin-bottom:20px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      @media print{@page{margin:1.5cm}.grid{grid-template-columns:1fr 1fr}}</style></head>
      <body><h1>Room Assignments</h1>
      <p>Printed ${new Date().toLocaleDateString('en-CA', { weekday:'long', year:'numeric', month:'long', day:'numeric' })} · ${rooms.length} rooms · ${rooms.reduce((s,r)=>s+r.people.length,0)} assigned</p>
      <div class="grid">${rows}</div></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  const assignedEmails = new Set(rooms.flatMap(r => r.people.map(p => p.email)));
  const unassigned = merged.filter(m => !assignedEmails.has(m.email));
  const byGender = { male: [], female: [] };
  unassigned.forEach(p => {
    const g = (p.gender || '').toLowerCase();
    if (g.includes('female') || g === 'f') byGender.female.push(p);
    else byGender.male.push(p);
  });

  const totalAssigned = rooms.reduce((s, r) => s + r.people.length, 0);
  const totalCapacity = rooms.reduce((s, r) => s + r.capacity, 0);

  return (
    <div>
      {/* header with stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 18, margin: '0 0 6px', fontWeight: 700 }}>Room Assignments</h2>
          <div style={{ fontSize: 12.5, color: C.mute }}>Assign {unassigned.length} registrants to {rooms.length} room{rooms.length !== 1 ? 's' : ''} · {totalAssigned} / {totalCapacity} capacity</div>
        </div>
        <Btn tone="ghost" small onClick={printRooms} disabled={rooms.length === 0} style={{ marginLeft: 16 }}><Download size={13} /> Print</Btn>
      </div>

      {/* tips */}
      <div style={{ background: '#F7F3FF', border: '1px solid #E8E2F8', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 12.5, color: C.mute }}>
        ✋ Drag names from below to drop into rooms. Click room names to rename. Hit capacity? Try adjusting room numbers.
      </div>

      {/* Unassigned registrants by gender */}
      <div style={{ marginBottom: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {['male', 'female'].map(gender => {
          const genderIcon = gender === 'male' ? 'M' : 'F';
          const genderColor = gender === 'male' ? '#2A5FA5' : '#C0507A';
          const genderBg = gender === 'male' ? '#E8F0FF' : '#FFE8F0';
          const count = byGender[gender].length;
          return (
            <div key={gender}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>{genderIcon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: genderColor, textTransform: 'capitalize' }}>{gender}</div>
                  <div style={{ fontSize: 11.5, color: C.mute }}>{count} unassigned</div>
                </div>
              </div>
              <Card style={{ background: genderBg, padding: 12, border: `1px solid ${genderColor}33` }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {byGender[gender].length === 0 ? (
                    <div style={{ fontSize: 12.5, color: C.mute, fontStyle: 'italic', padding: '16px 12px', textAlign: 'center' }}>Everyone assigned!</div>
                  ) : (
                    byGender[gender].map(person => (
                      <div
                        key={person.email}
                        draggable
                        onDragStart={() => setDraggedPerson(person)}
                        style={{
                          padding: '10px 12px',
                          background: '#fff',
                          border: `1.5px solid ${genderColor}66`,
                          borderRadius: 7,
                          fontSize: 12.5,
                          cursor: 'grab',
                          userSelect: 'none',
                          transition: 'all .15s',
                          boxShadow: '0 1px 3px rgba(0,0,0,.06)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.12)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.06)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                      >
                        <div style={{ fontWeight: 500, color: '#1A1220' }}>{person.fullName}</div>
                        <div style={{ fontSize: 11, color: C.mute, marginTop: 2 }}>{person.subgroup}{person.designation ? ` · ${person.designation}` : ''}</div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>
          );
        })}
      </div>

      {/* Room cards */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.ink }}>Rooms</div>
          <div style={{ fontSize: 12.5, color: C.mute }}>({rooms.length} total)</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
          {rooms.map(room => {
            const genderSet = new Set(room.people.map(p => {
              const g = (p.gender || '').toLowerCase();
              return (g.includes('female') || g === 'f') ? 'female' : 'male';
            }));
            const isFull = room.people.length >= room.capacity;
            const isMixed = genderSet.size > 1;
            const isAllFemale = !isMixed && genderSet.has('female') && room.people.length > 0;
            const isAllMale = !isMixed && genderSet.has('male') && room.people.length > 0;
            const isEmpty = room.people.length === 0;
            const roomIcon = isAllFemale ? 'F' : isAllMale ? 'M' : isMixed ? 'MF' : null;
            const roomBg = isFull ? C.redBg : isAllFemale ? '#FFE8F0' : isAllMale ? '#E8F0FF' : C.cream;
            const roomBorder = isFull ? C.red : isMixed ? C.amber : isAllFemale ? '#E0A0C8' : isAllMale ? '#4A7FC4' : C.line;
            const roomAccent = isFull ? C.red : isMixed ? C.amber : isAllFemale ? '#C0507A' : isAllMale ? C.blue : C.mute;

            return (
            <Card
              key={room.id}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'scale(1.02)'; }}
              onDragLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)'; }}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.transform = 'scale(1)';
                if (draggedPerson && room.people.length < room.capacity) {
                  handleAssignPerson(draggedPerson, room.id);
                  setDraggedPerson(null);
                }
              }}
              style={{ background: roomBg, border: `2px solid ${roomBorder}`, transition: 'all .2s', cursor: 'default' }}
            >
              {/* header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${roomBorder}88` }}>
                {roomIcon && <span style={{ fontSize: 11.5, fontWeight: 700, color: roomAccent, background: `${roomAccent}15`, padding: '4px 7px', borderRadius: 5, lineHeight: 1 }}>{roomIcon}</span>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingRoomId === room.id ? (
                    <input
                      autoFocus
                      value={editingRoomName}
                      onChange={e => setEditingRoomName(e.target.value)}
                      onBlur={() => commitRename(room.id)}
                      onKeyDown={e => { if (e.key === 'Enter') commitRename(room.id); if (e.key === 'Escape') setEditingRoomId(null); }}
                      style={{ fontWeight: 700, fontSize: 14, width: '100%', border: `1px solid ${roomAccent}`, borderRadius: 5, padding: '4px 8px', color: roomAccent }}
                    />
                  ) : (
                    <div
                      style={{ fontWeight: 700, fontSize: 14, cursor: 'text', borderRadius: 5, padding: '2px 4px', marginLeft: -4, color: roomAccent, transition: 'all .15s' }}
                      onClick={() => { setEditingRoomId(room.id); setEditingRoomName(room.name); }}
                      onMouseEnter={e => { e.currentTarget.style.background = `${roomAccent}11`; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      title="Click to rename"
                    >{room.name}</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, fontSize: 12.5, color: C.mute }}>
                    <span style={{ fontWeight: 600, color: roomAccent }}>{room.people.length}</span>
                    <span>/</span>
                    <input
                      type="number"
                      min={room.people.length || 1}
                      value={room.capacity}
                      onChange={e => handleUpdateRoomCapacity(room.id, e.target.value)}
                      style={{ width: 45, fontSize: 12, padding: '4px 6px', borderRadius: 5, border: `1px solid ${C.line}`, color: roomAccent, fontWeight: 600 }}
                      title="Capacity"
                    />
                  </div>
                </div>
                <button onClick={() => handleDeleteRoom(room.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mute, padding: '2px 4px', transition: 'all .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = C.red; e.currentTarget.style.transform = 'scale(1.2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = C.mute; e.currentTarget.style.transform = 'scale(1)'; }}
                  title="Delete room">
                  <Trash2 size={15} />
                </button>
              </div>

              {/* status badges */}
              {(isFull || isMixed) && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                  {isFull && <Pill tone="red">Full</Pill>}
                  {isMixed && <Pill tone="amber">Mixed</Pill>}
                </div>
              )}

              {/* people list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {room.people.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: C.mute, fontStyle: 'italic', textAlign: 'center', padding: '24px 8px' }}>Drag names here to assign</div>
                ) : (
                  room.people.map(person => {
                    const isHead = room.roomHead === person.email;
                    const pGender = (person.gender || '').toLowerCase();
                    const isFemale = pGender.includes('female') || pGender === 'f';
                    return (
                      <div
                        key={person.email}
                        style={{
                          padding: '9px 10px',
                          background: isHead ? '#FFF9E6' : '#fff',
                          border: `1.5px solid ${isHead ? '#F5C842' : '#E8E2F8'}`,
                          borderRadius: 6,
                          fontSize: 12,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'all .15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.08)'; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
                      >
                        <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: isHead ? 700 : 500, color: '#1A1220', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {person.fullName}{isHead ? ' ⭐' : ''}
                            </div>
                            {person.designation && <div style={{ fontSize: 10.5, color: C.mute, marginTop: 2 }}>{person.designation}</div>}
                          </div>
                        </span>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button
                            onClick={() => handleSetRoomHead(room.id, person.email)}
                            title={isHead ? 'Remove as room head' : 'Set as room head'}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: isHead ? '#F5C842' : C.mute, padding: '2px 4px', display: 'flex', alignItems: 'center', transition: 'all .15s' }}
                            onMouseEnter={e => { if (!isHead) e.currentTarget.style.color = '#F5C842'; }}
                            onMouseLeave={e => { if (!isHead) e.currentTarget.style.color = C.mute; }}
                          >
                            <Crown size={13} fill={isHead ? 'currentColor' : 'none'} />
                          </button>
                          <button onClick={() => handleRemovePersonFromRoom(person, room.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mute, padding: '2px 4px', fontSize: 14, transition: 'all .15s', lineHeight: 1 }}
                            onMouseEnter={e => { e.currentTarget.style.color = C.red; }}
                            onMouseLeave={e => { e.currentTarget.style.color = C.mute; }}
                            title="Remove from room">✕</button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
            );
          })}
        </div>
      </div>

      {/* Add rooms */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Single room */}
        <Card>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Add single room</div>
              <div style={{ fontSize: 11, color: C.mute }}>Create one room manually</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={newRoomName}
              onChange={e => setNewRoomName(e.target.value)}
              placeholder="Room name"
              style={{ flex: 1, minWidth: 100, fontSize: 13, padding: '7px 10px', borderRadius: 6, border: `1px solid ${C.line}` }}
              onKeyDown={e => { if (e.key === 'Enter') { handleAddRoom(newRoomName, newRoomCapacity); setNewRoomName(''); } }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap' }}>
              Cap:
              <input type="number" min={1} value={newRoomCapacity} onChange={e => setNewRoomCapacity(e.target.value)} style={{ width: 55, fontSize: 13, padding: '7px 8px', borderRadius: 6, border: `1px solid ${C.line}` }} />
            </div>
            <Btn small onClick={() => { handleAddRoom(newRoomName, newRoomCapacity); setNewRoomName(''); }} disabled={rooms.length >= 50}>
              <Plus size={13} /> Add
            </Btn>
          </div>
        </Card>

        {/* Bulk create */}
        <Card>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Bulk create rooms</div>
              <div style={{ fontSize: 11, color: C.mute }}>Generate multiple rooms at once</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <input
              type="text"
              value={bulkPrefix}
              onChange={e => setBulkPrefix(e.target.value)}
              placeholder="Prefix"
              style={{ flex: 1, minWidth: 80, fontSize: 13, padding: '7px 10px', borderRadius: 6, border: `1px solid ${C.line}` }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap' }}>
              Count:
              <input type="number" min={1} max={50} value={bulkCount} onChange={e => setBulkCount(e.target.value)} style={{ width: 55, fontSize: 13, padding: '7px 8px', borderRadius: 6, border: `1px solid ${C.line}` }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap' }}>
              Cap:
              <input type="number" min={1} value={bulkCapacity} onChange={e => setBulkCapacity(e.target.value)} style={{ width: 55, fontSize: 13, padding: '7px 8px', borderRadius: 6, border: `1px solid ${C.line}` }} />
            </div>
            <Btn small onClick={() => handleBulkCreateRooms(bulkPrefix, Number(bulkCount), bulkCapacity)} disabled={rooms.length >= 50 || !bulkCount}>
              <Plus size={13} /> Create
            </Btn>
          </div>
          <div style={{ fontSize: 11, color: C.mute, background: '#F7F3FF', padding: '6px 8px', borderRadius: 5 }}>
            Creates "{bulkPrefix} {rooms.length + 1}", "{bulkPrefix} {rooms.length + 2}", etc. (cap: {bulkCapacity} each)
          </div>
        </Card>
      </div>
    </div>
  );
}
