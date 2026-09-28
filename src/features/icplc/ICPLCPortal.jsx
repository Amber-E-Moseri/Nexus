import React, { useState } from 'react'
import {
  AlertTriangle,
  ClipboardList,
  FileText,
  FolderInput,
  LayoutDashboard,
  Plane,
  Settings,
  TableProperties,
  Users,
} from 'lucide-react'
import './icplc.css'
import { ICPLCProvider } from './ICPLCContext.jsx'
import OverviewPage from './pages/OverviewPage.jsx'
import PeoplePage from './pages/PeoplePage.jsx'
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
  { key: 'overview',      label: 'Overview',        short: 'Overview', icon: LayoutDashboard },
  { key: 'people',        label: 'Working List',    short: 'List',     icon: Users },
  { key: 'board',         label: 'Board',           short: 'Board',    icon: TableProperties },
  { key: 'documentation', label: 'Documentation',   short: 'Docs',     icon: FileText },
  { key: 'travel',        label: 'Travel',          short: 'Travel',   icon: Plane },
  { key: 'attention',     label: 'Needs Attention', short: 'Alerts',   icon: AlertTriangle },
  { key: 'imports',       label: 'Imports',         short: 'Imports',  icon: FolderInput },
  { key: 'settings',      label: 'Settings',        short: 'Settings', icon: Settings },
]

// Single legacy tab — RegistrationEcosystem handles its own sub-navigation
// (rooms / transport / finance). Collapsing to one prevents three outer tabs
// from all rendering the same legacyContent instance with no internal navigation.
const LEGACY_TABS = [
  { key: 'legacy', label: 'Room / Transport / Finance', short: 'R/T/F', icon: ClipboardList },
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
  const accessLabel = accessTier === 'admin'
    ? 'Admin'
    : accessTier === 'write'
      ? 'Edit access'
      : accessTier === 'finance_only'
        ? 'Finance'
        : 'Read only'

  return (
    <ICPLCProvider config={config} accessTier={accessTier}>
      <div className="icplc-root">
        <header className="icplc-header">
          <div>
            <div className="icplc-title">{config?.event_name || 'ICPLC'}</div>
            <div className="icplc-subtitle">International Cell Leaders Pastors Conference</div>
          </div>
          <div className="icplc-header-stats" aria-label="ICPLC access and scope">
            <span>{accessLabel}</span>
            <span>{isFinanceOnly ? 'Finance workspace' : 'Operations workspace'}</span>
          </div>
        </header>

        {/* Tab bar — scrolls inside itself on narrow screens */}
        <div className="icplc-tabbar" role="tablist" aria-label="ICPLC sections">
          {allTabs.map((t) => {
            const isLegacy = LEGACY_TABS.some((l) => l.key === t.key)
            const Icon = t.icon
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={resolvedTab === t.key}
                className="icplc-tab"
                onClick={() => setActiveTab(t.key)}
                style={{ opacity: isLegacy ? 0.7 : 1 }}
              >
                {Icon && <Icon size={14} aria-hidden />}
                <span className="icplc-tab-label">{t.label}</span>
                <span className="icplc-tab-label-short" aria-hidden>{t.short}</span>
              </button>
            )
          })}
        </div>

        {/* Page body */}
        <div role="tabpanel" className="icplc-panel">
          {/* Legacy tabs — render the injected RegistrationEcosystem content */}
          {isLegacyTab && (
            <div data-icplc-legacy-tab={resolvedTab}>
              {legacyContent}
            </div>
          )}

          {/* New ICPLC operational tabs */}
          {!isLegacyTab && (
            <div className="icplc-content">
              {resolvedTab === 'overview' && <OverviewPage canWrite={canWrite} onShowPeople={() => setActiveTab('people')} onShowAttention={() => setActiveTab('attention')} />}
              {resolvedTab === 'people' && <PeoplePage canWrite={canWrite} />}
              {resolvedTab === 'board' && <BoardPage canWrite={canWrite} />}
              {resolvedTab === 'documentation' && <DocumentationPage canWrite={canWrite} />}
              {resolvedTab === 'travel' && <TravelPage canWrite={canWrite} />}
              {resolvedTab === 'attention' && <NeedsAttentionPage canWrite={canWrite} />}
              {resolvedTab === 'imports' && canWrite && <ImportsPage />}
              {resolvedTab === 'settings' && canAdmin && <SettingsPage />}
            </div>
          )}
        </div>
      </div>
    </ICPLCProvider>
  )
}
