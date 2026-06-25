import { usePWA } from '../hooks/usePWA'
import { Wifi, WifiOff } from 'lucide-react'

export function OfflineIndicator() {
  const { isOnline } = usePWA()

  if (isOnline) {
    return null
  }

  return (
    <div className="fixed top-0 left-0 right-0 bg-yellow-50 border-b border-yellow-200 px-4 py-2 z-50">
      <div className="flex items-center gap-2 max-w-7xl mx-auto">
        <WifiOff size={16} className="text-yellow-700" />
        <span className="text-sm font-medium text-yellow-800">
          You're offline — some features may be limited
        </span>
      </div>
    </div>
  )
}
