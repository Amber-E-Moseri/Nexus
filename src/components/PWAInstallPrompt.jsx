import { useState, useEffect } from 'react'
import { X, Download, Share } from 'lucide-react'
import { usePWA } from '../hooks/usePWA'

const DISMISSED_KEY = 'blw_pwa_install_dismissed'
const IOS_DISMISSED_KEY = 'blw_ios_install_dismissed'

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
}

export function PWAInstallPrompt() {
  const { isInstallable, isInstalled, install } = usePWA()
  const [visible, setVisible] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISSED_KEY) === 'true'
    const iosDismissed = localStorage.getItem(IOS_DISMISSED_KEY) === 'true'

    if (isInstalled || isStandalone()) {
      setVisible(false)
      setShowIOSGuide(false)
      return
    }

    if (isIOS() && !iosDismissed) {
      // iOS never fires beforeinstallprompt — show manual instructions instead
      setShowIOSGuide(true)
      setVisible(true)
      return
    }

    if (!dismissed) {
      setVisible(isInstallable)
    }
  }, [isInstallable, isInstalled])

  if (!visible) return null

  const handleDismiss = () => {
    if (showIOSGuide) {
      localStorage.setItem(IOS_DISMISSED_KEY, 'true')
    } else {
      localStorage.setItem(DISMISSED_KEY, 'true')
    }
    setVisible(false)
  }

  const handleInstall = async () => {
    setInstalling(true)
    try {
      const success = await install()
      if (success) {
        localStorage.setItem(DISMISSED_KEY, 'true')
        setVisible(false)
      }
    } catch (err) {
      console.error('Installation failed:', err)
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      zIndex: 9999,
      maxWidth: 320,
      borderRadius: 12,
      background: 'var(--surface)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
      border: '1px solid var(--border)',
      padding: '14px 16px',
    }}>
      <button
        onClick={handleDismiss}
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-tertiary)',
          padding: 2,
        }}
        aria-label="Dismiss"
      >
        <X size={15} />
      </button>

      {showIOSGuide ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Share size={16} color="var(--accent)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Add to Home Screen
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
            To get push notifications on iPhone, install the app:
          </p>
          <ol style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8, margin: '8px 0 0 0', paddingLeft: 18 }}>
            <li>Tap the <strong>Share</strong> button in Safari</li>
            <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
            <li>Tap <strong>Add</strong> to confirm</li>
          </ol>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
            Install BLW Nexus
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
            Add to your home screen for push notifications and offline access.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleInstall}
              disabled={installing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: installing ? 'not-allowed' : 'pointer',
                opacity: installing ? 0.6 : 1,
              }}
            >
              <Download size={13} />
              {installing ? 'Installing…' : 'Install'}
            </button>
            <button
              onClick={handleDismiss}
              style={{
                padding: '6px 12px',
                background: 'var(--surface-secondary)',
                color: 'var(--text-secondary)',
                border: 'none',
                borderRadius: 8,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Not Now
            </button>
          </div>
        </>
      )}
    </div>
  )
}
