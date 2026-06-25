import { useState, useEffect } from 'react'
import { X, Download } from 'lucide-react'
import { usePWA } from '../hooks/usePWA'

export function PWAInstallPrompt() {
  const { isInstallable, install } = usePWA()
  const [visible, setVisible] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    setVisible(isInstallable)
  }, [isInstallable])

  if (!visible) {
    return null
  }

  const handleInstall = async () => {
    setInstalling(true)
    try {
      const success = await install()
      if (success) {
        setVisible(false)
      }
    } catch (err) {
      console.error('Installation failed:', err)
    } finally {
      setInstalling(false)
    }
  }

  const handleDismiss = () => {
    setVisible(false)
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm animate-in slide-in-from-bottom-4">
      <div className="rounded-xl bg-white shadow-lg border border-[var(--border)] p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-1">
              Install BLW Nexus
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              Add the app to your home screen for quick access and offline support.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleInstall}
                disabled={installing}
                className="flex items-center gap-2 px-3 py-1.5 bg-[var(--accent)] text-white text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition"
              >
                <Download size={14} />
                {installing ? 'Installing...' : 'Install'}
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 bg-[var(--surface-secondary)] text-[var(--text-secondary)] text-xs font-medium rounded-lg hover:bg-[var(--border)] transition"
              >
                Not Now
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
