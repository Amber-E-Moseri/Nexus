import React, { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useICPLCProfile } from '../hooks/useICPLCProfile.js'
import OverviewTab from './tabs/OverviewTab.jsx'
import RegistrationTab from './tabs/RegistrationTab.jsx'
import DocumentationTab from './tabs/DocumentationTab.jsx'
import TravelTab from './tabs/TravelTab.jsx'
import ActivityTab from './tabs/ActivityTab.jsx'

const TABS = [
  { key: 'overview',       label: 'Overview' },
  { key: 'registration',   label: 'Registration' },
  { key: 'documentation',  label: 'Documentation' },
  { key: 'travel',         label: 'Travel' },
  { key: 'activity',       label: 'Activity' },
]

/**
 * Canonical participant profile drawer.
 * Opened from any surface (People, Board, Documentation, Travel, NeedsAttention).
 * The same component renders regardless of which page opened it.
 */
export default function ParticipantProfileDrawer({ participantId, initialTab = 'overview', onClose, canWrite }) {
  const [activeTab, setActiveTab] = useState(initialTab)
  const { data: participant, isLoading, error } = useICPLCProfile(participantId)

  return (
    <Dialog.Root open={!!participantId} onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed', inset: 0, zIndex: 40,
            background: 'rgba(0,0,0,0.35)',
          }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
            width: 560, maxWidth: '95vw',
            background: 'var(--surface-1, #fff)',
            display: 'flex', flexDirection: 'column',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '16px 20px 0',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                {isLoading ? (
                  <div style={{ height: 22, width: 200, background: 'var(--surface-2)', borderRadius: 4 }} />
                ) : (
                  <Dialog.Title style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {participant?.full_name || 'Participant'}
                  </Dialog.Title>
                )}
                {participant?.subgroup && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {participant.subgroup}{participant.region ? ` · ${participant.region}` : ''}
                  </div>
                )}
              </div>
              <Dialog.Close
                style={{
                  background: 'none', border: 'none', fontSize: 20,
                  color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px 6px',
                  lineHeight: 1, flexShrink: 0,
                }}
              >
                ×
              </Dialog.Close>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 0, marginBottom: -1 }}>
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  style={{
                    padding: '8px 14px',
                    background: 'none', border: 'none',
                    borderBottom: activeTab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                    color: activeTab === t.key ? 'var(--accent)' : 'var(--text-secondary)',
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
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px' }}>
            {isLoading && <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>}
            {error && <div style={{ color: 'var(--text-secondary)' }}>Failed to load profile.</div>}
            {participant && (
              <>
                {activeTab === 'overview' && (
                  <OverviewTab participant={participant} />
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
                  <ActivityTab participantId={participant.id} />
                )}
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
