import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  Code2,
  Eye,
  Image,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Monitor,
  Save,
  Send,
  Smartphone,
  Tag,
  Underline,
  Users,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  addUniqueRecipientPills,
  buildCommunicationRecipientData,
  COMMUNICATION_ROLES,
  escapeHtml,
  fillTemplateTags,
  getRecipientPillKey,
  loadCommunicationSources,
  normalizeEmail,
  parseImportedContactText,
  resolveRecipientPills,
  sanitizeEmailHtml,
  segmentFiltersToRecipientPills,
  slugifyLabel,
  stripHtmlToText,
  titleize,
} from '../../lib/communications'
import { supabase } from '../../lib/supabase'

const COLORS = ['#4C2A92', '#E8A020', '#2D8653', '#C94830', '#1C7C9C', '#6B6560']

function cardStyle() {
  return 'rounded-2xl border border-[var(--border)] bg-white shadow-[0_1px_3px_rgba(28,22,16,.05)]'
}

function Section({ title, action, children }) {
  return (
    <section className="space-y-3 border-b border-[var(--border)] p-4 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-bold uppercase tracking-[.08em] text-[var(--text-tertiary)]">{title}</div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Field({ label, children, hint }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11.5px] font-semibold text-[var(--text-secondary)]">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-[var(--text-tertiary)]">{hint}</span> : null}
    </label>
  )
}

function TextInput(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] ${props.className ?? ''}`}
    />
  )
}

function TextArea(props) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] ${props.className ?? ''}`}
    />
  )
}

function StatusBadge({ status }) {
  const tone = {
    draft: { bg: '#F4F1EA', fg: '#7A6F5E' },
    scheduled: { bg: '#E8EEFF', fg: '#2E5BCE' },
    sending: { bg: '#FEF8E7', fg: '#C47E0A' },
    sent: { bg: '#EBF7F1', fg: '#2D8653' },
    failed: { bg: '#FEF0ED', fg: '#C94830' },
  }[status] ?? { bg: '#F4F1EA', fg: '#7A6F5E' }

  return (
    <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
      {status}
    </span>
  )
}

function RecipientChip({ label, active, tone = 'default', onClick }) {
  const styles = tone === 'gold'
    ? active
      ? { bg: '#FEF8E7', border: '#E8A020', fg: '#B57406' }
      : { bg: '#fff', border: 'var(--border)', fg: 'var(--text-secondary)' }
    : active
      ? { bg: 'var(--accent-light)', border: 'var(--accent)', fg: 'var(--accent)' }
      : { bg: '#fff', border: 'var(--border)', fg: 'var(--text-secondary)' }

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition"
      style={{ background: styles.bg, borderColor: styles.border, color: styles.fg }}
    >
      {label}
    </button>
  )
}

function SelectedPill({ pill, onRemove }) {
  const label = pill.type === 'individual'
    ? `${pill.name ?? pill.email} <${pill.email}>`
    : pill.label ?? pill.category ?? pill.subgroup ?? pill.deptId ?? pill.type

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-light)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--accent)]">
      {label}
      <button type="button" onClick={() => onRemove(pill)} className="text-[var(--accent)]">
        ×
      </button>
    </span>
  )
}

function ToolbarButton({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--accent)]"
    >
      <Icon size={15} />
    </button>
  )
}

const TOKEN_GROUPS = {
  People: [
    { label: '{{name}}', value: '{{name}}' },
    { label: '{{email}}', value: '{{email}}' },
    { label: '{{subgroup}}', value: '{{subgroup}}' },
    { label: '{{leadership_category}}', value: '{{leadership_category}}' },
  ],
  Organization: [
    { label: '{{sender_name}}', value: '{{sender_name}}' },
    { label: '{{org_name}}', value: '{{org_name}}' },
    { label: '{{pastor_name}}', value: '{{pastor_name}}' },
  ],
  Dates: [
    { label: '{{date_today}}', value: '{{date_today}}' },
    { label: '{{next_date}}', value: '{{next_date}}' },
  ],
  Meeting: [
    { label: '{{meeting_label}}', value: '{{meeting_label}}' },
    { label: '{{recap}}', value: '{{recap}}' },
  ],
}

