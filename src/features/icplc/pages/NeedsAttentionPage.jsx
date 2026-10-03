import React, { useEffect, useMemo, useState } from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCWorkingList } from '../hooks/useICPLCWorkingList.js'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import BulkActionBar from '../components/BulkActionBar.jsx'
import SelectCheckbox from '../components/SelectCheckbox.jsx'
import { useRowSelection } from '../hooks/useRowSelection.js'
import {
  ATTENTION_CATEGORIES,
  attentionCategoryKeys,
  attentionTier,
  attentionCategoryDef,
} from '../lib/documentationRules.js'
import { needsAttentionNow } from '../lib/attentionModel.js'
import { registrationDisplayName } from '../lib/reconciliation.js'

const INFORMATIONAL = new Set(
  ATTENTION_CATEGORIES.filter((c) => c.informational).map((c) => c.key),
)

// Presentation-level next action — derived from the primary attention reason key.
// Never persisted; purely for display.
const NEXT_ACTION = {
  registration_missing:    'Complete ICPLC registration',
  not_registered:          'Complete ICPLC registration',
  visa_unknown:            'Follow up on Nigerian visa process',
  visa_not_started:        'Follow up on Nigerian visa process',
  visa_blocked:            'Follow up on Nigerian visa process',
  non_ecowas_review:       'Follow up on Nigerian visa process',
  passport_incomplete:     'Review passport status',
  travel_incomplete:       'Complete required travel information',
  canadian_status_unknown: 'Review Canadian status information',
  canadian_status_review:  'Review Canadian status',
  canadian_docs_review:    'Review Canadian document expiry',
  pr_card:                 'Verify PR card status',
  study_permit:            'Verify study permit status',
  pgwp:                    'Verify PGWP status',
  work_permit:             'Verify work permit status',
  documentation_incomplete:'Collect missing documentation information',
}

function nextActionFor(primaryKey) {
  return NEXT_ACTION[primaryKey] || 'Review participant status'
}

const TIER_BORDER = {
  0: '#C94830', // urgent (registration)
  1: '#C97820', // known problems
  2: '#2563EB', // missing info
  3: '#9CA3AF', // informational
}

const TIER_BG = {
  0: '#FEF0ED',
  1: '#FEF6E8',
  2: '#EFF6FF',
  3: '#F3F4F6',
}

const TIER_LABEL_COLOR = {
  0: '#C94830',
  1: '#C97820',
  2: '#2563EB',
  3: '#6B7280',
}

/**
 * Needs Attention — work queue.
 *
 * Each participant appears exactly once. Multiple attention reasons are represented
 * but do not cause duplicate rows. Primary reason drives the next action.
 */
