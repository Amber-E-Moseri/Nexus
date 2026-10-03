import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth.js'
import Badge from '../../../components/ui/Badge.jsx'
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
import { deriveFlightStatus, deriveReadiness, effectiveParticipationStatus, flightStatusLabel, flightStatusTone, readinessLabel, readinessTone } from '../lib/readinessEngine.js'
import { deriveDocumentationActions, RISK_LABELS } from '../lib/documentationRisk.js'
import { registrationDisplayName } from '../lib/reconciliation.js'

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

const PARAMS = ['q', 'reason', 'category', 'readiness', 'participation', 'registration', 'flight', 'subgroup', 'tag', 'risk']

const TIER_BORDER = { 0: '#C94830', 1: '#C97820', 2: '#2563EB', 3: '#9CA3AF' }
const TIER_BG = { 0: '#FEF0ED', 1: '#FEF6E8', 2: '#EFF6FF', 3: '#F3F4F6' }
const TIER_LABEL_COLOR = { 0: '#C94830', 1: '#C97820', 2: '#2563EB', 3: '#6B7280' }

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

function hasReason(row, value) {
  return row.keys.includes(value)
}

function matchesSearch(row, q) {
  if (!q) return true
  const haystack = [
    row.participant.full_name,
    row.participant.email,
    row.participant.subgroup,
    row.participant.region,
    ...row.keys.map((key) => attentionCategoryDef(key)?.label || key),
    ...(row.participant.tags || []).map((tag) => tag.name),
  ].filter(Boolean).join(' ').toLowerCase()
  return haystack.includes(q.toLowerCase())
}

