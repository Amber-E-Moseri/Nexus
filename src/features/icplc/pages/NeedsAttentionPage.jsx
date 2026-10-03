import React, { useEffect, useMemo, useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth.js'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCWorkingList } from '../hooks/useICPLCWorkingList.js'
import { useICPLCTargets } from '../hooks/useICPLCTargets.js'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import BulkActionBar from '../components/BulkActionBar.jsx'
import SelectCheckbox from '../components/SelectCheckbox.jsx'
import ICPLCEmailComposer, { canEstimateICPLCEmail } from '../components/ICPLCEmailComposer.jsx'
import { useRowSelection } from '../hooks/useRowSelection.js'
import {
  ATTENTION_CATEGORIES,
  attentionCategoryDef,
  attentionCategoryKeys,
  attentionTier,
  REGISTRATION_STATE_LABELS,
  registrationState,
} from '../lib/documentationRules.js'
import { needsAttentionNow } from '../lib/attentionModel.js'
import { deriveFlightStatus, deriveReadiness, effectiveParticipationStatus, flightStatusLabel, readinessLabel } from '../lib/readinessEngine.js'
import { deriveDocumentationActions, RISK_LABELS } from '../lib/documentationRisk.js'
import { registrationDisplayName } from '../lib/reconciliation.js'
import {
  activeShortcut,
  buildSubgroupOptions,
  FILTER_PARAMS,
  filterActionRows,
  SECONDARY_PARAMS,
  subgroupKey,
  SUMMARY_SHORTCUTS,
  summaryCounts,
  UNKNOWN_SUBGROUP_LABEL,
  UNKNOWN_SUBGROUP,
} from '../lib/actionFilters.js'

const INFORMATIONAL = new Set(ATTENTION_CATEGORIES.filter((c) => c.informational).map((c) => c.key))
const ACTIONABLE_CATEGORIES = ATTENTION_CATEGORIES.filter((c) => !c.informational)

const NEXT_ACTION = {
  registration_missing: 'Complete ICPLC registration',
  not_registered: 'Complete ICPLC registration',
  visa_unknown: 'Follow up on Nigerian visa process',
  visa_not_started: 'Follow up on Nigerian visa process',
  visa_blocked: 'Follow up on Nigerian visa process',
  passport_incomplete: 'Review passport status',
  travel_incomplete: 'Complete required travel information',
  canadian_status_unknown: 'Review Canadian status information',
  canadian_status_review: 'Review Canadian status',
  canadian_docs_review: 'Review Canadian document expiry',
  pr_card: 'Verify PR card status',
  study_permit: 'Verify study permit status',
  pgwp: 'Verify PGWP status',
  work_permit: 'Verify work permit status',
  documentation_incomplete: 'Collect missing documentation information',
}

const PARTICIPATION_LABELS = {
  tracking: 'Tracking',
  likely: 'Likely',
  confirmed: 'Confirmed',
  uncertain: 'Uncertain',
  not_attending: 'Not Attending',
}

const PARAMS = FILTER_PARAMS

// Documented attention tiers (documentationRules.attentionTier): 0 urgent, 1 known operational problem, 2 staff once-over.
const TIER_LABEL = { 0: 'Urgent', 1: 'Needs action', 2: 'Review', 3: 'Info' }

function nextActionFor(primaryKey) {
  return NEXT_ACTION[primaryKey] || 'Review participant status'
}

function readParams(searchParams) {
  return Object.fromEntries(PARAMS.map((key) => [key, searchParams.get(key) || '']))
}

function writeParams(setSearchParams, patch) {
  setSearchParams((current) => {
    const next = new URLSearchParams(current)
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    return next
  }, { replace: true })
}

function uniqueOptions(rows, key, label = (value) => value) {
  return [...new Set(rows.map((row) => row[key]).filter(Boolean))]
    .sort((a, b) => String(label(a)).localeCompare(String(label(b))))
    .map((value) => ({ value, label: label(value) }))
}

function countBy(rows, key) {
  const out = {}
  for (const row of rows) out[row[key]] = (out[row[key]] || 0) + 1
  return out
}

function FilterSelect({ label, value, options, counts, onChange, allLabel = 'All', hideLabel = false }) {
  // A URL can carry a value that is no longer in the population; keep it visible so the select never lies.
  const known = !value || options.some((o) => o.value === value)
  return (
    <label className={`icplc-action-filter${value ? ' has-value' : ''}`}>
      <span className={hideLabel ? 'icplc-sr' : undefined}>{label}</span>
      <select className="icplc-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}{(option.count ?? counts?.[option.value]) != null ? ` (${option.count ?? counts[option.value]})` : ''}
          </option>
        ))}
        {!known && <option value={value}>{value} (0)</option>}
      </select>
    </label>
  )
}

