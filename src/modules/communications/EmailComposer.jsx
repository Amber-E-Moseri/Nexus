import { useState, useRef, useEffect } from 'react'
import { Copy, Eye, EyeOff, Send, AlertCircle, Check, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

const PRIMARY = '#4C2A92'
const ACCENT = '#E8A020'
const SUCCESS = '#2D6A4F'
const ERROR = '#C94830'
const WARNING = '#9A6000'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#F4F1EA'
const SURFACE = '#FFFFFF'
const BORDER = '#EDE8DC'

// Default available variables
const DEFAULT_VARIABLES = [
  '{{name}}',
  '{{email}}',
  '{{subgroup}}',
  '{{role}}',
  '{{leadership_category}}',
  '{{sender_name}}',
  '{{org_name}}',
  '{{date_today}}',
]

// Spam trigger words
const SPAM_TRIGGERS = [
  'FREE',
  'URGENT',
  'ACT NOW',
  'LIMITED TIME',
  'CLICK HERE',
  'BUY NOW',
  'RISK FREE',
  'GUARANTEE',
  'NO OBLIGATION',
  'WINNER',
  'CASH',
  'PRIZE',
]

function getSpamScore(subject) {
  if (!subject) return { score: 0, level: 'good', triggers: [] }
  const upper = subject.toUpperCase()
  const triggers = SPAM_TRIGGERS.filter(t => upper.includes(t))
  const capsCount = (subject.match(/[A-Z]/g) || []).length
  const capRatio = subject.length > 0 ? capsCount / subject.length : 0

  let score = triggers.length * 25 + (capRatio > 0.3 ? 15 : 0)
  if (subject.includes('!!!')) score += 20
  if (subject.includes('???')) score += 10

  score = Math.min(100, score)
  const level = score > 50 ? 'risky' : score > 25 ? 'ok' : 'good'

  return { score, level, triggers }
}

function RichTextToolbar({ onAction }) {
  const buttons = [
    { label: 'B', action: 'bold', title: 'Bold (Ctrl+B)' },
    { label: 'I', action: 'italic', title: 'Italic (Ctrl+I)' },
    { label: 'U', action: 'underline', title: 'Underline' },
    { label: 'H1', action: 'h1', title: 'Heading 1' },
    { label: 'H2', action: 'h2', title: 'Heading 2' },
    { label: '•', action: 'bullet', title: 'Bullet list' },
    { label: '1.', action: 'number', title: 'Numbered list' },
    { label: 'A', action: 'link', title: 'Insert link' },
  ]

  return (
    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', padding: '10px 0', borderBottom: `1px solid ${BORDER}`, marginBottom: 12 }}>
      {buttons.map((btn) => (
        <button
          key={btn.action}
          onClick={() => onAction(btn.action)}
          title={btn.title}
          style={{
            padding: '6px 10px',
            background: BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 5,
            fontSize: 12,
            fontWeight: 700,
            color: TEXT,
            cursor: 'pointer',
            transition: 'all 150ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = BORDER; e.currentTarget.style.borderColor = PRIMARY }}
          onMouseLeave={(e) => { e.currentTarget.style.background = BG; e.currentTarget.style.borderColor = BORDER }}
        >
          {btn.label}
        </button>
      ))}
    </div>
  )
}

function SubjectLineHelper({ value }) {
  const spam = getSpamScore(value)
  const charCount = value.length
  const isLong = charCount > 60
  const colors = {
    good: { bg: '#EBF7F1', color: SUCCESS, label: 'Good' },
    ok: { bg: '#FEF5E4', color: WARNING, label: 'OK' },
    risky: { bg: '#FEF0ED', color: ERROR, label: 'Risky' },
  }
  const style = colors[spam.level]

  return (
    <div style={{ background: BG, borderRadius: 10, padding: 12, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase' }}>Characters:</span>
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: isLong ? ERROR : TEXT,
            background: isLong ? '#FEF0ED' : 'transparent',
            padding: isLong ? '2px 8px' : 0,
            borderRadius: 4,
          }}>
            {charCount}/60 {isLong ? '(too long)' : ''}
          </span>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: style.bg,
          padding: '4px 10px',
          borderRadius: 6,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: style.color, textTransform: 'uppercase' }}>Spam score:</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: style.color }}>{style.label}</span>
        </div>
      </div>
      {spam.triggers.length > 0 && (
        <div style={{ marginTop: 8, padding: 8, background: '#fff', borderRadius: 6, fontSize: 11, color: MUTED }}>
          <strong style={{ color: TEXT }}>Detected trigger words:</strong> {spam.triggers.join(', ')}
        </div>
      )}
    </div>
  )
}

