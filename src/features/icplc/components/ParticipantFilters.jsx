import React, { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Search, Tag as TagIcon, SlidersHorizontal } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useICPLC } from '../ICPLCContext.jsx'
import { SUBGROUP_OPTIONS } from '../lib/subgroups.js'
import { UNTAGGED } from '../lib/participantFilters.js'
import { ATTENTION_CATEGORIES } from '../lib/documentationRules.js'

const WORKING_LIST_VIEW_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'registered', label: 'Registered' },
  { value: 'not_registered', label: 'Not Registered' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'needs_attention', label: 'Needs Attention' },
]

// Order = order in the popover. `field` is the key in the shared filters object; `labels` overrides the default
// wording per option. Passport / Canadian-document filters are readiness indicators only (ICPLC does not renew
// those documents); the visa filters are the active assistance workflow.
const GROUPS = [
  { field: 'participation_status', label: 'Participation', options: ['tracking', 'likely', 'confirmed', 'uncertain', 'not_attending'] },
  { field: 'readiness', label: 'Readiness', options: ['unknown', 'waiting_itinerary', 'in_progress', 'action_required', 'blocked', 'ready'] },
  {
    field: 'attention_state', label: 'Attention',
    options: ['registration_missing', 'confirmed_registration_missing', 'confirmed_needs_attention', 'docs_incomplete', 'docs_review_acknowledged'],
    labels: {
      registration_missing: 'Registration missing',
      confirmed_registration_missing: 'Confirmed + registration missing',
      confirmed_needs_attention: 'Confirmed + needs attention',
      docs_incomplete: 'Documentation information incomplete',
      docs_review_acknowledged: 'Documentation review acknowledged',
    },
  },
  { field: 'documentation', label: 'Documentation', options: ['action_required', 'canadian_docs_review'], labels: { action_required: 'Action required', canadian_docs_review: 'Canadian documents require review' } },
  { field: 'time_risk', label: 'Target dates', options: ['due_soon', 'overdue'], labels: { due_soon: 'Due soon', overdue: 'Overdue' } },
  { field: 'flight_status', label: 'Flights', options: ['booked', 'awaiting', 'missing', 'not_required'], labels: { not_required: 'Not required' } },
  {
    field: 'passport_readiness', label: 'Passport', options: ['ready', 'renewal_in_progress', 'no_passport', 'renewal_needed', 'unsure', 'issue', 'unknown'],
    labels: { ready: 'Valid', renewal_in_progress: 'In progress', no_passport: 'No valid passport', renewal_needed: 'Renewal needed', unknown: 'Unknown' },
  },
  { field: 'passport_region', label: 'Passport region', options: ['ECOWAS', 'NON_ECOWAS'], labels: { ECOWAS: 'ECOWAS', NON_ECOWAS: 'Non-ECOWAS' } },
  { field: 'visa_requirement', label: 'Visa requirement', options: ['review', 'required', 'not_required'] },
  {
    field: 'visa_process_status', label: 'Visa process', options: ['not_started', 'in_progress', 'submitted', 'processing', 'approved', 'issue', 'not_applicable'],
    labels: { approved: 'Approved', issue: 'Issue', not_applicable: 'Not applicable' },
  },
  { field: 'assistance', label: 'Assistance', options: ['requested'], labels: { requested: 'Visa assistance requested' } },
]
const LABEL_OVERRIDES = { review: 'Needs review', waiting_itinerary: 'Waiting on itinerary' }
const labelOf = (v, group) => group?.labels?.[v] || LABEL_OVERRIDES[v] || (v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' '))

const FILTER_FIELDS = [...GROUPS.map((g) => g.field), 'tags', 'attention']
const TAG_SEARCH_THRESHOLD = 8

const sectionTitle = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

