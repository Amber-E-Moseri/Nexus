import React, { useState, useRef, useEffect } from 'react'
import './icplc.css'
import { ICPLCProvider } from './ICPLCContext.jsx'
import OverviewPage from './pages/OverviewPage.jsx'
import PeoplePage from './pages/PeoplePage.jsx'
import NeedsAttentionPage from './pages/NeedsAttentionPage.jsx'
import DocumentationPage from './pages/DocumentationPage.jsx'
import TravelPage from './pages/TravelPage.jsx'
import ImportsPage from './pages/ImportsPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import RegistrationsPage from './pages/RegistrationsPage.jsx'

// maturity: undefined = READY (no tag), 'beta' = BETA tag
const PRIMARY_TABS = [
  { key: 'overview',        label: 'Overview',        short: 'Overview' },
  { key: 'needs_attention', label: 'Needs Attention',  short: 'Attention' },
  { key: 'people',          label: 'People',           short: 'People' },
  { key: 'documentation',   label: 'Documentation',    short: 'Docs' },
  { key: 'travel',          label: 'Travel',           short: 'Travel', maturity: 'beta' },
]

const MANAGE_ITEMS = [
  { key: 'registrations', label: 'Registrations' },
  { key: 'imports',       label: 'Imports',       requiresWrite: true },
  { key: 'settings',      label: 'Settings',      requiresAdmin: true },
]

// Legacy Rooms/Finance — kept in code, removed from primary nav
const LEGACY_KEY = 'legacy'

export default function ICPLCPortal({
  config,
  accessTier,
  scopedSubgroup = null,
  legacyContent,
  financeAccess,
  onConfigReload,
}) {
  const [activeTab, setActiveTab] = useState('overview')
  // People workspace: 'list' | 'board'
  const [peopleView, setPeopleView] = useState('list')

  const isFinanceOnly = accessTier === 'finance_only'
  const canWrite = accessTier === 'admin' || accessTier === 'write'
  const canAdmin = accessTier === 'admin'

  function switchTab(key) {
    // Board alias: redirect to People with Board view (preserves old bookmarks)
    if (key === 'board') {
      setActiveTab('people')
      setPeopleView('board')
      return
    }
    setActiveTab(key)
  }

  const visiblePrimaryTabs = isFinanceOnly ? [] : PRIMARY_TABS

  const visibleManageItems = isFinanceOnly ? [] : MANAGE_ITEMS.filter((item) => {
    if (item.requiresAdmin) return canAdmin
    if (item.requiresWrite) return canWrite
    return true
  })

  const showLegacy = financeAccess || !isFinanceOnly || canAdmin

  const allValidKeys = new Set([
    ...visiblePrimaryTabs.map((t) => t.key),
    ...visibleManageItems.map((i) => i.key),
    ...(showLegacy ? [LEGACY_KEY] : []),
  ])

  const resolvedTab = allValidKeys.has(activeTab)
    ? activeTab
    : visiblePrimaryTabs[0]?.key || visibleManageItems[0]?.key || LEGACY_KEY

  const isLegacyTab = resolvedTab === LEGACY_KEY

  return (
    <ICPLCProvider config={config} accessTier={accessTier} scopedSubgroup={scopedSubgroup}>
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

        {/* Nav row: primary tablist + Manage dropdown */}
        <div className="icplc-nav-row">
          <div className="icplc-tabbar" role="tablist" aria-label="ICPLC sections">
            {visiblePrimaryTabs.map((t) => (
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
              </button>
            ))}
          </div>
          {visibleManageItems.length > 0 && (
            <ManageMenu
              items={visibleManageItems}
              activeTab={resolvedTab}
              onSelect={switchTab}
            />
          )}
        </div>

        {scopedSubgroup && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 20px',
            background: '#F5F0FF',
            borderBottom: '1px solid #E0D5FA',
            fontSize: 12,
            color: '#5B3DA8',
            fontWeight: 500,
          }}>
            <span aria-hidden>🔵</span>
            Viewing <strong>{scopedSubgroup}</strong> — your subgroup
          </div>
        )}
        <div role="tabpanel" className="icplc-panel">
          {isLegacyTab && (
            <div data-icplc-legacy-tab={LEGACY_KEY}>
              {legacyContent}
            </div>
          )}

          {!isLegacyTab && (
            <div className="icplc-content">
              {resolvedTab === 'overview' && (
                <OverviewPage canWrite={canWrite} onShowPeople={() => switchTab('people')} />
              )}
              {resolvedTab === 'needs_attention' && (
                <NeedsAttentionPage canWrite={canWrite} />
              )}
              {resolvedTab === 'people' && (
                <PeoplePage canWrite={canWrite} view={peopleView} onViewChange={setPeopleView} />
              )}
              {resolvedTab === 'documentation' && (
                <DocumentationPage canWrite={canWrite} />
              )}
              {resolvedTab === 'travel' && (
                <TravelPage canWrite={canWrite} />
              )}
              {resolvedTab === 'registrations' && (
                <RegistrationsPage canWrite={canWrite} />
              )}
              {resolvedTab === 'imports' && canWrite && (
                <ImportsPage />
              )}
              {resolvedTab === 'settings' && canAdmin && (
                <SettingsPage onConfigReload={onConfigReload} />
              )}
            </div>
          )}
        </div>
      </div>
    </ICPLCProvider>
  )
}

function ManageMenu({ items, activeTab, onSelect }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const btnRef = useRef(null)
  const isActive = items.some((i) => i.key === activeTab)

  useEffect(() => {
    if (!open) return
    function handleOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      setOpen(false)
      btnRef.current?.focus()
    }
    if (e.key === 'ArrowDown' && !open) {
      e.preventDefault()
      setOpen(true)
    }
  }

  return (
    <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`icplc-tab icplc-tab-manage${isActive ? ' icplc-tab-manage--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleKeyDown}
        aria-label="Manage — administrative tools"
      >
        <span className="icplc-tab-label">Manage</span>
        <span className="icplc-tab-label-short" aria-hidden>Manage</span>
        <span aria-hidden className="icplc-manage-caret">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Manage menu"
          style={{
            position: 'absolute', top: '100%', right: 0, zIndex: 30,
            background: 'var(--icplc-surface)',
            border: '1px solid var(--icplc-border)',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            minWidth: 168,
            padding: '4px 0',
            marginTop: 2,
          }}
        >
          {items.map((item, idx) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              autoFocus={idx === 0}
              onClick={() => { onSelect(item.key); setOpen(false) }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() }
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  const next = menuRef.current?.querySelectorAll('[role="menuitem"]')?.[idx + 1]
                  next?.focus()
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  if (idx === 0) { setOpen(false); btnRef.current?.focus() }
                  else menuRef.current?.querySelectorAll('[role="menuitem"]')?.[idx - 1]?.focus()
                }
              }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 16px',
                background: activeTab === item.key ? 'var(--icplc-purple-bg)' : 'transparent',
                border: 'none', cursor: 'pointer', fontSize: 13,
                color: activeTab === item.key ? 'var(--icplc-purple)' : 'var(--icplc-text)',
                fontWeight: activeTab === item.key ? 600 : 400,
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
