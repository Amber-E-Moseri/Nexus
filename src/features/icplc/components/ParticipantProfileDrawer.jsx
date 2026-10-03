import React, { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useICPLCProfile } from '../hooks/useICPLCProfile.js'
import { useICPLC } from '../ICPLCContext.jsx'
import MergeParticipantDialog from './MergeParticipantDialog.jsx'
import DeleteParticipantDialog from './DeleteParticipantDialog.jsx'
import OverviewTab from './tabs/OverviewTab.jsx'
import RegistrationTab from './tabs/RegistrationTab.jsx'
import DocumentationTab from './tabs/DocumentationTab.jsx'
import TravelTab from './tabs/TravelTab.jsx'
import ActivityTab from './tabs/ActivityTab.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import {
  registrationState,
  REGISTRATION_STATE_LABELS,
  REGISTRATION_URGENT_LABELS,
  attentionCategoryKeys,
  attentionTier,
  attentionCategoryDef,
  documentationActionRequired,
  ATTENTION_CATEGORIES,
} from '../lib/documentationRules.js'
import {
  deriveReadiness,
  readinessTone,
  readinessLabel,
  effectiveParticipationStatus,
  deriveItineraryStatus,
} from '../lib/readinessEngine.js'
import { attendanceEvidence, flightNotRequired } from '../lib/flightRequirement.js'
import { needsAttentionNow } from '../lib/attentionModel.js'

const INFORMATIONAL = new Set(
  ATTENTION_CATEGORIES.filter((c) => c.informational).map((c) => c.key),
)

// Presentation-level next action (see NeedsAttentionPage for the canonical copy)
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

const PARTICIPATION_TONES = {
  tracking: 'mute', likely: 'in_progress', confirmed: 'done',
  uncertain: 'at_risk', not_attending: 'blocked',
}
const PARTICIPATION_LABELS = {
  tracking: 'Tracking', likely: 'Likely', confirmed: 'Confirmed',
  uncertain: 'Uncertain', not_attending: 'Not Attending',
}

/**
 * Compact 4-dimension summary + action banner for the drawer header.
 * Participation, Registration, Documentation, Travel are independent — not a funnel.
 */
