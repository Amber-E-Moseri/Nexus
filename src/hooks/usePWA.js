import { useEffect, useState, useCallback } from 'react'

export function usePWA() {
  const [isInstallable, setIsInstallable] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false)

  // Check if app is installed (PWA or native)
  useEffect(() => {
    const checkInstalled = async () => {
      if ('getInstalledRelatedApps' in navigator) {
        try {
          const apps = await navigator.getInstalledRelatedApps()
          setIsInstalled(apps.length > 0)
        } catch (err) {
          console.warn('Failed to check installed apps:', err)
        }
      }

      // Check display mode
      if (window.matchMedia('(display-mode: standalone)').matches) {
        setIsInstalled(true)
      }
    }

    checkInstalled()
  }, [])

  // Listen for beforeinstallprompt event
  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setDeferredPrompt(event)
      setIsInstallable(true)
    }

    const handleAppInstalled = () => {
      setIsInstallable(false)
      setIsInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Check service worker status
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(() => {
        setServiceWorkerReady(true)
      });
    }
  }, [])

  // Trigger install prompt
  const install = useCallback(async () => {
    if (!deferredPrompt) {
      return false
    }

    try {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      setDeferredPrompt(null)
      setIsInstallable(false)
      return outcome === 'accepted'
    } catch (err) {
      console.error('Installation failed:', err)
      return false
    }
  }, [deferredPrompt])

  // Subscribe to push notifications
  const subscribeToPush = useCallback(async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push notifications not supported')
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.REACT_APP_VAPID_PUBLIC_KEY,
      })

      // Send subscription to backend
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      })

      return await response.json()
    } catch (err) {
      console.error('Failed to subscribe to push:', err)
      throw err
    }
  }, [])

  // Request notification permission
  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      throw new Error('Notifications not supported')
    }

    if (Notification.permission === 'granted') {
      return 'granted'
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        await subscribeToPush()
      }
      return permission
    }

    return 'denied'
  }, [subscribeToPush])

  // Check if notification permission granted
  const notificationPermission = () => {
    if (!('Notification' in window)) return 'denied'
    return Notification.permission
  }

  return {
    isInstallable,
    isInstalled,
    isOnline,
    serviceWorkerReady,
    install,
    subscribeToPush,
    requestNotificationPermission,
    notificationPermission: notificationPermission(),
    hasDeferredPrompt: !!deferredPrompt,
  }
}