function FilterSelect({ label, value, options, counts, onChange }) {
  return (
    <label className="icplc-action-filter">
      <span>{label}</span>
      <select className="icplc-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}{counts?.[option.value] != null ? ` (${counts[option.value]})` : ''}
          </option>
        ))}
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
          risk: documentation.worst || '',
          tags: participant.tags || [],
        }
      })
      .sort((a, b) => a.tier - b.tier || (a.participant.full_name || '').localeCompare(b.participant.full_name || ''))
  }, [participants, targets])

  const filteredQueue = useMemo(() => baseQueue.filter((row) => (
    matchesSearch(row, filters.q)
    && (!filters.reason || hasReason(row, filters.reason))
    && (!filters.category || row.category === filters.category)
    && (!filters.readiness || row.readiness === filters.readiness)
    && (!filters.participation || row.participation === filters.participation)
    && (!filters.registration || row.registration === filters.registration)
    && (!filters.flight || row.flight === filters.flight)
    && (!filters.subgroup || row.subgroup === filters.subgroup)
    && (!filters.tag || row.tags.some((tag) => tag.name === filters.tag))
    && (!filters.risk || row.risk === filters.risk)
  )), [baseQueue, filters])

  const shownParticipants = useMemo(() => filteredQueue.map((row) => row.participant), [filteredQueue])
  const selection = useRowSelection({ resetKey: searchParams.toString() })
  const syncShown = selection.syncShown
  useEffect(() => { syncShown(shownParticipants) }, [syncShown, shownParticipants])

  const summary = useMemo(() => {
    const hasSection = (row, section) => row.keys.some((key) => attentionCategoryDef(key)?.section === section)
    return {
      all: baseQueue.length,
      urgent: baseQueue.filter((row) => row.tier === 0).length,
      registration: baseQueue.filter((row) => hasSection(row, 'registration')).length,
      documentation: baseQueue.filter((row) => hasSection(row, 'documentation')).length,
      travel: baseQueue.filter((row) => hasSection(row, 'travel')).length,
    }
  }, [baseQueue])

  const reasonOptions = ACTIONABLE_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))
  const categoryOptions = uniqueOptions(baseQueue, 'category', (value) => value.charAt(0).toUpperCase() + value.slice(1))
  const readinessOptions = uniqueOptions(baseQueue, 'readiness', readinessLabel)
  const participationOptions = uniqueOptions(baseQueue, 'participation', (value) => PARTICIPATION_LABELS[value] || value)
  const registrationOptions = uniqueOptions(baseQueue, 'registration', (value) => REGISTRATION_STATE_LABELS[value] || value)
  const flightOptions = uniqueOptions(baseQueue, 'flight', flightStatusLabel)
  const subgroupOptions = uniqueOptions(baseQueue, 'subgroup')
  const riskOptions = uniqueOptions(baseQueue, 'risk', (value) => RISK_LABELS[value] || value)
  const tagOptions = [...new Set(baseQueue.flatMap((row) => row.tags.map((tag) => tag.name)).filter(Boolean))]
    .sort()
    .map((value) => ({ value, label: value }))
  const reasonCounts = {}
  for (const row of baseQueue) for (const key of row.keys) reasonCounts[key] = (reasonCounts[key] || 0) + 1

  const activeFilters = PARAMS.filter((key) => filters[key])
  const clearAll = () => setSearchParams({}, { replace: true })

  if (isLoading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ height: 80, background: 'var(--surface-2)', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
      ))}
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

  const isEmpty = filteredQueue.length === 0 && ambiguousRegistrations.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="icplc-action-header">
        <div>
          <h2>Action</h2>
          <p>Operational queue for participants who need staff follow-up.</p>
        </div>
        <div role="status">{filteredQueue.length} of {baseQueue.length} action item{baseQueue.length === 1 ? '' : 's'}</div>
      </div>

      <div className="icplc-action-summary" aria-label="Action summary">
        <button type="button" className="icplc-action-stat" onClick={() => writeParams(setSearchParams, { category: '', reason: '' })}>
          <strong>{summary.all}</strong><span>All Actions</span>
        </button>
        <button type="button" className="icplc-action-stat" onClick={() => writeParams(setSearchParams, { category: '', reason: '', registration: '' })}>
          <strong>{summary.urgent}</strong><span>Urgent</span>
        </button>
        <button type="button" className="icplc-action-stat" onClick={() => writeParams(setSearchParams, { category: 'registration', reason: '' })}>
          <strong>{summary.registration}</strong><span>Registration</span>
        </button>
        <button type="button" className="icplc-action-stat" onClick={() => writeParams(setSearchParams, { category: 'documentation', reason: '' })}>
          <strong>{summary.documentation}</strong><span>Documentation</span>
        </button>
        <button type="button" className="icplc-action-stat" onClick={() => writeParams(setSearchParams, { category: 'travel', reason: '' })}>
          <strong>{summary.travel}</strong><span>Travel</span>
        </button>
      </div>

      <section className="icplc-action-filters" aria-label="Action filters">
        <label className="icplc-action-filter icplc-action-filter-search">
          <span>Search</span>
          <input
            type="search"
            className="icplc-input"
            value={filters.q}
            placeholder="Search name, email, subgroup, reason, tag"
            onChange={(e) => writeParams(setSearchParams, { q: e.target.value })}
          />
        </label>
        <FilterSelect label="Reason" value={filters.reason} options={reasonOptions} counts={reasonCounts} onChange={(value) => writeParams(setSearchParams, { reason: value })} />
        <FilterSelect label="Category" value={filters.category} options={categoryOptions} counts={countBy(baseQueue, 'category')} onChange={(value) => writeParams(setSearchParams, { category: value })} />
        <FilterSelect label="Readiness" value={filters.readiness} options={readinessOptions} counts={countBy(baseQueue, 'readiness')} onChange={(value) => writeParams(setSearchParams, { readiness: value })} />
        <FilterSelect label="Participation" value={filters.participation} options={participationOptions} counts={countBy(baseQueue, 'participation')} onChange={(value) => writeParams(setSearchParams, { participation: value })} />
        <FilterSelect label="Registration" value={filters.registration} options={registrationOptions} counts={countBy(baseQueue, 'registration')} onChange={(value) => writeParams(setSearchParams, { registration: value })} />
        <FilterSelect label="Travel" value={filters.flight} options={flightOptions} counts={countBy(baseQueue, 'flight')} onChange={(value) => writeParams(setSearchParams, { flight: value })} />
        <FilterSelect label="Time risk" value={filters.risk} options={riskOptions} counts={countBy(baseQueue, 'risk')} onChange={(value) => writeParams(setSearchParams, { risk: value })} />
        <FilterSelect label="Subgroup" value={filters.subgroup} options={subgroupOptions} counts={countBy(baseQueue, 'subgroup')} onChange={(value) => writeParams(setSearchParams, { subgroup: value })} />
        <FilterSelect label="Tag" value={filters.tag} options={tagOptions} onChange={(value) => writeParams(setSearchParams, { tag: value })} />
      </section>

      {activeFilters.length > 0 && (
        <div className="icplc-action-active-filters">
          {activeFilters.map((key) => (
            <button key={key} type="button" className="icplc-chip" aria-pressed="true" onClick={() => writeParams(setSearchParams, { [key]: '' })}>
              {key}: {filters[key]} x
            </button>
          ))}
          <button type="button" className="icplc-btn" onClick={clearAll}>Clear all</button>
        </div>
      )}

      {filteredQueue.length > 0 && (
        <div className="icplc-action-toolbar">
          <label>
            <SelectCheckbox
              checked={selection.allShownSelected}
              indeterminate={selection.someSelected}
              onChange={selection.toggleAllShown}
              label={`Select all ${filteredQueue.length} filtered action rows`}
            />
            <span>Select all filtered</span>
          </label>
          <span>{selection.count} selected</span>
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

      {isEmpty && (
        <div className="icplc-action-empty">
          <div>All clear</div>
          <p>No participants match the current action filters.</p>
          {activeFilters.length > 0 && <button type="button" className="icplc-btn" onClick={clearAll}>Clear filters</button>}
        </div>
      )}

      <div className="icplc-action-list" aria-label="Action results">
        {filteredQueue.map((row) => {
          const { participant, primaryKey, keys, tier } = row
          const primaryDef = attentionCategoryDef(primaryKey)
          const borderColor = TIER_BORDER[tier] || TIER_BORDER[1]
          const bgColor = TIER_BG[tier] || 'var(--icplc-surface)'
          const labelColor = TIER_LABEL_COLOR[tier] || TIER_LABEL_COLOR[1]
          const profileTab = primaryDef?.section || 'overview'

          return (
            <article
              key={participant.id}
              className="icplc-action-row"
              style={{ borderLeftColor: borderColor, background: bgColor }}
              tabIndex={0}
              aria-label={`Open profile: ${participant.full_name}`}
              onClick={() => openProfile(participant.id, profileTab)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProfile(participant.id, profileTab) }
              }}
            >
              <div className="icplc-action-row-main">
                <SelectCheckbox
                  checked={selection.isSelected(participant.id)}
                  onChange={() => selection.toggle(participant.id)}
                  label={`Select ${participant.full_name}`}
                />
                <div className="icplc-action-person">
                  <strong>{participant.full_name}</strong>
                  <span>{[participant.email, participant.subgroup].filter(Boolean).join(' | ') || 'No email or subgroup'}</span>
                </div>
                <Badge tone={readinessTone(row.readiness)} label={readinessLabel(row.readiness)} />
              </div>

              <div className="icplc-action-why">
                <span style={{ color: labelColor, borderColor: `${borderColor}55`, background: `${borderColor}18` }}>
                  {primaryDef?.label || primaryKey}
                </span>
                {keys.slice(1, 3).map((key) => <span key={key}>{attentionCategoryDef(key)?.label || key}</span>)}
                {keys.length > 3 && <span>+{keys.length - 3} more</span>}
              </div>

              <div className="icplc-action-state">
                <Badge tone={row.registration === 'registered' ? 'done' : row.registration === 'registration_missing' ? 'blocked' : 'at_risk'} label={REGISTRATION_STATE_LABELS[row.registration]} />
                <Badge tone="mute" label={PARTICIPATION_LABELS[row.participation] || row.participation} />
                <Badge tone={flightStatusTone(row.flight)} label={flightStatusLabel(row.flight)} />
                {row.risk && <Badge tone="warn" label={RISK_LABELS[row.risk] || row.risk} />}
              </div>

              <div className="icplc-action-next">
                <strong>Next action</strong>
                <span>{nextActionFor(primaryKey)}</span>
              </div>

              {row.tags.length > 0 && (
                <div className="icplc-action-tags">
                  {row.tags.slice(0, 3).map((tag) => <span key={tag.id || tag.name} className="fchip" style={{ background: tag.color || 'var(--surface-2)' }}>{tag.name}</span>)}
                  {row.tags.length > 3 && <span>+{row.tags.length - 3}</span>}
                </div>
              )}
            </article>
          )
        })}
      </div>

      <BulkActionBar
        eventId={config?.id}
        selection={selection}
        context="action"
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
