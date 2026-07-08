import { useEffect, useState } from 'react'
import { AlertCircle, Check, Sparkles, Wand2, X } from 'lucide-react'
import { callFlockCRM as callFlockAPI, flockCard, FLOCK } from '../../lib/flockSupabase'

const RESULTS = ['Reached', 'No Answer', 'Left Message', 'Rescheduled Call']
const NEXT_ACTIONS = ['None', 'Callback', 'Follow-up']

/* ── Heuristic parsers ported from app-core.js (client-side, no LLM) ── */
function detectResult(lower) {
  const noAnswer = /(voicemail|left a message|left message|left them a message|went to voicemail|no answer|didn.t pick|did not pick|didn.t answer|did not answer|not available|couldn.t reach|could not reach|no response|never answered|never picked|didn.t get through|did not get through)/
  const reached = /(spoke|talked|chatted|connected|reached|answered|picked up|pick up|she picked|he picked|they picked|caught up|had a call|had a chat|had a conversation|great call|good call|nice call|quick call|long call|good chat|great chat|nice chat|she said|he said|they said|she told|he told|they told|she mentioned|he mentioned|they mentioned|graduating|told me|let me know|shared|mentioned|praying|discussed|talked about|spoke about|we talked|we spoke|we chatted|we discussed)/
  const calledAnd = /called .{1,40}[,]\s*(she|he|they|we)\b/
  const calledNameAnd = /called .{1,40} and (she|he|they|we)\b/
  if (noAnswer.test(lower)) return /voicemail|left.*message/.test(lower) ? 'Left Message' : 'No Answer'
  if (reached.test(lower) || calledAnd.test(lower) || calledNameAnd.test(lower)) return 'Reached'
  if (/(reschedul|moved the call|call moved|postponed)/.test(lower)) return 'Rescheduled Call'
  return 'No Answer'
}

function detectNextAction(lower) {
  if (/(call back|call them back|call him back|call her back|ring back|ring them|callback|they.ll call|they will call|will call me|calling me back|she.ll call|he.ll call|will phone|will ring)/.test(lower)) return 'Callback'
  if (/(follow.?up|check in|check on|check back|will send|will pray|will visit|will text|will try|try again|try her|try him|try them|need to send|need to pray|going to send|going to pray|going to visit|going to try|reach out|touch base|connect again|catch up|reconnect|will call|call again|call next|calling next|ping|in \d+ day|in \d+ week|in \d+ month|next week|next month|next monday|next tuesday|next wednesday|next thursday|next friday|next saturday|next sunday|tomorrow|this week|this friday|this monday|in a week|in a month|in a few|a few days|a few weeks)/.test(lower)) return 'Follow-up'
  return 'None'
}

