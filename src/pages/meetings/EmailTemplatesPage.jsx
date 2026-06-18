import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { formatRelativeDate } from '../../lib/dateUtils'
import { supabase } from '../../lib/supabase'

const PAGE_BG = '#F9F7F3'
const PANEL_BG = '#FFFFFF'
const PANEL_BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const ACCENT = '#4C2A92'
const DANGER = '#C94830'
const SUCCESS = '#2D8653'
const TEMPLATE_SELECT = 'id, name, subject, body, is_default, created_by, updated_at'

const INPUT = {
  width: '100%',
  border: `1px solid ${PANEL_BORDER}`,
  borderRadius: 9,
  padding: '9px 11px',
  fontSize: 13,
  color: TEXT,
  background: PANEL_BG,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none',
}

const VARIABLE_HELP = [
  { token: '{{name}}', label: "Recipient's full name" },
  { token: '{{meeting_label}}', label: 'Meeting name/date' },
  { token: '{{next_date}}', label: 'Next meeting date' },
  { token: '{{recap}}', label: 'Meeting recap text' },
  { token: '{{subgroup}}', label: "Recipient's subgroup" },
  { token: '{{leadership_category}}', label: "Recipient's leadership category" },
  { token: '{{space_name}}', label: 'Department / space name' },
  { token: '{{pastor_name}}', label: "Recipient's pastor name" },
  { token: '{{sender_name}}', label: 'Name of sender' },
  { token: '{{org_name}}', label: 'Organisation name' },
  { token: '{{date_today}}', label: "Today's date (long format)" },
]

const SAMPLE_VALUES = {
  '{{name}}': 'Jane Smith',
  '{{meeting_label}}': 'Toronto Regional Leaders Meeting - July 19',
  '{{next_date}}': 'Sunday, July 26',
  '{{recap}}': 'We shared a recap on soul winning focus, upcoming prayer targets, and department handoff actions.',
  '{{subgroup}}': 'Central East',
  '{{leadership_category}}': 'Cell Leader',
  '{{space_name}}': 'Media',
  '{{pastor_name}}': 'Pastor John',
  '{{sender_name}}': 'BLW Canada Team',
  '{{org_name}}': 'BLW Canada',
  '{{date_today}}': new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
}

function renderPreview(text) {
  return VARIABLE_HELP.reduce(
    (result, item) => result.replaceAll(item.token, SAMPLE_VALUES[item.token]),
    text ?? '',
  )
}

function emptyTemplate(profile) {
  return {
    id: null,
    name: '',
    subject: '',
    body: '',
    is_default: false,
    created_by: profile?.id ?? null,
  }
}

