import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Mic, Square, UserPlus, Wand2, X } from 'lucide-react'
import { callFlockCRM as callFlockAPI, flockCard, FLOCK } from '../../lib/flockSupabase'
import { useAuth } from '../../hooks/useAuth'
import FlockVoiceInteractionLogger from './FlockVoiceInteractionLogger'

const RESULTS = ['Reached', 'No Answer', 'Left Message', 'Rescheduled Call']
const NEXT_ACTIONS = ['None', 'Callback', 'Follow-up']

/* ── Heuristic parsers ── */
export function detectResult(lower) {
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

function parseNaturalDate(text) {
  const lower = text.toLowerCase()
  const now = new Date()
  const at9 = (d) => { d.setHours(9, 0, 0, 0); return d }
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
    if (delta === 0 || dayMatch[1]) delta += 7
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

/** Levenshtein edit distance — used to tolerate typos/mis-transcriptions in names. */
function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prev[j], prev[j - 1], prevDiag)
      prevDiag = tmp
    }
  }
  return prev[b.length]
}

/** Best token-level similarity (0..1) between a name part and any word in the text. */
function bestWordSimilarity(part, words) {
  let best = 0
  for (const w of words) {
    if (w.length < 2) continue
    if (w === part) return 1
    const dist = levenshtein(part, w)
    const sim = 1 - dist / Math.max(part.length, w.length)
    if (sim > best) best = sim
  }
  return best
}

/**
 * Fuzzy-matches spoken/typed text against known contacts. Tolerates minor
 * transcription errors (Levenshtein) instead of requiring an exact substring.
 * Returns the top match plus enough info to detect "no confident match" and
 * "two names tied" so the UI can ask rather than silently guessing.
 */
function matchPerson(lower, people) {
  const words = lower.split(/[^a-z0-9']+/).filter(Boolean)
  const scored = people.map((p) => {
    const nameLower = String(p.name || '').toLowerCase()
    const parts = nameLower.split(/\s+/).filter((s) => s.length > 1)
    if (!parts.length) return { id: p.id, name: p.name, score: 0 }
    // Exact substring match still wins outright (fast path, no false negatives).
    const exactHits = parts.filter((part) => lower.indexOf(part) >= 0).length
    const fuzzySum = parts.reduce((sum, part) => sum + bestWordSimilarity(part, words), 0)
    const score = exactHits === parts.length ? 1 : fuzzySum / parts.length
    return { id: p.id, name: p.name, score }
  }).sort((a, b) => b.score - a.score)

  const top = scored[0]
  const second = scored[1]
  const CONFIDENT = 0.72
  const AMBIGUOUS_GAP = 0.08

  if (!top || top.score < CONFIDENT) {
    return { personId: '', personName: '', confidence: top?.score || 0, ambiguous: false, candidates: scored.slice(0, 3) }
  }
  const ambiguous = !!second && top.score - second.score < AMBIGUOUS_GAP && second.score >= CONFIDENT
  return { personId: top.id, personName: top.name, confidence: top.score, ambiguous, candidates: scored.slice(0, 3) }
}

function toDatetimeLocal(d) {
  if (!d) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const DRAFT_KEY = 'ct-voice-log-draft'
function loadDraft() { try { return localStorage.getItem(DRAFT_KEY) || '' } catch { return '' } }
function saveDraft(text) { try { if (text) localStorage.setItem(DRAFT_KEY, text); else localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ } }

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

// Voice recording state machine
function useVoiceInput(onTranscript) {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const recognitionRef = useRef(null)

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    setSupported(!!SpeechRecognition)
  }, [])

  const start = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return
    const r = new SpeechRecognition()
    r.continuous = true
    r.interimResults = true
    r.lang = 'en-US'

    let finalTranscript = ''
    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript + ' '
        else interim += e.results[i][0].transcript
      }
      onTranscript(finalTranscript + interim)
    }
    r.onend = () => { setListening(false); recognitionRef.current = null }
    r.onerror = () => { setListening(false); recognitionRef.current = null }
    r.start()
    recognitionRef.current = r
    setListening(true)
  }

  const stop = () => {
    recognitionRef.current?.stop()
    setListening(false)
  }

  return { listening, supported, start, stop }
}