function TokenMenu({ onInsert }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--accent)]"
        title="Insert merge tokens"
      >
        <Tag size={14} />
        Tokens
        <ChevronDown size={13} />
      </button>
      {open ? (
        <div className="absolute top-full right-0 mt-1 z-50 rounded-xl border border-[var(--border)] bg-white shadow-lg">
          {Object.entries(TOKEN_GROUPS).map(([group, tokens]) => (
            <div key={group} className="border-b border-[var(--border)] last:border-b-0">
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                {group}
              </div>
              <div className="px-3 py-1 space-y-0.5">
                {tokens.map((token) => (
                  <button
                    key={token.value}
                    type="button"
                    onClick={() => {
                      onInsert(token.value)
                      setOpen(false)
                    }}
                    className="block w-full text-left rounded-md px-2 py-1.5 text-[12px] font-mono text-[var(--text-primary)] transition hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
                  >
                    {token.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {open ? <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} /> : null}
    </div>
  )
}

function ContactManagerModal({ open, onClose, sources, onRefresh, profile }) {
  const [tab, setTab] = useState('people')
  const [contacts, setContacts] = useState([])
  const [categories, setCategories] = useState([])
  const [links, setLinks] = useState([])
  const [importValue, setImportValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setContacts((sources.contacts ?? []).map((contact) => ({ ...contact })))
    setCategories((sources.categories ?? []).map((category) => ({ ...category })))
    setLinks((sources.categories ?? []).flatMap(() => []).concat(
      Object.entries(sources.categoryMembers ?? {})
        .filter(([key]) => key.startsWith('contact:'))
        .flatMap(([key, members]) => members.map((member) => ({ contact_id: member.id, category_id: key.slice(8) }))),
    ))
    setImportValue('')
    setError(null)
    setTab('people')
  }, [open, sources])

  if (!open) return null

  function toggleLink(contactId, categoryId) {
    setLinks((current) => {
      const exists = current.some((link) => link.contact_id === contactId && link.category_id === categoryId)
      return exists
        ? current.filter((link) => !(link.contact_id === contactId && link.category_id === categoryId))
        : [...current, { contact_id: contactId, category_id: categoryId }]
    })
  }

  function removeCategory(categoryId) {
    setCategories((current) => current.filter((category) => category.id !== categoryId))
    setLinks((current) => current.filter((link) => link.category_id !== categoryId))
  }

  function mergeImport() {
    const parsed = parseImportedContactText(importValue)
    if (parsed.contacts.length === 0) {
      setError('No valid email addresses found in import input.')
      return
    }

    const categoryMap = new Map(categories.map((category) => [category.name.toLowerCase(), category.id]))
    const nextCategories = [...categories]
    const nextContacts = [...contacts]
    const nextLinks = [...links]

    for (const categoryName of parsed.categories) {
      const key = categoryName.toLowerCase()
      if (categoryMap.has(key)) continue
      const id = crypto.randomUUID()
      categoryMap.set(key, id)
      nextCategories.push({
        id,
        name: categoryName,
        color: COLORS[nextCategories.length % COLORS.length],
      })
    }

    const existingEmails = new Set(nextContacts.map((contact) => normalizeEmail(contact.email)))

    for (const contact of parsed.contacts) {
      const email = normalizeEmail(contact.email)
      let contactId = nextContacts.find((item) => normalizeEmail(item.email) === email)?.id

      if (!contactId) {
        contactId = crypto.randomUUID()
        existingEmails.add(email)
        nextContacts.push({
          id: contactId,
          full_name: contact.full_name || email,
          email,
          notes: '',
          source: 'imported',
        })
      }

      for (const categoryName of contact.categories) {
        const categoryId = categoryMap.get(categoryName.toLowerCase())
        if (!categoryId) continue
        if (!nextLinks.some((link) => link.contact_id === contactId && link.category_id === categoryId)) {
          nextLinks.push({ contact_id: contactId, category_id: categoryId })
        }
      }
    }

    setCategories(nextCategories)
    setContacts(nextContacts)
    setLinks(nextLinks)
    setImportValue('')
    setError(null)
    setTab('people')
  }

  async function saveAll() {
    setSaving(true)
    setError(null)

    try {
      const originalContactIds = new Set((sources.contacts ?? []).map((contact) => contact.id))
      const originalCategoryIds = new Set((sources.categories ?? []).map((category) => category.id))
      const nextContactIds = new Set(contacts.map((contact) => contact.id))
      const nextCategoryIds = new Set(categories.map((category) => category.id))

      const deletedContactIds = Array.from(originalContactIds).filter((id) => !nextContactIds.has(id))
      const deletedCategoryIds = Array.from(originalCategoryIds).filter((id) => !nextCategoryIds.has(id))

      if (deletedContactIds.length > 0) {
        await supabase.from('communication_contacts').delete().in('id', deletedContactIds)
      }
      if (deletedCategoryIds.length > 0) {
        await supabase.from('communication_categories').delete().in('id', deletedCategoryIds)
      }

      const contactRows = contacts.map((contact) => ({
        id: contact.id,
        full_name: contact.full_name?.trim() || contact.email,
        email: normalizeEmail(contact.email),
        notes: contact.notes?.trim() || null,
        source: contact.source ?? 'manual',
        created_by: profile?.id ?? null,
      }))

      const categoryRows = categories.map((category) => ({
        id: category.id,
        name: category.name.trim(),
        color: category.color || '#4C2A92',
        created_by: profile?.id ?? null,
      }))

      if (contactRows.some((contact) => !contact.email)) {
        throw new Error('Every managed contact must have an email address.')
      }
      if (categoryRows.some((category) => !category.name)) {
        throw new Error('Every category must have a name.')
      }

      if (contactRows.length > 0) {
        const { error: contactError } = await supabase.from('communication_contacts').upsert(contactRows)
        if (contactError) throw contactError
      }

      if (categoryRows.length > 0) {
        const { error: categoryError } = await supabase.from('communication_categories').upsert(categoryRows)
        if (categoryError) throw categoryError
      }

      await supabase.from('communication_contact_categories').delete().neq('contact_id', '00000000-0000-0000-0000-000000000000')
      if (links.length > 0) {
        const { error: linksError } = await supabase.from('communication_contact_categories').insert(links)
        if (linksError) throw linksError
      }

      await onRefresh()
      onClose()
    } catch (err) {
      setError(err.message ?? String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(14,14,30,.45)] p-6">
      <div className="max-h-[86vh] w-full max-w-5xl overflow-hidden rounded-[22px] border border-[var(--border)] bg-white shadow-[0_24px_64px_rgba(14,14,30,.22)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <div className="text-[16px] font-black text-[var(--text-primary)]">Manage contacts and categories</div>
            <div className="mt-1 text-[12px] text-[var(--text-secondary)]">Custom mail contacts extend the existing OS people data without editing core users or roster rows.</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-[var(--text-secondary)]">
            Close
          </button>
        </div>

        <div className="flex gap-1 border-b border-[var(--border)] px-6 pt-4">
          {[
            ['people', 'People'],
            ['categories', 'Categories'],
            ['import', 'Import'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="rounded-t-xl px-4 py-2 text-[12.5px] font-semibold"
              style={{
                background: tab === key ? '#fff' : 'var(--surface-secondary)',
                color: tab === key ? 'var(--accent)' : 'var(--text-secondary)',
                border: `1px solid var(--border)`,
                borderBottomColor: tab === key ? '#fff' : 'var(--border)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-[62vh] overflow-y-auto px-6 py-5">
          {error ? (
            <div className="mb-4 rounded-2xl border border-[#F5C4B8] bg-[#FEF0ED] px-4 py-3 text-[12.5px] text-[#C94830]">
              {error}
            </div>
          ) : null}

          {tab === 'people' ? (
            <div className="space-y-3">
              {contacts.map((contact) => {
                const activeCategoryIds = links
                  .filter((link) => link.contact_id === contact.id)
                  .map((link) => link.category_id)

                return (
                  <div key={contact.id} className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4 lg:grid-cols-[1.1fr_1fr_1.4fr_auto]">
                    <TextInput
                      value={contact.full_name ?? ''}
                      onChange={(event) => setContacts((current) => current.map((item) => item.id === contact.id ? { ...item, full_name: event.target.value } : item))}
                      placeholder="Full name"
                    />
                    <TextInput
                      type="email"
                      value={contact.email ?? ''}
                      onChange={(event) => setContacts((current) => current.map((item) => item.id === contact.id ? { ...item, email: event.target.value } : item))}
                      placeholder="Email"
                    />
                    <div className="flex flex-wrap gap-2">
                      {categories.map((category) => (
                        <RecipientChip
                          key={category.id}
                          label={category.name}
                          active={activeCategoryIds.includes(category.id)}
                          tone="gold"
                          onClick={() => toggleLink(contact.id, category.id)}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setContacts((current) => current.filter((item) => item.id !== contact.id))}
                      className="rounded-xl border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-[#C94830]"
                    >
                      Remove
                    </button>
                  </div>
                )
              })}

              <button
                type="button"
                onClick={() => setContacts((current) => [...current, { id: crypto.randomUUID(), full_name: '', email: '', notes: '', source: 'manual' }])}
                className="rounded-xl border border-dashed border-[var(--accent)] px-4 py-3 text-[12.5px] font-semibold text-[var(--accent)]"
              >
                Add contact
              </button>
            </div>
          ) : null}

          {tab === 'categories' ? (
            <div className="space-y-3">
              {categories.map((category, index) => (
                <div key={category.id} className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4 lg:grid-cols-[1fr_auto_auto]">
                  <TextInput
                    value={category.name}
                    onChange={(event) => setCategories((current) => current.map((item) => item.id === category.id ? { ...item, name: event.target.value } : item))}
                    placeholder="Category name"
                  />
                  <input
                    type="color"
                    value={category.color ?? COLORS[index % COLORS.length]}
                    onChange={(event) => setCategories((current) => current.map((item) => item.id === category.id ? { ...item, color: event.target.value } : item))}
                    className="h-11 w-16 rounded-xl border border-[var(--border)] bg-white p-1"
                  />
                  <button
                    type="button"
                    onClick={() => removeCategory(category.id)}
                    className="rounded-xl border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-[#C94830]"
                  >
                    Remove
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setCategories((current) => [...current, { id: crypto.randomUUID(), name: '', color: COLORS[current.length % COLORS.length] }])}
                className="rounded-xl border border-dashed border-[var(--accent)] px-4 py-3 text-[12.5px] font-semibold text-[var(--accent)]"
              >
                Add category
              </button>
            </div>
          ) : null}

          {tab === 'import' ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-secondary)] p-5 text-[12.5px] text-[var(--text-secondary)]">
                Paste CSV lines like `name,email,category` or raw email lists. Multiple categories can be separated with `|`.
              </div>
              <TextArea rows={12} value={importValue} onChange={(event) => setImportValue(event.target.value)} placeholder="Jane Smith,jane@example.com,First Timers&#10;leaders@example.com" />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={mergeImport}
                  className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-[12.5px] font-bold text-white"
                >
                  Merge import into manager
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4">
          <div className="text-[12px] text-[var(--text-tertiary)]">
            {contacts.length} contacts · {categories.length} categories
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--text-secondary)]">
              Cancel
            </button>
            <button
              type="button"
              onClick={saveAll}
              disabled={saving}
              className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-[12.5px] font-bold text-white disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function buildPreviewDocument({ subject, previewText, bodyHtml, context, recipient }) {
  const safeHtml = sanitizeEmailHtml(fillTemplateTags(bodyHtml || '', recipient, context))
  const safeSubject = fillTemplateTags(subject || '', recipient, context)
  const safePreview = fillTemplateTags(previewText || '', recipient, context)

  return {
    subject: safeSubject,
    previewText: safePreview,
    html: `
      <div style="font-family:Arial,sans-serif;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #EDE8DC;">
        <div style="padding:24px 24px 16px;border-bottom:1px solid #EDE8DC;">
          <div style="font-size:20px;font-weight:700;color:#4C2A92;">BLW Canada</div>
          <div style="margin-top:4px;font-size:12px;color:#9E9488;">Sent via BLW Canada OS</div>
        </div>
        <div style="padding:24px;color:#2D2A22;font-size:14px;line-height:1.7;">
          ${safeHtml || `<p style="color:#9E9488;">${escapeHtml('Start writing your email body...')}</p>`}
        </div>
        <div style="padding:16px 24px;border-top:1px solid #EDE8DC;font-size:11px;color:#9E9488;text-align:center;">
          BLW Canada · <a href="#" style="color:#9E9488;text-decoration:underline;">Unsubscribe</a>
        </div>
      </div>
    `,
  }
}

export default function EmailComposerPage() {
  const navigate = useNavigate()
  const { campaignId } = useParams()
  const { profile } = useAuth()
  const editorRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [htmlMode, setHtmlMode] = useState(false)
  const [previewDevice, setPreviewDevice] = useState('desktop')
  const [status, setStatus] = useState('draft')
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [bodyHtml, setBodyHtml] = useState('<p></p>')
  const [replyTo, setReplyTo] = useState('')
  const [fromName, setFromName] = useState('BLW Canada')
  const [testEmail, setTestEmail] = useState('')
  const [scheduleMode, setScheduleMode] = useState('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [selectedSegmentId, setSelectedSegmentId] = useState('')
  const [recipientPills, setRecipientPills] = useState([])
  const [segments, setSegments] = useState([])
  const [sources, setSources] = useState(buildCommunicationRecipientData())
  const [peopleSearch, setPeopleSearch] = useState('')
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [managerOpen, setManagerOpen] = useState(false)
  const [runABTest, setRunABTest] = useState(false)
  const [subjectA, setSubjectA] = useState('')
  const [subjectB, setSubjectB] = useState('')
  const [splitPercent, setSplitPercent] = useState(50)
  const [testDurationHours, setTestDurationHours] = useState(24)

  async function refreshSources() {
    const nextSources = await loadCommunicationSources(supabase)
    setSources(nextSources)
    return nextSources
  }

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)

      const [nextSources, segmentsRes] = await Promise.all([
        refreshSources(),
        supabase.from('communication_segments').select('id, name, filters, estimated_count').order('name'),
      ])

      if (!active) return
      setSegments(segmentsRes.data ?? [])

      if (campaignId) {
        const { data } = await supabase
          .from('communication_campaigns')
          .select('id, name, subject, preview_text, body_html, body_text, body, recipient_filters, status, scheduled_at, segment_id, from_name, reply_to_email')
          .eq('id', campaignId)
          .single()

        if (data && active) {
          setName(data.name ?? '')
          setSubject(data.subject ?? '')
          setPreviewText(data.preview_text ?? '')
          setBodyHtml(data.body_html ?? data.body ?? '<p></p>')
          setStatus(data.status ?? 'draft')
          setScheduledAt(data.scheduled_at ? new Date(data.scheduled_at).toISOString().slice(0, 16) : '')
          setScheduleMode(data.status === 'scheduled' ? 'later' : 'now')
          setSelectedSegmentId(data.segment_id ?? '')
          setFromName(data.from_name ?? 'BLW Canada')
          setReplyTo(data.reply_to_email ?? profile?.email ?? '')

          if (Array.isArray(data.recipient_filters) && data.recipient_filters.length > 0) {
            setRecipientPills(data.recipient_filters)
          } else if (data.segment_id) {
            const segment = (segmentsRes.data ?? []).find((item) => item.id === data.segment_id)
            setRecipientPills(segment ? segmentFiltersToRecipientPills(segment.filters ?? {}, nextSources) : [])
          }
        }
      } else {
        setReplyTo(profile?.email ?? '')
      }

      if (active) setLoading(false)
    }

    load()
    return () => { active = false }
  }, [campaignId, profile?.email])

  useEffect(() => {
    if (!htmlMode && editorRef.current && editorRef.current.innerHTML !== bodyHtml) {
      editorRef.current.innerHTML = bodyHtml
    }
  }, [bodyHtml, htmlMode])

  const groupOptions = useMemo(() => {
    const deptChips = (sources.depts ?? []).map((dept) => ({
      id: `department:${dept.id}`,
      type: 'department',
      deptId: dept.id,
      label: dept.name,
    }))

    const subgroupChips = Object.keys(sources.subgroupMembers ?? {}).sort().map((subgroup) => ({
      id: `subgroup:${subgroup}`,
      type: 'subgroup',
      subgroup,
      label: subgroup,
    }))

    const roleChips = COMMUNICATION_ROLES.map((role) => ({
      id: `category:role:${role}`,
      type: 'category',
      category: `role:${role}`,
      label: titleize(role),
      tone: 'default',
    }))

    const leadershipChips = Object.keys(sources.categoryMembers ?? {})
      .filter((key) => key.startsWith('leadership:'))
      .sort()
      .map((key) => ({
        id: `category:${key}`,
        type: 'category',
        category: key,
        label: key.slice(11),
        tone: 'gold',
      }))

    const customChips = (sources.categories ?? []).map((category) => ({
      id: `category:contact:${category.id}`,
      type: 'category',
      category: `contact:${category.id}`,
      label: category.name,
      tone: 'gold',
    }))

    return {
      deptChips,
      subgroupChips,
      roleChips,
      leadershipChips,
      customChips,
    }
  }, [sources])

  const peopleOptions = useMemo(() => {
    const merged = new Map()
    for (const user of sources.users ?? []) {
      if (!user.email) continue
      merged.set(normalizeEmail(user.email), {
        id: `individual:${normalizeEmail(user.email)}`,
        type: 'individual',
        name: user.name ?? user.email,
        email: user.email,
      })
    }
    for (const person of sources.rosterWithEmail ?? []) {
      if (!person.email) continue
      merged.set(normalizeEmail(person.email), {
        id: `individual:${normalizeEmail(person.email)}`,
        type: 'individual',
        name: person.full_name ?? person.email,
        email: person.email,
      })
    }
    for (const contact of sources.contactsWithEmail ?? []) {
      if (!contact.email) continue
      merged.set(normalizeEmail(contact.email), {
        id: `individual:${normalizeEmail(contact.email)}`,
        type: 'individual',
        name: contact.full_name ?? contact.email,
        email: contact.email,
      })
    }

    const query = peopleSearch.trim().toLowerCase()
    return Array.from(merged.values())
      .filter((person) => {
        if (!query) return true
        return person.name.toLowerCase().includes(query) || person.email.toLowerCase().includes(query)
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [peopleSearch, sources])

  const resolvedRecipients = useMemo(
    () => resolveRecipientPills(recipientPills, sources),
    [recipientPills, sources],
  )

  const previewRecipient = resolvedRecipients[0] ?? {
    name: 'Jane Smith',
    email: 'jane@example.com',
    subgroup: 'Central East',
    leadership_category: 'Cell Leader',
  }

  const previewDocument = useMemo(
    () => buildPreviewDocument({
      subject,
      previewText,
      bodyHtml,
      context: {
        sender_name: fromName || 'BLW Canada',
        org_name: 'BLW Canada',
        unsubscribe_link: '#',
      },
      recipient: previewRecipient,
    }),
    [bodyHtml, fromName, previewRecipient, previewText, subject],
  )

  function updateRecipients(nextPills) {
    setRecipientPills(nextPills)
  }

  function togglePill(option) {
    const key = getRecipientPillKey(option)
    const exists = recipientPills.some((pill) => getRecipientPillKey(pill) === key)

    if (exists) {
      updateRecipients(recipientPills.filter((pill) => getRecipientPillKey(pill) !== key))
      return
    }

    updateRecipients(addUniqueRecipientPills(recipientPills, [option]))
  }

  function replaceSegment(segmentId) {
    setSelectedSegmentId(segmentId)
    const segment = segments.find((item) => item.id === segmentId)
    if (!segment) return

    const preserved = recipientPills.filter((pill) => ['individual', 'csv_import'].includes(pill.type))
    const nextSegmentPills = segmentFiltersToRecipientPills(segment.filters ?? {}, sources)
    updateRecipients(addUniqueRecipientPills(preserved, nextSegmentPills))
  }

  function syncEditorHtml(nextHtml) {
    setBodyHtml(sanitizeEmailHtml(nextHtml))
  }

  function execEditor(command, value = null) {
    if (!editorRef.current) return
    editorRef.current.focus()
    document.execCommand(command, false, value)
    syncEditorHtml(editorRef.current.innerHTML)
  }

  function insertHtml(html) {
    execEditor('insertHTML', html)
  }

  function insertToken(token) {
    if (!editorRef.current) return
    editorRef.current.focus()
    document.execCommand('insertText', false, token)
    syncEditorHtml(editorRef.current.innerHTML)
  }

  function buildCampaignPayload(nextStatus) {
    const cleanHtml = sanitizeEmailHtml(bodyHtml)
    const cleanText = stripHtmlToText(cleanHtml)

    return {
      name: name.trim() || (subject.trim() ? subject.trim() : 'Untitled campaign'),
      subject: subject.trim(),
      preview_text: previewText.trim() || null,
      body_html: cleanHtml,
      body_text: cleanText,
      body: cleanText,
      recipient_filters: recipientPills,
      status: nextStatus,
      segment_id: selectedSegmentId || null,
      scheduled_at: nextStatus === 'scheduled' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      from_name: fromName.trim() || 'BLW Canada',
      reply_to_email: replyTo.trim() || null,
      created_by: profile?.id ?? null,
      recipient_count: resolvedRecipients.length,
    }
  }

  async function upsertCampaign(nextStatus) {
    const payload = buildCampaignPayload(nextStatus)
    if (!payload.subject || !payload.body_html || resolvedRecipients.length === 0) {
      throw new Error('Subject, body, and at least one recipient are required.')
    }

    if (campaignId) {
      const { error: updateError } = await supabase.from('communication_campaigns').update(payload).eq('id', campaignId)
      if (updateError) throw updateError
      return campaignId
    }

    const { data, error: insertError } = await supabase
      .from('communication_campaigns')
      .insert(payload)
      .select('id')
      .single()

    if (insertError) throw insertError
    return data.id
  }

  async function handleSaveDraft() {
    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      const payload = buildCampaignPayload('draft')
      if (!payload.subject || !payload.body_html) {
        throw new Error('Subject and body are required before saving a draft.')
      }

      let savedId = campaignId
      if (campaignId) {
        const { error: updateError } = await supabase.from('communication_campaigns').update(payload).eq('id', campaignId)
        if (updateError) throw updateError
      } else {
        const { data, error: insertError } = await supabase.from('communication_campaigns').insert(payload).select('id').single()
        if (insertError) throw insertError
        savedId = data.id
      }

      setStatus('draft')
      setMessage('Draft saved.')
      if (!campaignId && savedId) navigate(`/communications/campaigns/${savedId}/edit`, { replace: true })
    } catch (err) {
      setError(err.message ?? String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleSendOrSchedule() {
    setSending(true)
    setError(null)
    setMessage(null)

    try {
      if (runABTest && (!subjectA.trim() || !subjectB.trim())) {
        throw new Error('Both subject variants are required for A/B testing.')
      }

      const nextStatus = scheduleMode === 'later' ? 'scheduled' : 'sending'
      const savedCampaignId = await upsertCampaign(nextStatus)

      // If A/B test is enabled, create the test record
      if (runABTest) {
        const { error: abError } = await supabase.from('communication_ab_tests').insert({
          campaign_id: savedCampaignId,
          subject_a: subjectA.trim(),
          subject_b: subjectB.trim(),
          split_percent: splitPercent,
          test_duration_hours: testDurationHours,
          metric: 'opens',
        })
        if (abError) throw abError
      }

      if (scheduleMode === 'later') {
        setStatus('scheduled')
        setMessage('Campaign scheduled. Existing scheduled-send infrastructure will deliver it when the backend cron job runs.')
        if (!campaignId) navigate(`/communications/campaigns/${savedCampaignId}/edit`, { replace: true })
        return
      }

      const { data, error: invokeError } = await supabase.functions.invoke('send-communication-email', {
        body: {
          campaign_id: savedCampaignId,
          context: { sender_name: fromName.trim() || 'BLW Canada' },
        },
      })

      if (invokeError || data?.failed > 0) {
        throw new Error(invokeError?.message ?? `${data?.failed ?? 1} email(s) failed to send.`)
      }

      setStatus('sent')
      setMessage(`Campaign sent to ${data.sent} recipient(s).`)
      if (!campaignId) navigate(`/communications/campaigns/${savedCampaignId}/edit`, { replace: true })
    } catch (err) {
      setError(err.message ?? String(err))
    } finally {
      setSending(false)
    }
  }

  async function handleSendTest() {
    setSendingTest(true)
    setError(null)
    setMessage(null)

    try {
      if (!testEmail.trim()) throw new Error('Enter a test email address.')
      if (!subject.trim()) throw new Error('Add a subject before sending a test.')

      const { error: invokeError } = await supabase.functions.invoke('send-communication-email', {
        body: {
          test_email: testEmail.trim(),
          subject: `[TEST] ${subject.trim()}`,
          body_html: sanitizeEmailHtml(bodyHtml),
          body_text: stripHtmlToText(bodyHtml),
          preview_text: previewText,
          reply_to: replyTo.trim() || undefined,
          context: { sender_name: fromName.trim() || 'BLW Canada' },
        },
      })

      if (invokeError) throw invokeError
      setMessage(`Test email sent to ${testEmail.trim()}.`)
    } catch (err) {
      setError(err.message ?? String(err))
    } finally {
      setSendingTest(false)
    }
  }

  if (loading) {
    return <div className="h-[70vh] animate-pulse rounded-[24px] bg-[var(--surface-secondary)]" />
  }

  const deviceWidth = previewDevice === 'mobile' ? '370px' : '100%'

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[12.5px] text-[var(--text-secondary)]">
            <Link to="/communications" className="inline-flex items-center gap-1 text-[var(--text-secondary)]">
              <ChevronLeft size={14} />
              Communications
            </Link>
            <span>/</span>
            <span>Composer</span>
          </div>
          <h1 className="text-[21px] font-black leading-tight text-[var(--text-primary)]">
            {campaignId ? 'Edit Campaign' : 'New Campaign'}
          </h1>
          <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">
            Build BLW emails inside the OS shell with live recipient resolution, HTML editing, and native campaign persistence.
          </p>
        </div>
      </section>

      {message ? (
        <div className="rounded-2xl border border-[#CAE7D6] bg-[#EEF6F1] px-4 py-3 text-[12.5px] text-[#1B5E3C]">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-[#F5C4B8] bg-[#FEF0ED] px-4 py-3 text-[12.5px] text-[#C94830]">
          {error}
        </div>
      ) : null}

      <div className={`${cardStyle()} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-3">
            <StatusBadge status={status} />
            <TextInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Campaign name"
              className="min-w-[260px] bg-white"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={handleSaveDraft} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--text-secondary)] disabled:opacity-60">
              <Save size={14} />
              {saving ? 'Saving...' : 'Save draft'}
            </button>
            <button type="button" onClick={handleSendOrSchedule} disabled={sending} className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-[12.5px] font-bold text-white disabled:opacity-60">
              <Send size={14} />
              {sending ? 'Working...' : scheduleMode === 'later' ? 'Schedule campaign' : 'Send campaign'}
            </button>
          </div>
        </div>

        <div className="grid min-h-[72vh] gap-0 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
          <aside className="border-r border-[var(--border)] bg-[var(--surface-secondary)]">
            <Section
              title="Audience"
              action={
                <button type="button" onClick={() => setManagerOpen(true)} className="text-[11px] font-semibold text-[var(--accent)]">
                  Manage
                </button>
              }
            >
              <Field label="Saved segment">
                <select
                  value={selectedSegmentId}
                  onChange={(event) => replaceSegment(event.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none"
                >
                  <option value="">No saved segment</option>
                  {segments.map((segment) => (
                    <option key={segment.id} value={segment.id}>
                      {segment.name} (~{segment.estimated_count ?? 0})
                    </option>
                  ))}
                </select>
              </Field>

              <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-3">
                <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--text-primary)]">
                  <Users size={14} />
                  {resolvedRecipients.length} recipients
                </div>
                <button type="button" onClick={() => setRecipientPills([])} className="text-[11px] font-semibold text-[var(--text-secondary)]">
                  Clear all
                </button>
              </div>

              {recipientPills.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {recipientPills.map((pill) => (
                    <SelectedPill
                      key={getRecipientPillKey(pill)}
                      pill={pill}
                      onRemove={(nextPill) => setRecipientPills((current) => current.filter((item) => getRecipientPillKey(item) !== getRecipientPillKey(nextPill)))}
                    />
                  ))}
                </div>
              ) : null}
            </Section>

            <Section title="Groups">
              <div className="flex flex-wrap gap-2">
                <RecipientChip
                  label="Everyone on roster"
                  active={recipientPills.some((pill) => pill.type === 'all_roster')}
                  onClick={() => togglePill({ id: 'all_roster', type: 'all_roster', label: 'Everyone on roster with email' })}
                />
                {groupOptions.deptChips.map((chip) => (
                  <RecipientChip key={chip.id} label={chip.label} active={recipientPills.some((pill) => getRecipientPillKey(pill) === chip.id)} onClick={() => togglePill(chip)} />
                ))}
              </div>
            </Section>

            <Section title="Subgroups">
              <div className="flex flex-wrap gap-2">
                {groupOptions.subgroupChips.map((chip) => (
                  <RecipientChip key={chip.id} label={chip.label} active={recipientPills.some((pill) => getRecipientPillKey(pill) === chip.id)} onClick={() => togglePill(chip)} />
                ))}
              </div>
            </Section>

            <Section title="Categories">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {groupOptions.roleChips.map((chip) => (
                    <RecipientChip key={chip.id} label={chip.label} active={recipientPills.some((pill) => getRecipientPillKey(pill) === chip.id)} onClick={() => togglePill(chip)} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {groupOptions.leadershipChips.map((chip) => (
                    <RecipientChip key={chip.id} label={chip.label} tone="gold" active={recipientPills.some((pill) => getRecipientPillKey(pill) === chip.id)} onClick={() => togglePill(chip)} />
                  ))}
                  {groupOptions.customChips.map((chip) => (
                    <RecipientChip key={chip.id} label={chip.label} tone="gold" active={recipientPills.some((pill) => getRecipientPillKey(pill) === chip.id)} onClick={() => togglePill(chip)} />
                  ))}
                </div>
              </div>
            </Section>

            <Section title="Individuals">
              <div className="space-y-3">
                <TextInput value={peopleSearch} onChange={(event) => setPeopleSearch(event.target.value)} placeholder="Search people by name or email" />
                <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-secondary)]">
                  <button
                    type="button"
                    onClick={() => setRecipientPills((current) => addUniqueRecipientPills(current, peopleOptions))}
                  >
                    Select all visible
                  </button>
                  <span>{peopleOptions.length} visible</span>
                </div>
                <div className="max-h-[220px] space-y-2 overflow-y-auto rounded-2xl border border-[var(--border)] bg-white p-2">
                  {peopleOptions.map((person) => {
                    const active = recipientPills.some((pill) => getRecipientPillKey(pill) === person.id)
                    return (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => togglePill(person)}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-[var(--surface-secondary)]"
                        style={{ background: active ? 'var(--accent-light)' : 'transparent' }}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[12.5px] font-semibold text-[var(--text-primary)]">{person.name}</div>
                          <div className="truncate text-[11px] text-[var(--text-secondary)]">{person.email}</div>
                        </div>
                        <span className="text-[11px] font-bold text-[var(--accent)]">{active ? 'Added' : 'Add'}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </Section>

            <Section title="Campaign Settings">
              <Field label="From name">
                <TextInput value={fromName} onChange={(event) => setFromName(event.target.value)} placeholder="BLW Canada" />
              </Field>
              <Field label="Reply-to email">
                <TextInput type="email" value={replyTo} onChange={(event) => setReplyTo(event.target.value)} placeholder="name@blwcanada.ca" />
              </Field>
            </Section>

            <Section title="Schedule">
              <div className="space-y-3 text-[12.5px] text-[var(--text-primary)]">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={scheduleMode === 'now'} onChange={() => setScheduleMode('now')} />
                  Send now
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={scheduleMode === 'later'} onChange={() => setScheduleMode('later')} />
                  Schedule for later
                </label>
                {scheduleMode === 'later' ? (
                  <TextInput type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
                ) : null}
              </div>
            </Section>

            <Section title="A/B Testing">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={runABTest} onChange={(event) => setRunABTest(event.target.checked)} />
                <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">Run A/B test for this campaign</span>
              </label>
              {runABTest ? (
                <div className="mt-4 space-y-3">
                  <Field label="Subject line A">
                    <TextInput value={subjectA} onChange={(event) => setSubjectA(event.target.value)} placeholder="e.g., Weekly Update" />
                  </Field>
                  <Field label="Subject line B">
                    <TextInput value={subjectB} onChange={(event) => setSubjectB(event.target.value)} placeholder="e.g., Don't miss this week's update" />
                  </Field>
                  <div className="flex gap-3">
                    <Field label="Split %">
                      <TextInput type="number" value={splitPercent} onChange={(event) => setSplitPercent(Math.max(5, Math.min(50, parseInt(event.target.value) || 5)))} min="5" max="50" />
                      <span className="block text-[11px] text-[var(--text-tertiary)]">{100 - splitPercent}% get variant A, {splitPercent}% get variant B</span>
                    </Field>
                    <Field label="Test duration (hours)">
                      <TextInput type="number" value={testDurationHours} onChange={(event) => setTestDurationHours(Math.max(1, parseInt(event.target.value) || 1))} min="1" />
                    </Field>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', padding: '8px 12px', background: 'var(--surface-secondary)', borderRadius: '8px' }}>
                    After {testDurationHours} hour(s), the system will calculate open rates for each variant and show a winner in the analytics dashboard.
                  </div>
                </div>
              ) : null}
            </Section>

            <Section title="Send Test">
              <Field label="Test inbox">
                <TextInput type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="test@example.com" />
              </Field>
              <button type="button" onClick={handleSendTest} disabled={sendingTest} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-[12.5px] font-semibold text-[var(--accent)] disabled:opacity-60">
                <Eye size={14} />
                {sendingTest ? 'Sending...' : 'Send test email'}
              </button>
            </Section>
          </aside>

          <section className="flex min-w-0 flex-col border-r border-[var(--border)] bg-white">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <Field label="Subject line">
                <TextInput value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject line" className="bg-white" />
              </Field>
              <div className="mt-3">
                <Field label="Inbox preview text">
                  <TextInput value={previewText} onChange={(event) => setPreviewText(event.target.value)} placeholder="Preview text shown beside the subject in inboxes" className="bg-white" />
                </Field>
              </div>
            </div>

            <div className="flex items-center gap-1 border-b border-[var(--border)] px-3 py-2">
              <ToolbarButton icon={Bold} label="Bold" onClick={() => execEditor('bold')} />
              <ToolbarButton icon={Italic} label="Italic" onClick={() => execEditor('italic')} />
              <ToolbarButton icon={Underline} label="Underline" onClick={() => execEditor('underline')} />
              <ToolbarButton icon={List} label="Bullet list" onClick={() => execEditor('insertUnorderedList')} />
              <ToolbarButton icon={ListOrdered} label="Numbered list" onClick={() => execEditor('insertOrderedList')} />
              <ToolbarButton icon={AlignLeft} label="Align left" onClick={() => execEditor('justifyLeft')} />
              <ToolbarButton icon={AlignCenter} label="Align center" onClick={() => execEditor('justifyCenter')} />
              <ToolbarButton icon={AlignRight} label="Align right" onClick={() => execEditor('justifyRight')} />
              <ToolbarButton
                icon={LinkIcon}
                label="Link"
                onClick={() => {
                  const url = window.prompt('Enter URL')
                  if (url) execEditor('createLink', url)
                }}
              />
              <ToolbarButton
                icon={Image}
                label="Image"
                onClick={() => {
                  const url = window.prompt('Enter image URL')
                  if (url) insertHtml(`<img src="${escapeHtml(url)}" alt="" style="max-width:100%;border-radius:12px;" />`)
                }}
              />
              <div className="h-5 w-px bg-[var(--border)]" />
              <TokenMenu onInsert={insertToken} />
              <div className="h-5 w-px bg-[var(--border)]" />
              <ToolbarButton icon={Tag} label="Divider" onClick={() => insertHtml('<hr />')} />
              <ToolbarButton
                icon={CalendarClock}
                label="Button"
                onClick={() => insertHtml('<p><a href="#" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#4C2A92;color:#ffffff;text-decoration:none;font-weight:700;">Call to action</a></p>')}
              />
              <div className="ml-auto flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-1">
                <button type="button" onClick={() => setHtmlMode(false)} className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${!htmlMode ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)]'}`}>
                  Rich
                </button>
                <button type="button" onClick={() => setHtmlMode(true)} className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${htmlMode ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)]'}`}>
                  <span className="inline-flex items-center gap-1"><Code2 size={12} /> HTML</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {htmlMode ? (
                <TextArea
                  rows={20}
                  value={bodyHtml}
                  onChange={(event) => syncEditorHtml(event.target.value)}
                  className="min-h-[58vh] bg-white font-mono text-[12px]"
                />
              ) : (
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(event) => syncEditorHtml(event.currentTarget.innerHTML)}
                  className="min-h-[58vh] rounded-[18px] border border-[var(--border)] bg-white px-5 py-5 text-[14px] leading-7 text-[var(--text-primary)] outline-none"
                  style={{ whiteSpace: 'normal' }}
                />
              )}
            </div>
          </section>

          <aside className="flex min-w-0 flex-col bg-[var(--surface-secondary)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[.08em] text-[var(--text-tertiary)]">Live Preview</div>
                <div className="mt-1 text-[12.5px] text-[var(--text-secondary)]">Updates while you type.</div>
              </div>
              <div className="flex rounded-xl border border-[var(--border)] bg-white p-1">
                <button type="button" onClick={() => setPreviewDevice('desktop')} className={`flex h-8 w-8 items-center justify-center rounded-lg ${previewDevice === 'desktop' ? 'bg-[var(--accent-light)] text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
                  <Monitor size={15} />
                </button>
                <button type="button" onClick={() => setPreviewDevice('mobile')} className={`flex h-8 w-8 items-center justify-center rounded-lg ${previewDevice === 'mobile' ? 'bg-[var(--accent-light)] text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
                  <Smartphone size={15} />
                </button>
              </div>
            </div>

            <div className="border-b border-[var(--border)] bg-white px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-tertiary)]">Inbox</div>
              <div className="mt-1 text-[13px] font-bold text-[var(--text-primary)]">{previewDocument.subject || '(no subject yet)'}</div>
              <div className="mt-1 text-[11.5px] text-[var(--text-secondary)]">{previewDocument.previewText || 'Preview text will appear here.'}</div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="mx-auto transition-all" style={{ width: deviceWidth, maxWidth: '100%' }}>
                <div className={`${cardStyle()} overflow-hidden`}>
                  <div className="bg-white p-4">
                    {/* eslint-disable-next-line react/no-danger */}
                    <div dangerouslySetInnerHTML={{ __html: previewDocument.html }} />
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <ContactManagerModal
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        sources={sources}
        onRefresh={refreshSources}
        profile={profile}
      />
    </div>
  )
}
