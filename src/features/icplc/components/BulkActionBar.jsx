import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardCheck, Download, Mail, MoreHorizontal, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useBulkMarkDocumentationReviewed, useBulkSetTag } from '../hooks/useICPLCBulk.js'
import { useICPLCWorkingList } from '../hooks/useICPLCWorkingList.js'
import { buildReviewItems, classifyForReview, partitionForReview, RESULT_LABELS, CANNOT_REVIEW_REASONS, summarizeBulkResults } from '../lib/bulkReview.js'
import { downloadBulkExport } from '../lib/bulkExport.js'

const selectStyle = { width: 'auto', maxWidth: 170 }
const STATUS_ORDER = ['updated', 'already_reviewed', 'no_change', 'skipped_stale', 'skipped_ineligible', 'failed']

/**
 * Contextual bulk-action bar, shared by Action, People, Documentation and Travel.
 *
 * Phase 1/2 actions only: Mark Documentation Reviewed, Add / Remove tag, Export selected / filtered.
 * Everything that changes participation, travel exceptions, registration, passport/visa values, assistance,
 * deletion or merging is intentionally absent.
 *
 * Every mutation asks for an inline confirmation naming the count, and ends with a per-participant result
 * (never a bare "Success"). Nothing here sends a notification.
 *
 * @param selection     controller from useRowSelection()
 * @param context       'needs_attention' (Action) | 'people' | 'documentation' | 'travel'
 * @param filteredRows  every row currently shown, used by Export filtered
 */
