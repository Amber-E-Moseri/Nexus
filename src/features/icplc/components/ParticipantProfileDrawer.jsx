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
import { registrationState, REGISTRATION_STATE_LABELS, REGISTRATION_URGENT_LABELS } from '../lib/documentationRules.js'
import { deriveReadiness, readinessTone, readinessLabel } from '../lib/readinessEngine.js'

const PARTICIPATION_TONES = {
  tracking: 'mute', likely: 'in_progress', confirmed: 'done',
  uncertain: 'at_risk', not_attending: 'blocked',
}
const PARTICIPATION_LABELS = {
  tracking: 'Tracking', likely: 'Likely', confirmed: 'Confirmed',
  uncertain: 'Uncertain', not_attending: 'Not Attending',
}

export function DrawerStatusBadges({ participant }) {
  const { readiness } = deriveReadiness(participant)
  const regState = registrationState(participant) // the one canonical derivation, shared with every other view
  const registered = regState === 'registered'
  // Registration is mandatory and can't be waived: an incomplete one is always urgent, even for a confirmed participant.
  const urgent = !registered && participant.participation_status !== 'not_attending'
  const regTone = registered ? 'done' : urgent ? 'blocked' : 'at_risk'
  const regLabel = registered ? REGISTRATION_STATE_LABELS.registered : urgent ? REGISTRATION_URGENT_LABELS[regState] : REGISTRATION_STATE_LABELS[regState]

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      <Badge
        tone={PARTICIPATION_TONES[participant.participation_status] || 'mute'}
        label={PARTICIPATION_LABELS[participant.participation_status] || (participant.participation_status || 'Unknown')}
      />
      <Badge tone={regTone} label={regLabel} />
      <Badge tone={readinessTone(readiness)} label={readinessLabel(readiness)} />
    </div>
  )
}

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
  // The drawer opens programmatically (no Dialog.Trigger), so remember the opener to restore focus.
  const openerRef = useRef(typeof document !== 'undefined' ? document.activeElement : null)
  const { data: participant, isLoading, error } = useICPLCProfile(participantId)
  // 'admin' tier = super admin / regional secretary: the only roles that may merge or delete (also enforced in the DB).
  const { accessTier } = useICPLC()
  const canManageRecord = accessTier === 'admin'
  const [dialog, setDialog] = useState(null) // 'merge' | 'delete' | null

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
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
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
                {participant && <DrawerStatusBadges participant={participant} />}
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
                {activeTab === 'overview' && (
                  <OverviewTab participant={participant} canWrite={canWrite} />
                )}
                {activeTab === 'registration' && (
                  <RegistrationTab participant={participant} canWrite={canWrite} />
                )}
                {activeTab === 'documentation' && (
                  <DocumentationTab participant={participant} canWrite={canWrite} />
                )}
                {activeTab === 'travel' && (
                  <TravelTab participant={participant} canWrite={canWrite} />
                )}
                {activeTab === 'activity' && (
                  <ActivityTab participant={participant} canWrite={canWrite} />
                )}
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