function VariableChips({ variables, onInsert }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', marginBottom: 6 }}>Available variables</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {variables.map((v) => (
          <button
            key={v}
            onClick={() => onInsert(v)}
            style={{
              background: '#F4F0FC',
              border: `1px solid #D5CCE9`,
              color: PRIMARY,
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#EDE8F8'; e.currentTarget.style.borderColor = PRIMARY }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#F4F0FC'; e.currentTarget.style.borderColor = '#D5CCE9' }}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}

function EmailPreviewPane({ body, subject, isMobile }) {
  if (!body) {
    return (
      <div style={{
        background: BG,
        borderRadius: 10,
        padding: 20,
        textAlign: 'center',
        color: MUTED,
        fontSize: 13,
      }}>
        <Eye size={32} style={{ opacity: 0.5, margin: '0 auto 8px', display: 'block' }} />
        Write content above to see preview
      </div>
    )
  }

  // Simple HTML rendering (real implementation would use DOMPurify + marked/rehype)
  const processedBody = body
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, i) => (
      <p key={i} style={{ marginBottom: 12, lineHeight: 1.6, color: TEXT }}>
        {line}
      </p>
    ))

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${BORDER}`,
      borderRadius: 10,
      padding: 16,
      minHeight: 200,
    }}>
      {subject && (
        <div style={{
          fontSize: 14,
          fontWeight: 700,
          color: TEXT,
          marginBottom: 12,
          paddingBottom: 12,
          borderBottom: `1px solid ${BORDER}`,
        }}>
          {subject}
        </div>
      )}
      <div style={{ fontSize: 13, color: TEXT }}>
        {processedBody}
      </div>
    </div>
  )
}

function TestEmailForm({ onSendTest, subject, loading }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const handleSend = async () => {
    if (!email.trim()) return
    await onSendTest(email)
    setSent(true)
    setEmail('')
    setTimeout(() => setSent(false), 3000)
  }

  return (
    <div style={{ background: BG, borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', marginBottom: 8 }}>Send test email</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          style={{
            flex: 1,
            padding: '8px 10px',
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            fontSize: 12,
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!email.trim() || loading}
          style={{
            padding: '8px 12px',
            background: sent ? SUCCESS : PRIMARY,
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 150ms',
          }}
        >
          {sent ? <Check size={14} /> : <Send size={14} />}
          {sent ? 'Sent' : 'Send'}
        </button>
      </div>
    </div>
  )
}

function SignaturePreview({ userId }) {
  const [signature, setSignature] = useState(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const iframeRef = useRef(null)

  useEffect(() => {
    if (!expanded || !userId) return
    loadSignature()
  }, [expanded, userId])

  async function loadSignature() {
    setLoading(true)
    const { data } = await supabase
      .from('email_signatures')
      .select('signature_html')
      .eq('user_id', userId)
      .eq('is_default', true)
      .maybeSingle()

    setSignature(data?.signature_html ?? null)
    setLoading(false)
  }

  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '10px 12px',
          background: BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          color: TEXT,
          cursor: 'pointer',
          transition: 'all 150ms',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = BORDER }}
        onMouseLeave={(e) => { e.currentTarget.style.background = BG }}
      >
        <span>Signature preview</span>
        <ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : '', transition: 'transform 150ms' }} />
      </button>

      {expanded && (
        <div style={{ marginTop: 8 }}>
          {loading ? (
            <div style={{ padding: 16, textAlign: 'center', color: MUTED, fontSize: 12 }}>Loading signature...</div>
          ) : !signature ? (
            <div style={{ padding: 16, background: BG, borderRadius: 8, textAlign: 'center', color: MUTED, fontSize: 12 }}>
              <p>(No signature set)</p>
              <a href="/settings" style={{ color: PRIMARY, textDecoration: 'underline', fontSize: 11 }}>
                Add one in Settings
              </a>
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              srcDoc={signature}
              style={{
                width: '100%',
                height: 200,
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                minHeight: 100,
                background: SURFACE,
              }}
              title="Signature Preview"
            />
          )}
        </div>
      )}
    </div>
  )
}

export default function EmailComposer({
  value = '',
  onChange = () => {},
  subject = '',
  onSubjectChange = () => {},
  variables = DEFAULT_VARIABLES,
  templates = [],
  onLoadTemplate = () => {},
  onSendTest = async () => {},
  previewVisible = true,
  onTogglePreview = () => {},
  isMobile = false,
  showSubject = true,
  autosave = true,
}) {
  const { user } = useAuth()
  const [mode, setMode] = useState('plain') // 'plain', 'rich', 'mjml'
  const [autoSaveIndicator, setAutoSaveIndicator] = useState('saved')
  const [testLoading, setTestLoading] = useState(false)
  const editorRef = useRef(null)

  // Auto-save to localStorage every 30s (opt-out via autosave=false, e.g. when
  // the parent owns persistence such as the campaign builder).
  useEffect(() => {
    if (!autosave) return undefined
    const timer = setInterval(() => {
      if (value !== (localStorage.getItem('draft_campaign_body') || '')) {
        setAutoSaveIndicator('saving')
        localStorage.setItem('draft_campaign_body', value)
        localStorage.setItem('draft_campaign_subject', subject)
        setTimeout(() => setAutoSaveIndicator('saved'), 500)
      }
    }, 30000)
    return () => clearInterval(timer)
  }, [value, subject, autosave])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (autosave && (e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        setAutoSaveIndicator('saving')
        localStorage.setItem('draft_campaign_body', value)
        localStorage.setItem('draft_campaign_subject', subject)
        setTimeout(() => setAutoSaveIndicator('saved'), 500)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'b' && mode === 'rich') {
        e.preventDefault()
        handleToolbarAction('bold')
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'i' && mode === 'rich') {
        e.preventDefault()
        handleToolbarAction('italic')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [value, subject, mode])

  const handleToolbarAction = (action) => {
    const editor = editorRef.current
    if (!editor) return

    const start = editor.selectionStart
    const end = editor.selectionEnd
    const selectedText = value.substring(start, end) || 'text'
    const before = value.substring(0, start)
    const after = value.substring(end)

    let newValue = value
    switch (action) {
      case 'bold':
        newValue = before + `**${selectedText}**` + after
        break
      case 'italic':
        newValue = before + `*${selectedText}*` + after
        break
      case 'underline':
        newValue = before + `__${selectedText}__` + after
        break
      case 'h1':
        newValue = before + `\n# ${selectedText}\n` + after
        break
      case 'h2':
        newValue = before + `\n## ${selectedText}\n` + after
        break
      case 'bullet':
        newValue = before + `\n• ${selectedText}\n` + after
        break
      case 'number':
        newValue = before + `\n1. ${selectedText}\n` + after
        break
      case 'link':
        newValue = before + `[${selectedText}](url)` + after
        break
      default:
        break
    }
    onChange(newValue)
    setTimeout(() => {
      editor.focus()
      editor.setSelectionRange(start + 2, end + 2)
    }, 0)
  }

  const handleInsertVariable = (variable) => {
    const editor = editorRef.current
    if (!editor) return

    const start = editor.selectionStart
    const before = value.substring(0, start)
    const after = value.substring(start)
    const newValue = before + variable + after

    onChange(newValue)
    setTimeout(() => {
      editor.focus()
      editor.setSelectionRange(start + variable.length, start + variable.length)
    }, 0)
  }

  const handleLoadTemplate = (template) => {
    if (template) {
      onSubjectChange(template.subject || '')
      onChange(template.body || '')
      onLoadTemplate(template)
    }
  }

  const handleSendTest = async (email) => {
    setTestLoading(true)
    try {
      await onSendTest(email, value)
    } finally {
      setTestLoading(false)
    }
  }

  const layoutStyle = !isMobile && previewVisible
    ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }
    : { display: 'block' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Mode selector */}
      <div style={{
        display: 'flex',
        gap: 6,
        background: BG,
        padding: 4,
        borderRadius: 8,
        width: 'fit-content',
      }}>
        {['plain', 'rich', 'mjml'].map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: '6px 12px',
              background: mode === m ? '#fff' : 'transparent',
              border: `1px solid ${mode === m ? BORDER : 'transparent'}`,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: mode === m ? 700 : 500,
              color: mode === m ? PRIMARY : MUTED,
              cursor: 'pointer',
              textTransform: 'capitalize',
              transition: 'all 150ms',
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Subject line (hidden when the parent owns the subject, e.g. A/B test) */}
      {showSubject ? (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', marginBottom: 6 }}>Subject line</div>
          <input
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            placeholder="Your subject line..."
            style={{
              width: '100%',
              padding: '10px 12px',
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              color: TEXT,
              outline: 'none',
              fontFamily: 'inherit',
              marginBottom: 8,
            }}
          />
          <SubjectLineHelper value={subject} />
        </div>
      ) : null}

      {/* Main editor + preview layout */}
      <div style={layoutStyle}>
        {/* Left: Editor */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase' }}>Body</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {previewVisible && isMobile && (
                <button
                  onClick={onTogglePreview}
                  style={{
                    border: `1px solid ${BORDER}`,
                    background: 'transparent',
                    color: MUTED,
                    padding: '4px 8px',
                    borderRadius: 5,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {previewVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              )}
              <span style={{ fontSize: 10, fontWeight: 600, color: autoSaveIndicator === 'saved' ? SUCCESS : MUTED }}>
                {autoSaveIndicator === 'saved' ? '✓ Saved' : 'Saving...'}
              </span>
            </div>
          </div>

          {/* Template loader */}
          {templates.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <select
                onChange={(e) => handleLoadTemplate(templates.find(t => t.id === e.target.value))}
                value=""
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  background: '#fff',
                  color: TEXT,
                  cursor: 'pointer',
                }}
              >
                <option value="">— Load from template —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Rich text toolbar */}
          {mode === 'rich' && <RichTextToolbar onAction={handleToolbarAction} />}

          {/* Variable chips */}
          <VariableChips variables={variables} onInsert={handleInsertVariable} />

          {/* Text editor */}
          <textarea
            ref={editorRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Write your email here...\n\nTip: Use {{name}}, {{email}}, {{subgroup}} etc. for personalization.`}
            style={{
              width: '100%',
              minHeight: isMobile ? 200 : 300,
              padding: '12px',
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.6,
              fontFamily: '"DM Sans", system-ui, sans-serif',
              color: TEXT,
              resize: 'vertical',
              outline: 'none',
            }}
          />
        </div>

        {/* Right: Preview (respects previewVisible on every breakpoint) */}
        {previewVisible && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', marginBottom: 12 }}>Live preview</div>

            <EmailPreviewPane body={value} subject={showSubject ? subject : ''} isMobile={isMobile} />

            <div style={{ marginTop: 12 }}>
              <TestEmailForm onSendTest={handleSendTest} subject={subject} loading={testLoading} />
            </div>

            {user?.id && (
              <SignaturePreview userId={user.id} />
            )}

            {/* Variable legend */}
            <div style={{ background: BG, borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', marginBottom: 8 }}>Variables</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {variables.map((v) => (
                  <div key={v} style={{ fontSize: 11, color: MUTED }}>
                    <span style={{ fontWeight: 700, color: PRIMARY }}>{v}</span> — Replaced with recipient's {v.slice(2, -2)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