export default function BulkActionBar({ eventId, selection, context, canWrite, filteredRows = [], canEmail = false, onEmail }) {
  const count = selection.count
  const [pending, setPending] = useState(null) // { kind, text, run, partition? }
  const [result, setResult] = useState(null) // { title, summary, note, error }
  const [menuOpen, setMenuOpen] = useState(false)
  const reviewMut = useBulkMarkDocumentationReviewed()
  const tagMut = useBulkSetTag()
  const busy = reviewMut.isPending || tagMut.isPending

  // Canonical rows: registration state in the export, and updated_at / missing-info for the review, must come from the
  // same derivation the rest of ICPLC uses. Same query keys as the pages, so this reuses their cache. promote:false
  // keeps this a read-only consumer (no Ready => Confirmed write from the Documentation or Travel pages).
  const { participants: canonical } = useICPLCWorkingList(eventId, {}, { promote: false })
  const canonById = useMemo(() => new Map((canonical || []).map((p) => [p.id, p])), [canonical])
  const canon = (rows) => rows.map((r) => canonById.get(r.id) || r)

  const { data: tags = [] } = useQuery({
    queryKey: ['icplc_tags', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('icplc_tags')
        .select('*')
        .or(`event_id.eq.${eventId},event_id.is.null`)
        .order('sort_order')
      if (error) throw error
      return data || []
    },
    enabled: !!eventId && canWrite,
    staleTime: 5 * 60_000,
  })

  if (count === 0 && !result) return null

  const who = `${count} ${count === 1 ? 'person' : 'people'}`
  const showReview = canWrite && context !== 'travel'
  const reviewIsPrimary = context === 'documentation' || context === 'needs_attention'
  const nameOf = (id) => selection.selectedRows.find((r) => r.id === id)?.full_name || canonById.get(id)?.full_name || 'Unknown participant'

  function dismiss() { setResult(null); setPending(null) }

  function startReview() {
    const partition = partitionForReview(canon(selection.selectedRows))
    setResult(null)
    setMenuOpen(false)
    setPending({ kind: 'review', partition })
  }

  async function applyReview() {
    const { partition } = pending
    setPending(null)
    try {
      const { results } = await reviewMut.mutateAsync({ items: buildReviewItems(partition.eligible) })
      setResult({
        title: 'Documentation review',
        summary: summarizeBulkResults(results),
        // Bulk review records the acknowledgement only. Action is recalculated by the canonical rules.
        note: 'Reviewing records that staff looked at what is missing. Registration, visa, passport and travel issues are unaffected, so those people stay in Action when another canonical reason still applies.',
      })
    } catch (err) {
      setResult({ title: 'Documentation review', error: err.message || 'Could not save' })
    }
  }

  function startTag(action, tag) {
    setResult(null)
    setMenuOpen(false)
    const ids = selection.selectedIds
    setPending({
      kind: 'tag',
      text: `${action === 'add' ? 'Add' : 'Remove'} tag "${tag.name}" ${action === 'add' ? 'to' : 'from'} ${who}?`,
      run: async () => {
        try {
          const { results } = await tagMut.mutateAsync({ ids, tagId: tag.id, action })
          setResult({ title: `${action === 'add' ? 'Add' : 'Remove'} tag "${tag.name}"`, summary: summarizeBulkResults(results) })
        } catch (err) {
          setResult({ title: 'Tag', error: err.message || 'Could not save' })
        }
      },
    })
  }

  function exportRows(kind, rows) {
    const n = downloadBulkExport(kind, canon(rows))
    setMenuOpen(false)
    setResult({ title: 'Export', summary: null, note: `Exported ${n} ${n === 1 ? 'person' : 'people'} (${kind}).` })
  }

  const partition = pending?.kind === 'review' ? pending.partition : null

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      style={{
        position: 'sticky', bottom: 12, zIndex: 15, marginTop: 12,
        background: 'var(--icplc-surface, #fff)', border: '1px solid var(--icplc-purple, #4C2A92)',
        borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.16)', padding: '10px 12px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {count > 0 && <strong style={{ fontSize: 13, color: 'var(--icplc-purple, #4C2A92)' }}>{count} selected</strong>}

        {count > 0 && !pending && (
          <div className="icplc-bulk-bar-group" role="group" aria-label="Bulk Manage">
            <strong style={{ fontSize: 12, color: 'var(--icplc-text-soft, #666)' }}>Manage</strong>
            {showReview && (
              <button
                type="button"
                className={`icplc-btn${reviewIsPrimary ? ' icplc-btn-primary' : ''}`}
                disabled={busy}
                onClick={startReview}
              >
                <ClipboardCheck size={14} aria-hidden /> Mark reviewed
              </button>
            )}

            {canWrite && (
              <>
                <select
                  className="icplc-input"
                  style={selectStyle}
                  aria-label="Add a tag to selected"
                  value=""
                  disabled={busy || tags.length === 0}
                  onChange={(e) => {
                    const t = tags.find((x) => x.id === e.target.value)
                    if (t) startTag('add', t)
                  }}
                >
                  <option value="">Add tag…</option>
                  {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select
                  className="icplc-input"
                  style={selectStyle}
                  aria-label="Remove a tag from selected"
                  value=""
                  disabled={busy || tags.length === 0}
                  onChange={(e) => {
                    const t = tags.find((x) => x.id === e.target.value)
                    if (t) startTag('remove', t)
                  }}
                >
                  <option value="">Remove tag…</option>
                  {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </>
            )}

            {canEmail && (
              <button type="button" className="icplc-btn" disabled={busy} onClick={onEmail}>
                <Mail size={14} aria-hidden /> Email selected
              </button>
            )}

            <button type="button" className="icplc-btn" onClick={() => exportRows('selected', selection.selectedRows)}>
              <Download size={14} aria-hidden /> Export selected
            </button>

            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="icplc-btn"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <MoreHorizontal size={14} aria-hidden /> More
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="icplc-bulk-menu"
                  style={{
                    position: 'absolute', bottom: '110%', right: 0, zIndex: 20,
                    background: 'var(--icplc-surface, #fff)', border: '1px solid var(--icplc-border, #ddd)',
                    borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.16)', padding: 6, display: 'flex', flexDirection: 'column', gap: 4,
                  }}
                >
                  <button type="button" role="menuitem" className="icplc-btn" disabled={filteredRows.length === 0} onClick={() => exportRows('filtered', filteredRows)}>
                    <Download size={14} aria-hidden /> Export filtered ({filteredRows.length})
                  </button>
                  <div style={{ fontSize: 11.5, color: 'var(--icplc-text-soft, #666)', padding: '4px 6px' }}>
                    Participation, readiness and registration are not bulk-editable: readiness and registration are derived, and participation is changed per person from the profile.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {pending?.kind === 'tag' && (
          <>
            <span style={{ fontSize: 13 }}>{pending.text}</span>
            <button type="button" className="icplc-btn icplc-btn-primary" disabled={busy} onClick={() => { const run = pending.run; setPending(null); run() }}>Apply</button>
            <button type="button" className="icplc-btn" onClick={() => setPending(null)}>Cancel</button>
          </>
        )}

        <span style={{ flex: 1 }} />
        {count > 0 && (
          <button type="button" className="icplc-btn icplc-bulk-clear" onClick={() => { selection.clear(); setPending(null); setMenuOpen(false) }} aria-label="Clear selection">
            <X size={14} aria-hidden /> Clear
          </button>
        )}
      </div>

      {partition && (
        <div role="group" aria-label="Confirm documentation review" style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>
            <strong>{count} selected</strong>
            <div>Eligible: {partition.eligible.length}</div>
            <div>Already reviewed: {partition.already_reviewed.length}</div>
            <div>
              Cannot review: {partition.cannot_review.length}
              {partition.cannot_review.length > 0 && (
                <span style={{ color: 'var(--icplc-text-soft, #666)' }}>{' '}({cannotSummary(partition.cannot_review)})</span>
              )}
            </div>
          </div>
          {partition.eligible.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span>Mark {partition.eligible.length} as documentation reviewed?</span>
              <button type="button" className="icplc-btn icplc-btn-primary" disabled={busy} onClick={applyReview}>
                Mark {partition.eligible.length} reviewed
              </button>
              <button type="button" className="icplc-btn" onClick={() => setPending(null)}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span>Nobody in this selection needs a documentation review.</span>
              <button type="button" className="icplc-btn" onClick={() => setPending(null)}>Close</button>
            </div>
          )}
        </div>
      )}

      {result && (
        <div role="status" style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong>{result.title}</strong>
            <span style={{ flex: 1 }} />
            <button type="button" className="icplc-btn" onClick={dismiss} aria-label="Dismiss result"><X size={12} aria-hidden /></button>
          </div>
          {result.error && <div style={{ color: 'var(--icplc-red, #B42318)' }}>Failed: {result.error}</div>}
          {result.summary && (
            <>
              <div>
                {`${result.summary.total} processed · `}{STATUS_ORDER.filter((s) => result.summary.counts[s]).map((s) => `${result.summary.counts[s]} ${RESULT_LABELS[s]}`).join(' · ') || 'No participants'}
              </div>
              {result.summary.problems?.length > 0 && (
                <ul aria-label="Needs follow-up" style={{ margin: 0, paddingLeft: 18, color: 'var(--icplc-red, #B42318)' }}>
                  {result.summary.problems.map((r) => <li key={`${r.id}:${r.status}`}>{nameOf(r.id)} — {RESULT_LABELS[r.status] || r.status}{r.reason ? ` (${r.reason.replace(/_/g, ' ')})` : ''}</li>)}
                </ul>
              )}
              {result.summary.reasons.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--icplc-text-soft, #666)' }}>
                  {result.summary.reasons.map((r) => <li key={`${r.status}:${r.reason}`}>{r.label} — {r.count}</li>)}
                </ul>
              )}
            </>
          )}
          {result.note && <div style={{ color: 'var(--icplc-text-soft, #666)' }}>{result.note}</div>}
        </div>
      )}
    </div>
  )
}

function cannotSummary(rows) {
  const by = {}
  for (const p of rows) {
    const label = CANNOT_REVIEW_REASONS[classifyForReview(p).reason] || 'Other'
    by[label] = (by[label] || 0) + 1
  }
  return Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')
}
