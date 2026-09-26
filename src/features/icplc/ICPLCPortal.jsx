import React, { useState } from 'react'
import { ICPLCProvider } from './ICPLCContext.jsx'
import OverviewPage from './pages/OverviewPage.jsx'
import PeoplePage from './pages/PeoplePage.jsx'
import RegistrationsPage from './pages/RegistrationsPage.jsx'
import BoardPage from './pages/BoardPage.jsx'
import DocumentationPage from './pages/DocumentationPage.jsx'
import TravelPage from './pages/TravelPage.jsx'
import NeedsAttentionPage from './pages/NeedsAttentionPage.jsx'
import ImportsPage from './pages/ImportsPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'

// New ICPLC operational tabs — use icplc_participants exclusively.
// Legacy tabs are rendered via the `legacyContent` prop injected by ICPLCPage
// so this component never imports RegistrationEcosystem.jsx.
const NEW_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'people', label: 'People' },
  { key: 'registrations', label: 'Registrations' },
  { key: 'board', label: 'Board' },
  { key: 'documentation', label: 'Documentation' },
  { key: 'travel', label: 'Travel' },
  { key: 'attention', label: 'Needs Attention' },
  { key: 'imports', label: 'Imports' },
  { key: 'settings', label: 'Settings' },
]

// Single legacy tab — RegistrationEcosystem handles its own sub-navigation
// (rooms / transport / finance). Collapsing to one prevents three outer tabs
// from all rendering the same legacyContent instance with no internal navigation.
const LEGACY_TABS = [
  { key: 'legacy', label: 'Room / Transport / Finance' },
]

export default function ICPLCPortal({
  config,
  accessTier,  // 'admin' | 'write' | 'read_only' | 'finance_only'
  legacyContent, // Pre-rendered RegistrationEcosystem element (injected by ICPLCPage)
  financeAccess,
}) {
  const [activeTab, setActiveTab] = useState('overview')

  const isFinanceOnly = accessTier === 'finance_only'
  const canWrite = accessTier === 'admin' || accessTier === 'write'
  const canAdmin = accessTier === 'admin'

  const visibleNewTabs = isFinanceOnly
    ? [] // Finance team sees Finance tab only
    : NEW_TABS.filter((t) => {
        if (t.key === 'settings') return canAdmin
        if (t.key === 'imports') return canWrite
        return true
      })

  // Legacy tab is visible to anyone who has finance or general access;
  // finance-only tier sees it as their only tab.
  const visibleLegacyTabs = LEGACY_TABS.filter(() => financeAccess || !isFinanceOnly || canAdmin)

  const allTabs = [...visibleNewTabs, ...visibleLegacyTabs]

  // If current tab is not visible (e.g. finance only), redirect to first available
  const resolvedTab = allTabs.find((t) => t.key === activeTab) ? activeTab
    : allTabs[0]?.key || 'legacy'

  const isLegacyTab = LEGACY_TABS.some((t) => t.key === resolvedTab)

  return (
    <ICPLCProvider config={config} accessTier={accessTier}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Tab bar */}
        <div style={{
          display: 'flex', gap: 0, borderBottom: '1px solid var(--border)',
          overflowX: 'auto', flexShrink: 0,
        }}>
          {allTabs.map((t) => {
            const isLegacy = LEGACY_TABS.some((l) => l.key === t.key)
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  padding: '10px 16px', background: 'transparent', border: 'none',
                  borderBottom: resolvedTab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                  color: resolvedTab === t.key ? 'var(--accent)' : 'var(--text-secondary)',
                  fontWeight: resolvedTab === t.key ? 600 : 400,
                  cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
                  opacity: isLegacy ? 0.7 : 1,
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Page body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 0' }}>
          {/* Legacy tabs — render the injected RegistrationEcosystem content */}
          {isLegacyTab && (
            <div data-icplc-legacy-tab={resolvedTab}>
              {legacyContent}
            </div>
          )}

          {/* New ICPLC operational tabs */}
          {!isLegacyTab && resolvedTab === 'overview' && <OverviewPage />}
          {!isLegacyTab && resolvedTab === 'people' && <PeoplePage canWrite={canWrite} />}
          {!isLegacyTab && resolvedTab === 'registrations' && <RegistrationsPage canWrite={canWrite} />}
          {!isLegacyTab && resolvedTab === 'board' && <BoardPage canWrite={canWrite} />}
          {!isLegacyTab && resolvedTab === 'documentation' && <DocumentationPage canWrite={canWrite} />}
          {!isLegacyTab && resolvedTab === 'travel' && <TravelPage canWrite={canWrite} />}
          {!isLegacyTab && resolvedTab === 'attention' && <NeedsAttentionPage canWrite={canWrite} />}
          {!isLegacyTab && resolvedTab === 'imports' && canWrite && <ImportsPage />}
          {!isLegacyTab && resolvedTab === 'settings' && canAdmin && <SettingsPage />}
        </div>
      </div>
    </ICPLCProvider>
  )
}
