import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

// Public ICPLC 2026 Canada help centre (no auth to view). Every string is
// editable in place by super_admin / regional_secretary; overrides live in
// icplc26_content.fields (key -> text) and fall back to the defaults below.

const BLUE = '#0741DC'
const ORANGE = '#F47B20'
const GREEN = '#0F7A55'
const INK = '#111010'
const MUTED = '#6B6560'
const WRAP = { width: 'min(1200px, calc(100% - 40px))', margin: 'auto' }
const eyebrow = (color) => ({ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 })
const h2 = { fontFamily: "Sora, Inter, sans-serif", fontSize: 'clamp(36px,5vw,64px)', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em', margin: 0 }
const h3 = { fontFamily: "Sora, Inter, sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' }

// Named editor granted access without changing their app-wide role:
// Pastor Chi Nwokem (cedochie@gmail.com). Mirrors the RLS policy in the migration.
const EXTRA_EDITOR_USER_IDS = ['4c70ca61-443b-4a64-87aa-3453c9dd5c65']

const EditCtx = createContext({ fields: {}, editMode: false, save: async () => {} })

function EditableText({ k, d, multiline = false }) {
  const { fields, editMode, save } = useContext(EditCtx)
  const value = fields[k] ?? d
  const [editing, setEditing] = useState(false)
  const [tmp, setTmp] = useState(value)
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select?.() } }, [editing])

  if (!editMode) return <>{value}</>

  const commit = async () => {
    if (tmp === value) { setEditing(false); return }
    setBusy(true)
    try { await save(k, tmp === d ? null : tmp); setEditing(false) } finally { setBusy(false) }
  }
  const cancel = () => { setTmp(value); setEditing(false) }

  if (editing) {
    const common = {
      ref, value: tmp, onChange: e => setTmp(e.target.value),
      onKeyDown: e => { if (e.key === 'Escape') cancel(); else if (e.key === 'Enter' && !multiline) commit() },
      style: { width: '100%', minWidth: 200, padding: 8, font: 'inherit', color: '#111', border: `2px solid ${BLUE}`, borderRadius: 6, background: '#fff', letterSpacing: 'normal', textTransform: 'none' },
    }
    return (
      <span style={{ display: 'block', width: '100%' }} onClick={e => e.stopPropagation()}>
        {multiline ? <textarea rows={4} {...common} /> : <input type="text" {...common} />}
        <span style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button type="button" onClick={commit} disabled={busy || tmp === value} style={btn(GREEN)}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={cancel} disabled={busy} style={btn('#777')}>Cancel</button>
        </span>
      </span>
    )
  }
  return (
    <span
      onClick={e => { e.preventDefault(); e.stopPropagation(); setTmp(value); setEditing(true) }}
      style={{ cursor: 'pointer', outline: '1px dashed rgba(7,65,220,.55)', outlineOffset: 2, borderRadius: 3 }}
      title="Click to edit"
    >{value || <em style={{ opacity: 0.5 }}>(empty)</em>}</span>
  )
}

const btn = (bg) => ({ padding: '4px 10px', background: bg, color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 700 })