function DrawerOperationalSummary({ participant }) {
  const regState = registrationState(participant)
  const registered = regState === 'registered'
  const isNA = participant.participation_status === 'not_attending'
  const urgent = !registered && !isNA

  const effective = effectiveParticipationStatus(participant)
  const evidence = attendanceEvidence(participant)

  const hasDocAction = documentationActionRequired(participant)
  const fnr = flightNotRequired(participant)
  const itinerary = deriveItineraryStatus(participant)

  // Actionable attention keys (informational excluded)
  const actionableKeys = isNA
    ? []
    : attentionCategoryKeys(participant).filter((k) => !INFORMATIONAL.has(k))
  const hasAction = actionableKeys.length > 0
  const primaryKey = actionableKeys[0]
  const tier = primaryKey ? attentionTier(primaryKey) : 1
  const isUrgent = tier === 0
  const actionCount = actionableKeys.length

  // Participation dimension
  const partTone = PARTICIPATION_TONES[effective] || 'mute'
  const partLabel = PARTICIPATION_LABELS[effective] || effective

  // Registration dimension
  const regTone = registered ? 'done' : urgent ? 'blocked' : 'at_risk'
  const regLabel = registered
    ? REGISTRATION_STATE_LABELS.registered
    : urgent
      ? REGISTRATION_URGENT_LABELS[regState]
      : REGISTRATION_STATE_LABELS[regState]

  // Documentation dimension
  const docTone = hasDocAction ? 'at_risk' : 'done'
  const docLabel = hasDocAction ? 'Action required' : 'OK'

  // Travel dimension (independent of documentation)
  const travelTone = isNA ? 'mute'
    : fnr ? 'mute'
    : itinerary === 'received' ? 'done'
    : 'at_risk'
  const travelLabel = isNA ? 'N/A'
    : fnr ? 'Not required'
    : itinerary === 'received' ? 'Flight received'
    : 'Missing'

  const dims = [
    { label: 'Participation', tone: partTone, value: partLabel, extra: evidence },
    { label: 'Registration',  tone: regTone,  value: regLabel },
    { label: 'Documentation', tone: docTone,  value: docLabel },
    { label: 'Travel',        tone: travelTone, value: travelLabel },
  ]

  return (
    <div style={{ marginTop: 10, marginBottom: 2 }}>
      {/* Action banner — only shown when something needs attention */}
      {hasAction && (
        <div style={{
          marginBottom: 10, padding: '10px 12px',
          background: isUrgent ? 'var(--icplc-red-bg)' : 'var(--icplc-orange-bg)',
          borderRadius: 8,
          border: `1px solid ${isUrgent ? '#F3BDB8' : '#FDE68A'}`,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3, color: isUrgent ? 'var(--icplc-red)' : 'var(--icplc-orange)' }}>
            Action Required
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--icplc-text)', marginBottom: 2 }}>
            {attentionCategoryDef(primaryKey)?.label || primaryKey}
            {actionCount > 1 && (
              <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--icplc-text-soft)', marginLeft: 6 }}>
                +{actionCount - 1} more
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--icplc-text-soft)' }}>
            Next action: {NEXT_ACTION[primaryKey] || 'Review participant status'}
          </div>
        </div>
      )}

      {/* 4 independent dimensions — not a sequential funnel */}
      <div className="icplc-dim-grid">
        {dims.map(({ label, tone, value, extra }) => (
          <React.Fragment key={label}>
            <span className="icplc-dim-label">{label}</span>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              <Badge tone={tone} label={value} />
              {extra && (
                <Badge
                  tone={extra.type === 'conflict' ? 'at_risk' : 'in_progress'}
                  label={extra.label}
                />
              )}
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

// DrawerOperationalSummary is exported for testing: it is the production drawer header component.
export { DrawerOperationalSummary }

const TABS = [
  { key: 'overview',       label: 'Overview' },
  { key: 'registration',   label: 'Registration' },
  { key: 'documentation',  label: 'Documentation' },
  { key: 'travel',         label: 'Travel' },
  { key: 'activity',       label: 'Notes & Activity' },
]

/**
 * Canonical participant profile drawer.
 * Opened from any surface (People, Board, Documentation, Travel, NeedsAttention).
 * The same component renders regardless of which page opened it.
 */
export default function ParticipantProfileDrawer({ participantId, initialTab = 'overview', onClose, canWrite }) {
  const [activeTab, setActiveTab] = useState(initialTab)
  const openerRef = useRef(typeof document !== 'undefined' ? document.activeElement : null)
  const { data: participant, isLoading, error } = useICPLCProfile(participantId)
  const { accessTier } = useICPLC()
  const canManageRecord = accessTier === 'admin'
  const [dialog, setDialog] = useState(null)

  return (
    <Dialog.Root open={!!participantId} onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed', inset: 0, zIndex: 40,
            background: 'rgba(0,0,0,0.8)',
          }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className="icplc-drawer"
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            const opener = openerRef.current
            if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus()
          }}
        >
          {/* Header */}
          <div style={{
            padding: '16px 20px 0',
            borderBottom: '1px solid var(--icplc-border, var(--border))',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                {isLoading ? (
                  <div style={{ height: 22, width: 200, background: 'var(--icplc-grey-bg, var(--surface-2))', borderRadius: 4 }} />
                ) : (
                  <Dialog.Title style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--icplc-text, var(--text-primary))' }}>
                    {participant?.full_name || 'Participant'}
                  </Dialog.Title>
                )}
                {(participant?.subgroup || participant?.leadership) && (
                  <div style={{ fontSize: 12, color: 'var(--icplc-text-soft, var(--text-secondary))', marginTop: 2 }}>
                    {[participant.subgroup, participant.leadership || participant.region].filter(Boolean).join(' · ')}
                  </div>
                )}

                {/* Operational summary: action banner + 4 dimensions */}
                {participant && <DrawerOperationalSummary participant={participant} />}

                {participant && canManageRecord && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button type="button" className="icplc-btn" onClick={() => setDialog('merge')}
                      style={{ fontSize: 12, padding: '4px 10px', minHeight: 30 }}>
                      Merge…
                    </button>
                    <button type="button" className="icplc-btn" onClick={() => setDialog('delete')}
                      style={{ fontSize: 12, padding: '4px 10px', minHeight: 30, color: '#B42318', borderColor: '#F3BDB8' }}>
                      Delete
                    </button>
                  </div>
                )}
              </div>
              <Dialog.Close className="icplc-drawer-close" aria-label="Close profile">
                <span aria-hidden>×</span>
              </Dialog.Close>
            </div>

            {/* Tab bar */}
            <div className="icplc-drawer-tabs" role="tablist" aria-label="Participant sections">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t.key}
                  onClick={() => setActiveTab(t.key)}
                  style={{
                    padding: '8px 14px', minHeight: 44,
                    background: 'none', border: 'none',
                    borderBottom: activeTab === t.key ? '2px solid var(--icplc-purple, var(--accent))' : '2px solid transparent',
                    color: activeTab === t.key ? 'var(--icplc-purple, var(--accent))' : 'var(--icplc-text-soft, var(--text-secondary))',
                    fontSize: 13, fontWeight: activeTab === t.key ? 600 : 400,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div role="tabpanel" style={{ flex: 1, overflowY: 'auto', padding: '20px 20px' }}>
            {isLoading && <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>}
            {error && <div style={{ color: 'var(--text-secondary)' }}>Failed to load profile.</div>}
            {participant && (
              <>
                {activeTab === 'overview' && <OverviewTab participant={participant} canWrite={canWrite} />}
                {activeTab === 'registration' && <RegistrationTab participant={participant} canWrite={canWrite} />}
                {activeTab === 'documentation' && <DocumentationTab participant={participant} canWrite={canWrite} />}
                {activeTab === 'travel' && <TravelTab participant={participant} canWrite={canWrite} />}
                {activeTab === 'activity' && <ActivityTab participant={participant} canWrite={canWrite} />}
              </>
            )}
          </div>
          {participant && dialog === 'merge' && (
            <MergeParticipantDialog
              participant={participant}
              onClose={() => setDialog(null)}
              onMerged={() => setDialog(null)}
            />
          )}
          {participant && dialog === 'delete' && (
            <DeleteParticipantDialog
              participant={participant}
              onClose={() => setDialog(null)}
              onDeleted={() => { setDialog(null); onClose() }}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
