import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Upload, Users, CheckCircle2, Circle, Filter, Download, RefreshCw, ChevronDown, ChevronRight, AlertCircle, Home, Church, Droplets, DoorOpen, Trash2, Plus, Crown, DollarSign, Pencil, Plane, Settings } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import RegistrationEditModal from './RegistrationEditModal';
import RegistrationDataTab from './RegistrationDataTab';
import SettingsTab from './SettingsTab';
import { useEventConfig } from './EventConfigContext';

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


// Convert any raw time value to "h:mm AM/PM" for display
function fmtTime(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  // ISO datetime: "...T14:30:00..."
  const isoM = s.match(/T(\d{2}):(\d{2})/);
  if (isoM) {
    let h = parseInt(isoM[1], 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${isoM[2]} ${ampm}`;
  }
  // 24-hour: "14:30" or "14:30:00"
  const h24 = s.match(/^(\d{1,2}):(\d{2})/);
  if (h24) {
    let h = parseInt(h24[1], 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${h24[2]} ${ampm}`;
  }
  // "2:30PM" → "2:30 PM"
  const nospace = s.match(/^(\d{1,2}:\d{2})\s*(AM|PM)$/i);
  if (nospace) return `${nospace[1]} ${nospace[2].toUpperCase()}`;
  return s;
}

// ---------- header normalization ----------
const ALIASES = {
  submittedAt: [/submitted/i, /timestamp/i],
  fullNameDirect: [/^full.?name$/i],
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
  out.fullName = out.fullNameDirect || [out.firstName, out.lastName].filter(Boolean).join(' ');
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

// ---------- storage helpers (Supabase-backed) ----------
async function loadKey(key, fallback) {
  try {
    const { data } = await supabase
      .from('registration_config')
      .select('value')
      .eq('key', key)
      .maybeSingle()
    return data ? data.value : fallback
  } catch { return fallback; }
}
async function saveKey(key, value) {
  try {
    const { error } = await supabase
      .from('registration_config')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) console.error('saveKey failed:', key, error.message);
  } catch (e) { console.error('saveKey error:', key, e.message); }
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

const DEFAULT_TABS = [
  { key: 'overview', label: 'Overview', icon: Home },
  { key: 'central',  label: 'Registration Data', icon: Users },
  { key: 'confirm', label: 'Delegates', icon: CheckCircle2, hidden: true },
  { key: 'discipleship', label: 'Foundation & Baptism', icon: Church },
  { key: 'compliance', label: 'Hospitality', icon: AlertCircle },
  { key: 'rooms', label: 'Room Assignments', icon: DoorOpen },
  { key: 'transport', label: 'Transportation', icon: Plane },
  { key: 'finance', label: 'Finance', icon: DollarSign, restricted: true },
  { key: 'import', label: 'Import Data', icon: Upload },
];

export default function App({ limitedToSubgroups = null, sprintEditAccess = false, financeAccess = false, limitedToRegistrationDataOnly = false, userTeamNames = [] }) {
  const { profile, role } = useAuth();
  const { config, reload: reloadConfig } = useEventConfig();
  const eventConfig = config || {
    event_name: 'This Is It 2.0', sprint_pattern: '%This Is It 2.0%',
    early_cutoff_at: '2026-08-06T00:00:00Z', early_fee: 250, standard_fee: 350,
    local_detection_regex: 'manitoba|winnipeg',
    exempt_fellowships: ['BLW University of Manitoba', 'BLW University of Winnipeg'],
    public_token_key: 'tii2_public_token', tab_config: [],
  };
  const [tab, setTab] = useState('overview');
  const exemptFellowships = useMemo(() => new Set(eventConfig.exempt_fellowships || []), [eventConfig]);
  // isGloballyScoped: user has a subgroup scope — controls tab visibility
  const isGloballyScoped = !!(limitedToSubgroups?.length);
  // isLimited: filters displayed data — only applies to Registration Data tab when limitedToRegistrationDataOnly
  const isLimited = isGloballyScoped && (!limitedToRegistrationDataOnly || tab === 'central');
  const [highlightEmail, setHighlightEmail] = useState(null);
  const [roster, setRoster] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [confirmations, setConfirmations] = useState({});
  const [targets, setTargets] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [lastImport, setLastImport] = useState({ roster: null, registrations: null });
  const [subgroupFilter, setSubgroupFilter] = useState('All');
  const [rooms, setRooms] = useState([]);
  const [numRooms, setNumRooms] = useState(5);
  const [peoplePerRoom, setPeoplePerRoom] = useState(2);
  const [workingListDb, setWorkingListDb] = useState([]);
  const [workingListLoading, setWorkingListLoading] = useState(false);
  const [hasFinanceAccess, setHasFinanceAccess] = useState(financeAccess);
  const [hasRoomsAccess, setHasRoomsAccess] = useState(false);
  const [payments, setPayments] = useState([]); // from event_payments table
  const [editingReg, setEditingReg] = useState(null);
  // Track emails edited locally so refetches don't stomp on in-flight or recent saves
  const dirtyEmails = React.useRef(new Set());

  const handleDeleteReg = useCallback(async (regId, regEmail) => {
    try {
      let deleteError;
      if (regId) {
        ({ error: deleteError } = await supabase.from('registrations').delete().eq('id', regId));
      } else if (regEmail) {
        ({ error: deleteError } = await supabase.from('registrations').delete().eq('email', regEmail));
      }
      if (deleteError) throw deleteError;
      dirtyEmails.current.delete(regEmail);
      setRegistrations(prev => prev.filter(r => r.id !== regId && r.email !== regEmail));
    } catch (e) {
      alert(`Failed to delete registration: ${e.message}`);
    }
  }, []);

  const handleSaveReg = useCallback((updated) => {
    // Mark as dirty so the next refetch won't overwrite this record while the
    // DB write is still propagating. Auto-clears after 10 s (well past any write latency).
    dirtyEmails.current.add(updated.email);
    setTimeout(() => dirtyEmails.current.delete(updated.email), 10_000);

    setRegistrations(prev => prev.map(r => {
      if (r.email !== updated.email) return r;
      const merged = { ...r, ...updated };
      if (updated.firstName !== undefined || updated.lastName !== undefined) {
        merged.fullName = updated.fullName || [updated.firstName, updated.lastName].filter(Boolean).join(' ') || r.fullName;
      }
      return merged;
    }));
  }, []);

  const refetchRegistrations = useCallback(async () => {
    try {
      const { data: dbRegs } = await supabase
        .from('registrations')
        .select('*')
        .order('submitted_at', { ascending: false });
      const mapped = (dbRegs || []).map(r => ({
        id: r.id, email: r.email, fullName: r.full_name, firstName: r.first_name,
        lastName: r.last_name, gender: r.gender, subgroup: r.subgroup, fellowship: r.fellowship,
        phone: r.phone, designation: r.designation, shirtSize: r.shirt_size,
        foundationStatus: r.foundation_status, baptism: r.baptism, allergies: r.allergies,
        team: r.team, leadership: r.leadership, submittedAt: r.submitted_at,
        arrivalDate: r.arrival_date, arrivalTime: r.arrival_time, arrivalFlight: r.arrival_flight,
        departureDate: r.departure_date, departureTime: r.departure_time, departureFlight: r.departure_flight,
      }));
      // Merge: keep local version for any record edited in the last 10 s
      setRegistrations(prev => {
        const prevByEmail = new Map(prev.map(r => [r.email, r]));
        const merged = mapped.map(fetched =>
          dirtyEmails.current.has(fetched.email) ? (prevByEmail.get(fetched.email) ?? fetched) : fetched
        );
        // Preserve locally-added rows not yet returned by the DB
        const fetchedEmails = new Set(mapped.map(r => r.email));
        const localOnly = prev.filter(r => !fetchedEmails.has(r.email));
        return [...merged, ...localOnly];
      });
    } catch (e) {
      console.error('Failed to refetch registrations:', e);
    }
  }, []);

  const handleClearFlight = useCallback(async (regEmail) => {
    try {
      // Optimistically update local state first
      setRegistrations(prev => prev.map(r =>
        r.email === regEmail
          ? { ...r, arrivalDate: null, arrivalTime: null, arrivalFlight: null, departureDate: null, departureTime: null, departureFlight: null }
          : r
      ));
      // Try direct client update first (may fail due to RLS)
      const { error, count } = await supabase
        .from('registrations')
        .update({ arrival_date: null, arrival_time: null, arrival_flight: null, departure_date: null, departure_time: null, departure_flight: null })
        .eq('email', regEmail.toLowerCase());

      console.log('Clear flight response:', { error, count });
      if (error) {
        console.error('RLS blocked direct update, trying edge function...');
        // If RLS blocks it, try the edge function
        const { data: fnData, error: fnError } = await supabase.functions.invoke('clear-flight', {
          body: { email: regEmail },
        });
        console.log('Edge function response:', { fnData, fnError });
        if (fnError) throw new Error(fnError.message || 'Failed to clear flight');
      }
    } catch (e) {
      console.error('Failed to clear flight:', e);
      alert(`Failed to clear flight: ${e.message}`);
      // Refetch to undo optimistic update on error
      await refetchRegistrations();
    }
  }, [refetchRegistrations]);

  // Finance access: sprint Finance team, regional_secretary, or explicit grant
  useEffect(() => {
    if (financeAccess) { setHasFinanceAccess(true); return; }
    if (!profile?.id) return;
    if (role === 'regional_secretary') { setHasFinanceAccess(true); return; }
    supabase.from('user_grants')
      .select('id')
      .eq('user_id', profile.id)
      .eq('grant_type', 'finance_data_access')
      .maybeSingle()
      .then(({ data }) => { if (data) setHasFinanceAccess(true); })
      .catch(() => {});
  }, [profile?.id, role, financeAccess]);

  // Rooms access: super_admin, regional_secretary, Programs space members,
  // explicit rooms_access grant, or Accommodation sprint team member
  useEffect(() => {
    if (!profile?.id) return;
    if (role === 'super_admin' || role === 'regional_secretary') { setHasRoomsAccess(true); return; }
    if (profile.is_programs_member) { setHasRoomsAccess(true); return; }

    // Check user_grants for an explicit rooms_access grant (e.g. Pastor Nigel)
    supabase.from('user_grants')
      .select('id')
      .eq('user_id', profile.id)
      .eq('grant_type', 'rooms_access')
      .maybeSingle()
      .then(({ data: grant }) => {
        if (grant) { setHasRoomsAccess(true); return; }
        // Accommodation team members in the active event sprint also get access
        return supabase.from('sprints').select('id').ilike('name', eventConfig.sprint_pattern).limit(1).maybeSingle()
          .then(({ data: sprint }) => {
            if (!sprint?.id) return;
            return supabase.from('sprint_team_members')
              .select('sprint_teams:team_id(name)')
              .eq('user_id', profile.id)
              .then(({ data: teams }) => {
                const ok = (teams || []).some(t =>
                  (t.sprint_teams?.name || '').toLowerCase().includes('accommodation')
                );
                if (ok) setHasRoomsAccess(true);
              });
          });
      })
      .catch(() => {});
  }, [profile?.id, profile?.is_programs_member, role, eventConfig.sprint_pattern]);

  useEffect(() => {
    (async () => {
      const [r, reg, conf, tg, li] = await Promise.all([
        loadKey('roster', []), loadKey('registrations', []),
        loadKey('confirmations', {}), loadKey('targets', {}),
        loadKey('last-import', { roster: null, registrations: null }),
      ]);

      // Always fetch roster from Supabase (authoritative source)
      let finalRoster = r;
      try {
        let rosterQ = supabase.from('roster').select('*').order('last_name', { ascending: true });
        if (limitedToSubgroups?.length) rosterQ = rosterQ.in('subgroup', limitedToSubgroups);
        const { data: dbRoster } = await rosterQ;
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

      // Fetch registrations from Supabase; always re-fetch for scoped users to prevent stale cache leaking out-of-scope rows
      let finalReg = reg;
      if (!reg || reg.length === 0 || limitedToSubgroups?.length) {
        try {
          let regsQ = supabase.from('registrations').select('*').order('submitted_at', { ascending: false });
          if (limitedToSubgroups?.length) regsQ = regsQ.in('subgroup', limitedToSubgroups);
          const { data: dbRegs } = await regsQ;
          // Rename snake_case columns to camelCase for compatibility
          finalReg = (dbRegs || []).map(r => ({
            id: r.id,
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
            submittedAt: r.submitted_at,
            arrivalDate: r.arrival_date,
            arrivalTime: r.arrival_time,
            arrivalFlight: r.arrival_flight,
            departureDate: r.departure_date,
            departureTime: r.departure_time,
            departureFlight: r.departure_flight,
          }));
        } catch (e) {
          console.error('Failed to fetch registrations from Supabase:', e);
        }
      }

      // Fetch working list from Supabase
      try {
        let wlQ = supabase.from('working_list').select('*').order('subgroup', { ascending: true });
        if (limitedToSubgroups?.length) wlQ = wlQ.in('subgroup', limitedToSubgroups);
        const { data: dbWl } = await wlQ;
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

      setRoster(finalRoster); setRegistrations(finalReg); setConfirmations(conf); setTargets(tg); setLastImport(li);

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

  const registrationsFiltered = useMemo(() => {
    if (!isLimited) return registrations;
    return registrations.filter(r => limitedToSubgroups.includes(r.subgroup));
  }, [registrations, isLimited, limitedToSubgroups]);

  const paymentByEmail = useMemo(
    () => Object.fromEntries(payments.map(p => [p.email, p])),
    [payments],
  );

  const merged = useMemo(() => registrationsFiltered.map(r => {
    const conf = confirmations[r.email] || {};
    const pay = paymentByEmail[r.email];
    const hasPaid = pay ? (Number(pay.amount_paid) || 0) > 0 && (Number(pay.amount_paid) || 0) >= (Number(pay.amount_expected) || 0) : false;
    const hasFlightInfo = !!(r.arrivalFlight || r.departureFlight || r.arrivalDate || r.departureDate);
    // isLocal = explicitly marked as driving/not flying (excludes from Transportation tab)
    const isLocal = !!conf.inState;
    // fullyConfirmed = confirmed attending by any means: paid, has a flight, or marked in-state
    const fullyConfirmed = hasPaid || hasFlightInfo || isLocal;
    return {
      ...r,
      hasPaid,
      hasFlightInfo,
      inStateConfirmed: isLocal,
      fullyConfirmed,
    };
  }), [registrationsFiltered, confirmations, paymentByEmail]);

  const rosterFiltered = useMemo(() => {
    if (!isLimited) return roster;
    return roster.filter(r => limitedToSubgroups.includes(r.subgroup));
  }, [roster, isLimited, limitedToSubgroups]);

  const subgroups = useMemo(() => {
    const s = new Set([...rosterFiltered.map(r => r.subgroup), ...registrationsFiltered.map(r => r.subgroup)]);
    return [...s].filter(Boolean).sort();
  }, [rosterFiltered, registrationsFiltered]);

  const bySubgroup = useMemo(() => {
    const out = {};
    subgroups.forEach(sg => { out[sg] = { total: 0, confirmed: 0, flights: 0, flightsNeeded: 0 }; });
    merged.forEach(r => {
      if (!out[r.subgroup]) out[r.subgroup] = { total: 0, confirmed: 0, flights: 0, flightsNeeded: 0 };
      out[r.subgroup].total++;
      if (r.fullyConfirmed) out[r.subgroup].confirmed++;
      if (r.arrivalFlight || r.departureFlight) out[r.subgroup].flights++;

      // Count out-of-state people (excluding exempt fellowships) as flights needed
      if (!r.inStateConfirmed && !exemptFellowships.has(r.fellowship)) {
        out[r.subgroup].flightsNeeded++;
      }
    });
    return out;
  }, [merged, subgroups, exemptFellowships]);

  const totalRegs = registrationsFiltered.length;
  const totalRegTarget = Object.values(targets).reduce((s, t) => s + (Number(t.reg) || 0), 0);

  const workingList = useMemo(() => {
    return rosterFiltered.filter(p => !regByEmail[p.email]);
  }, [rosterFiltered, regByEmail]);

  const visibleTabs = useMemo(() => {
    const overrides = Object.fromEntries((eventConfig.tab_config || []).map((item) => [item.key, item]));
    let tabs = DEFAULT_TABS.map((item) => ({ ...item, ...(config ? { hidden: false } : {}), ...(overrides[item.key] || {}) }));
    if (role === 'super_admin') tabs = [...tabs, { key: 'settings', label: 'Settings', icon: Settings }];
    const privileged = role === 'super_admin' || role === 'regional_secretary';
    const allowed = tabs.filter(t => {
      if (t.hidden) return false;
      if (t.key === 'settings') return role === 'super_admin';
      if (t.team_whitelist?.length) {
        return privileged || t.team_whitelist.some((allowedTeam) => userTeamNames.some((team) => team.toLowerCase().includes(allowedTeam.toLowerCase())));
      }
      if (t.restricted && !hasFinanceAccess && role !== 'regional_secretary') return false;
      // Rooms: Accommodation/Programs teams, reg sec, super admin only
      if (t.key === 'rooms' && !hasRoomsAccess) return false;
      // Import Data: super admin only
      if (t.key === 'import' && role !== 'super_admin') return false;
      if (isGloballyScoped && ['import', 'rooms', 'finance'].includes(t.key)) return false;
      return true;
    });
    return allowed;
  }, [config, eventConfig, hasFinanceAccess, hasRoomsAccess, isGloballyScoped, role, userTeamNames]);

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
    const li = { ...lastImport, [kind]: now };
    setLastImport(li); await saveKey('last-import', li);
  }

  async function handleImportWorkingList(text) {
    if (!text || !text.trim()) return;
    const rows = parseCSV(text);
    if (!rows.length) return;
    const now = new Date().toISOString();
    const records = rows.map(r => ({
      email: (r.email || '').toLowerCase().trim(),
      full_name: r.fullName || `${r.firstName} ${r.lastName}`.trim(),
      subgroup: r.subgroup || '',
      fellowship: r.fellowship || '',
      phone_number: r.phone_number || r.phone || '',
      synced_at: now,
      manually_added: false,
    })).filter(r => r.email);

    // Safety guard: refuse to wipe existing data if the new import looks suspiciously small
    if (records.length === 0) {
      alert('No valid rows found in the pasted data. Import cancelled — existing working list is unchanged.');
      return;
    }

    try {
      // Preserve absent markings and manually-added rows across re-import
      const { data: existing } = await supabase.from('working_list').select('email, absent, absent_reason, manually_added, full_name, subgroup, fellowship, phone_number');
      const absentByEmail = {};
      const manualRows = [];
      for (const row of existing || []) {
        if (row.absent) absentByEmail[row.email] = { absent: true, absent_reason: row.absent_reason };
        if (row.manually_added) manualRows.push(row);
      }

      // Delete only sheet-synced rows (manually_added = false OR null for legacy rows)
      await supabase.from('working_list').delete().or('manually_added.eq.false,manually_added.is.null');

      // Re-insert with absent data preserved
      const withAbsent = records.map(r => ({ ...r, ...(absentByEmail[r.email] || {}) }));
      const { error } = await supabase.from('working_list').insert(withAbsent);
      if (error) throw error;

      // Keep manually-added entries that aren't overwritten by the import
      const importEmails = new Set(records.map(r => r.email));
      const manualToKeep = manualRows.filter(m => !importEmails.has(m.email));
      if (manualToKeep.length) await supabase.from('working_list').insert(manualToKeep.map(m => ({ ...m, synced_at: now })));

      // Refresh state
      const { data: refreshed } = await supabase.from('working_list').select('*').order('subgroup');
      setWorkingListDb(refreshed || withAbsent);
    } catch (e) {
      console.error('Failed to save working list:', e);
      alert('Failed to save working list to database: ' + e.message);
    }
    const li = { ...lastImport, 'working-list': now };
    setLastImport(li); await saveKey('last-import', li);
  }

  async function handleAddToWorkingList(person) {
    const now = new Date().toISOString();
    const row = { ...person, synced_at: now, manually_added: true, absent: false };
    try {
      const { error } = await supabase.from('working_list').insert(row);
      if (error) throw error;
      setWorkingListDb(prev => [...prev, row]);
    } catch (e) {
      alert('Failed to add person: ' + e.message);
    }
  }

  async function handleMarkAbsent(email, absent, reason) {
    try {
      const { error } = await supabase.from('working_list').update({ absent, absent_reason: reason || null }).eq('email', email);
      if (error) throw error;
      setWorkingListDb(prev => prev.map(p => p.email === email ? { ...p, absent, absent_reason: reason || null } : p));
    } catch (e) {
      alert('Failed to update: ' + e.message);
    }
  }

  async function handleEditWorkingListPerson(email, updates) {
    try {
      const { error } = await supabase.from('working_list').update(updates).eq('email', email);
      if (error) throw error;
      setWorkingListDb(prev => prev.map(p => p.email === email ? { ...p, ...updates } : p));
    } catch (e) {
      alert('Failed to update: ' + e.message);
    }
  }

  async function handleRemoveFromWorkingList(email) {
    try {
      const { error } = await supabase.from('working_list').delete().eq('email', email);
      if (error) throw error;
      setWorkingListDb(prev => prev.filter(p => p.email !== email));
    } catch (e) {
      alert('Failed to remove: ' + e.message);
    }
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
          <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 20, color: '#fff', letterSpacing: -0.3 }}>
            {eventConfig.event_name}{isLimited && <span style={{ fontSize: 14, fontWeight: 500, marginLeft: 12, opacity: 0.9 }}>• Viewing: {limitedToSubgroups.join(', ')}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, fontFamily: 'JetBrains Mono', fontSize: 11, color: '#D8CCF0' }}>
          <span>roster: {rosterFiltered.length > 0 ? rosterFiltered.length : '—'}</span>
          <span>reg: {registrationsFiltered.length > 0 ? registrationsFiltered.length : '—'}</span>
        </div>
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '14px 32px 0', borderBottom: `1px solid ${C.line}`, background: C.paper, overflowX: 'auto' }}>
        {visibleTabs.map(t => {
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

      {editingReg && (
        <RegistrationEditModal
          registration={editingReg}
          onClose={() => setEditingReg(null)}
          onSave={(updated) => { handleSaveReg(updated); setEditingReg(null); }}
        />
      )}

      <div style={{ padding: 28, maxWidth: 1280, margin: '0 auto' }}>
        {tab === 'overview' && (
          <OverviewTab {...{ totalRegs, totalRegTarget, subgroups, bySubgroup, targets, setTarget, merged, isLimited,
            canSetTargets: role === 'super_admin' || role === 'regional_secretary' || (role === 'pastor' && !isGloballyScoped) }} />
        )}
        {tab === 'central' && (
          <RegistrationDataTab
            workingListDb={workingListDb}
            merged={merged}
            paymentByEmail={paymentByEmail}
            hasFinanceAccess={hasFinanceAccess}
            subgroups={subgroups}
            isLimited={isLimited}
            role={role}
            onSaveReg={handleSaveReg}
            onDeleteReg={handleDeleteReg}
            sprintEditAccess={sprintEditAccess}
            onMarkAbsent={handleMarkAbsent}
            onAddPerson={handleAddToWorkingList}
            onEditPerson={handleEditWorkingListPerson}
            onRemove={handleRemoveFromWorkingList}
            onConfirm={toggleConfirm}
            highlightEmail={highlightEmail}
            onClearHighlight={() => setHighlightEmail(null)}
            publicTokenKey={eventConfig.public_token_key}
          />
        )}
        {tab === 'confirm' && <ConfirmTab {...{ merged, subgroupFilter, setSubgroupFilter, subgroups, isLimited, onEditReg: setEditingReg }} />}
        {tab === 'discipleship' && <DiscipleshipTab {...{ merged, subgroupFilter, setSubgroupFilter, subgroups, isLimited }} />}
        {tab === 'compliance' && <DelegateComplianceTab {...{ merged, subgroupFilter, setSubgroupFilter, subgroups, isLimited }} />}
        {tab === 'rooms' && <RoomAssignmentTab {...{ merged: merged.filter(r => r.fullyConfirmed), rooms, handleAddRoom, handleBulkCreateRooms, handleDeleteRoom, handleAssignPerson, handleRemovePersonFromRoom, handleUpdateRoomCapacity, handleSetRoomHead, handleRenameRoom, peoplePerRoom, isLimited }} />}
        {tab === 'transport' && <TransportTab {...{ merged, isLimited, onApplied: refetchRegistrations, onClearFlight: handleClearFlight, exemptFellowships }} />}
        {tab === 'finance' && (hasFinanceAccess
          ? <FinanceTab {...{ registrations: registrationsFiltered, payments, setPayments, userId: profile?.id, earlyCutoffAt: eventConfig.early_cutoff_at, earlyFee: eventConfig.early_fee, standardFee: eventConfig.standard_fee }} />
          : <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
              <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Access Restricted</div>
              <div style={{ color: C.mute, fontSize: 14 }}>Finance data is only accessible to the Regional Secretary and authorised team members.</div>
            </div>
        )}
        {tab === 'import' && <ImportTab {...{ handleImport, handleImportWorkingList, roster: rosterFiltered, registrations: registrationsFiltered, workingListDb, lastImport, isLimited, onApiSyncApplied: refetchRegistrations }} />}
        {tab === 'settings' && role === 'super_admin' && <SettingsTab config={config} onSaved={reloadConfig} />}
      </div>
    </div>
  );
}

// ============ OVERVIEW ============
function OverviewTab({ totalRegs, totalRegTarget, subgroups, bySubgroup, targets, setTarget, merged, isLimited, canSetTargets }) {
  const regPct = totalRegTarget ? Math.round((totalRegs / totalRegTarget) * 100) : 0;
  const confirmedCount = useMemo(() => merged.filter(r => r.fullyConfirmed).length, [merged]);
  const totalFlightsNeeded = useMemo(() => Object.values(bySubgroup).reduce((s, v) => s + (v.flightsNeeded || 0), 0), [bySubgroup]);
  const totalFlightsBooked = useMemo(() => Object.values(bySubgroup).reduce((s, v) => s + (v.flights || 0), 0), [bySubgroup]);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
        <SummaryCard label="Total registrations" current={totalRegs} target={totalRegTarget} pct={regPct} />
        <SummaryCard label="Confirmed" current={confirmedCount} target={totalRegs} pct={totalRegs ? Math.round((confirmedCount / totalRegs) * 100) : 0} />
        <SummaryCard label="Flights" current={totalFlightsBooked} target={totalFlightsNeeded} pct={totalFlightsNeeded ? Math.round((totalFlightsBooked / totalFlightsNeeded) * 100) : 0} />
      </div>


      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, margin: 0 }}>By subgroup</h2>
      </div>

      <Card style={{ padding: 0, overflowX: 'auto' }}>
        <div style={{ overflowX: 'auto', minWidth: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Subgroup</th>
              <th>Registration target</th>
              <th>Registrations</th>
              <th>Difference (reg)</th>
              <th>Flights needed</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {subgroups.map(sg => {
              const s = bySubgroup[sg] || { total: 0 };
              const t = targets[sg] || {};
              const regTarget = Number(t.reg) || 0;
              const regPctSg = regTarget ? Math.round((s.total / regTarget) * 100) : 0;
              const tone = statusTone(regPctSg);
              return (
                <tr key={sg}>
                  <td style={{ fontWeight: 600 }}>{sg}</td>
                  <td>
                    {canSetTargets
                      ? <input type="number" style={{ width: 60 }} value={t.reg ?? ''} placeholder="0"
                          onChange={e => setTarget(sg, 'reg', e.target.value)} />
                      : <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12.5 }}>{t.reg || '—'}</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 110 }}>
                      <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12.5 }}>{s.total}</span>
                      <div style={{ flex: 1 }}><ProgressBar pct={regPctSg} tone="green" /></div>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12.5, color: regTarget - s.total > 0 ? C.green : C.mute }}>
                    {regTarget ? (regTarget - s.total > 0 ? `−${regTarget - s.total}` : `+${s.total - regTarget}`) : '—'}
                  </td>
                  <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12.5, color: C.mute }}>
                    {s.flightsNeeded || 0}
                  </td>
                  <td><Pill tone={tone}>{statusLabel(regPctSg)}</Pill></td>
                </tr>
              );
            })}
            {subgroups.length === 0 && <tr><td colSpan={6} style={{ color: C.mute, textAlign: 'center', padding: 24 }}>Import registrations to see subgroup breakdown.</td></tr>}
          </tbody>
        </table>
        </div>
      </Card>

      <div style={{ marginTop: 10, display: 'flex', gap: 16, alignItems: 'center', padding: '8px 4px' }}>
        <span style={{ fontSize: 11.5, color: C.mute, fontFamily: 'JetBrains Mono', textTransform: 'uppercase', letterSpacing: 0.05 }}>Status:</span>
        {[
          { tone: 'green', label: 'On track', desc: '≥ 95% of reg target' },
          { tone: 'amber', label: 'Tracking', desc: '75–94%' },
          { tone: 'red',   label: 'Behind',   desc: '< 75%' },
        ].map(({ tone, label, desc }) => (
          <div key={tone} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Pill tone={tone}>{label}</Pill>
            <span style={{ fontSize: 11.5, color: C.mute }}>{desc}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Btn tone="ghost" small onClick={() => downloadCSV('subgroup-overview.csv', subgroups.map(sg => ({
          subgroup: sg, regTarget: targets[sg]?.reg || 0, regs: bySubgroup[sg]?.total || 0,
        })), [
          { key: 'subgroup', label: 'Subgroup' }, { key: 'regTarget', label: 'Reg Target' }, { key: 'regs', label: 'Registrations' },
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


// ============ WORKING LIST ============
const TITLE_RE = /\b(pastor|bro|brother|sis|sister|dr|rev|reverend|mr|mrs|ms|evangelist|evang)\b\.?/gi;
function normalizeName(n) {
  return (n || '').replace(TITLE_RE, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function AddPersonModal({ subgroups, onSave, onClose }) {
  const [form, setForm] = useState({ full_name: '', email: '', subgroup: '', fellowship: '', phone_number: '' });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const valid = form.full_name.trim() && form.email.trim();
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 420, maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,.18)' }}>
        <h3 style={{ fontFamily: 'Space Grotesk', margin: '0 0 18px' }}>Add person to working list</h3>
        {[
          { k: 'full_name', label: 'Full Name *' },
          { k: 'email', label: 'Email *' },
          { k: 'fellowship', label: 'Fellowship' },
          { k: 'phone_number', label: 'Phone' },
        ].map(({ k, label }) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.mute, marginBottom: 4 }}>{label}</div>
            <input value={form[k]} onChange={set(k)} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1px solid ${C.line}`, fontFamily: 'Inter', fontSize: 13 }} />
          </div>
        ))}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.mute, marginBottom: 4 }}>Subgroup</div>
          <select value={form.subgroup} onChange={set('subgroup')} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1px solid ${C.line}`, fontFamily: 'Inter', fontSize: 13 }}>
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

function LinkRegistrationModal({ person, registrations, onLink, onClose }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return registrations.slice(0, 50);
    return registrations.filter(r =>
      (r.fullName || '').toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q) ||
      (r.subgroup || '').toLowerCase().includes(q)
    ).slice(0, 50);
  }, [registrations, search]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: 480, maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,.18)' }}>
        <h3 style={{ fontFamily: 'Space Grotesk', margin: '0 0 4px' }}>Link to registration</h3>
        <div style={{ fontSize: 12.5, color: C.mute, marginBottom: 14 }}>Linking <strong>{person.full_name}</strong> — select their matching registration below.</div>
        <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email or subgroup…" style={{ padding: '8px 10px', borderRadius: 7, border: `1px solid ${C.line}`, fontFamily: 'Inter', fontSize: 13, marginBottom: 10 }} />
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 && <div style={{ color: C.mute, padding: 16, textAlign: 'center' }}>No matches</div>}
          {filtered.map((r, i) => (
            <div key={i} onClick={() => onLink(r.email)} style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, border: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F5F0FF'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.fullName}</div>
                <div style={{ fontSize: 12, color: C.mute }}>{r.subgroup} · {r.email}</div>
              </div>
              <div style={{ fontSize: 12 }}><Pill tone="green">Select</Pill></div>
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

function WorkingListRow({ p, useDb, canEdit, isLimited, registrations, onMarkAbsent, onEdit, onRemove, onLink, onUnlink, onSetStatusFilter, onGoToRegistration }) {
  const [showAbsent, setShowAbsent] = useState(false);
  const [absentReason, setAbsentReason] = useState(p.absent_reason || '');
  const [editing, setEditing] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: p.full_name, email: p.email, subgroup: p.subgroup, fellowship: p.fellowship, phone_number: p.phone_number || '' });

  const rowStyle = p.registered
    ? { background: '#F0FAF4', opacity: 0.7 }
    : p.absent
    ? { background: '#FAFAFA', opacity: 0.65 }
    : { background: '#FFFBF4' };

  if (editing) {
    return (
      <>
        <tr style={{ background: '#F5F0FF' }}>
          <td><input value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} style={{ width: '100%', padding: '4px 6px', borderRadius: 5, border: `1px solid ${C.line}`, fontFamily: 'Inter', fontSize: 12.5 }} /></td>
          <td><input value={editForm.fellowship} onChange={e => setEditForm(f => ({ ...f, fellowship: e.target.value }))} style={{ width: '100%', padding: '4px 6px', borderRadius: 5, border: `1px solid ${C.line}`, fontFamily: 'Inter', fontSize: 12.5 }} /></td>
          <td><input value={editForm.phone_number} onChange={e => setEditForm(f => ({ ...f, phone_number: e.target.value }))} style={{ width: '100%', padding: '4px 6px', borderRadius: 5, border: `1px solid ${C.line}`, fontFamily: 'Inter', fontSize: 12.5 }} /></td>
          <td><input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} style={{ width: '100%', padding: '4px 6px', borderRadius: 5, border: `1px solid ${C.line}`, fontFamily: 'Inter', fontSize: 12 }} /></td>
          {useDb && <td>—</td>}
          <td>
            <div style={{ display: 'flex', gap: 4 }}>
              <Btn tone="primary" small onClick={() => { onEdit(p.email, editForm); setEditing(false); }}>Save</Btn>
              <Btn tone="ghost" small onClick={() => setEditing(false)}>Cancel</Btn>
            </div>
          </td>
        </tr>
      </>
    );
  }

  return (
    <>
      <tr style={useDb ? rowStyle : undefined}>
        <td style={p.absent ? { textDecoration: 'line-through', color: C.mute } : undefined}>{p.full_name}</td>
        <td>{p.fellowship || '—'}</td>
        <td>{p.phone_number || '—'}</td>
        <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>{p.email}</td>
        {useDb && (
          <td>
            {p.registered
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span onClick={() => onSetStatusFilter?.('registered')} style={{ cursor: 'pointer' }} title="Filter by Registered"><Pill tone="green">{p.fuzzyMatched ? 'Registered (fuzzy)' : p.linked_registration_email ? 'Registered (linked)' : 'Registered'}</Pill></span>
                  {onGoToRegistration && <button onClick={() => onGoToRegistration(p.email)} style={{ fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: '#4C2A92', padding: 0, fontFamily: 'Inter', textDecoration: 'underline', textUnderlineOffset: 2 }} title="View in Registration Data">View →</button>}
                </div>
              : p.absent ? <span onClick={() => onSetStatusFilter?.('absent')} style={{ cursor: 'pointer' }} title="Filter by Absent"><Pill tone="mute">Absent</Pill></span>
              : <span onClick={() => onSetStatusFilter?.('pending')} style={{ cursor: 'pointer' }} title="Filter by Pending"><Pill tone="amber">Pending</Pill></span>}
          </td>
        )}
        {canEdit && !isLimited && (
          <td>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {!p.registered && !p.absent && (
                <button onClick={() => setShowAbsent(true)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: `1px solid ${C.amber}`, background: 'transparent', color: C.amber, cursor: 'pointer', fontFamily: 'Inter' }}>Absent</button>
              )}
              {p.absent && (
                <button onClick={() => { onMarkAbsent(p.email, false, ''); setAbsentReason(''); }} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: `1px solid ${C.line}`, background: 'transparent', color: C.mute, cursor: 'pointer', fontFamily: 'Inter' }}>Undo absent</button>
              )}
              {p.fuzzyMatched && p.fuzzyMatchedEmail && (
                <button onClick={() => onLink(p.email, p.fuzzyMatchedEmail)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: `1px solid ${C.green}`, background: C.greenBg, color: C.green, cursor: 'pointer', fontFamily: 'Inter', fontWeight: 600 }}>✓ Validate match</button>
              )}
              {!p.registered && !p.linked_registration_email && (
                <button onClick={() => setShowLink(true)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: `1px solid ${C.purple}`, background: 'transparent', color: C.purple, cursor: 'pointer', fontFamily: 'Inter' }}>Link reg</button>
              )}
              {p.linked_registration_email && (
                <button onClick={() => onUnlink(p.email)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: `1px solid ${C.line}`, background: 'transparent', color: C.mute, cursor: 'pointer', fontFamily: 'Inter' }}>Unlink</button>
              )}
              <button onClick={() => setEditing(true)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: `1px solid ${C.line}`, background: 'transparent', color: C.ink, cursor: 'pointer', fontFamily: 'Inter' }}>Edit</button>
              {p.manually_added && (
                <button onClick={() => { if (confirm(`Remove ${p.full_name} from the working list?`)) onRemove(p.email); }} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: `1px solid #F44`, background: 'transparent', color: '#D00', cursor: 'pointer', fontFamily: 'Inter' }}>Remove</button>
              )}
            </div>
          </td>
        )}
      </tr>
      {showLink && createPortal(
        <LinkRegistrationModal person={p} registrations={registrations} onLink={email => { onLink(p.email, email); setShowLink(false); }} onClose={() => setShowLink(false)} />,
        document.body
      )}
      {showAbsent && (
        <tr style={{ background: '#FFF8E6' }}>
          <td colSpan={canEdit ? (useDb ? 6 : 5) : (useDb ? 5 : 4)} style={{ padding: '8px 12px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>Reason for absence:</span>
              <input autoFocus value={absentReason} onChange={e => setAbsentReason(e.target.value)} placeholder="e.g. travelling, health, work" style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.line}`, fontFamily: 'Inter', fontSize: 12.5 }} onKeyDown={e => { if (e.key === 'Enter') { onMarkAbsent(p.email, true, absentReason); setShowAbsent(false); } if (e.key === 'Escape') setShowAbsent(false); }} />
              <Btn tone="primary" small onClick={() => { onMarkAbsent(p.email, true, absentReason); setShowAbsent(false); }}>Confirm</Btn>
              <Btn tone="ghost" small onClick={() => setShowAbsent(false)}>Cancel</Btn>
            </div>
          </td>
        </tr>
      )}
      {p.absent && p.absent_reason && (
        <tr style={{ background: '#FAFAFA' }}>
          <td colSpan={canEdit ? (useDb ? 6 : 5) : (useDb ? 5 : 4)} style={{ padding: '4px 12px 8px', fontSize: 12, color: C.mute, fontStyle: 'italic' }}>
            Reason: {p.absent_reason}
          </td>
        </tr>
      )}
    </>
  );
}

function WorkingListTab({ workingList, workingListDb, workingListLoading, regByEmail, subgroupFilter, setSubgroupFilter, subgroups, isLimited, merged, role, onAddPerson, onMarkAbsent, onEditPerson, onRemove, onGoToRegistration }) {
  // Only use the DB working list when there are sheet-synced (imported) entries.
  // Manually-added entries alone don't count — they get merged into both branches below.
  const useDb = workingListDb.some(p => !p.manually_added);
  const [fellowshipFilter, setFellowshipFilter] = useState('All');
  // 'all' = pending + absent (not registered), 'pending' = not reg + not absent, 'absent' = absent only, 'registered' = registered only
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');

  const canEdit = !isLimited && (role === 'super_admin' || role === 'regional_secretary' || role === 'dept_lead' || role === 'pastor');

  const fellowships = useMemo(() => {
    const f = new Set(merged.map(r => r.fellowship).filter(Boolean));
    return [...f].sort();
  }, [merged]);

  // Build a normalized-name → registration-email map for fuzzy fallback
  const regByNormalizedName = useMemo(() => {
    const map = {};
    merged.forEach(r => {
      const n = normalizeName(r.fullName || '');
      if (n) map[n] = r.email;
    });
    return map;
  }, [merged]);

  const source = useMemo(() => {
    function resolveRegistered(p) {
      // 1. Manual link takes priority
      if (p.linked_registration_email && regByEmail[p.linked_registration_email]) return { registered: true, fuzzyMatched: false, fuzzyMatchedEmail: null };
      // 2. Direct email match
      if (regByEmail[p.email]) return { registered: true, fuzzyMatched: false, fuzzyMatchedEmail: null };
      // 3. Fuzzy name match
      const n = normalizeName(p.full_name);
      if (n && regByNormalizedName[n]) return { registered: true, fuzzyMatched: true, fuzzyMatchedEmail: regByNormalizedName[n] };
      return { registered: false, fuzzyMatched: false, fuzzyMatchedEmail: null };
    }

    const manualEntries = workingListDb
      .filter(p => p.manually_added)
      .map(p => {
        const { registered, fuzzyMatched } = resolveRegistered(p);
        return {
          full_name: p.full_name,
          subgroup: p.subgroup,
          fellowship: p.fellowship,
          phone_number: p.phone_number || '',
          email: p.email,
          absent: !!p.absent,
          absent_reason: p.absent_reason || '',
          manually_added: true,
          linked_registration_email: p.linked_registration_email || null,
          registered,
          fuzzyMatched,
          fuzzyMatchedEmail,
        };
      });

    if (useDb) {
      // DB branch: all imported rows + manually-added (dedup by email)
      const importedEmails = new Set();
      const importedRows = workingListDb
        .filter(p => !p.manually_added)
        .map(p => {
          importedEmails.add(p.email);
          const { registered, fuzzyMatched, fuzzyMatchedEmail } = resolveRegistered(p);
          return {
            full_name: p.full_name,
            subgroup: p.subgroup,
            fellowship: p.fellowship,
            phone_number: p.phone_number || '',
            email: p.email,
            absent: !!p.absent,
            absent_reason: p.absent_reason || '',
            manually_added: false,
            linked_registration_email: p.linked_registration_email || null,
            registered,
            fuzzyMatched,
            fuzzyMatchedEmail,
          };
        });
      const extraManual = manualEntries.filter(p => !importedEmails.has(p.email));
      return [...importedRows, ...extraManual];
    }

    // Roster branch: everyone not yet registered + manually-added (dedup by email)
    const rosterEmails = new Set();
    const rosterRows = workingList.map(p => {
      const email = p.email;
      rosterEmails.add(email);
      return {
        full_name: p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
        subgroup: p.subgroup,
        fellowship: p.fellowship || '',
        phone_number: p.phone_number || '',
        email,
        absent: false,
        absent_reason: '',
        manually_added: false,
        linked_registration_email: null,
        registered: false,
        fuzzyMatched: false,
      };
    });
    // Overlay absent/linked data from DB onto matching roster entries
    const dbByEmail = Object.fromEntries(workingListDb.map(p => [p.email, p]));
    const enrichedRoster = rosterRows.map(p => {
      const db = dbByEmail[p.email];
      if (!db) return p;
      const { registered, fuzzyMatched } = resolveRegistered(db);
      return {
        ...p,
        absent: !!db.absent,
        absent_reason: db.absent_reason || '',
        linked_registration_email: db.linked_registration_email || null,
        registered,
        fuzzyMatched,
      };
    });
    const extraManual = manualEntries.filter(p => !rosterEmails.has(p.email));
    return [...enrichedRoster, ...extraManual];
  }, [useDb, workingListDb, workingList, regByEmail, regByNormalizedName]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return source.filter(p => {
      if (statusFilter === 'all' && p.absent) return false;
      if (statusFilter === 'pending' && (p.registered || p.absent)) return false;
      if (statusFilter === 'absent' && !p.absent) return false;
      if (statusFilter === 'registered' && !p.registered) return false;
      if (isLimited) { if (fellowshipFilter !== 'All' && p.fellowship !== fellowshipFilter) return false; }
      else { if (subgroupFilter !== 'All' && p.subgroup !== subgroupFilter) return false; }
      if (q) {
        return (p.full_name || '').toLowerCase().includes(q) ||
               (p.email || '').toLowerCase().includes(q) ||
               (p.fellowship || '').toLowerCase().includes(q) ||
               (p.subgroup || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [source, isLimited, fellowshipFilter, subgroupFilter, statusFilter, search]);

  const byGroup = useMemo(() => {
    const g = {};
    filtered.forEach(p => { (g[p.subgroup || 'Unassigned'] ||= []).push(p); });
    return g;
  }, [filtered]);

  const totalNotReg = source.filter(p => !p.registered && !p.absent).length;
  const totalRegistered = source.filter(p => p.registered).length;
  const totalAbsent = source.filter(p => p.absent).length;

  async function handleSaveAdd(person) {
    await onAddPerson(person);
    setShowAddModal(false);
  }

  return (
    <div>
      {showAddModal && <AddPersonModal subgroups={subgroups} onSave={handleSaveAdd} onClose={() => setShowAddModal(false)} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, fellowship, subgroup…"
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.line}`, fontFamily: 'Inter', fontSize: 13, outline: 'none' }}
        />
        {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mute, fontSize: 18, lineHeight: 1 }}>×</button>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, margin: 0 }}>Working list</h2>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {useDb ? (
              <>
                <span style={{ color: totalNotReg > 0 ? C.amber : C.green }}>{totalNotReg} to follow up</span>
                {totalRegistered > 0 && <span style={{ color: C.green }}>· {totalRegistered} registered</span>}
                {totalAbsent > 0 && <span style={{ color: C.mute }}>· {totalAbsent} absent</span>}
              </>
            ) : (
              <span>On the roster but not yet registered — {source.length} people to follow up with.</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {useDb && (
            <div style={{ display: 'flex', background: '#F3F0EB', borderRadius: 8, padding: 2, gap: 2 }}>
              {[
                { key: 'all', label: `All (${source.length})` },
                { key: 'pending', label: `Pending (${totalNotReg})` },
                { key: 'absent', label: `Absent (${totalAbsent})` },
                { key: 'registered', label: `Registered (${totalRegistered})` },
              ].map(opt => (
                <button key={opt.key} onClick={() => setStatusFilter(opt.key)} style={{
                  padding: '4px 10px', fontSize: 12, fontWeight: 500, borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: statusFilter === opt.key ? 'white' : 'transparent',
                  color: statusFilter === opt.key ? C.text : C.mute,
                  boxShadow: statusFilter === opt.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  whiteSpace: 'nowrap',
                }}>{opt.label}</button>
              ))}
            </div>
          )}
          {isLimited ? (
            <FellowshipSelect value={fellowshipFilter} onChange={setFellowshipFilter} fellowships={fellowships} />
          ) : (
            <SubgroupSelect value={subgroupFilter} onChange={setSubgroupFilter} subgroups={subgroups} />
          )}
          {canEdit && <Btn tone="subtle" small onClick={() => setShowAddModal(true)}><Plus size={13} /> Add Person</Btn>}
          <Btn tone="ghost" small onClick={() => downloadCSV('working-list.csv', filtered, [
            { key: 'full_name', label: 'Full Name' },
            { key: 'subgroup', label: 'Subgroup' },
            { key: 'fellowship', label: 'Fellowship' },
            { key: 'phone_number', label: 'Phone' },
            { key: 'email', label: 'Email' },
            { key: 'registered', label: 'Registered', get: r => r.registered ? 'Yes' : 'No' },
            { key: 'absent', label: 'Absent', get: r => r.absent ? 'Yes' : 'No' },
            { key: 'absent_reason', label: 'Absent Reason' },
          ])}><Download size={13} /> Export</Btn>
        </div>
      </div>

      {Object.keys(byGroup).length === 0 && (
        <Card>
          <div style={{ color: C.mute, textAlign: 'center', padding: 20 }}>
            {useDb
              ? statusFilter === 'all' && totalRegistered > 0 && totalNotReg === 0 && totalAbsent === 0
                ? `All ${totalRegistered} people on the list have registered.`
                : statusFilter === 'pending' && totalNotReg === 0
                  ? 'No one pending — everyone has registered or is marked absent.'
                  : statusFilter === 'absent' && totalAbsent === 0
                    ? 'No one marked absent.'
                    : statusFilter === 'registered' && totalRegistered === 0
                      ? 'No registrations matched yet.'
                      : 'Working list is empty — sync the "Working List" sheet tab or add someone manually.'
              : 'Nobody outstanding — roster may not be imported yet.'}
          </div>
        </Card>
      )}

      {Object.entries(byGroup).sort().map(([sg, people]) => {
        const pending = people.filter(p => !p.registered && !p.absent).length;
        const absent = people.filter(p => p.absent).length;
        return (
          <Card key={sg} style={{ marginBottom: 14, padding: 0, overflowX: 'auto' }}>
            <div style={{ padding: '12px 16px', background: '#FAF8FE', borderBottom: `1px solid ${C.line}`, fontWeight: 600, fontSize: 13.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span>{sg}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {pending > 0 && <Pill tone="amber">{pending} pending</Pill>}
                {absent > 0 && <Pill tone="mute">{absent} absent</Pill>}
                <Pill tone="mute">{people.length} total</Pill>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Fellowship</th>
                  <th>Phone</th>
                  <th>Email</th>
                  {useDb && <th>Status</th>}
                  {canEdit && !isLimited && <th></th>}
                </tr>
              </thead>
              <tbody>
                {people.map((p, i) => (
                  <WorkingListRow key={p.email || i} p={p} useDb={useDb} canEdit={canEdit} isLimited={isLimited} registrations={merged} onMarkAbsent={onMarkAbsent} onEdit={onEditPerson} onRemove={onRemove} onLink={(wlEmail, regEmail) => onEditPerson(wlEmail, { linked_registration_email: regEmail })} onUnlink={wlEmail => onEditPerson(wlEmail, { linked_registration_email: null })} onSetStatusFilter={setStatusFilter} onGoToRegistration={onGoToRegistration} />
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
function FinanceTab({ registrations, payments, setPayments, userId, earlyCutoffAt, earlyFee = 250, standardFee = 350 }) {
  const earlyCutoff = earlyCutoffAt ? new Date(earlyCutoffAt) : null;
  const earlyBirdActive = !earlyCutoff || new Date() < earlyCutoff;
  const defaultFee = earlyBirdActive ? Number(earlyFee) : Number(standardFee);
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

function FellowshipSelect({ value, onChange, fellowships }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      <option value="All">All fellowships</option>
      {fellowships.map(f => <option key={f} value={f}>{f || '(None)'}</option>)}
    </select>
  );
}

// ============ DELEGATES ============
function ConfirmTab({ merged, subgroupFilter, setSubgroupFilter, subgroups, isLimited, onEditReg }) {
  const [fellowshipFilter, setFellowshipFilter] = useState('All');
  const [search, setSearch] = useState('');

  const fellowships = useMemo(() => {
    const f = new Set(merged.filter(r => r.fullyConfirmed).map(r => r.fellowship).filter(Boolean));
    return [...f].sort();
  }, [merged]);

  const confirmed = useMemo(() => merged.filter(r => r.fullyConfirmed), [merged]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return confirmed.filter(r => {
      const matchesGroup = isLimited
        ? (fellowshipFilter === 'All' || r.fellowship === fellowshipFilter)
        : (subgroupFilter === 'All' || r.subgroup === subgroupFilter);
      if (!matchesGroup) return false;
      if (!q) return true;
      return (
        (r.fullName || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.subgroup || '').toLowerCase().includes(q) ||
        (r.fellowship || '').toLowerCase().includes(q)
      );
    });
  }, [confirmed, isLimited, fellowshipFilter, subgroupFilter, search]);

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, margin: 0 }}>Delegates</h2>
            <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3 }}>
              {filtered.length} confirmed delegate{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search name, email, subgroup…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '6px 11px', border: `1px solid ${C.line}`, borderRadius: 7, fontSize: 13, fontFamily: 'Inter', flex: 1, maxWidth: 320, color: C.ink, background: '#fff' }}
          />
          {isLimited ? (
            <FellowshipSelect value={fellowshipFilter} onChange={setFellowshipFilter} fellowships={fellowships} />
          ) : (
            <SubgroupSelect value={subgroupFilter} onChange={setSubgroupFilter} subgroups={subgroups} />
          )}
          <Btn tone="ghost" small onClick={() => downloadCSV('delegates.csv', filtered, [
            { key: 'fullName', label: 'Name' },
            { key: 'subgroup', label: 'Subgroup' },
            { key: 'fellowship', label: 'Fellowship' },
            { key: 'phone', label: 'Phone' },
            { key: 'email', label: 'Email' },
            { key: 'baptism', label: 'Baptism' },
            { key: 'foundationStatus', label: 'Foundation Status' },
            { key: 'team', label: 'Department' },
            { key: 'designation', label: 'Designation' },
            { key: 'shirtSize', label: 'Shirt Size' },
            { key: 'allergies', label: 'Dietary' },
            { key: 'arrivalDate', label: 'Arrival Date' },
            { key: 'arrivalFlight', label: 'Arrival Flight' },
            { key: 'departureDate', label: 'Departure Date' },
            { key: 'departureFlight', label: 'Departure Flight' },
            { get: r => r.hasPaid ? 'Yes' : 'No', label: 'Paid' },
          ])}><Download size={13} /> Export</Btn>
        </div>
      </div>

      <Card style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Subgroup</th>
              <th>Fellowship</th>
              <th>Phone</th>
              <th>Baptism</th>
              <th>Foundation</th>
              <th>Department</th>
              <th>Designation</th>
              <th>Shirt</th>
              <th>Dietary</th>
              <th>Arrival</th>
              <th>Dep. Flight</th>
              <th>Paid</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const isLocal = /manitoba|winnipeg/i.test(r.fellowship || '');
              const noFlightFlag = !r.hasFlightInfo && !isLocal;
              return (
                <tr key={i}>
                  <td style={{ color: C.mute, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {r.fullName}
                      {noFlightFlag && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FFF3CD', color: '#B8710A', border: '1px solid #F5C842', borderRadius: 12, fontSize: 10, fontWeight: 600, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                          <AlertCircle size={10} /> No flights
                        </span>
                      )}
                    </div>
                  </td>
                  <td>{r.subgroup || '—'}</td>
                  <td>{r.fellowship || '—'}</td>
                  <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{r.phone || '—'}</td>
                  <td>{r.baptism || '—'}</td>
                  <td>{r.foundationStatus || '—'}</td>
                  <td>{r.team || '—'}</td>
                  <td>{r.designation || '—'}</td>
                  <td>{r.shirtSize || '—'}</td>
                  <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.allergies || '—'}</td>
                  <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {r.arrivalDate ? `${r.arrivalDate}${r.arrivalFlight ? ` · ${r.arrivalFlight}` : ''}` : '—'}
                  </td>
                  <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {r.departureDate ? `${r.departureDate}${r.departureFlight ? ` · ${r.departureFlight}` : ''}` : '—'}
                  </td>
                  <td>{r.hasPaid ? <Pill tone="green">Paid</Pill> : <span style={{ color: C.mute }}>—</span>}</td>
                  <td style={{ width: 36, padding: '6px 8px' }}>
                    {onEditReg && (
                      <button
                        onClick={() => onEditReg(r)}
                        title="Edit registration"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mute, display: 'flex', alignItems: 'center', padding: 4, borderRadius: 6 }}
                        onMouseEnter={e => e.currentTarget.style.color = C.purple}
                        onMouseLeave={e => e.currentTarget.style.color = C.mute}
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={15} style={{ color: C.mute, textAlign: 'center', padding: 24 }}>
                {confirmed.length === 0 ? 'No confirmed delegates yet.' : 'No delegates match the current filters.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ============ FOUNDATION SCHOOL & BAPTISM ============
function DiscipleshipTab({ merged, subgroupFilter, setSubgroupFilter, subgroups, isLimited }) {
  const [needFoundation, setNeedFoundation] = useState(true);
  const [needBaptism, setNeedBaptism] = useState(true);
  const [mode, setMode] = useState('either'); // either | both
  const [dismissed, setDismissed] = useState(new Set());
  const [fellowshipFilter, setFellowshipFilter] = useState('All');

  const fellowships = useMemo(() => {
    const f = new Set(merged.map(r => r.fellowship).filter(Boolean));
    return [...f].sort();
  }, [merged]);

  const dismiss = (key) => setDismissed(prev => new Set([...prev, key]));

  const filtered = useMemo(() => merged.filter(r => {
    // Check filter (subgroup or fellowship depending on limited mode)
    if (isLimited) {
      if (fellowshipFilter !== 'All' && r.fellowship !== fellowshipFilter) return false;
    } else {
      if (subgroupFilter !== 'All' && r.subgroup !== subgroupFilter) return false;
    }
    if (dismissed.has(r.email || r.fullName)) return false;
    const fsGraduated = /grad/i.test(r.foundationStatus);
    const baptismFlag = /no|not sure/i.test(r.baptism);
    const flagFoundation = needFoundation && !fsGraduated;
    const flagBaptism = needBaptism && baptismFlag;
    if (mode === 'both') return flagFoundation && flagBaptism;
    return flagFoundation || flagBaptism;
  }), [merged, isLimited, subgroupFilter, fellowshipFilter, needFoundation, needBaptism, mode, dismissed]);

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
          {isLimited ? (
            <FellowshipSelect value={fellowshipFilter} onChange={setFellowshipFilter} fellowships={fellowships} />
          ) : (
            <SubgroupSelect value={subgroupFilter} onChange={setSubgroupFilter} subgroups={subgroups} />
          )}
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

// Extract the actual error message from a Supabase FunctionsHttpError.
// When a function returns non-2xx, error.message is the generic
// "Edge Function returned a non-2xx status code" — the real detail lives
// in error.context (the raw Response). Read it so we show something useful.
async function readFunctionError(error) {
  if (!error) return ''
  try {
    const body = await error.context?.json?.()
    if (body?.error) return body.error + (body.details ? ` — ${body.details}` : '')
  } catch {}
  return error.message || String(error)
}

// ============ TRANSPORTATION ============
function FlightsSyncBlock({ onApplied, registrations = [] }) {
  const [state, setState] = useState('idle'); // idle | loading | preview | applying | done | error
  const [preview, setPreview] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  // manualMatches: { [submissionFullName]: { email, registrantName } }
  const [manualMatches, setManualMatches] = useState({});
  // search text typed per unmatched row
  const [searches, setSearches] = useState({});

  async function fetchPreview() {
    setState('loading');
    setPreview(null);
    setErrorMsg('');
    setManualMatches({});
    setSearches({});
    try {
      const { data, error } = await supabase.functions.invoke('registration-api-sync', {
        body: { action: 'preview', form: 'flights' },
      });
      if (error) throw new Error(await readFunctionError(error));
      if (data?.error) throw new Error(data.error + (data.details ? ` — ${data.details}` : ''));
      setPreview(data);
      setState('preview');
    } catch (e) {
      setErrorMsg(String(e));
      setState('error');
    }
  }

  async function applySync() {
    setState('applying');
    try {
      // Build manual_matches: attach flight data from each unmatched row that has been assigned
      const manualList = (preview?.unmatched_rows || [])
        .filter(row => manualMatches[row.full_name])
        .map(row => ({
          email: manualMatches[row.full_name].email,
          full_name: row.full_name,
          arrival_date: row.arrival_date,
          arrival_time: row.arrival_time,
          arrival_flight: row.arrival_flight,
          departure_date: row.departure_date,
          departure_time: row.departure_time,
          departure_flight: row.departure_flight,
        }));

      const { data, error } = await supabase.functions.invoke('registration-api-sync', {
        body: { action: 'apply', form: 'flights', manual_matches: manualList },
      });
      if (error) throw new Error(await readFunctionError(error));
      if (data?.error) throw new Error(data.error + (data.details ? ` — ${data.details}` : ''));
      setState('done');
      onApplied?.();
    } catch (e) {
      setErrorMsg(String(e));
      setState('error');
    }
  }

  function pickRegistrant(submissionName, registrantName) {
    const reg = registrations.find(r => r.fullName === registrantName);
    if (reg) {
      setManualMatches(prev => ({ ...prev, [submissionName]: { email: reg.email, registrantName } }));
    } else {
      // clear if the typed value doesn't match any registrant
      setManualMatches(prev => {
        const next = { ...prev };
        delete next[submissionName];
        return next;
      });
    }
  }

  const totalToWrite = (preview?.matched_count ?? 0) + Object.keys(manualMatches).length;

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Sync flight data from Ministry Platform</div>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3 }}>
            Pulls flight form submissions and matches them to registrations by name. Preview before applying.
          </div>
        </div>
        {(state === 'idle' || state === 'error') && (
          <Btn tone="subtle" small onClick={fetchPreview}>Fetch preview</Btn>
        )}
        {state === 'loading' && <span style={{ fontSize: 12.5, color: C.mute }}>Fetching…</span>}
        {state === 'done' && <span style={{ fontSize: 12.5, color: C.green, fontWeight: 600 }}>✓ Synced</span>}
      </div>

      {state === 'error' && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: C.redBg, borderRadius: 8, fontSize: 12.5, color: C.red }}>
          {errorMsg}
        </div>
      )}

      {(state === 'preview' || state === 'applying') && preview && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5 }}><b>{preview.total_submissions}</b> submissions</span>
            <span style={{ fontSize: 12.5 }}><b>{preview.unique_people}</b> unique people</span>
            <span style={{ fontSize: 12.5, color: C.green }}><b>{preview.matched_count}</b> matched</span>
            {preview.unmatched_count > 0 && (
              <span style={{ fontSize: 12.5, color: C.red }}><b>{preview.unmatched_count}</b> unmatched by name</span>
            )}
          </div>

          {/* Auto-matched rows */}
          {preview.rows?.length > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: 12, maxHeight: 280, overflowY: 'auto', border: `1px solid ${C.line}`, borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#F7F5FC', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Name</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Arrival</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Arr. Flight</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Departure</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Dep. Flight</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}>
                      <td style={{ padding: '5px 10px', fontWeight: 500 }}>{r.full_name}</td>
                      <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono', fontSize: 11 }}>{r.arrival_date}{r.arrival_time ? ` ${fmtTime(r.arrival_time)}` : ''}</td>
                      <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono', fontSize: 11 }}>{r.arrival_flight || '—'}</td>
                      <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono', fontSize: 11 }}>{r.departure_date}{r.departure_time ? ` ${fmtTime(r.departure_time)}` : ''}</td>
                      <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono', fontSize: 11 }}>{r.departure_flight || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Manual match section for unmatched rows */}
          {preview.unmatched_rows?.length > 0 && (
            <div style={{ marginBottom: 14, border: `1px solid ${C.amber}`, borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', background: C.amberBg, fontSize: 12.5, color: C.amber, fontWeight: 600 }}>
                ⚠ {preview.unmatched_rows.length} name{preview.unmatched_rows.length > 1 ? 's' : ''} couldn't be matched automatically — assign each one below to apply their flights
              </div>
              {/* datalist for autocomplete */}
              <datalist id="reg-names-list">
                {registrations.map(r => <option key={r.email} value={r.fullName} />)}
              </datalist>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#FFFBF2' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>Name on form</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Arrival</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Arr. Flight</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Departure</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Dep. Flight</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>Match to registrant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.unmatched_rows.map((row, i) => {
                      const assigned = manualMatches[row.full_name];
                      return (
                        <tr key={i} style={{ borderTop: `1px solid ${C.line}`, background: assigned ? '#F0FDF4' : undefined }}>
                          <td style={{ padding: '6px 10px', fontWeight: 500, color: C.amber }}>{row.full_name}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'JetBrains Mono', fontSize: 11 }}>{row.arrival_date}{row.arrival_time ? ` ${fmtTime(row.arrival_time)}` : ''}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'JetBrains Mono', fontSize: 11 }}>{row.arrival_flight || '—'}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'JetBrains Mono', fontSize: 11 }}>{row.departure_date}{row.departure_time ? ` ${fmtTime(row.departure_time)}` : ''}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'JetBrains Mono', fontSize: 11 }}>{row.departure_flight || '—'}</td>
                          <td style={{ padding: '6px 10px', minWidth: 200 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input
                                list="reg-names-list"
                                placeholder="Type a name…"
                                value={searches[row.full_name] ?? ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setSearches(prev => ({ ...prev, [row.full_name]: val }));
                                  pickRegistrant(row.full_name, val);
                                }}
                                style={{
                                  flex: 1, padding: '4px 8px', fontSize: 12, borderRadius: 6,
                                  border: `1px solid ${assigned ? '#22C55E' : C.line}`,
                                  background: assigned ? '#F0FDF4' : '#fff',
                                  outline: 'none',
                                }}
                              />
                              {assigned && <span style={{ color: '#22C55E', fontSize: 14 }}>✓</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Btn tone="primary" small onClick={applySync} disabled={state === 'applying' || totalToWrite === 0}>
              {state === 'applying' ? 'Applying…' : `Apply — write ${totalToWrite} record${totalToWrite !== 1 ? 's' : ''}`}
            </Btn>
            <Btn tone="ghost" small onClick={() => { setState('idle'); setPreview(null); setManualMatches({}); setSearches({}); }}>Cancel</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

function TransportTab({ merged, isLimited, onApplied, onClearFlight, exemptFellowships }) {
  const [subgroupFilter, setSubgroupFilter] = useState('All');
  const [refreshing, setRefreshing] = useState(false);
  const [clearingEmail, setClearingEmail] = useState(null);
  const [viewMode, setViewMode] = useState('arrivals'); // 'arrivals' | 'departures' | 'full'

  async function handleRefresh() {
    setRefreshing(true);
    await onApplied?.();
    setRefreshing(false);
  }

  async function clearFlight(person) {
    console.log('clearFlight called for:', person.email);
    setClearingEmail(person.email);
    if (!onClearFlight) {
      console.error('onClearFlight is not defined');
      alert('Error: Clear flight handler not available');
      setClearingEmail(null);
      return;
    }
    console.log('Calling onClearFlight...');
    await onClearFlight(person.email);
    console.log('onClearFlight completed');
    setClearingEmail(null);
  }

  const subgroups = useMemo(() => {
    const s = new Set(merged.map(r => r.subgroup).filter(Boolean));
    return [...s].sort();
  }, [merged]);

  // Out-of-state delegates = not inStateConfirmed, not from exempt fellowships
  const outOfState = useMemo(() =>
    merged.filter(r => !r.inStateConfirmed && !exemptFellowships.has(r.fellowship)),
    [merged, exemptFellowships]);

  const filtered = useMemo(() =>
    subgroupFilter === 'All' ? outOfState : outOfState.filter(r => r.subgroup === subgroupFilter),
    [outOfState, subgroupFilter]);

  const withFlight = useMemo(() =>
    filtered.filter(r => r.arrivalFlight || r.departureFlight || r.arrivalDate || r.departureDate),
    [filtered]);

  const missingFlight = useMemo(() =>
    filtered.filter(r => !r.arrivalFlight && !r.departureFlight && !r.arrivalDate && !r.departureDate),
    [filtered]);

  // Group people with flights by arrival date, sorted by arrival time
  const byArrivalDate = useMemo(() => {
    const groups = {};
    withFlight.filter(r => r.arrivalFlight || r.arrivalDate).forEach(r => {
      const key = r.arrivalDate || 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    Object.values(groups).forEach(g =>
      g.sort((a, b) => (a.arrivalTime || '').localeCompare(b.arrivalTime || '')),
    );
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === 'Unknown') return 1;
      if (b === 'Unknown') return -1;
      return a.localeCompare(b);
    });
  }, [withFlight]);

  // Group people with flights by departure date, sorted by departure time
  const byDepartureDate = useMemo(() => {
    const groups = {};
    withFlight.filter(r => r.departureFlight || r.departureDate).forEach(r => {
      const key = r.departureDate || 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    Object.values(groups).forEach(g =>
      g.sort((a, b) => (a.departureTime || '').localeCompare(b.departureTime || '')),
    );
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === 'Unknown') return 1;
      if (b === 'Unknown') return -1;
      return a.localeCompare(b);
    });
  }, [withFlight]);

  const flightCols = [
    { key: 'fullName', label: 'Name' },
    { key: 'subgroup', label: 'Subgroup' },
    { key: 'arrivalDate', label: 'Arrival Date' },
    { key: 'arrivalTime', label: 'Arrival Time' },
    { key: 'arrivalFlight', label: 'Arrival Flight' },
    { key: 'departureDate', label: 'Departure Date' },
    { key: 'departureTime', label: 'Departure Time' },
    { key: 'departureFlight', label: 'Departure Flight' },
  ];

  const FlightGroup = ({ groups, labelPrefix, timeKey, flightKey, emptyMsg }) => (
    groups.length > 0 ? groups.map(([date, people]) => (
      <div key={date} style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: 13.5, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plane size={14} color={C.purple} />
          {date === 'Unknown' ? `${labelPrefix} date unknown` : `${labelPrefix} ${date}`}
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11.5, fontWeight: 400, color: C.mute }}>{people.length} person{people.length !== 1 ? 's' : ''}</span>
        </div>
        <Card style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Subgroup</th>
                  <th>Time</th>
                  <th>Flight</th>
                  {viewMode === 'full' && <><th>Dep. Date</th><th>Dep. Time</th><th>Dep. Flight</th></>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {people.map(r => (
                  <tr key={r.email}>
                    <td style={{ fontWeight: 500 }}>{r.fullName}</td>
                    <td style={{ color: C.mute }}>{r.subgroup}</td>
                    <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>{r[timeKey] ? fmtTime(r[timeKey]) : '—'}</td>
                    <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>{r[flightKey] || '—'}</td>
                    {viewMode === 'full' && (
                      <>
                        <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>{r.departureDate || '—'}</td>
                        <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>{r.departureTime ? fmtTime(r.departureTime) : '—'}</td>
                        <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>{r.departureFlight || '—'}</td>
                      </>
                    )}
                    <td>
                      <button
                        onClick={() => clearFlight(r)}
                        disabled={clearingEmail === r.email}
                        title="Clear flight info"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: clearingEmail === r.email ? C.mute : `${C.mute}88`, padding: '2px 4px', lineHeight: 1, transition: 'color .12s' }}
                        onMouseEnter={e => { if (clearingEmail !== r.email) e.currentTarget.style.color = C.red; }}
                        onMouseLeave={e => { e.currentTarget.style.color = clearingEmail === r.email ? C.mute : `${C.mute}88`; }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    )) : (
      <Card>
        <div style={{ color: C.mute, textAlign: 'center', padding: '20px 0', fontSize: 13 }}>{emptyMsg}</div>
      </Card>
    )
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, margin: 0 }}>Transportation</h2>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3 }}>
            Out-of-state delegates (excludes in-state confirmed &amp; exempt fellowships).
            {' '}{withFlight.length} with flights · {missingFlight.length} awaiting flight info.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* View mode toggle */}
          <div style={{ display: 'flex', background: '#F1EEF6', borderRadius: 8, padding: 2, gap: 2 }}>
            {[['arrivals', 'Arrivals'], ['departures', 'Departures'], ['full', 'Full View']].map(([mode, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: viewMode === mode ? C.purple : 'transparent',
                color: viewMode === mode ? '#fff' : C.mute,
                transition: 'all .15s',
              }}>{label}</button>
            ))}
          </div>
          <Btn tone="ghost" small onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw size={13} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Btn>
          <Btn tone="ghost" small onClick={() => downloadCSV('flight-manifest.csv', withFlight, flightCols)}>
            <Download size={13} /> Export manifest
          </Btn>
        </div>
      </div>

      <FlightsSyncBlock
        onApplied={onApplied}
        registrations={merged.map(r => ({ email: r.email, fullName: r.fullName || `${r.firstName || ''} ${r.lastName || ''}`.trim() }))}
      />

      {/* Arrivals view */}
      {(viewMode === 'arrivals' || viewMode === 'full') && (
        <div>
          {viewMode === 'full' && (
            <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 13, color: C.purple, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Arrivals
            </div>
          )}
          <FlightGroup
            groups={byArrivalDate}
            labelPrefix="Arriving"
            timeKey="arrivalTime"
            flightKey="arrivalFlight"
            emptyMsg="No arrival data yet. Sync from the platform above or edit individual records."
          />
        </div>
      )}

      {/* Departures view */}
      {(viewMode === 'departures' || viewMode === 'full') && (
        <div style={viewMode === 'full' ? { marginTop: 32 } : {}}>
          {viewMode === 'full' && (
            <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 13, color: C.purple, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Departures
            </div>
          )}
          <FlightGroup
            groups={byDepartureDate}
            labelPrefix="Departing"
            timeKey="departureTime"
            flightKey="departureFlight"
            emptyMsg="No departure data yet. Sync from the platform above or edit individual records."
          />
        </div>
      )}

      {/* Missing flight info */}
      {missingFlight.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: 13.5, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={14} color={C.amber} />
            Awaiting flight info
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11.5, fontWeight: 400, color: C.mute }}>{missingFlight.length} person{missingFlight.length !== 1 ? 's' : ''}</span>
          </div>
          <Card style={{ padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Subgroup</th>
                    <th>Fellowship</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {missingFlight.map(r => (
                    <tr key={r.email}>
                      <td style={{ fontWeight: 500 }}>{r.fullName}</td>
                      <td style={{ color: C.mute }}>{r.subgroup}</td>
                      <td style={{ color: C.mute }}>{r.fellowship}</td>
                      <td style={{ fontFamily: 'JetBrains Mono', fontSize: 11.5, color: C.mute }}>{r.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
            <Btn tone="ghost" small onClick={() => downloadCSV('missing-flights.csv', missingFlight, [
              { key: 'fullName', label: 'Name' }, { key: 'subgroup', label: 'Subgroup' },
              { key: 'fellowship', label: 'Fellowship' }, { key: 'email', label: 'Email' },
            ])}><Download size={13} /> Export missing list</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ IMPORT ============
function ApiSyncBlock({ onApplied }) {
  const [state, setState] = useState('idle'); // idle | loading | preview | applying | done | error
  const [preview, setPreview] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  async function fetchPreview() {
    setState('loading');
    setPreview(null);
    setErrorMsg('');
    try {
      const { data, error } = await supabase.functions.invoke('registration-api-sync', {
        body: { action: 'preview' },
      });
      if (error) throw new Error(await readFunctionError(error));
      if (data?.error) throw new Error(data.error + (data.details ? ` — ${data.details}` : ''));
      setPreview(data);
      setState('preview');
    } catch (e) {
      setErrorMsg(String(e));
      setState('error');
    }
  }

  async function applySync() {
    setState('applying');
    try {
      const { data, error } = await supabase.functions.invoke('registration-api-sync', {
        body: { action: 'apply' },
      });
      if (error) throw new Error(await readFunctionError(error));
      if (data?.error) throw new Error(data.error + (data.details ? ` — ${data.details}` : ''));
      setState('done');
      onApplied?.();
    } catch (e) {
      setErrorMsg(String(e));
      setState('error');
    }
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Sync from Ministry Platform API</div>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3 }}>
            Fetches form submissions directly from leaders.lwcanada.org. Preview before applying — existing records are updated, nothing is deleted.
          </div>
        </div>
        {(state === 'idle' || state === 'error') && (
          <Btn tone="subtle" small onClick={fetchPreview}>Fetch preview</Btn>
        )}
        {state === 'loading' && (
          <span style={{ fontSize: 12.5, color: C.mute }}>Fetching…</span>
        )}
        {state === 'done' && (
          <span style={{ fontSize: 12.5, color: C.green, fontWeight: 600 }}>✓ Synced</span>
        )}
      </div>

      {state === 'error' && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: '#FBE9E9', borderRadius: 8, fontSize: 12.5, color: C.red }}>
          {errorMsg}
        </div>
      )}

      {(state === 'preview' || state === 'applying') && preview && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5 }}><b>{preview.total_submissions}</b> submissions fetched</span>
            <span style={{ fontSize: 12.5 }}><b>{preview.unique_emails}</b> unique emails (after dedup)</span>
            <span style={{ fontSize: 12.5, color: C.green }}><b>{preview.new_count}</b> new</span>
            <span style={{ fontSize: 12.5, color: C.amber }}><b>{preview.update_count}</b> updates</span>
          </div>

          <div style={{ overflowX: 'auto', marginBottom: 12, maxHeight: 320, overflowY: 'auto', border: `1px solid ${C.line}`, borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F7F5FC', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Name</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Email</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Subgroup</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Fellowship</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Designation</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.line}`, background: r._status === 'new' ? '#F0FBF4' : 'white' }}>
                    <td style={{ padding: '5px 10px' }}>
                      <Pill tone={r._status === 'new' ? 'green' : 'amber'}>{r._status === 'new' ? 'New' : 'Update'}</Pill>
                    </td>
                    <td style={{ padding: '5px 10px', fontWeight: 500 }}>{r.full_name}</td>
                    <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono', fontSize: 11 }}>{r.email}</td>
                    <td style={{ padding: '5px 10px', color: C.mute }}>{r.subgroup}</td>
                    <td style={{ padding: '5px 10px', color: C.mute }}>{r.fellowship}</td>
                    <td style={{ padding: '5px 10px', color: C.mute }}>{r.designation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Btn tone="primary" small onClick={applySync} disabled={state === 'applying'}>
              {state === 'applying' ? 'Applying…' : `Apply — sync ${preview.unique_emails} records`}
            </Btn>
            <Btn tone="ghost" small onClick={() => { setState('idle'); setPreview(null); }}>Cancel</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}


function ImportTab({ handleImport, handleImportWorkingList, roster, registrations, workingListDb, lastImport, isLimited, onApiSyncApplied }) {
  return (
    <div>
      <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, marginTop: 0 }}>Import from Google Sheets</h2>
      <div style={{ fontSize: 12.5, color: C.mute, marginBottom: 18, maxWidth: 640 }}>
        In each sheet: File → Download → Comma-separated values (.csv), open the file, select all, copy, and paste below.
        Column headers are matched automatically (first/last name, email, subgroup, fellowship, etc.) —
        exact header wording doesn't need to match. Re-paste any time; confirmations are kept by email across re-imports.
      </div>

      <ApiSyncBlock onApplied={onApiSyncApplied} />

      <ImportBlock title="Working List" hint="Name, Email, Subgroup, Fellowship, Leadership Category — replaces existing working list"
        count={workingListDb.length} last={lastImport['working-list']} onImport={handleImportWorkingList} />
      <ImportBlock title="Roster (who we're working on)" hint="First Name, Last Name, Subgroup, Leadership Position, Email"
        count={roster.length} last={lastImport.roster} onImport={t => handleImport('roster', t)} />
      <ImportBlock title="Registrations" hint="Your registration form export"
        count={registrations.length} last={lastImport.registrations} onImport={t => handleImport('registrations', t)} />
    </div>
  );
}

// ============ DELEGATE COMPLIANCE ============
function isNaAllergy(val) {
  // Strip all N/A variants (N/A, N\A, NA, none, nil, nope, no) plus separators
  // to catch compound values like "N\A . n/a"
  return val
    .replace(/[nN][\\\/]?[aA]/g, '')
    .replace(/\bnone\b|\bnil\b|\bnope\b|\bno\b/gi, '')
    .replace(/[\s.,\\/!]+/g, '')
    .length === 0;
}

function DelegateComplianceTab({ merged, subgroupFilter, setSubgroupFilter, subgroups, isLimited }) {
  const [fellowshipFilter, setFellowshipFilter] = useState('All');

  const fellowships = useMemo(() => {
    const f = new Set(merged.map(r => r.fellowship).filter(Boolean));
    return [...f].sort();
  }, [merged]);

  const filtered = useMemo(() => merged.filter(r => {
    if (isLimited) {
      if (fellowshipFilter !== 'All' && r.fellowship !== fellowshipFilter) return false;
    } else {
      if (subgroupFilter !== 'All' && r.subgroup !== subgroupFilter) return false;
    }
    const val = r.allergies?.trim().toLowerCase()
    return val && val !== '' && !isNaAllergy(val)
  }), [merged, isLimited, subgroupFilter, fellowshipFilter]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, margin: 0 }}>Delegate Compliance</h2>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3 }}>{filtered.length} people with allergies or diet restrictions.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isLimited ? (
            <FellowshipSelect value={fellowshipFilter} onChange={setFellowshipFilter} fellowships={fellowships} />
          ) : (
            <SubgroupSelect value={subgroupFilter} onChange={setSubgroupFilter} subgroups={subgroups} />
          )}
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
            {filtered.map((r, i) => {
              const allergyVal = r.allergies?.trim().toLowerCase();
              const showAllergy = allergyVal && !isNaAllergy(allergyVal);
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{r.fullName}</td>
                  <td>{r.subgroup}</td>
                  <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>{r.email}</td>
                  <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>{r.phone || '—'}</td>
                  <td style={{ background: '#FBF0DE', fontWeight: 500 }}>{showAllergy ? r.allergies : '—'}</td>
                </tr>
              );
            })}
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
function RoomAssignmentTab({ merged, rooms, handleAddRoom, handleBulkCreateRooms, handleDeleteRoom, handleAssignPerson, handleRemovePersonFromRoom, handleUpdateRoomCapacity, handleSetRoomHead, handleRenameRoom, peoplePerRoom, isLimited }) {
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomCapacity, setNewRoomCapacity] = useState(peoplePerRoom);
  const [bulkPrefix, setBulkPrefix] = useState('Room');
  const [bulkCount, setBulkCount] = useState(5);
  const [bulkCapacity, setBulkCapacity] = useState(2);
  const [draggedPerson, setDraggedPerson] = useState(null);
  const [selectedPerson, setSelectedPerson] = useState(null); // mobile tap-to-assign
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [editingRoomName, setEditingRoomName] = useState('');
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  const isMobile = windowWidth < 700;

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
    <div style={{ display: 'flex', flexDirection: 'column', height: isMobile ? 'auto' : 'calc(100vh - 200px)', minHeight: isMobile ? 0 : 520 }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 18, margin: '0 0 3px', fontWeight: 700 }}>Room Assignments</h2>
          <div style={{ fontSize: 12, color: C.mute }}>
            {unassigned.length} unassigned · {rooms.length} rooms · {totalAssigned}/{totalCapacity} filled
            {isMobile ? ' · tap name then tap room' : ' · drag names into rooms'}
          </div>
        </div>
        <Btn tone="ghost" small onClick={printRooms} disabled={rooms.length === 0}><Download size={13} /> Print</Btn>
      </div>

      {/* tap-to-assign banner on mobile */}
      {isMobile && selectedPerson && (
        <div style={{ marginBottom: 10, padding: '8px 12px', background: C.blueBg, borderRadius: 8, fontSize: 12.5, color: C.blue, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Assigning: {selectedPerson.fullName} — tap a room</span>
          <button onClick={() => setSelectedPerson(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.blue, fontWeight: 700, fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* body — side-by-side on desktop, stacked on mobile */}
      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 14, overflow: isMobile ? 'visible' : 'hidden' }}>

        {/* ── unassigned pool ── */}
        <div style={isMobile
          ? { flexShrink: 0 }
          : { width: 230, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
        }>
          {['male', 'female'].map(gender => {
            const genderColor = gender === 'male' ? '#2A5FA5' : '#C0507A';
            const genderBg   = gender === 'male' ? '#EEF3FF' : '#FFF0F6';
            const label      = gender === 'male' ? 'Men' : 'Women';
            const count      = byGender[gender].length;
            return (
              <div key={gender} style={isMobile
                ? { marginBottom: gender === 'male' ? 10 : 0 }
                : { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', marginBottom: gender === 'male' ? 10 : 0 }
              }>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: genderColor, background: `${genderColor}18`, padding: '2px 7px', borderRadius: 99 }}>{label}</span>
                  <span style={{ fontSize: 11.5, color: C.mute }}>{count} left</span>
                </div>
                <div style={isMobile
                  ? { display: 'flex', flexWrap: 'wrap', gap: 6, background: genderBg, borderRadius: 8, border: `1px solid ${genderColor}25`, padding: 8 }
                  : { flex: 1, overflowY: 'auto', background: genderBg, borderRadius: 8, border: `1px solid ${genderColor}25`, padding: 6 }
                }>
                  {count === 0 ? (
                    <div style={{ fontSize: 11.5, color: C.mute, fontStyle: 'italic', textAlign: 'center', padding: '12px 8px', width: '100%' }}>All assigned!</div>
                  ) : (
                    byGender[gender].map(person => {
                      const isSelected = selectedPerson?.email === person.email;
                      return isMobile ? (
                        <button
                          key={person.email}
                          onClick={() => setSelectedPerson(isSelected ? null : person)}
                          style={{ padding: '6px 10px', background: isSelected ? genderColor : '#fff', color: isSelected ? '#fff' : '#1A1220', border: `1.5px solid ${isSelected ? genderColor : genderColor + '44'}`, borderRadius: 20, fontSize: 12, cursor: 'pointer', fontWeight: isSelected ? 700 : 400, transition: 'all .12s', lineHeight: 1.3 }}
                        >
                          {person.fullName}
                        </button>
                      ) : (
                        <div
                          key={person.email}
                          draggable
                          onDragStart={e => { setDraggedPerson(person); e.dataTransfer.effectAllowed = 'move'; }}
                          style={{ padding: '6px 8px', background: '#fff', border: `1px solid ${genderColor}33`, borderRadius: 5, fontSize: 12, cursor: 'grab', userSelect: 'none', marginBottom: 4, transition: 'box-shadow .12s' }}
                          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.12)'; }}
                          onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
                        >
                          <div style={{ fontWeight: 500, color: '#1A1220', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{person.fullName}</div>
                          {(person.subgroup || person.designation) && (
                            <div style={{ fontSize: 10.5, color: C.mute, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {person.subgroup}{person.designation ? ` · ${person.designation}` : ''}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── rooms grid + add controls ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: isMobile ? 'visible' : 'hidden', minWidth: 0 }}>
          {/* rooms grid */}
          <div style={{ flex: isMobile ? 'none' : 1, overflowY: isMobile ? 'visible' : 'auto', paddingRight: 2 }}>
            {rooms.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', color: C.mute, fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🏠</div>
                No rooms yet — use the controls below to create some.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
                {rooms.map(room => {
                  const genderSet = new Set(room.people.map(p => {
                    const g = (p.gender || '').toLowerCase();
                    return (g.includes('female') || g === 'f') ? 'female' : 'male';
                  }));
                  const isFull     = room.people.length >= room.capacity;
                  const isMixed    = genderSet.size > 1;
                  const isAllFemale = !isMixed && genderSet.has('female') && room.people.length > 0;
                  const isAllMale   = !isMixed && genderSet.has('male')   && room.people.length > 0;
                  const roomBg     = isFull ? C.redBg   : isAllFemale ? '#FFF0F6' : isAllMale ? '#EEF3FF' : '#FAFAF8';
                  const roomBorder = isFull ? C.red     : isMixed ? C.amber : isAllFemale ? '#E0A0C8' : isAllMale ? '#4A7FC4' : C.line;
                  const roomAccent = isFull ? C.red     : isMixed ? C.amber : isAllFemale ? '#C0507A' : isAllMale ? C.blue : C.mute;
                  const genderTag  = isAllFemale ? 'F' : isAllMale ? 'M' : isMixed ? 'MF' : null;
                  const fillPct    = Math.min(100, Math.round((room.people.length / room.capacity) * 100));

                  return (
                    <div
                      key={room.id}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.style.outline = `2px solid ${roomAccent}`; e.currentTarget.style.transform = 'scale(1.01)'; }}
                      onDragLeave={e => { e.currentTarget.style.outline = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
                      onDrop={e => {
                        e.preventDefault();
                        e.currentTarget.style.outline = 'none';
                        e.currentTarget.style.transform = 'scale(1)';
                        if (draggedPerson && room.people.length < room.capacity) {
                          handleAssignPerson(draggedPerson, room.id);
                          setDraggedPerson(null);
                        }
                      }}
                      onClick={() => {
                        if (selectedPerson && room.people.length < room.capacity) {
                          handleAssignPerson(selectedPerson, room.id);
                          setSelectedPerson(null);
                        }
                      }}
                      style={{ background: roomBg, border: `1.5px solid ${selectedPerson && room.people.length < room.capacity ? roomAccent : roomBorder}`, borderRadius: 8, padding: '8px 10px', transition: 'all .15s', cursor: selectedPerson ? 'pointer' : 'default' }}
                    >
                      {/* compact header row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                        {genderTag && <span style={{ fontSize: 9.5, fontWeight: 700, color: roomAccent, background: `${roomAccent}18`, padding: '1px 5px', borderRadius: 4, lineHeight: 1.6, flexShrink: 0 }}>{genderTag}</span>}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {editingRoomId === room.id ? (
                            <input
                              autoFocus
                              value={editingRoomName}
                              onChange={e => setEditingRoomName(e.target.value)}
                              onBlur={() => commitRename(room.id)}
                              onKeyDown={e => { if (e.key === 'Enter') commitRename(room.id); if (e.key === 'Escape') setEditingRoomId(null); }}
                              style={{ fontWeight: 700, fontSize: 12.5, width: '100%', border: `1px solid ${roomAccent}`, borderRadius: 4, padding: '2px 6px', color: roomAccent }}
                            />
                          ) : (
                            <div
                              style={{ fontWeight: 700, fontSize: 12.5, color: roomAccent, cursor: 'text', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                              onClick={() => { setEditingRoomId(room.id); setEditingRoomName(room.name); }}
                              title={`${room.name} — click to rename`}
                            >{room.name}</div>
                          )}
                        </div>
                        {/* capacity: n / [input] */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, fontSize: 11.5, color: roomAccent, fontWeight: 600 }}>
                          <span>{room.people.length}/</span>
                          <input
                            type="number"
                            min={room.people.length || 1}
                            value={room.capacity}
                            onChange={e => handleUpdateRoomCapacity(room.id, e.target.value)}
                            style={{ width: 32, fontSize: 11.5, padding: '1px 3px', borderRadius: 4, border: `1px solid ${C.line}`, color: roomAccent, fontWeight: 600, textAlign: 'center' }}
                            title="Capacity"
                          />
                        </div>
                        <button
                          onClick={() => handleDeleteRoom(room.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mute, padding: '1px 3px', flexShrink: 0, lineHeight: 1, transition: 'color .12s' }}
                          onMouseEnter={e => { e.currentTarget.style.color = C.red; }}
                          onMouseLeave={e => { e.currentTarget.style.color = C.mute; }}
                          title="Delete room"
                        ><Trash2 size={12} /></button>
                      </div>

                      {/* fill bar */}
                      <div style={{ height: 3, background: `${roomAccent}22`, borderRadius: 2, marginBottom: 7, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${fillPct}%`, background: roomAccent, borderRadius: 2, transition: 'width .3s' }} />
                      </div>

                      {/* people list — compact */}
                      {room.people.length === 0 ? (
                        <div style={{ fontSize: 11, color: C.mute, fontStyle: 'italic', textAlign: 'center', padding: '10px 0' }}>Drop here</div>
                      ) : (
                        room.people.map(person => {
                          const isHead = room.roomHead === person.email;
                          return (
                            <div
                              key={person.email}
                              style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 0', borderBottom: `1px solid ${roomBorder}44`, fontSize: 11.5 }}
                            >
                              {isHead && <Crown size={10} fill="#F5C842" color="#F5C842" style={{ flexShrink: 0 }} />}
                              <span style={{ flex: 1, minWidth: 0, fontWeight: isHead ? 700 : 400, color: '#1A1220', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {person.fullName}
                              </span>
                              <button
                                onClick={() => handleSetRoomHead(room.id, person.email)}
                                title={isHead ? 'Remove as head' : 'Set as head'}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: isHead ? '#F5C842' : `${C.mute}88`, padding: '0 2px', flexShrink: 0, lineHeight: 1, transition: 'color .12s', display: 'flex', alignItems: 'center' }}
                                onMouseEnter={e => { if (!isHead) e.currentTarget.style.color = '#F5C842'; }}
                                onMouseLeave={e => { if (!isHead) e.currentTarget.style.color = `${C.mute}88`; }}
                              ><Crown size={10} fill={isHead ? 'currentColor' : 'none'} /></button>
                              <button
                                onClick={() => handleRemovePersonFromRoom(person, room.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: `${C.mute}88`, padding: '0 2px', fontSize: 12, flexShrink: 0, lineHeight: 1, transition: 'color .12s' }}
                                onMouseEnter={e => { e.currentTarget.style.color = C.red; }}
                                onMouseLeave={e => { e.currentTarget.style.color = `${C.mute}88`; }}
                                title="Remove"
                              >✕</button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* add room controls */}
          <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, paddingTop: 10, borderTop: `1px solid ${C.line}`, marginTop: 10 }}>
            {/* single room */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={newRoomName}
                onChange={e => setNewRoomName(e.target.value)}
                placeholder="Room name"
                style={{ flex: 1, minWidth: 80, fontSize: 12.5, padding: '8px 9px', borderRadius: 6, border: `1px solid ${C.line}` }}
                onKeyDown={e => { if (e.key === 'Enter') { handleAddRoom(newRoomName, newRoomCapacity); setNewRoomName(''); } }}
              />
              <input type="number" min={1} value={newRoomCapacity} onChange={e => setNewRoomCapacity(e.target.value)} style={{ width: 52, fontSize: 12.5, padding: '8px 6px', borderRadius: 6, border: `1px solid ${C.line}` }} title="Capacity" />
              <Btn small onClick={() => { handleAddRoom(newRoomName, newRoomCapacity); setNewRoomName(''); }} disabled={rooms.length >= 50}><Plus size={12} /> Add room</Btn>
            </div>
            {/* bulk */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={bulkPrefix}
                onChange={e => setBulkPrefix(e.target.value)}
                placeholder="Prefix"
                style={{ flex: 1, minWidth: 60, fontSize: 12.5, padding: '8px 9px', borderRadius: 6, border: `1px solid ${C.line}` }}
              />
              <input type="number" min={1} max={50} value={bulkCount} onChange={e => setBulkCount(e.target.value)} style={{ width: 48, fontSize: 12.5, padding: '8px 6px', borderRadius: 6, border: `1px solid ${C.line}` }} title="Count" />
              <input type="number" min={1} value={bulkCapacity} onChange={e => setBulkCapacity(e.target.value)} style={{ width: 48, fontSize: 12.5, padding: '8px 6px', borderRadius: 6, border: `1px solid ${C.line}` }} title="Capacity each" />
              <Btn small onClick={() => handleBulkCreateRooms(bulkPrefix, Number(bulkCount), bulkCapacity)} disabled={rooms.length >= 50 || !bulkCount}><Plus size={12} /> Bulk</Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ BULK EMAIL SENDER ============
function BulkEmailSender({ selectedStatuses, statusCounts, merged, onClose }) {
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
        if (selectedStatuses.not_registered && r.emailStatus === 'not_registered') return true;
        if (selectedStatuses.confirming && r.emailStatus === 'confirming') return true;
        if (selectedStatuses.confirmed && r.emailStatus === 'confirmed') return true;
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
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, margin: 0, fontWeight: 700 }}>Send bulk email</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 24, cursor: 'pointer', color: C.mute, padding: 0 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Left: Template selection */}
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

          {/* Right: Recipients */}
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

        {/* Footer */}
        <div style={{ padding: '12px 24px', borderTop: `1px solid ${C.line}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn tone="ghost" small onClick={onClose}>Cancel</Btn>
          <Btn tone="primary" small onClick={handleSend} disabled={sending || !template || recipientEmails.length === 0}>
            {sending ? 'Sending…' : `Send to ${recipientEmails.length}`}
          </Btn>
        </div>
      </div>
    </div>,
    document.body
  );
}