/** Best-effort guess at a name mentioned after "called"/"with"/"to", for quick-add prefill. */
function guessNameFromText(text) {
  const m = text.match(/\b(?:called|call with|spoke (?:to|with)|talked (?:to|with)|with)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)/)
  return m ? m[1] : ''
}

export default function FlockAiLogPanel({ preselect = null, onOpenPerson }) {
  const { profile, user } = useAuth()
  const [people, setPeople] = useState([])
  const [forPerson, setForPerson] = useState(preselect)
  const [logMode, setLogMode] = useState('text') // 'text' or 'voice'
  const [text, setText] = useState(loadDraft)
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState(null)
  const [matchInfo, setMatchInfo] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [success, setSuccess] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddName, setQuickAddName] = useState('')
  const [quickAddSaving, setQuickAddSaving] = useState(false)
  const [voiceLogSuccess, setVoiceLogSuccess] = useState(false)

  const { listening, supported, start, stop } = useVoiceInput((transcript) => {
    setText(transcript)
  })

  // Depend on user.id — otherwise switching accounts in the same tab without a
  // hard refresh left the previous pastor's people list on screen.
  useEffect(() => {
    setPeople([])
    callFlockAPI('people')
      .then((list) => setPeople(Array.isArray(list) ? list : []))
      .catch(() => setPeople([]))
  }, [user?.id])

  useEffect(() => { saveDraft(text) }, [text])

  const runParse = () => {
    const desc = text.trim()
    if (!desc) { setMsg({ type: 'error', text: 'Please describe the call first.' }); return }
    setParsing(true)
    setMsg(null)
    const lower = desc.toLowerCase()
    const result = detectResult(lower)
    let nextAction = detectNextAction(lower)
    const dt = parseNaturalDate(desc)
    if (dt && nextAction === 'None') nextAction = 'Follow-up'
    let person = matchPerson(lower, people)
    if (!person.personId && forPerson) person = { personId: forPerson.id, personName: forPerson.name, confidence: 1, ambiguous: false, candidates: [] }
    setMatchInfo(person)
    setQuickAddOpen(false)
    setQuickAddName(person.personId ? '' : guessNameFromText(desc))
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

  const patch = (key, value) => {
    setParsed((p) => ({ ...p, [key]: value }))
    if (key === 'personId') setQuickAddOpen(false)
  }

  const quickAddPerson = async () => {
    const name = quickAddName.trim()
    if (!name || quickAddSaving) return
    setQuickAddSaving(true)
    setMsg(null)
    try {
      const res = await callFlockAPI('addPerson', { payload: JSON.stringify({ name, cadenceDays: 28 }) })
      if (!res || res.success !== true) throw new Error((res && res.error) || 'Could not add person')
      const newPerson = { id: res.personId, name }
      setPeople((cur) => [...cur, newPerson].sort((a, b) => String(a.name).localeCompare(String(b.name))))
      patch('personId', res.personId)
      patch('personName', name)
      setQuickAddOpen(false)
    } catch (e) {
      setMsg({ type: 'error', text: 'Error: ' + String(e.message || e) })
    } finally {
      setQuickAddSaving(false)
    }
  }

  const save = async () => {
    if (!parsed || saving) return
    if (!parsed.personId) { setMsg({ type: 'error', text: 'Please pick which person this call was with.' }); return }
    const needsDate = parsed.nextAction === 'Callback' || parsed.nextAction === 'Follow-up'
    if (needsDate && !parsed.nextActionDateTime) { setMsg({ type: 'error', text: `${parsed.nextAction} needs a date/time.` }); return }
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
          loggedBy: profile?.name || profile?.email || 'Pastor',
        }),
      })
      if (!res || res.success !== true) throw new Error((res && res.error) || 'Save failed')

      const keptTodos = (parsed.todos || []).filter((t) => t.keep && t.text.trim())
      if (keptTodos.length) {
        try {
          await callFlockAPI('saveTodos', {
            payload: JSON.stringify({
              interactionId: res.interactionId || 'log-' + Date.now(),
              personId: parsed.personId,
              personName: parsed.personName,
              todos: keptTodos.map((t) => ({ text: t.text.trim(), dueDate: '' })),
            }),
          })
        } catch { /* non-fatal */ }
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
    setVoiceLogSuccess(false)
    setForPerson(null)
    setLogMode('text')
    if (listening) stop()
  }

  const handleVoiceLogSuccess = () => {
    setVoiceLogSuccess(true)
    if (onOpenPerson && forPerson) {
      setTimeout(() => onOpenPerson(forPerson.id), 1500)
    }
  }

  if (success || voiceLogSuccess) {
    return (
      <div style={{ ...flockCard({ padding: '40px 28px' }), textAlign: 'center', maxWidth: '520px', margin: '0 auto' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: FLOCK.greenTint, color: FLOCK.green, display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
          <Check size={28} />
        </div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>
          {voiceLogSuccess ? 'Voice note saved.' : 'Call logged.'}
        </div>
        <div style={{ fontSize: '13px', color: FLOCK.muted, marginTop: '6px' }}>
          {voiceLogSuccess ? 'Todos added for this contact.' : `Interaction saved for ${parsed?.personName || 'this person'}.`}
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '22px', flexWrap: 'wrap' }}>
          <button type="button" onClick={reset} style={{ padding: '11px 18px', background: FLOCK.purple, color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: FLOCK.fontBody }}>
            Log another
          </button>
          {onOpenPerson && ((parsed?.personId) || (forPerson?.id)) && (
            <button type="button" onClick={() => onOpenPerson(parsed?.personId || forPerson.id)} style={{ padding: '11px 18px', background: FLOCK.card, color: FLOCK.text, border: `1px solid ${FLOCK.borderStrong}`, borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: FLOCK.fontBody }}>
              View {(parsed?.personName || forPerson?.name)?.split(' ')[0] || 'their'}'s notes
            </button>
          )}
        </div>
      </div>
    )
  }

  // Voice logging mode
  if (logMode === 'voice' && forPerson) {
    return (
      <div style={{ display: 'grid', gap: '16px', maxWidth: '620px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <Mic size={20} color={FLOCK.purple} />
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>Voice interaction log</h2>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: FLOCK.muted }}>
            Speak to create follow-up todos for {forPerson.name}.
          </p>
        </div>
        <FlockVoiceInteractionLogger
          contactId={forPerson.id}
          contactName={forPerson.name}
          onSuccess={handleVoiceLogSuccess}
          onClose={() => setLogMode('text')}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '16px', maxWidth: '620px' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <Mic size={20} color={FLOCK.purple} />
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>Quick Call Log</h2>
        </div>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: FLOCK.muted }}>
          Speak or type what happened on the call — Nexus will fill in the details.
        </p>
      </div>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: `1px solid ${FLOCK.border}`, paddingBottom: '0' }}>
        <button
          type="button"
          onClick={() => setLogMode('text')}
          style={{
            padding: '10px 12px',
            background: 'none',
            border: 'none',
            borderBottom: logMode === 'text' ? `3px solid ${FLOCK.purple}` : 'none',
            color: logMode === 'text' ? FLOCK.purple : FLOCK.muted,
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: FLOCK.fontBody,
          }}
        >
          Text
        </button>
        <button
          type="button"
          onClick={() => forPerson ? setLogMode('voice') : setMsg({ type: 'error', text: 'Please select a person first to use voice logging.' })}
          style={{
            padding: '10px 12px',
            background: 'none',
            border: 'none',
            borderBottom: logMode === 'voice' ? `3px solid ${FLOCK.purple}` : 'none',
            color: logMode === 'voice' ? FLOCK.purple : FLOCK.muted,
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: FLOCK.fontBody,
            opacity: forPerson ? 1 : 0.5,
          }}
        >
          Voice
        </button>
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

        {/* Voice recording strip */}
        {supported && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', background: listening ? FLOCK.redTint : FLOCK.purpleTint, border: `1px solid ${listening ? FLOCK.red + '44' : FLOCK.purple + '44'}`, transition: 'background 0.2s' }}>
            <button
              type="button"
              onClick={listening ? stop : start}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '7px',
                padding: '8px 14px', border: 'none', borderRadius: '8px',
                background: listening ? FLOCK.red : FLOCK.purple,
                color: '#FFFFFF', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer', fontFamily: FLOCK.fontBody,
              }}
            >
              {listening ? <><Square size={13} /> Stop recording</> : <><Mic size={13} /> Speak your log</>}
            </button>
            <span style={{ fontSize: '12px', color: listening ? FLOCK.red : FLOCK.purple, fontWeight: 600 }}>
              {listening ? 'Listening… speak naturally about the call' : 'Tap to dictate, or type below'}
            </span>
            {listening && (
              <span style={{ marginLeft: 'auto', display: 'flex', gap: '3px', alignItems: 'center' }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{ display: 'block', width: '4px', borderRadius: '2px', background: FLOCK.red, animation: `pulse-bar 0.8s ease-in-out ${i * 0.15}s infinite alternate`, height: `${10 + i * 4}px` }} />
                ))}
              </span>
            )}
          </div>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={supported ? 'Or type here — e.g. "Called Sarah, she picked up. Graduating in spring. Will follow up next Tuesday."' : 'e.g. Called Sarah, she picked up. Doing well, graduating in spring. Will follow up next Tuesday.'}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={runParse}
            disabled={parsing || !text.trim()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '10px 18px', background: FLOCK.purple, color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: parsing ? 'wait' : 'pointer', opacity: parsing || !text.trim() ? 0.6 : 1, fontFamily: FLOCK.fontBody }}
          >
            <Wand2 size={15} />
            {parsing ? 'Parsing…' : 'Parse & review'}
          </button>
          {text && (
            <button type="button" onClick={() => setText('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: FLOCK.muted, fontSize: '12px', fontFamily: FLOCK.fontBody }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {parsed && (
        <div style={flockCard({ padding: '18px', display: 'grid', gap: '16px' })}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>Review &amp; confirm</div>

          <div>
            <label style={labelStyle}>Person</label>
            <select value={parsed.personId} onChange={(e) => patch('personId', e.target.value)} style={inputStyle}>
              <option value="">— pick a person —</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            {/* Ambiguous match: two contacts scored close together — ask instead of guessing. */}
            {matchInfo?.ambiguous && matchInfo.candidates.length > 1 && (
              <div style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '8px', background: FLOCK.amberTint, display: 'grid', gap: '6px' }}>
                <div style={{ fontSize: '12px', color: FLOCK.text, fontWeight: 600 }}>Did you mean one of these?</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {matchInfo.candidates.filter((c) => c.score >= 0.6).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { patch('personId', c.id); patch('personName', c.name); setMatchInfo((m) => ({ ...m, ambiguous: false })) }}
                      style={{ padding: '6px 12px', borderRadius: '999px', border: `1px solid ${FLOCK.purple}`, background: FLOCK.card, color: FLOCK.purple, fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* No confident match: offer to add this person on the spot instead of leaving the field blank. */}
            {!parsed.personId && !matchInfo?.ambiguous && (
              <div style={{ marginTop: '8px' }}>
                {!quickAddOpen ? (
                  <button
                    type="button"
                    onClick={() => setQuickAddOpen(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: FLOCK.purple, fontSize: '12px', fontWeight: 600, fontFamily: FLOCK.fontBody, padding: 0 }}
                  >
                    <UserPlus size={13} />
                    Didn't find them? Add as a new person
                  </button>
                ) : (
                  <div style={{ padding: '10px 12px', borderRadius: '8px', background: FLOCK.surface, display: 'grid', gap: '8px' }}>
                    <div style={{ fontSize: '12px', color: FLOCK.text, fontWeight: 600 }}>Add new contact</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={quickAddName}
                        onChange={(e) => setQuickAddName(e.target.value)}
                        placeholder="Full name"
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={quickAddPerson}
                        disabled={!quickAddName.trim() || quickAddSaving}
                        style={{ padding: '9px 16px', background: FLOCK.purple, color: '#FFFFFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: quickAddSaving ? 'wait' : 'pointer', opacity: !quickAddName.trim() || quickAddSaving ? 0.6 : 1, fontFamily: FLOCK.fontBody, whiteSpace: 'nowrap' }}
                      >
                        {quickAddSaving ? 'Adding…' : 'Add & select'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Result</label>
              <select value={parsed.result} onChange={(e) => patch('result', e.target.value)} style={inputStyle}>
                {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Next action</label>
              <select value={parsed.nextAction} onChange={(e) => patch('nextAction', e.target.value)} style={inputStyle}>
                {NEXT_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
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
              <label style={labelStyle}>Suggested follow-ups</label>
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

      <style>{`
        @keyframes pulse-bar {
          from { opacity: 0.5; transform: scaleY(0.7); }
          to   { opacity: 1;   transform: scaleY(1.1); }
        }
      `}</style>
    </div>
  )
}