export default function NeedsAttentionPage({ canWrite }) {
  const { config, activeProfileId, activeProfileTab, closeProfile, openProfile } = useICPLC()
  const { participants, ambiguousRegistrations, isLoading, error } = useICPLCWorkingList(config?.id)
  const [showAbsent, setShowAbsent] = useState(false)

  // Deduplicated queue: one entry per participant, highest-priority reason first
  const queue = useMemo(() => {
    if (!participants) return []
    return participants
      .filter((p) => {
        if (!showAbsent && p.participation_status === 'not_attending') return false
        return needsAttentionNow(p)
      })
      .map((p) => {
        const actionableKeys = attentionCategoryKeys(p).filter((k) => !INFORMATIONAL.has(k))
        return { participant: p, keys: actionableKeys }
      })
      .sort((a, b) => {
        const aTier = a.keys.length ? attentionTier(a.keys[0]) : 99
        const bTier = b.keys.length ? attentionTier(b.keys[0]) : 99
        if (aTier !== bTier) return aTier - bTier
        return (a.participant.full_name || '').localeCompare(b.participant.full_name || '')
      })
  }, [participants, showAbsent])

  // Selection follows exactly the rendered queue. Toggling Not Attending changes it, so it clears the selection.
  const shownParticipants = useMemo(() => queue.map((q) => q.participant), [queue])
  const selection = useRowSelection({ resetKey: String(showAbsent) })
  const syncShown = selection.syncShown
  useEffect(() => { syncShown(shownParticipants) }, [syncShown, shownParticipants])

  const absentAttentionCount = useMemo(() => {
    if (!participants) return 0
    return participants.filter(
      (p) => p.participation_status === 'not_attending' && needsAttentionNow(p),
    ).length
  }, [participants])

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
      <span style={{ fontSize: 18, lineHeight: 1 }}>⚠</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#991B1B', marginBottom: 4 }}>Failed to load attention items</div>
        <div style={{ fontSize: 12, color: '#B91C1C' }}>
          {error?.message || 'An error occurred. Please refresh the page.'}
        </div>
      </div>
    </div>
  )

  const isEmpty = queue.length === 0 && ambiguousRegistrations.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {queue.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--icplc-text-soft)', cursor: 'pointer' }}>
              <SelectCheckbox
                checked={selection.allShownSelected}
                indeterminate={selection.someSelected}
                onChange={selection.toggleAllShown}
                label={`Select all ${queue.length} shown`}
              />
              Select all shown
            </label>
          )}
          <div style={{ fontSize: 12, color: 'var(--icplc-text-soft)' }}>
            {queue.length} item{queue.length !== 1 ? 's' : ''} need attention
          </div>
        </div>
        {absentAttentionCount > 0 && (
          <button
            type="button"
            className="icplc-chip"
            aria-pressed={showAbsent}
            onClick={() => setShowAbsent((v) => !v)}
          >
            {showAbsent ? 'Hiding not attending' : `Include not attending (${absentAttentionCount})`}
          </button>
        )}
      </div>

      {/* Ambiguous registrations */}
      {ambiguousRegistrations.length > 0 && (
        <div style={{
          border: '1px solid var(--icplc-border)', borderLeft: '3px solid #C97820',
          borderRadius: 8, padding: '14px 16px', background: 'var(--icplc-orange-bg)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>
            Ambiguous Registration Match
            <span style={countPill}>{ambiguousRegistrations.length}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--icplc-text-soft)', marginBottom: 6 }}>
            These registrations could belong to an existing participant. They are not linked and no duplicate was created — review them in Manage › Registrations.
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--icplc-text-soft)' }}>
            {ambiguousRegistrations.slice(0, 20).map((r) => (
              <li key={r.id}>{registrationDisplayName(r) || r.email || r.id}{r.email ? ` — ${r.email}` : ''}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div style={{
          padding: '48px 20px', textAlign: 'center',
          border: '1px dashed var(--border)', borderRadius: 8,
          color: 'var(--text-secondary)',
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>All clear</div>
          <div style={{ fontSize: 13 }}>No items need attention right now.</div>
        </div>
      )}

      {/* Work queue rows */}
      {queue.map(({ participant, keys }) => {
        const primaryKey = keys[0]
        const rest = keys.slice(1)
        const tier = primaryKey ? attentionTier(primaryKey) : 1
        const nextAction = nextActionFor(primaryKey)
        const borderColor = TIER_BORDER[tier] || TIER_BORDER[1]
        const bgColor = TIER_BG[tier] || 'var(--icplc-surface)'
        const labelColor = TIER_LABEL_COLOR[tier] || TIER_LABEL_COLOR[1]
        const section = attentionCategoryDef(primaryKey)?.section || 'overview'

        return (
          <div
            key={participant.id}
            role="button"
            tabIndex={0}
            aria-label={`Open profile: ${participant.full_name}`}
            onClick={() => openProfile(participant.id, section)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openProfile(participant.id, section)
              }
            }}
            style={{
              padding: '14px 16px',
              border: `1px solid ${borderColor}33`,
              borderLeft: `3px solid ${borderColor}`,
              borderRadius: 8,
              background: bgColor,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ paddingTop: 2 }}>
                <SelectCheckbox
                  checked={selection.isSelected(participant.id)}
                  onChange={() => selection.toggle(participant.id)}
                  label={`Select ${participant.full_name}`}
                />
              </div>
              {/* Left: name + reasons */}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--icplc-text)', marginBottom: 4 }}>
                  {participant.full_name}
                  {participant.subgroup && (
                    <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--icplc-text-soft)', marginLeft: 8 }}>
                      {participant.subgroup}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                  {primaryKey && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${borderColor}18`, color: labelColor, border: `1px solid ${borderColor}44`, fontWeight: 600 }}>
                      {attentionCategoryDef(primaryKey)?.label || primaryKey}
                    </span>
                  )}
                  {rest.length > 0 && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--icplc-grey-bg)', color: 'var(--icplc-text-soft)', border: '1px solid var(--icplc-border)' }}>
                      +{rest.length} more
                    </span>
                  )}
                </div>
              </div>

              {/* Right: next action */}
              <div style={{ fontSize: 12, color: 'var(--icplc-text-soft)', textAlign: 'right', flexShrink: 0, maxWidth: 220 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2, color: 'var(--icplc-text-muted)' }}>
                  Next action
                </div>
                <div style={{ fontWeight: 500, color: 'var(--icplc-text)' }}>{nextAction}</div>
              </div>
            </div>
          </div>
        )
      })}

      <BulkActionBar eventId={config?.id} selection={selection} context="needs_attention" canWrite={canWrite} filteredRows={shownParticipants} />

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

const countPill = {
  marginLeft: 8, fontSize: 12, fontWeight: 400,
  background: 'rgba(0,0,0,0.08)', borderRadius: 10, padding: '1px 8px',
}
