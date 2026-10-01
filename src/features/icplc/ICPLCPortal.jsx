import React, { useState } from 'react'
import './icplc.css'
import { ICPLCProvider } from './ICPLCContext.jsx'
import OverviewPage from './pages/OverviewPage.jsx'
import PeoplePage from './pages/PeoplePage.jsx'
import BoardPage from './pages/BoardPage.jsx'
import DocumentationPage from './pages/DocumentationPage.jsx'
import TravelPage from './pages/TravelPage.jsx'
import ImportsPage from './pages/ImportsPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'

// maturity: undefined = READY (no tag), 'beta' = BETA tag, 'coming_soon' = COMING SOON tag
const NEW_TABS = [
  { key: 'overview',      label: 'Overview',        short: 'Overview' },
  { key: 'people',        label: 'Working List',    short: 'List' },
  { key: 'board',         label: 'Board',           short: 'Board' },
  { key: 'documentation', label: 'Documentation',   short: 'Docs' },
  { key: 'travel',        label: 'Travel',          short: 'Travel',   maturity: 'beta' },
  { key: 'imports',       label: 'Imports',         short: 'Imports' },
  { key: 'settings',      label: 'Settings',        short: 'Settings' },
]

const LEGACY_TABS = [
  { key: 'legacy', label: 'Rooms / Finance', short: 'R/F', maturity: 'coming_soon' },
]

export default function ICPLCPortal({
  config,
  accessTier,
  legacyContent,
  financeAccess,
  onConfigReload,
}) {
  const [activeTab, setActiveTab] = useState('overview')
  const switchTab = setActiveTab

  const isFinanceOnly = accessTier === 'finance_only'
  const canWrite = accessTier === 'admin' || accessTier === 'write'
  const canAdmin = accessTier === 'admin'

  const visibleNewTabs = isFinanceOnly
    ? []
    : NEW_TABS.filter((t) => {
        if (t.key === 'settings') return canAdmin
        if (t.key === 'imports') return canWrite
        return true
      })

  const visibleLegacyTabs = LEGACY_TABS.filter(() => financeAccess || !isFinanceOnly || canAdmin)

  const allTabs = [...visibleNewTabs, ...visibleLegacyTabs]

  const resolvedTab = allTabs.find((t) => t.key === activeTab) ? activeTab
    : allTabs[0]?.key || 'legacy'

  const isLegacyTab = LEGACY_TABS.some((t) => t.key === resolvedTab)
  return (
    <ICPLCProvider config={config} accessTier={accessTier}>
      <div className="icplc-root">
        <header className="icplc-header">
          <div className="icplc-header-left">
            <div className="icplc-header-icon" aria-hidden>✦</div>
            <div>
              <div className="icplc-title">{config?.event_name || 'ICPLC'}</div>
              <div className="icplc-subtitle">International Campus Pastors and Leaders Conference</div>
            </div>
          </div>
          <div className="icplc-header-right">
            <a
              href="https://nexus.lwcanada.org/icplc26"
              target="_blank"
              rel="noopener noreferrer"
              className="icplc-header-link"
              title="Go to ICPLC 26"
            >
              ICPLC 26
            </a>
          </div>
        </header>

        <div className="icplc-tabbar" role="tablist" aria-label="ICPLC sections">
          {allTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={resolvedTab === t.key}
                className="icplc-tab"
                onClick={() => switchTab(t.key)}
              >
                <span className="icplc-tab-label">{t.label}</span>
                <span className="icplc-tab-label-short" aria-hidden>{t.short}</span>
                {t.maturity === 'beta' && (
                  <span className="icplc-maturity-tag icplc-maturity-tag--beta" aria-label="Beta feature">BETA</span>
                )}
                {t.maturity === 'coming_soon' && (
                  <span className="icplc-maturity-tag icplc-maturity-tag--coming-soon" aria-label="Coming soon">SOON</span>
                )}
              </button>
            ))}
        </div>

        <div role="tabpanel" className="icplc-panel">
          {isLegacyTab && (
            <div data-icplc-legacy-tab={resolvedTab}>
              {legacyContent}
            </div>
          )}

          {!isLegacyTab && (
            <div className="icplc-content">
              {resolvedTab === 'overview' && <OverviewPage canWrite={canWrite} onShowPeople={() => switchTab('people')} />}
              {resolvedTab === 'people' && <PeoplePage canWrite={canWrite} />}
              {resolvedTab === 'board' && <BoardPage canWrite={canWrite} />}
              {resolvedTab === 'documentation' && <DocumentationPage canWrite={canWrite} />}
              {resolvedTab === 'travel' && <TravelPage canWrite={canWrite} />}
              {resolvedTab === 'imports' && canWrite && <ImportsPage />}
              {resolvedTab === 'settings' && canAdmin && <SettingsPage onConfigReload={onConfigReload} />}
            </div>
          )}
        </div>
      </div>
    </ICPLCProvider>
  )
}