export default function EmailTemplatesPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [globalMessage, setGlobalMessage] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formState, setFormState] = useState(() => emptyTemplate(profile))
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const bodyRef = useRef(null)

  useEffect(() => {
    setFormState((current) => (current.id || current.name || current.subject || current.body ? current : emptyTemplate(profile)))
  }, [profile])

  async function loadTemplates() {
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await supabase
      .from('absence_email_templates')
      .select(TEMPLATE_SELECT)
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false })

    if (queryError) {
      setError(queryError.message)
      setTemplates([])
    } else {
      setTemplates(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  const preview = useMemo(() => ({
    subject: renderPreview(formState.subject),
    body: renderPreview(formState.body),
  }), [formState.body, formState.subject])

  function beginCreate() {
    setGlobalMessage(null)
    setFormState(emptyTemplate(profile))
    setFormOpen(true)
  }

  function beginEdit(template) {
    setGlobalMessage(null)
    setFormState({
      id: template.id,
      name: template.name ?? '',
      subject: template.subject ?? '',
      body: template.body ?? '',
      is_default: !!template.is_default,
      created_by: template.created_by ?? profile?.id ?? null,
    })
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setFormState(emptyTemplate(profile))
  }

  function setField(key, value) {
    setFormState((current) => ({ ...current, [key]: value }))
  }

  function insertVariable(token) {
    const textarea = bodyRef.current
    if (!textarea) {
      setField('body', `${formState.body}${token}`)
      return
    }

    const start = textarea.selectionStart ?? formState.body.length
    const end = textarea.selectionEnd ?? formState.body.length
    const nextBody = `${formState.body.slice(0, start)}${token}${formState.body.slice(end)}`
    setField('body', nextBody)

    requestAnimationFrame(() => {
      textarea.focus()
      const nextCursor = start + token.length
      textarea.setSelectionRange(nextCursor, nextCursor)
    })
  }

  async function setAsDefault(templateId) {
    setSaving(true)
    setError(null)
    setGlobalMessage(null)

    const { error: clearError } = await supabase
      .from('absence_email_templates')
      .update({ is_default: false })
      .neq('id', templateId)

    if (clearError) {
      setSaving(false)
      setError(clearError.message)
      return
    }

    const { error: setErrorValue } = await supabase
      .from('absence_email_templates')
      .update({ is_default: true })
      .eq('id', templateId)

    if (setErrorValue) {
      setSaving(false)
      setError(setErrorValue.message)
      return
    }

    await loadTemplates()
    setSaving(false)
    setGlobalMessage('Default template updated.')
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setGlobalMessage(null)

    const payload = {
      name: formState.name.trim(),
      subject: formState.subject.trim(),
      body: formState.body,
      is_default: !!formState.is_default,
      created_by: formState.created_by ?? profile?.id ?? null,
    }

    if (payload.is_default) {
      const excludeId = formState.id ?? '00000000-0000-0000-0000-000000000000'
      const { error: clearError } = await supabase
        .from('absence_email_templates')
        .update({ is_default: false })
        .neq('id', excludeId)

      if (clearError) {
        setSaving(false)
        setError(clearError.message)
        return
      }
    }

    const query = formState.id
      ? supabase.from('absence_email_templates').update(payload).eq('id', formState.id)
      : supabase.from('absence_email_templates').insert(payload)

    const { error: saveError } = await query

    if (saveError) {
      setSaving(false)
      setError(saveError.message)
      return
    }

    await loadTemplates()
    setSaving(false)
    setGlobalMessage(formState.id ? 'Template updated.' : 'Template created.')
    closeForm()
  }

  async function handleDelete(templateId) {
    if (!window.confirm('Delete this email template?')) return
    setDeletingId(templateId)
    setError(null)
    setGlobalMessage(null)

    const { error: deleteError } = await supabase
      .from('absence_email_templates')
      .delete()
      .eq('id', templateId)

    if (deleteError) {
      setError(deleteError.message)
    } else {
      setTemplates((current) => current.filter((template) => template.id !== templateId))
      if (formState.id === templateId) closeForm()
      setGlobalMessage('Template deleted.')
    }

    setDeletingId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 24px 0', background: PANEL_BG, borderBottom: `1px solid ${PANEL_BORDER}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button type="button" onClick={() => navigate('/communications')} style={{ border: 'none', background: 'none', color: MUTED, cursor: 'pointer', fontSize: 13, padding: 0 }}>
            {'<-'} Communications
          </button>
          <span style={{ color: '#D8D3C9' }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Templates</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', paddingBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Absence Email Templates</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>
              Create and manage reusable follow-up emails for missed meeting attendance.
            </p>
          </div>
          <button
            type="button"
            onClick={beginCreate}
            style={{ border: 'none', background: ACCENT, color: '#FFFFFF', borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            + New Template
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px', background: PAGE_BG }}>
        {globalMessage ? (
          <div style={{ marginBottom: 12, fontSize: 13, color: SUCCESS, background: '#EEF6F1', border: '1px solid #C3E0CC', borderRadius: 12, padding: '10px 14px' }}>
            {globalMessage}
          </div>
        ) : null}
        {error ? (
          <div style={{ marginBottom: 12, fontSize: 13, color: DANGER, background: '#FEF0ED', border: '1px solid #F5C4B8', borderRadius: 12, padding: '10px 14px' }}>
            {error}
          </div>
        ) : null}

        {formOpen ? (
          <form onSubmit={handleSave} style={{ marginBottom: 16, background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 16, padding: 18, boxShadow: '0 8px 24px rgba(28,22,16,.06)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, .8fr)', gap: 18 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 5, fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em' }}>Name</label>
                  <input
                    value={formState.name}
                    onChange={(event) => setField('name', event.target.value)}
                    placeholder="Regional Meeting Follow-up"
                    required
                    style={INPUT}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 5, fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em' }}>Subject</label>
                  <input
                    value={formState.subject}
                    onChange={(event) => setField('subject', event.target.value)}
                    placeholder="We missed you at our last meeting"
                    required
                    style={INPUT}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em' }}>Body</label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: TEXT, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formState.is_default}
                        onChange={(event) => setField('is_default', event.target.checked)}
                      />
                      Set as default
                    </label>
                  </div>
                  <textarea
                    ref={bodyRef}
                    rows={10}
                    value={formState.body}
                    onChange={(event) => setField('body', event.target.value)}
                    required
                    style={{ ...INPUT, resize: 'vertical', lineHeight: 1.5 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={closeForm}
                    style={{ border: `1px solid ${PANEL_BORDER}`, background: PANEL_BG, color: MUTED, borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !formState.name.trim() || !formState.subject.trim() || !formState.body.trim()}
                    style={{
                      border: 'none',
                      background: ACCENT,
                      color: '#FFFFFF',
                      borderRadius: 8,
                      padding: '7px 16px',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: PAGE_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 12, padding: '14px 14px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                    Variable Reference
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {VARIABLE_HELP.map((item) => (
                      <button
                        key={item.token}
                        type="button"
                        onClick={() => insertVariable(item.token)}
                        style={{
                          border: '1px solid #D5CCE9',
                          background: '#F4F0FC',
                          color: ACCENT,
                          borderRadius: 999,
                          padding: '6px 10px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {item.token}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {VARIABLE_HELP.map((item) => (
                      <div key={`${item.token}-help`} style={{ fontSize: 12, color: MUTED }}>
                        <span style={{ color: ACCENT, fontWeight: 700 }}>{item.token}</span> - {item.label}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                    Preview
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: TEXT, marginBottom: 10 }}>
                    {preview.subject || 'Subject preview'}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: TEXT, lineHeight: 1.65 }}>
                    {preview.body || 'Body preview'}
                  </div>
                </div>
              </div>
            </div>
          </form>
        ) : null}

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: MUTED, fontSize: 13 }}>Loading templates...</div>
        ) : templates.length === 0 ? (
          <div style={{ background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 16, padding: '36px 24px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
            No templates saved yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {templates.map((template) => (
              <div key={template.id} style={{ background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 14, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: '1 1 380px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: TEXT }}>{template.name}</h2>
                      {template.is_default ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: '#EEF6F1', color: SUCCESS, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>
                          Default
                        </span>
                      ) : null}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, color: TEXT }}>
                      <span style={{ fontWeight: 700 }}>Subject:</span> {template.subject}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: MUTED }}>
                      Updated {formatRelativeDate(template.updated_at, { includeTime: true }) ?? '-'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => beginEdit(template)}
                      style={{ border: `1px solid ${PANEL_BORDER}`, background: PANEL_BG, color: ACCENT, borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setAsDefault(template.id)}
                      disabled={saving || template.is_default}
                      style={{
                        border: `1px solid ${PANEL_BORDER}`,
                        background: template.is_default ? '#F4F1EA' : PANEL_BG,
                        color: template.is_default ? MUTED : TEXT,
                        borderRadius: 8,
                        padding: '6px 12px',
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: saving || template.is_default ? 'not-allowed' : 'pointer',
                        opacity: saving || template.is_default ? 0.7 : 1,
                      }}
                    >
                      Set as default
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(template.id)}
                      disabled={deletingId === template.id}
                      style={{
                        border: `1px solid ${PANEL_BORDER}`,
                        background: PANEL_BG,
                        color: DANGER,
                        borderRadius: 8,
                        padding: '6px 12px',
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: deletingId === template.id ? 'not-allowed' : 'pointer',
                        opacity: deletingId === template.id ? 0.7 : 1,
                      }}
                    >
                      {deletingId === template.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