/** Lightweight natural-date parser (chrono-node is not a dependency). */
function parseNaturalDate(text) {
  const lower = text.toLowerCase()
  const now = new Date()
  const at9 = (d) => {
    d.setHours(9, 0, 0, 0)
    return d
  }
  if (/\btomorrow\b/.test(lower)) return at9(new Date(now.getTime() + 86400000))
  if (/\btoday\b/.test(lower)) return at9(new Date(now))
  const inN = lower.match(/in (\d+)\s*(day|days|week|weeks|month|months)/)
  if (inN) {
    const n = parseInt(inN[1], 10)
    const unit = inN[2]
    const d = new Date(now)
    if (unit.startsWith('day')) d.setDate(d.getDate() + n)
    else if (unit.startsWith('week')) d.setDate(d.getDate() + n * 7)
    else d.setMonth(d.getMonth() + n)
    return at9(d)
  }
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const dayMatch = lower.match(/(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/)
  if (dayMatch) {
    const target = days.indexOf(dayMatch[2])
    const d = new Date(now)
    let delta = (target - d.getDay() + 7) % 7
    if (delta === 0 || dayMatch[1]) delta += 7 // "next" or same-day → following week
    d.setDate(d.getDate() + delta)
    return at9(d)
  }
  if (/next week/.test(lower)) return at9(new Date(now.getTime() + 7 * 86400000))
  if (/next month/.test(lower)) {
    const d = new Date(now)
    d.setMonth(d.getMonth() + 1)
    return at9(d)
  }
  return null
}

function extractTodos(text) {
  if (!text || text.length < 6) return []
  const actionPhrases = [
    /(will|need to|going to|plan to|should|must|have to|want to)\s+(send|call|email|pray|visit|check|follow|reach|connect|text|schedule|set up|look into|share|bring|remind|help|meet|write|prepare)/,
    /(send|email|pray for|visit|check on|follow up|reach out|connect with|text|schedule|set up|remind)/,
    /(action|todo|to-do|to do|action item|next step)/,
  ]
  const todos = []
  text.replace(/([.!?])\s+/g, '$1|').split('|').forEach((raw) => {
    const s = raw.trim()
    if (s.length < 8 || s.length > 160) return
    const sl = s.toLowerCase()
    if (actionPhrases.some((re) => re.test(sl)) && todos.indexOf(s) < 0) todos.push(s)
  })
  return todos.slice(0, 5)
}

function matchPerson(lower, people) {
  let bestScore = 0
  let match = { personId: '', personName: '' }
  people.forEach((p) => {
    const nameLower = String(p.name || '').toLowerCase()
    const parts = nameLower.split(/\s+/)
    let score = 0
    parts.forEach((part) => {
      if (part.length > 1 && lower.indexOf(part) >= 0) score++
    })
    if (parts[0] && parts[0].length > 1 && lower.indexOf(parts[0]) >= 0) score += 0.5
    if (score > bestScore) {
      bestScore = score
      match = { personId: p.id, personName: p.name }
    }
  })
  return match
}

function toDatetimeLocal(d) {
  if (!d) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const DRAFT_KEY = 'ct-ai-log-draft'

function loadDraft() {
  try {
    return localStorage.getItem(DRAFT_KEY) || ''
  } catch {
    return ''
  }
}
function saveDraft(text) {
  try {
    if (text) localStorage.setItem(DRAFT_KEY, text)
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ignore quota / private-mode errors */
  }
}

const inputStyle = {
  padding: '10px 12px',
  border: `1px solid ${FLOCK.border}`,
  borderRadius: '8px',
  fontSize: '14px',
  fontFamily: FLOCK.fontBody,
  color: FLOCK.text,
  outline: 'none',
  boxSizing: 'border-box',
  width: '100%',
}
const labelStyle = { fontSize: '12px', fontWeight: 700, color: FLOCK.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block' }

export default function FlockAiLogPanel({ preselect = null, onOpenPerson }) {
  const [people, setPeople] = useState([])
  // Person carried over from a "Log a call" click elsewhere (due card, People tab).
  const [forPerson, setForPerson] = useState(preselect)
  const [text, setText] = useState(loadDraft)
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    callFlockAPI('people')
      .then((list) => setPeople(Array.isArray(list) ? list : []))
      .catch(() => setPeople([]))
  }, [])

  // Draft restore: persist the in-progress description so a reload/tab-switch
  // mid-call doesn't lose what was typed (parity with the standalone app's
  // draft-restore behavior — full offline queueing is out of scope, see brief).
  useEffect(() => {
    saveDraft(text)
  }, [text])

  const runParse = () => {
    const desc = text.trim()
    if (!desc) {
      setMsg({ type: 'error', text: 'Please describe the call first.' })
      return
    }
    setParsing(true)
    setMsg(null)
    const lower = desc.toLowerCase()
    const result = detectResult(lower)
    let nextAction = detectNextAction(lower)
    const dt = parseNaturalDate(desc)
    if (dt && nextAction === 'None') nextAction = 'Follow-up'
    let person = matchPerson(lower, people)
    // No name in the text? Fall back to the person this log was opened for.
    if (!person.personId && forPerson) person = { personId: forPerson.id, personName: forPerson.name }
    setParsed({
      personId: person.personId || '',
      personName: person.personName || '',
      result,
      nextAction,
      nextActionDateTime: dt ? toDatetimeLocal(dt) : '',
      summary: desc,
      todos: extractTodos(desc).map((t) => ({ text: t, keep: true })),
    })
    setParsing(false)
  }

  const patch = (key, value) => setParsed((p) => ({ ...p, [key]: value }))

  const save = async () => {
    if (!parsed || saving) return
    if (!parsed.personId) {
      setMsg({ type: 'error', text: 'Please pick which person this call was with.' })
      return
    }
    const needsDate = parsed.nextAction === 'Callback' || parsed.nextAction === 'Follow-up'
    if (needsDate && !parsed.nextActionDateTime) {
      setMsg({ type: 'error', text: `${parsed.nextAction} needs a date/time.` })
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      const res = await callFlockAPI('saveInteraction', {
        payload: JSON.stringify({
          personId: parsed.personId,
          fullName: parsed.personName,
          result: parsed.result,
          summary: parsed.summary,
          nextAction: parsed.nextAction,
          nextActionDateTime: parsed.nextActionDateTime ? new Date(parsed.nextActionDateTime).toISOString() : '',
        }),
      })
      if (!res || res.success !== true) throw new Error((res && res.error) || 'Save failed')

      const keptTodos = (parsed.todos || []).filter((t) => t.keep && t.text.trim())
      if (keptTodos.length) {
        try {
          await callFlockAPI('saveTodos', {
            payload: JSON.stringify({
              interactionId: res.interactionId || 'ai-' + Date.now(),
              personId: parsed.personId,
              personName: parsed.personName,
              todos: keptTodos.map((t) => ({ text: t.text.trim(), dueDate: '' })),
            }),
          })
        } catch {
          /* non-fatal: interaction already saved */
        }
      }
      saveDraft('')
      setSuccess(true)
    } catch (e) {
      setMsg({ type: 'error', text: 'Error: ' + String(e.message || e) })
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setText('')
    setParsed(null)
    setMsg(null)
    setSuccess(false)
    setForPerson(null)
  }

  if (success) {
    return (
      <div style={{ ...flockCard({ padding: '40px 28px' }), textAlign: 'center', maxWidth: '520px', margin: '0 auto' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: FLOCK.greenTint, color: FLOCK.green, display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
          <Check size={28} />
        </div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>Call logged.</div>
        <div style={{ fontSize: '13px', color: FLOCK.muted, marginTop: '6px' }}>Interaction saved to {parsed?.personName || 'the call list'}.</div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '22px', flexWrap: 'wrap' }}>
          <button type="button" onClick={reset} style={{ padding: '11px 18px', background: FLOCK.purple, color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: FLOCK.fontBody }}>
            Log another call
          </button>
          {onOpenPerson && parsed?.personId && (
            <button type="button" onClick={() => onOpenPerson(parsed.personId)} style={{ padding: '11px 18px', background: FLOCK.card, color: FLOCK.text, border: `1px solid ${FLOCK.borderStrong}`, borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: FLOCK.fontBody }}>
              View {parsed?.personName ? `${parsed.personName.split(' ')[0]}’s` : 'their'} notes
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '16px', maxWidth: '620px' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sparkles size={20} color={FLOCK.purple} />
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>AI Log Assistant</h2>
        </div>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: FLOCK.muted }}>Describe the call in plain language and it fills in the details for you.</p>
      </div>

      {msg && (
        <div style={{ ...flockCard({ padding: '12px 14px', background: FLOCK.redTint, borderColor: 'transparent' }), color: FLOCK.red, display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px' }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          {msg.text}
        </div>
      )}

      <div style={flockCard({ padding: '16px', display: 'grid', gap: '12px' })}>
        {forPerson && !parsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifySelf: 'start', padding: '6px 12px', borderRadius: '999px', background: FLOCK.purpleTint, color: FLOCK.purple, fontSize: '12px', fontWeight: 700, fontFamily: FLOCK.fontBody }}>
            Logging a call for {forPerson.name}
            <button type="button" onClick={() => setForPerson(null)} title="Clear" style={{ background: 'none', border: 'none', cursor: 'pointer', color: FLOCK.purple, display: 'grid', placeItems: 'center', padding: 0 }}>
              <X size={13} />
            </button>
          </div>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="e.g. Called Sarah, she picked up. Doing well, graduating in spring. Will follow up next Tuesday and send her the retreat info."
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
        <button
          type="button"
          onClick={runParse}
          disabled={parsing || !text.trim()}
          style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '10px 18px', background: FLOCK.purple, color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: parsing ? 'wait' : 'pointer', opacity: parsing || !text.trim() ? 0.6 : 1, fontFamily: FLOCK.fontBody }}
        >
          <Wand2 size={15} />
          {parsing ? 'Parsing…' : 'Parse'}
        </button>
      </div>

      {parsed && (
        <div style={flockCard({ padding: '18px', display: 'grid', gap: '16px' })}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>Review &amp; confirm</div>

          <div>
            <label style={labelStyle}>Person</label>
            <select value={parsed.personId} onChange={(e) => patch('personId', e.target.value)} style={inputStyle}>
              <option value="">— pick a person —</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Result</label>
              <select value={parsed.result} onChange={(e) => patch('result', e.target.value)} style={inputStyle}>
                {RESULTS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Next action</label>
              <select value={parsed.nextAction} onChange={(e) => patch('nextAction', e.target.value)} style={inputStyle}>
                {NEXT_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(parsed.nextAction === 'Callback' || parsed.nextAction === 'Follow-up') && (
            <div>
              <label style={labelStyle}>When {parsed.nextActionDateTime ? '' : '(required)'}</label>
              <input type="datetime-local" value={parsed.nextActionDateTime} onChange={(e) => patch('nextActionDateTime', e.target.value)} style={{ ...inputStyle, fontFamily: FLOCK.fontMono }} />
            </div>
          )}

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea value={parsed.summary} onChange={(e) => patch('summary', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
          </div>

          {parsed.todos.length > 0 && (
            <div>
              <label style={labelStyle}>Suggested to-dos</label>
              <div style={{ display: 'grid', gap: '6px' }}>
                {parsed.todos.map((t, idx) => (
                  <label key={idx} style={{ display: 'flex', gap: '9px', alignItems: 'flex-start', fontSize: '13px', color: FLOCK.text, background: FLOCK.surface, padding: '9px 11px', borderRadius: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={t.keep}
                      onChange={(e) => patch('todos', parsed.todos.map((x, i) => (i === idx ? { ...x, keep: e.target.checked } : x)))}
                      style={{ marginTop: '2px' }}
                    />
                    <span style={{ opacity: t.keep ? 1 : 0.5 }}>{t.text}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" onClick={save} disabled={saving} style={{ padding: '11px 20px', background: FLOCK.purple, color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: FLOCK.fontBody }}>
              {saving ? 'Saving…' : 'Save call'}
            </button>
            <button type="button" onClick={() => setParsed(null)} style={{ padding: '11px 20px', background: FLOCK.card, color: FLOCK.muted, border: `1px solid ${FLOCK.border}`, borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: FLOCK.fontBody }}>
              Re-parse
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