export default function ParticipantFilters({ resultCount, attentionCounts }) {
  const { config, filters, setFilters } = useICPLC()
  const [open, setOpen] = useState(false)
  const [tagQuery, setTagQuery] = useState('')
  const [attnMenu, setAttnMenu] = useState(null) // { top, left } while the Needs Attention menu is open

  // Subgroups from the DB so we can render "turn off" chips
  const { data: availableSubgroups = [] } = useQuery({
    queryKey: ['icplc_subgroups', config?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('icplc_participants')
        .select('subgroup')
        .eq('event_id', config.id)
        .not('subgroup', 'is', null)
      if (error) throw error
      return [...new Set([...SUBGROUP_OPTIONS, ...(data || []).map(r => r.subgroup).filter(Boolean)])].sort()
    },
    enabled: !!config?.id,
    staleTime: 5 * 60_000,
    placeholderData: SUBGROUP_OPTIONS,
  })

  // Same query key + shape as Settings / the Overview tag picker so the cache is shared.
  const { data: allTags = [] } = useQuery({
    queryKey: ['icplc_tags', config?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('icplc_tags')
        .select('*')
        .or(`event_id.eq.${config.id},event_id.is.null`)
        .order('sort_order')
      if (error) throw error
      return data || []
    },
    enabled: !!config?.id,
    staleTime: 5 * 60_000,
  })
  const tagColor = useMemo(() => new Map(allTags.map((t) => [t.name, t.color])), [allTags])

  useEffect(() => {
    if (!attnMenu) return
    const onKey = (e) => { if (e.key === 'Escape') setAttnMenu(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [attnMenu])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const toggle = (field, value) => setFilters((prev) => {
    const current = prev[field] || []
    return { ...prev, [field]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] }
  })
  const clearField = (field) => setFilters((prev) => ({ ...prev, [field]: [] }))
  const clearAdvanced = () => setFilters((prev) => ({ ...prev, ...Object.fromEntries(FILTER_FIELDS.map((f) => [f, []])) }))
  const clearAll = () => setFilters((prev) => ({
    ...prev, ...Object.fromEntries(FILTER_FIELDS.map((f) => [f, []])), working_list_view: 'all', subgroup: [],
  }))

  const activeCount = FILTER_FIELDS.reduce((n, f) => n + (filters[f]?.length || 0), 0)
  const excludedSubgroups = filters.subgroup || []
  const view = filters.working_list_view || 'all'
  const hasFilters = activeCount > 0 || excludedSubgroups.length > 0 || view !== 'all'

  const selectedTags = filters.tags || []
  const tagsMode = filters.tags_mode === 'all' ? 'all' : 'any'
  const visibleTags = allTags.filter((t) => t.name.toLowerCase().includes(tagQuery.trim().toLowerCase()))

  // Removable summary chips, so it is obvious what is narrowing the list.
  const activeChips = [
    ...GROUPS.flatMap((g) => (filters[g.field] || []).map((v) => ({ field: g.field, value: v, group: g.label, label: labelOf(v, g) }))),
    ...(filters.attention || []).map((v) => ({ field: 'attention', value: v, group: 'Attention', label: ATTENTION_CATEGORIES.find((c) => c.key === v)?.label || v })),
    ...selectedTags.map((v) => ({ field: 'tags', value: v, group: 'Tag', label: v === UNTAGGED ? 'Untagged' : v, color: tagColor.get(v) })),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {/* Primary chips: Working List View */}
        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 4, flex: '1 1 100%', minWidth: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin', paddingBottom: 4 }}>
          {WORKING_LIST_VIEW_OPTIONS.map((opt) => {
            const chip = (
              <button
                key={opt.value}
                type="button"
                className="icplc-chip"
                aria-pressed={view === opt.value}
                style={{ flexShrink: 0, whiteSpace: 'nowrap', ...(opt.value === 'needs_attention' ? { borderTopRightRadius: 0, borderBottomRightRadius: 0 } : {}) }}
                onClick={() => setFilters((prev) => ({ ...prev, working_list_view: opt.value }))}
              >
                {opt.label}
              </button>
            )
            if (opt.value !== 'needs_attention') return chip
            const picked = (filters.attention || []).length
            return (
              <span key={opt.value} style={{ display: 'inline-flex', flexShrink: 0 }}>
                {chip}
                <button
                  type="button"
                  className="icplc-chip"
                  aria-label="Choose which attention categories to show"
                  aria-haspopup="menu"
                  aria-expanded={!!attnMenu}
                  aria-pressed={picked > 0}
                  style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginLeft: -1, paddingLeft: 8, paddingRight: 8, whiteSpace: 'nowrap' }}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect()
                    setAttnMenu((m) => (m ? null : { top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 300)) }))
                  }}
                >
                  {picked > 0 ? `${picked} ` : ''}&#9662;
                </button>
              </span>
            )
          })}
        </div>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="icplc-btn"
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => setOpen((o) => !o)}
            style={{
              gap: 6,
              borderColor: activeCount ? 'var(--accent)' : undefined,
              color: activeCount ? 'var(--accent)' : undefined,
              fontWeight: activeCount ? 600 : undefined,
            }}
          >
            <SlidersHorizontal size={14} aria-hidden />
            Filters
            {activeCount > 0 && (
              <span style={{ background: 'var(--accent, #5B2D9E)', color: '#fff', borderRadius: 10, fontSize: 11, fontWeight: 700, padding: '1px 7px', lineHeight: '16px' }}>
                {activeCount}
              </span>
            )}
          </button>

          {open && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setOpen(false)} />
              <div
                role="dialog"
                aria-label="Filters"
                style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 11,
                  background: 'var(--surface-1, #fff)', border: '1px solid var(--border)',
                  borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.16)',
                  width: 360, maxWidth: 'calc(100vw - 32px)', maxHeight: 'min(560px, 75vh)',
                  display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>Filters</span>
                  {activeCount > 0 && (
                    <button type="button" onClick={clearAdvanced} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                      Clear all
                    </button>
                  )}
                </div>

                <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Tags first: the most-requested filter */}
                  <section aria-label="Tags">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ ...sectionTitle, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <TagIcon size={12} aria-hidden /> Tags
                        {selectedTags.length > 0 && <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· {selectedTags.length} selected</span>}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        {selectedTags.length > 1 && (
                          <span role="group" aria-label="Tag match mode" style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                            {['any', 'all'].map((m) => (
                              <button
                                key={m}
                                type="button"
                                aria-pressed={tagsMode === m}
                                title={m === 'any' ? 'Has at least one of the selected tags' : 'Has every selected tag'}
                                onClick={() => setFilters((prev) => ({ ...prev, tags_mode: m }))}
                                style={{
                                  border: 'none', cursor: 'pointer', fontSize: 11, padding: '3px 8px',
                                  background: tagsMode === m ? 'var(--accent, #5B2D9E)' : 'transparent',
                                  color: tagsMode === m ? '#fff' : 'var(--text-secondary)',
                                }}
                              >
                                {m === 'any' ? 'Any' : 'All'}
                              </button>
                            ))}
                          </span>
                        )}
                        {selectedTags.length > 0 && <ClearLink onClick={() => clearField('tags')} />}
                      </span>
                    </div>

                    {allTags.length > TAG_SEARCH_THRESHOLD && (
                      <div style={{ position: 'relative', marginBottom: 8 }}>
                        <Search size={13} aria-hidden style={{ position: 'absolute', left: 9, top: 9, color: 'var(--text-secondary)' }} />
                        <input
                          type="search"
                          className="icplc-input"
                          aria-label="Search tags"
                          placeholder="Search tags…"
                          value={tagQuery}
                          onChange={(e) => setTagQuery(e.target.value)}
                          style={{ width: '100%', paddingLeft: 28, boxSizing: 'border-box' }}
                        />
                      </div>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <button
                        type="button"
                        className="icplc-chip"
                        aria-pressed={selectedTags.includes(UNTAGGED)}
                        onClick={() => toggle('tags', UNTAGGED)}
                        style={{ fontStyle: 'italic' }}
                      >
                        Untagged
                      </button>
                      {visibleTags.map((t) => (
                        <TagChip key={t.id} tag={t} active={selectedTags.includes(t.name)} onClick={() => toggle('tags', t.name)} />
                      ))}
                      {allTags.length === 0 && (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No tags yet — create them in Settings.</span>
                      )}
                      {allTags.length > 0 && visibleTags.length === 0 && (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No tags match “{tagQuery}”.</span>
                      )}
                    </div>
                  </section>

                  {GROUPS.map((g) => (
                    <section key={g.field} aria-label={g.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={sectionTitle}>{g.label}</span>
                        {filters[g.field]?.length > 0 && <ClearLink onClick={() => clearField(g.field)} />}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {g.options.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            className="icplc-chip"
                            aria-pressed={!!filters[g.field]?.includes(opt)}
                            onClick={() => toggle(g.field, opt)}
                          >
                            {labelOf(opt, g)}
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>

                <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
                  <button type="button" onClick={() => setOpen(false)} className="icplc-btn icplc-btn-primary" style={{ width: '100%' }}>
                    {typeof resultCount === 'number' ? `Show ${resultCount} participant${resultCount === 1 ? '' : 's'}` : 'Done'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {hasFilters && (
          <button type="button" onClick={clearAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
            Reset
          </button>
        )}
      </div>

      {/* Active filter summary — each chip removes just that filter */}
      {activeChips.length > 0 && (
        <div aria-label="Active filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {activeChips.map((c) => (
            <span
              key={`${c.field}:${c.value}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 4px 3px 10px',
                borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface-2, #f5f3fa)', color: 'var(--text-primary)',
              }}
            >
              {c.color && <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />}
              <span style={{ color: 'var(--text-secondary)' }}>{c.group}:</span> {c.label}
              <button
                type="button"
                aria-label={`Remove filter ${c.group}: ${c.label}`}
                onClick={() => toggle(c.field, c.value)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'inline-flex', padding: 3, borderRadius: '50%', color: 'var(--text-secondary)' }}
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Subgroup visibility — each chip is ON (visible) by default; clicking hides that subgroup */}
      {availableSubgroups.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 4, alignItems: 'center', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin', paddingBottom: 4 }}>
          <span style={{ ...sectionTitle, fontWeight: 600, marginRight: 2, whiteSpace: 'nowrap', flexShrink: 0 }}>Subgroups</span>
          {availableSubgroups.map((sg) => {
            const isOff = excludedSubgroups.includes(sg)
            return (
              <button
                key={sg}
                type="button"
                className="icplc-chip"
                aria-pressed={!isOff}
                title={isOff ? `${sg} — hidden (click to show)` : `${sg} — visible (click to hide)`}
                onClick={() => toggle('subgroup', sg)}
                style={{
                  opacity: isOff ? 0.4 : 1,
                  background: isOff ? 'var(--surface-2, #f3f4f6)' : undefined,
                  color: isOff ? 'var(--text-secondary)' : undefined,
                  border: isOff ? '1px solid var(--border)' : undefined,
                  maxWidth: 260, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {isOff && <span aria-hidden style={{ marginRight: 4 }}>✕</span>}
                {sg}
              </button>
            )
          })}
        </div>
      )}

      {attnMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={() => setAttnMenu(null)} />
          <div
            role="menu"
            aria-label="Needs attention categories"
            style={{
              position: 'fixed', top: attnMenu.top, left: attnMenu.left, zIndex: 61, width: 288, maxHeight: '60vh', overflowY: 'auto',
              background: '#fff', border: '1px solid var(--border, #E5E7EB)', borderRadius: 10, padding: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px 8px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Needs attention because</span>
              {(filters.attention || []).length > 0 && (
                <button type="button" onClick={() => clearField('attention')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--icplc-purple, #4C2A92)' }}>Clear</button>
              )}
            </div>
            {ATTENTION_CATEGORIES.map((c) => {
              const n = attentionCounts?.get(c.key) || 0
              const checked = (filters.attention || []).includes(c.key)
              return (
                <label
                  key={c.key}
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  title={c.description}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px', borderRadius: 6, cursor: n || checked ? 'pointer' : 'default', opacity: n || checked ? 1 : 0.45, fontSize: 13 }}
                >
                  <input type="checkbox" checked={checked} disabled={!n && !checked} onChange={() => toggle('attention', c.key)} />
                  <span style={{ flex: 1 }}>{c.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>{n}</span>
                </label>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function ClearLink({ onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)', textDecoration: 'underline' }}>
      Clear
    </button>
  )
}

// A tag chip keeps the tag's own colour as a dot so it matches the badges in the table and drawer.
function TagChip({ tag, active, onClick }) {
  return (
    <button type="button" className="icplc-chip" aria-pressed={active} onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color || '#6366F1', boxShadow: active ? '0 0 0 1.5px #fff' : 'none', flexShrink: 0 }} />
      {tag.name}
    </button>
  )
}