export default function NeedsAttentionPage({ canWrite }) {
  const { config, activeProfileId, activeProfileTab, closeProfile, openProfile } = useICPLC()
  const { profile } = useAuth()
  const canEmail = canEstimateICPLCEmail(profile)
  const { participants, ambiguousRegistrations, isLoading, error } = useICPLCWorkingList(config?.id)
  const targets = useICPLCTargets(config?.id)
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readParams(searchParams)
  const [showEmail, setShowEmail] = useState(false)
  const [moreOpen, setMoreOpen] = useState(() => SECONDARY_PARAMS.some((key) => searchParams.get(key)))

  const baseQueue = useMemo(() => {
    if (!participants) return []
    return participants
      .filter(needsAttentionNow)
      .map((participant) => {
        const keys = attentionCategoryKeys(participant).filter((key) => !INFORMATIONAL.has(key))
        const primaryKey = keys[0]
        const primaryDef = attentionCategoryDef(primaryKey)
        const { readiness } = deriveReadiness(participant)
        const flight = deriveFlightStatus(participant)
        const documentation = deriveDocumentationActions(participant, { targets, now: new Date() })
        return {
          participant,
          id: participant.id,
          keys,
          primaryKey,
          category: primaryDef?.section || 'other',
          tier: primaryKey ? attentionTier(primaryKey) : 99,
          readiness,
          participation: effectiveParticipationStatus(participant),
          registration: registrationState(participant),
          flight,
          subgroup: participant.subgroup || '',
          subgroupKey: subgroupKey(participant.subgroup),
          sections: [...new Set(keys.map((key) => attentionCategoryDef(key)?.section).filter(Boolean))],
          risk: documentation.worst || '',
          tags: participant.tags || [],
        }
      })
      .sort((a, b) => a.tier - b.tier || (a.participant.full_name || '').localeCompare(b.participant.full_name || ''))
  }, [participants, targets])

  const filteredQueue = useMemo(
    () => filterActionRows(baseQueue, filters, (key) => attentionCategoryDef(key)?.label || key),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseQueue, searchParams],
  )

  const shownParticipants = useMemo(() => filteredQueue.map((row) => row.participant), [filteredQueue])
  const selection = useRowSelection({ resetKey: searchParams.toString() })
  const syncShown = selection.syncShown
  useEffect(() => { syncShown(shownParticipants) }, [syncShown, shownParticipants])

  const summary = useMemo(() => summaryCounts(baseQueue), [baseQueue])
  const shortcut = activeShortcut(filters)

  const reasonOptions = ACTIONABLE_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))
  const sectionCounts = {}
  for (const row of baseQueue) for (const section of row.sections) sectionCounts[section] = (sectionCounts[section] || 0) + 1
  const categoryOptions = Object.keys(sectionCounts).sort().map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))
  const readinessOptions = uniqueOptions(baseQueue, 'readiness', readinessLabel)
  const participationOptions = uniqueOptions(baseQueue, 'participation', (value) => PARTICIPATION_LABELS[value] || value)
  const registrationOptions = uniqueOptions(baseQueue, 'registration', (value) => REGISTRATION_STATE_LABELS[value] || value)
  const flightOptions = uniqueOptions(baseQueue, 'flight', flightStatusLabel)
  const subgroupOptions = buildSubgroupOptions(baseQueue)
  const riskOptions = uniqueOptions(baseQueue, 'risk', (value) => RISK_LABELS[value] || value)
  const tagOptions = [...new Set(baseQueue.flatMap((row) => row.tags.map((tag) => tag.name)).filter(Boolean))]
    .sort()
    .map((value) => ({ value, label: value }))
  const reasonCounts = {}
  for (const row of baseQueue) for (const key of row.keys) reasonCounts[key] = (reasonCounts[key] || 0) + 1

  const activeFilters = PARAMS.filter((key) => filters[key])
  const secondaryActive = SECONDARY_PARAMS.some((key) => filters[key])
  const clearAll = () => setSearchParams({}, { replace: true })

  const FILTER_LABELS = {
    q: 'Search', subgroup: 'Subgroup', reason: 'Reason', readiness: 'Readiness', urgent: 'Urgent',
    category: 'Category', participation: 'Participation', registration: 'Registration', flight: 'Travel', risk: 'Time risk', tag: 'Tag',
  }
  const optionLabel = (options, value) => options.find((o) => o.value === value)?.label
  const chipValue = {
    subgroup: (v) => (v === UNKNOWN_SUBGROUP ? UNKNOWN_SUBGROUP_LABEL : optionLabel(subgroupOptions, v) || v),
    reason: (v) => optionLabel(reasonOptions, v) || v,
    readiness: (v) => readinessLabel(v),
    urgent: () => 'Yes',
    category: (v) => optionLabel(categoryOptions, v) || v,
    participation: (v) => PARTICIPATION_LABELS[v] || v,
    registration: (v) => REGISTRATION_STATE_LABELS[v] || v,
    flight: (v) => flightStatusLabel(v),
    risk: (v) => RISK_LABELS[v] || v,
  }
  const chipText = (key) => `${FILTER_LABELS[key]}: ${(chipValue[key] || ((v) => v))(filters[key])}`

  if (isLoading) return (
    <div className="icplc-action" aria-busy="true" aria-label="Loading action items">
      <div className="icplc-skel" style={{ height: 44, width: 220 }} />
      <div className="icplc-skel" style={{ height: 64 }} />
      <div className="icplc-skel" style={{ height: 52 }} />
      {[1, 2, 3].map((i) => <div key={i} className="icplc-skel" style={{ height: 112 }} />)}
    </div>
  )

  if (error) return (
    <div style={{
      border: '1px solid #F3BDB8', borderRadius: 8, padding: '16px 20px',
      background: '#FEF2F2', display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <span style={{ fontSize: 18, lineHeight: 1 }}>!</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#991B1B', marginBottom: 4 }}>Failed to load action items</div>
        <div style={{ fontSize: 12, color: '#B91C1C' }}>{error?.message || 'An error occurred. Please refresh the page.'}</div>
      </div>
    </div>
  )

  const queueEmpty = baseQueue.length === 0
  const noMatches = filteredQueue.length === 0 && !queueEmpty
  const secondaryCount = SECONDARY_PARAMS.filter((k) => filters[k]).length
  const needLabel = `${baseQueue.length} participant${baseQueue.length === 1 ? '' : 's'} need${baseQueue.length === 1 ? 's' : ''} follow-up`

  return (
    <div className="icplc-action">
      <header className="icplc-action-head">
        <h2>Action</h2>
        <p><strong>{needLabel}</strong><span className="icplc-action-head-sub"> · Prioritized across registration, documentation and travel.</span></p>
      </header>

      <div className="icplc-action-summary" role="group" aria-label="Action summary">
        {Object.entries(SUMMARY_SHORTCUTS).map(([key, def]) => (
          <button
            key={key}
            type="button"
            className={`icplc-as${shortcut === key ? ' is-active' : ''}${key === 'urgent' && summary[key] > 0 ? ' is-urgent' : ''}`}
            aria-pressed={shortcut === key}
            onClick={() => writeParams(setSearchParams, def.patch)}
          >
            <span className="icplc-as-label">{def.label}</span>
            <strong>{summary[key]}</strong>
          </button>
        ))}
      </div>

      <section className="icplc-action-toolbar" aria-label="Action filters">
        <div className="icplc-action-primary">
          <label className="icplc-action-filter icplc-action-filter-search">
            <span className="icplc-sr">Search</span>
            <input
              type="search"
              className="icplc-input"
              value={filters.q}
              placeholder="Search people, email, reason, tag"
              onChange={(e) => writeParams(setSearchParams, { q: e.target.value })}
            />
          </label>
          <FilterSelect label="Subgroup" value={filters.subgroup} options={subgroupOptions} allLabel="All subgroups" hideLabel onChange={(value) => writeParams(setSearchParams, { subgroup: value })} />
          <FilterSelect label="Reason" value={filters.reason} options={reasonOptions} counts={reasonCounts} allLabel="All reasons" hideLabel onChange={(value) => writeParams(setSearchParams, { reason: value })} />
          <FilterSelect label="Readiness" value={filters.readiness} options={readinessOptions} counts={countBy(baseQueue, 'readiness')} allLabel="All readiness" hideLabel onChange={(value) => writeParams(setSearchParams, { readiness: value })} />
          <button
            type="button"
            className={`icplc-btn icplc-action-more${secondaryCount ? ' has-active' : ''}`}
            aria-expanded={moreOpen}
            aria-controls="icplc-action-more-filters"
            onClick={() => setMoreOpen((v) => !v)}
          >
            <SlidersHorizontal size={14} aria-hidden /> More filters{secondaryCount ? ` · ${secondaryCount}` : ''}
          </button>
        </div>
        {moreOpen && (
          <div id="icplc-action-more-filters" className="icplc-action-more-panel" role="group" aria-label="More filters">
            <FilterSelect label="Category" value={filters.category} options={categoryOptions} counts={sectionCounts} onChange={(value) => writeParams(setSearchParams, { category: value })} />
            <FilterSelect label="Participation" value={filters.participation} options={participationOptions} counts={countBy(baseQueue, 'participation')} onChange={(value) => writeParams(setSearchParams, { participation: value })} />
            <FilterSelect label="Registration" value={filters.registration} options={registrationOptions} counts={countBy(baseQueue, 'registration')} onChange={(value) => writeParams(setSearchParams, { registration: value })} />
            <FilterSelect label="Travel" value={filters.flight} options={flightOptions} counts={countBy(baseQueue, 'flight')} onChange={(value) => writeParams(setSearchParams, { flight: value })} />
            <FilterSelect label="Time risk" value={filters.risk} options={riskOptions} counts={countBy(baseQueue, 'risk')} onChange={(value) => writeParams(setSearchParams, { risk: value })} />
            <FilterSelect label="Tag" value={filters.tag} options={tagOptions} onChange={(value) => writeParams(setSearchParams, { tag: value })} />
          </div>
        )}
      </section>

      {activeFilters.length > 0 && (
        <div className="icplc-action-chips" aria-label="Active filters">
          {activeFilters.map((key) => (
            <button key={key} type="button" className="icplc-fchip" title={chipText(key)} aria-label={`Remove filter ${chipText(key)}`} onClick={() => writeParams(setSearchParams, { [key]: '' })}>
              <span>{chipText(key)}</span> <X size={12} aria-hidden />
            </button>
          ))}
          <button type="button" className="icplc-linkbtn" onClick={clearAll}>Clear all</button>
        </div>
      )}

      {ambiguousRegistrations.length > 0 && (
        <div className="icplc-action-ambiguous">
          <div>
            <strong>Registration source review</strong>
            <span>{ambiguousRegistrations.length}</span>
          </div>
          <p>Possible source matches still need review. Open Manage &gt; Imports &gt; Registration Sources to resolve them.</p>
          <ul>
            {ambiguousRegistrations.slice(0, 10).map((r) => (
              <li key={r.id}>{registrationDisplayName(r) || r.email || r.id}{r.email ? ` - ${r.email}` : ''}</li>
            ))}
          </ul>
        </div>
      )}

      {!queueEmpty && (
        <div className="icplc-action-resultbar">
          <div role="status" className="icplc-action-count">
            <strong>{filteredQueue.length}</strong> of {baseQueue.length} action item{baseQueue.length === 1 ? '' : 's'}
          </div>
          {filteredQueue.length > 0 && (
            <label className="icplc-action-selectall">
              <SelectCheckbox
                checked={selection.allShownSelected}
                indeterminate={selection.someSelected}
                onChange={selection.toggleAllShown}
                label={`Select all ${filteredQueue.length} filtered action rows`}
              />
              <span>Select all filtered</span>
            </label>
          )}
          {selection.count > 0 && (
            <span className="icplc-action-selpill" aria-live="polite">
              <strong>{selection.count} selected</strong>
              <span>of {filteredQueue.length} shown</span>
            </span>
          )}
        </div>
      )}

      {queueEmpty && ambiguousRegistrations.length === 0 && (
        <div className="icplc-action-empty">
          <div>You're all caught up.</div>
          <p>No participants currently require operational follow-up.</p>
        </div>
      )}

      {noMatches && (
        <div className="icplc-action-empty">
          <div>No participants match these filters.</div>
          {activeFilters.length > 0 && <button type="button" className="icplc-btn" onClick={clearAll}>Clear filters</button>}
        </div>
      )}

      <div className="icplc-action-list" aria-label="Action results">
        {filteredQueue.map((row) => {
          const { participant, primaryKey, keys, tier } = row
          const primaryDef = attentionCategoryDef(primaryKey)
          const profileTab = primaryDef?.section || 'overview'
          const others = keys.slice(1)
          const regLabel = REGISTRATION_STATE_LABELS[row.registration]

          return (
            <article
              key={participant.id}
              className={`icplc-ac${selection.isSelected(participant.id) ? ' is-selected' : ''}`}
              data-tier={tier}
              tabIndex={0}
              aria-label={`Open profile: ${participant.full_name}`}
              onClick={() => openProfile(participant.id, profileTab)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProfile(participant.id, profileTab) }
              }}
            >
              <div className="icplc-ac-select">
                <SelectCheckbox
                  checked={selection.isSelected(participant.id)}
                  onChange={() => selection.toggle(participant.id)}
                  label={`Select ${participant.full_name}`}
                />
              </div>
              <div className="icplc-ac-body">
                <div className="icplc-ac-top">
                  <div className="icplc-ac-who">
                    <strong>{participant.full_name}</strong>
                    <span className="icplc-ac-sub" title={participant.subgroup || undefined}>{participant.subgroup || 'No subgroup'}</span>
                  </div>
                  <span className="icplc-ac-priority">{TIER_LABEL[tier] || 'Review'}</span>
                </div>

                <div className="icplc-ac-line">
                  <em>Why</em>
                  <span className="icplc-ac-reason">{primaryDef?.label || primaryKey}</span>
                  {others.length > 0 && (
                    <span className="icplc-ac-also">
                      {others.slice(0, 2).map((key) => attentionCategoryDef(key)?.label || key).join(' · ')}
                      {others.length > 2 ? ` · +${others.length - 2} more` : ''}
                    </span>
                  )}
                </div>
                <div className="icplc-ac-line">
                  <em>Next</em>
                  <span>{nextActionFor(primaryKey)}</span>
                </div>

                <div className="icplc-ac-meta">
                  {row.registration === 'registered' && <span className="icplc-mchip">{regLabel}</span>}
                  {row.registration !== 'registered' && row.registration !== primaryKey && <span className="icplc-mchip is-warn">{regLabel}</span>}
                  <span className="icplc-mchip">{PARTICIPATION_LABELS[row.participation] || row.participation}</span>
                  <span className="icplc-mchip">{readinessLabel(row.readiness)}</span>
                  <span className="icplc-mchip">{flightStatusLabel(row.flight)}</span>
                  {row.risk && <span className="icplc-mchip is-warn">{RISK_LABELS[row.risk] || row.risk}</span>}
                  {row.tags.slice(0, 3).map((tag) => <span key={tag.id || tag.name} className="icplc-mchip is-tag" style={tag.color ? { background: tag.color } : undefined}>{tag.name}</span>)}
                  {row.tags.length > 3 && <span className="icplc-mchip">+{row.tags.length - 3}</span>}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <BulkActionBar
        eventId={config?.id}
        selection={selection}
        context="needs_attention"
        canWrite={canWrite}
        filteredRows={shownParticipants}
        canEmail={canEmail}
        onEmail={() => setShowEmail(true)}
      />

      {showEmail && canEmail && (
        <ICPLCEmailComposer
          eventId={config?.id}
          eventName={config?.event_name}
          sourceLabel="Selected action items"
          participants={selection.selectedRows}
          open
          onClose={() => setShowEmail(false)}
        />
      )}

      {activeProfileId && (
        <ParticipantProfileDrawer
          participantId={activeProfileId}
          initialTab={activeProfileTab}
          onClose={closeProfile}
          canWrite={canWrite}
        />
      )}
    </div>
  )
}