// Text + URL link; in edit mode the label is editable and a URL button opens an inline field.
function EditableLink({ k, label, url = '#', style }) {
  const { fields, editMode, save } = useContext(EditCtx)
  const href = fields[`${k}.url`] ?? url
  const [editingUrl, setEditingUrl] = useState(false)
  const shown = (h) => (h === '#' ? '' : h)
  const [tmp, setTmp] = useState(shown(href))
  const [busy, setBusy] = useState(false)
  const commit = async () => {
    setBusy(true)
    const v = tmp.trim()
    try { await save(`${k}.url`, v === '' || v === url ? null : v); setEditingUrl(false) } finally { setBusy(false) }
  }
  const external = /^https?:/.test(href)
  return (
    <>
      <a href={editMode ? undefined : href} {...(external && !editMode ? { target: '_blank', rel: 'noopener noreferrer' } : {})} style={style}>
        <EditableText k={`${k}.label`} d={label} />
      </a>
      {editMode && !editingUrl && <button type="button" onClick={() => { setTmp(shown(href)); setEditingUrl(true) }} title={href} style={{ ...btn(BLUE), marginLeft: 8 }}>URL</button>}
      {editMode && editingUrl && (
        <span style={{ display: 'block', marginTop: 6 }}>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            autoFocus type="text" value={tmp} placeholder="https://…, mailto:name@email.com, tel:+15551234567, or #section"
            onChange={e => setTmp(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') setEditingUrl(false) }}
            style={{ flex: 1, minWidth: 180, padding: 6, font: '13px Inter, sans-serif', color: '#111', border: `2px solid ${BLUE}`, borderRadius: 6, background: '#fff' }}
          />
          <button type="button" onClick={commit} disabled={busy} style={btn(GREEN)}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={() => setEditingUrl(false)} disabled={busy} style={btn('#777')}>Cancel</button>
        </span>
        <span style={{ display: 'block', marginTop: 6, fontSize: 12, lineHeight: 1.5, opacity: 0.75, fontWeight: 500 }}>
          Email: <code>mailto:name@lwcanada.org</code><br />
          Phone: <code>tel:+12045550123</code><br />
          Web page: <code>https://…</code> · Page section: <code>#faq</code>
        </span>
        </span>
      )}
    </>
  )
}

const T = ({ k, d, multiline }) => <EditableText k={k} d={d} multiline={multiline} />

function SectionHead({ id, eyebrowColor, dark, muted, e, t, p }) {
  return (
    <div className="sg" style={{ display: 'grid', gridTemplateColumns: '0.62fr 1.38fr', gap: 56, marginBottom: 38, alignItems: 'end' }}>
      <div>
        <div style={eyebrow(eyebrowColor)}><T k={`${id}.eyebrow`} d={e} /></div>
        <h2 style={{ ...h2, color: dark ? '#fff' : INK }}><T k={`${id}.title`} d={t} /></h2>
      </div>
      <p style={{ fontSize: 18, lineHeight: 1.65, color: muted, margin: 0 }}><T k={`${id}.intro`} d={p} multiline /></p>
    </div>
  )
}

const CHECKLIST = [
  { c: BLUE, t: 'Register for ICPLC', p: 'Complete the official conference registration and keep your confirmation email.', l: 'Register now →', h: 'https://icplcwithpastorchris.org/register' },
  { c: BLUE, t: 'Share document status', p: 'Tell the Canada team what passport and Canadian immigration documents you hold.', l: 'Canada form →', h: 'https://leaders.lwcanada.org/f/z95t25p3eqjb' },
  { c: BLUE, t: 'Check travel readiness', p: 'Review passport, Nigeria-entry and Canada-return requirements before booking.', l: 'Status tracker →', h: '#check' },
  { c: ORANGE, t: 'Submit your itinerary', p: 'Once booked, add your flight details for travel coordination.', l: 'Add itinerary →', h: 'https://leaders.lwcanada.org/f/pzyx9bd9nap4' },
]

const DOCS = [
  { tag: 'Canadian citizens', t: 'Canadian passport + Nigerian visa', p: 'Travel on your Canadian passport (6+ months valid beyond return). A Nigerian visa is required — even if you hold a second passport.' },
  { tag: 'Permanent residents', t: 'Check your PR card before departure', p: 'A valid PR card or PRTD is required to return by commercial carrier. Check expiry well in advance — renewal can take time.', l: 'Official Canada guidance →', u: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/permanent-residents/travel-outside-canada.html' },
  { tag: 'Students / workers / visitors', t: 'Check status and re-entry documents', p: 'Your permit and your re-entry document are separate. A valid permit alone does not authorise return by air. Check your TRV or eTA before booking.', l: 'Check IRCC entry requirements →', u: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/entry-requirements-country.html' },
]

const FAQ_GROUPS = [
  { g: 'Registration & fees', items: [
    ['What is the registration fee?', 'The registration fee has not yet been confirmed. This page will be updated when the amount is announced. Watch for a communication from the Canada team.'],
    ["I haven't received my confirmation — what should I do?", "Check your spam/junk folder first. If it's not there, contact the registration support team (see the Contact section) with your full name and the email address used at registration."],
    ['Can someone else register on my behalf?', 'Yes, but the registration must use your own name, contact details and passport information — not the person helping you. Errors in personal details can affect your travel documents. Also complete the Canada documentation form yourself separately.'],
  ] },
  { g: 'Flights & getting there', items: [
    ['Are group flights being arranged from Canada?', 'Details on coordinated travel from Canada are to be confirmed. Watch for an update from the Canada team. Do not book flights independently until travel guidance has been issued — early bookings without guidance may not align with group logistics.'],
    ['Which airport do I fly into?', 'The conference venue is Loveworld City, Asese — near Lagos. The closest major airport is Murtala Muhammed International Airport, Lagos (LOS). From Lagos you will travel by road to Asese. Specific transfer arrangements will be communicated by the team.'],
    ['What should I do after booking my flights?', 'Submit your travel itinerary using the itinerary form. Include your airline, flight numbers, and departure/arrival times. This lets the team coordinate arrivals and ensure support is available.'],
  ] },
  { g: 'On the ground', items: [
    ['Where will participants stay?', 'Accommodation details are to be confirmed. Options on the Loveworld City campus and nearby are expected to be available. Full accommodation information will be communicated once registration is further along.'],
    ['What currency should I bring?', 'The Nigerian naira (NGN) is the local currency. USD is also widely accepted in Lagos. Exchange currency at the airport or in Lagos before travelling to the venue. Bring enough for personal expenses — most conference services are expected to be covered by registration fees. Specific guidance will be confirmed.'],
    ['How do I contact the Canada team in an emergency?', 'Emergency contacts will be shared with all confirmed participants before departure. Save all team contact details to your phone before leaving Canada. For now, use the Contact section below.'],
  ] },
]

const CONTACTS = [
  { t: 'Registration help', p: 'For registration corrections, duplicate registrations, missing confirmations or general conference registration questions.', l: 'Email info@lwcanada.org →' },
  { t: 'Travel-document help', p: 'For questions about the internal documentation form, passport readiness or where to find official immigration guidance.', l: 'Email info@lwcanada.org →' },
  { t: 'Urgent travel changes', p: 'For flight changes, missed connections, arrival changes or an urgent issue during the travel period.', l: 'Email info@lwcanada.org →' },
]

const cardShadow = '0 4px 20px rgba(18,17,15,0.06)'

function FaqItem({ k, q, a, onRemove }) {
  const { editMode } = useContext(EditCtx)
  return (
    <details open={editMode || undefined} style={{ background: '#fff', border: '1px solid #E4DFD5', borderRadius: 12, marginBottom: 8 }}>
      <summary style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', gap: 16, fontWeight: 600, fontSize: 15, listStyle: 'none', cursor: 'pointer' }}>
        <span><T k={`${k}.q`} d={q} /></span>
        <span className="faq-chev" aria-hidden="true">⌄</span>
      </summary>
      <p style={{ margin: 0, padding: '0 20px 20px', fontSize: 14, lineHeight: 1.65, color: '#4D4943' }}><T k={`${k}.a`} d={a} multiline /></p>
      {editMode && <div style={{ padding: '0 20px 16px' }}><button type="button" onClick={onRemove} style={btn('#B3261E')}>Remove question</button></div>}
    </details>
  )
}

function StatusChecker() {
  const [f, setF] = useState({ status: '', pp: '', ret: '2026-11-22', name: false, pages: false, ecowas: false, reentry: false, docs: false })
  const [result, setResult] = useState(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const run = () => {
    if (!f.status) return setResult({ type: 'warn', title: 'Select your Canadian status first.', items: [] })
    if (!f.ret) return setResult({ type: 'warn', title: 'Enter your planned return date to Canada.', items: [] })
    const bad = [], warn = []
    const rd = new Date(f.ret)
    const need6 = new Date(rd); need6.setMonth(need6.getMonth() + 6)
    const soon60 = new Date(rd); soon60.setDate(soon60.getDate() + 60)
    if (!f.pp) bad.push('Enter your passport expiry date.')
    else {
      const pp = new Date(f.pp)
      if (pp < need6) bad.push(`Passport must be valid at least 6 months beyond your return date (until ${need6.toISOString().slice(0, 10)}). Renew before applying for a visa.`)
      else if (pp < soon60) warn.push('Passport expires within 60 days of return. Confirm this meets airline and visa requirements.')
    }
    if (!f.name) warn.push('Confirm passport name matches your registration and flight booking exactly.')
    if (!f.pages) warn.push('Ensure at least 2 blank passport pages are available for stamps.')
    if (!f.reentry) warn.push('Confirm you hold a valid TRV, eTA or return document, or that you are exempt.')
    if (!f.docs) {
      if (f.status === 'pr') warn.push('Confirm you have a valid PR card or have checked PRTD requirements.')
      else if (f.status === 'student') warn.push('Bring proof of enrolment and confirm your study permit covers your return date.')
      else if (f.status === 'worker') warn.push('Bring supporting employment and permit documents for your return.')
      else warn.push('Bring supporting status documents relevant to your immigration category.')
    }
    let type, title, items
    if (bad.length) { type = 'bad'; title = 'Action needed before you can travel.'; items = [...bad, ...warn] }
    else if (warn.length) { type = 'warn'; title = 'Almost ready — a few things to confirm.'; items = warn }
    else { type = 'ok'; title = 'No obvious issues from this self-check.'; items = ['Submit the documentation form and verify all requirements with the relevant official authority before booking.'] }
    if (f.ecowas) items.push('ECOWAS passport noted: no Nigerian visa required. Keep your passport valid for the duration of travel.')
    setResult({ type, title, items })
  }

  const resultColors = {
    ok: { background: 'rgba(15,122,85,0.18)', color: '#b8f0d8', border: '1px solid rgba(15,122,85,0.4)' },
    warn: { background: 'rgba(244,123,32,0.15)', color: '#ffe4c4', border: '1px solid rgba(244,123,32,0.4)' },
    bad: { background: 'rgba(138,31,20,0.2)', color: '#ffd0cc', border: '1px solid rgba(138,31,20,0.4)' },
  }
  const label = { display: 'block', fontSize: 12, fontWeight: 700, color: '#C9C2B8', marginBottom: 6 }
  const input = { width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #3a3733', background: '#111010', color: '#fff', font: '500 14px Inter, sans-serif' }
  const checks = [
    ['name', 'Passport name matches my registration and flight booking'],
    ['pages', 'At least 2 blank passport pages available'],
    ['ecowas', 'I travel on an ECOWAS-member country passport (visa-exempt for Nigeria)'],
    ['reentry', 'I have a valid TRV, eTA or return document to re-enter Canada (or I am exempt)'],
    ['docs', 'I have the supporting status documents that apply to my situation'],
  ]
  return (
    <div style={{ background: '#1A1917', borderRadius: 16, padding: 26 }}>
      <label style={label}>Your Canadian status</label>
      <select value={f.status} onChange={e => set('status', e.target.value)} style={{ ...input, marginBottom: 16 }}>
        <option value="">Select status</option>
        <option value="citizen">Canadian citizen</option>
        <option value="pr">Permanent resident</option>
        <option value="student">International student</option>
        <option value="worker">Work permit holder</option>
        <option value="other">Visitor / other</option>
      </select>
      <div className="g2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div><label style={label}>Passport expiry</label><input type="date" value={f.pp} onChange={e => set('pp', e.target.value)} style={input} /></div>
        <div><label style={label}>Planned return to Canada</label><input type="date" value={f.ret} onChange={e => set('ret', e.target.value)} style={input} /></div>
      </div>
      <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
        {checks.map(([k, text]) => (
          <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: '#C9C2B8', lineHeight: 1.45 }}>
            <input type="checkbox" checked={f[k]} onChange={e => set(k, e.target.checked)} style={{ marginTop: 3 }} />{text}
          </label>
        ))}
      </div>
      <button type="button" onClick={run} style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 999, padding: '13px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Check my documents</button>
      {result && (
        <div style={{ ...resultColors[result.type], marginTop: 18, borderRadius: 12, padding: '16px 18px', fontSize: 14, lineHeight: 1.55 }}>
          <strong>{result.title}</strong>
          {result.items.map((it, i) => <div key={i} style={{ marginTop: 6 }}>• {it}</div>)}
        </div>
      )}
    </div>
  )
}

export default function ICPLC26Page() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [editMode, setEditMode] = useState(false)
  const canEdit = profile?.role === 'super_admin' || profile?.role === 'regional_secretary' || EXTRA_EDITOR_USER_IDS.includes(profile?.id)

  const { data: content } = useQuery({
    queryKey: ['icplc26_content'],
    queryFn: async () => {
      const { data, error } = await supabase.from('icplc26_content').select('*').limit(1).maybeSingle()
      if (error) throw error
      return data
    },
  })
  const fields = content?.fields || {}

  // FAQ structure: [{ id, items: [id…] }]. Ids "0","1"… map to the built-in defaults; new ones use n<timestamp>.
  const layout = Array.isArray(fields['faq.layout'])
    ? fields['faq.layout']
    : FAQ_GROUPS.map((g, gi) => ({ id: String(gi), items: g.items.map((_, ii) => String(ii)) }))
  const saveLayout = (next) => save('faq.layout', next)

  // Merge one key into the fields JSON (null removes the override → default).
  const save = async (key, value) => {
    const next = { ...(queryClient.getQueryData(['icplc26_content'])?.fields || {}) }
    if (value === null) delete next[key]; else next[key] = value
    const row = queryClient.getQueryData(['icplc26_content'])
    const q = row?.id
      ? supabase.from('icplc26_content').update({ fields: next, updated_at: new Date().toISOString() }).eq('id', row.id).select()
      : supabase.from('icplc26_content').insert({ fields: next }).select()
    const { data, error } = await q
    if (error) { alert('Error saving: ' + error.message); throw error }
    if (!data?.length) { alert('No rows updated - you may not have permission to edit.'); throw new Error('no rows') }
    queryClient.setQueryData(['icplc26_content'], data[0])
  }

  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Syne:wght@400;700;800&family=Sora:wght@700;800&display=swap'
    document.head.appendChild(link)
    const prevTitle = document.title
    document.title = 'ICPLC 2026 — Canada Help Centre'
    return () => { document.head.removeChild(link); document.title = prevTitle }
  }, [])

  const navLink = { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: 600, padding: '9px 14px', borderRadius: 999, textDecoration: 'none' }

  return (
    <EditCtx.Provider value={{ fields, editMode, save }}>
      <div className="icplc26" style={{ fontFamily: 'Inter, system-ui, sans-serif', background: '#F2EFE8', color: '#111010', minHeight: '100vh' }}>
        <style>{`
          .icplc26 { scroll-behavior: smooth; }
          .icplc26 *, .icplc26 *::before, .icplc26 *::after { box-sizing: border-box; }
          .icplc26 a:hover { opacity: .75; }
          .icplc26 details summary::-webkit-details-marker { display: none; }
          .icplc26 details[open] .faq-chev { transform: rotate(180deg); }
          .icplc26 .faq-chev { transition: transform .2s ease; }
          @media (max-width: 780px) {
            .icplc26 section { padding-top: 36px !important; padding-bottom: 36px !important; }
            .icplc26 .i26-hero { display: flex; flex-direction: column; }
            .icplc26 .i26-hero-nav { order: -1; position: static !important; padding: 12px 0 !important; background: #0741DC; }
            .icplc26 .i26-hero-img { height: 190px !important; object-fit: cover; object-position: 50% 50%; }
            .icplc26 .g3, .icplc26 .g4 { grid-template-columns: 1fr 1fr !important; }
            .icplc26 .sg { grid-template-columns: 1fr !important; gap: 16px !important; }
            .icplc26 .nav-mid { display: none !important; }
          }
          @media (max-width: 520px) { .icplc26 .g3, .icplc26 .g4, .icplc26 .g2 { grid-template-columns: 1fr !important; } }
        `}</style>

        {canEdit && (
          <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 100, display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setEditMode(m => !m)}
              style={{ padding: '8px 14px', background: editMode ? '#DD6F51' : '#6B12BC', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
            >{editMode ? '✕ Done' : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>Edit</>}</button>
          </div>
        )}
        {editMode && (
          <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', background: '#6B12BC', color: '#fff', padding: '8px 16px', borderRadius: 8, fontWeight: 600, zIndex: 99, fontSize: 13 }}>
            Editing — click any text to edit
          </div>
        )}

        {/* HERO */}
        <header id="top" className="i26-hero" style={{ position: 'relative', overflow: 'hidden', background: BLUE }}>
          <img className="i26-hero-img" src="/icplc26-hero.webp" alt="ICPLC — International Campus Pastors' and Leaders' Conference" style={{ width: '100%', height: 'auto', display: 'block' }} />
          <nav className="i26-hero-nav" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, padding: '20px 0' }}>
            <div style={{ ...WRAP, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0D0D0C', borderRadius: 999, padding: '10px 10px 10px 22px' }}>
              <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, letterSpacing: '-1.5px', color: '#fff' }}>icplc</div>
              <div className="nav-mid" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <a href="#prepare" style={navLink}>Prepare</a>
                <a href="#check" style={navLink}>Status Tracker</a>
                <a href="#faq" style={navLink}>FAQ</a>
                <a href="#contact" style={navLink}>Help</a>
              </div>
              <EditableLink k="nav.register" label="Register Now" url="https://icplcwithpastorchris.org/register" style={{ background: '#fff', color: '#0D0D0C', borderRadius: 999, padding: '12px 22px', fontSize: 14, fontWeight: 700, textDecoration: 'none' }} />
            </div>
          </nav>
        </header>

        {/* QUICK FACTS */}
        <section style={{ padding: '36px 0 44px' }}>
          <div className="g3" style={{ ...WRAP, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {[
              ['facts.dates', 'Conference dates', 'Thu Nov 19 – Sun Nov 22, 2026', BLUE],
              ['facts.venue', 'Venue', 'Loveworld City, Asese, Nigeria', BLUE],
              ['facts.fee', 'Registration fee', 'To be confirmed', ORANGE],
            ].map(([k, label, val, c]) => (
              <div key={k} style={{ background: '#fff', borderLeft: `3px solid ${c}`, borderRadius: '0 12px 12px 0', padding: '20px 22px', boxShadow: '0 2px 12px rgba(18,17,15,0.05)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}><T k={`${k}.label`} d={label} /></div>
                <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}><T k={`${k}.value`} d={val} /></div>
              </div>
            ))}
          </div>
        </section>

        {/* CHECKLIST */}
        <section id="prepare" style={{ padding: '52px 0' }}>
          <div style={WRAP}>
            <SectionHead id="prepare" eyebrowColor={BLUE} muted="#4D4943" e="Start here" t="Your ICPLC checklist" p="Register first, then complete the Canada documentation form so we can spot who needs travel-document support early." />
            <div className="g4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
              {CHECKLIST.map((s, i) => (
                <div key={i} style={{ background: '#fff', borderLeft: `3px solid ${s.c}`, borderRadius: '0 14px 14px 0', padding: 26, boxShadow: cardShadow }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: s.c, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontFamily: 'Syne, sans-serif' }}>0{i + 1}</div>
                  <h3 style={{ ...h3, margin: '22px 0 9px' }}><T k={`check.${i}.t`} d={s.t} /></h3>
                  <p style={{ fontSize: 14, color: '#5D5851', lineHeight: 1.6, margin: 0 }}><T k={`check.${i}.p`} d={s.p} multiline /></p>
                  <div style={{ marginTop: 18 }}><EditableLink k={`check.${i}.link`} label={s.l} url={s.h} style={{ fontSize: 13, fontWeight: 700, color: s.c, textDecoration: 'none' }} /></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* TRAVEL DOCUMENTS */}
        <section id="immigration" style={{ padding: '52px 0' }}>
          <div style={WRAP}>
            <div className="sg" style={{ display: 'grid', gridTemplateColumns: '0.62fr 1.38fr', gap: 56, marginBottom: 38, alignItems: 'end' }}>
              <div>
                <div style={eyebrow(BLUE)}><T k="docs.eyebrow" d="Travel documents" /></div>
                <h2 style={h2}><T k="docs.title" d="Prepare to leave — and return" /></h2>
              </div>
              <div>
                <p style={{ fontSize: 18, lineHeight: 1.65, color: '#4D4943', margin: 0 }}><T k="docs.intro" d="You need a Nigerian visa to enter and the right Canadian document to re-board. We help organise paperwork but do not issue visas." multiline /></p>
              </div>
            </div>
            <div className="g3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
              {DOCS.map((d, i) => (
                <div key={i} style={{ background: '#fff', borderLeft: `3px solid ${BLUE}`, borderRadius: '0 14px 14px 0', padding: 26, boxShadow: cardShadow }}>
                  <div style={{ ...eyebrow(BLUE), marginBottom: 12 }}><T k={`docs.${i}.tag`} d={d.tag} /></div>
                  <h3 style={{ ...h3, margin: '0 0 10px' }}><T k={`docs.${i}.t`} d={d.t} /></h3>
                  <p style={{ fontSize: 14, color: '#5D5851', lineHeight: 1.6, margin: 0 }}><T k={`docs.${i}.p`} d={d.p} multiline /></p>
                  {d.l && <div style={{ marginTop: 18 }}><EditableLink k={`docs.${i}.link`} label={d.l} url={d.u} style={{ fontSize: 13, fontWeight: 700, color: BLUE, textDecoration: 'none' }} /></div>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* STATUS TRACKER */}
        <section id="check" style={{ padding: '52px 0', background: INK }}>
          <div className="sg" style={{ ...WRAP, display: 'grid', gridTemplateColumns: '0.62fr 1.38fr', gap: 56, alignItems: 'start' }}>
            <div>
              <div style={eyebrow(ORANGE)}><T k="tracker.eyebrow" d="Status tracker" /></div>
              <h2 style={{ ...h2, color: '#fff' }}><T k="tracker.title" d="Check your documents" /></h2>
              <p style={{ fontSize: 16, lineHeight: 1.65, color: '#C9C2B8', marginTop: 18 }}><T k="tracker.intro" d="A self-check tool only. Nothing is saved or sent. Official immigration authorities make the final determination." multiline /></p>
            </div>
            <StatusChecker />
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" style={{ padding: '52px 0' }}>
          <div style={WRAP}>
            <div style={{ marginBottom: 38 }}>
              <div style={eyebrow(BLUE)}><T k="faq.eyebrow" d="Frequently asked" /></div>
              <h2 style={h2}><T k="faq.title" d="Common questions" /></h2>
            </div>
            {layout.map((grp) => {
              const def = FAQ_GROUPS[Number(grp.id)]
              return (
                <div key={grp.id} style={{ marginBottom: 32, maxWidth: 820 }}>
                  <div style={{ ...eyebrow(MUTED), marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span><T k={`faq.${grp.id}.g`} d={def?.g ?? 'New section'} /></span>
                    {editMode && <button type="button" onClick={() => { if (window.confirm('Remove this section and all its questions?')) saveLayout(layout.filter(x => x.id !== grp.id)) }} style={btn('#B3261E')}>Remove section</button>}
                  </div>
                  {grp.items.map((iid) => {
                    const d = def?.items[Number(iid)]
                    return <FaqItem key={iid} k={`faq.${grp.id}.${iid}`} q={d?.[0] ?? 'New question'} a={d?.[1] ?? 'Answer'} onRemove={() => saveLayout(layout.map(x => x.id === grp.id ? { ...x, items: x.items.filter(i => i !== iid) } : x))} />
                  })}
                  {editMode && <button type="button" onClick={() => saveLayout(layout.map(x => x.id === grp.id ? { ...x, items: [...x.items, `n${Date.now()}`] } : x))} style={btn(BLUE)}>+ Add question</button>}
                </div>
              )
            })}
            {editMode && <button type="button" onClick={() => saveLayout([...layout, { id: `n${Date.now()}`, items: [`n${Date.now()}`] }])} style={{ ...btn(BLUE), padding: '8px 14px', fontSize: 13 }}>+ Add section</button>}
          </div>
        </section>

        {/* CONTACT */}
        <section id="contact" style={{ padding: '52px 0', background: '#E9E4D8' }}>
          <div style={WRAP}>
            <div style={{ marginBottom: 38 }}>
              <div style={eyebrow(ORANGE)}><T k="contact.eyebrow" d="Canada support" /></div>
              <h2 style={h2}><T k="contact.title" d="Need help?" /></h2>
            </div>
            <div className="g3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
              {CONTACTS.map((c, i) => (
                <div key={i} style={{ background: '#fff', borderLeft: `3px solid ${ORANGE}`, borderRadius: '0 14px 14px 0', padding: 26, boxShadow: cardShadow }}>
                  <h3 style={{ ...h3, margin: '0 0 10px' }}><T k={`contact.${i}.t`} d={c.t} /></h3>
                  <p style={{ fontSize: 14, color: '#5D5851', lineHeight: 1.6, margin: 0 }}><T k={`contact.${i}.p`} d={c.p} multiline /></p>
                  <div style={{ marginTop: 18 }}><EditableLink k={`contact.${i}.link`} label={c.l} url="mailto:info@lwcanada.org" style={{ fontSize: 13, fontWeight: 700, color: ORANGE, textDecoration: 'none' }} /></div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, background: INK, color: '#fff', borderRadius: 16, padding: '26px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div>
                <div style={{ ...h3, fontSize: 22 }}><T k="cta.t" d="Not sure where to start?" /></div>
                <p style={{ margin: '6px 0 0', color: '#C9C2B8', fontSize: 14 }}><T k="cta.p" d="Fill out the Canada documentation form and the team will follow up with you." multiline /></p>
              </div>
              <EditableLink k="cta.link" label="Open Canada form →" url="https://leaders.lwcanada.org/f/z95t25p3eqjb" style={{ background: ORANGE, color: '#fff', borderRadius: 999, padding: '12px 22px', fontSize: 14, fontWeight: 700, textDecoration: 'none' }} />
            </div>
          </div>
        </section>

        <footer style={{ background: '#0D0D0C', color: '#C9C2B8', padding: '34px 0 60px' }}>
          <div style={{ ...WRAP, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, letterSpacing: '-1.5px', color: '#fff' }}>icplc</div>
            <div style={{ fontSize: 12, lineHeight: 1.6, maxWidth: 560 }}><T k="footer.note" d="Canada Participant Help Centre · Not official immigration advice · Verify all requirements with IRCC and relevant authorities before travel." multiline /></div>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, fontWeight: 600 }}>
              <a href="#top" style={{ color: '#fff', textDecoration: 'none' }}>↑ Top</a>
              <a href="#faq" style={{ color: '#fff', textDecoration: 'none' }}>FAQ</a>
              <a href="#contact" style={{ color: '#fff', textDecoration: 'none' }}>Contact</a>
            </div>
          </div>
        </footer>
      </div>
    </EditCtx.Provider>
  )
}
