import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

/**
 * Convert VAPID key from URL-safe base64 to Uint8Array
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Check if browser supports push notifications
 */
export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && VAPID_PUBLIC_KEY
}

/**
 * Request notification permission and subscribe to push
 */
export async function requestPushPermission() {
  if (!pushSupported()) {
    console.warn('Browser does not support push notifications')
    return false
  }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.log('User denied push notification permission')
      return false
    }

    // Subscribe to push
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    })

    // Save subscription to Supabase
    const { data: user } = await supabase.auth.getUser()
    if (!user?.id) {
      console.error('No authenticated user found')
      return false
    }

    const { error } = await supabase
      .from('users')
      .update({
        push_subscription: subscription.toJSON(),
        push_subscribed_at: new Date().toISOString(),
        push_enabled: true
      })
      .eq('id', user.id)

    if (error) {
      console.error('Failed to save subscription to database:', error)
      await subscription.unsubscribe()
      return false
    }

    console.log('Push subscription saved successfully')
    return true
  } catch (err) {
    console.error('Failed to request push permission:', err)
    return false
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribePush() {
  if (!pushSupported()) {
    return true
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()

    if (subscription) {
      await subscription.unsubscribe()
    }

    // Update Supabase
    const { data: user } = await supabase.auth.getUser()
    if (user?.id) {
      await supabase
        .from('users')
        .update({
          push_subscription: null,
          push_enabled: false
        })
        .eq('id', user.id)
    }

    console.log('Push subscription removed')
    return true
  } catch (err) {
    console.error('Failed to unsubscribe from push:', err)
    return false
  }
}

/**
 * Check if push is currently enabled for this user
 */
export async function isPushEnabled() {
  if (!pushSupported()) {
    return false
  }

  try {
    const permission = Notification.permission
    if (permission !== 'granted') {
      return false
    }

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return subscription !== null
  } catch {
    return false
  }
}

/**
 * Get current push subscription status
 */
export async function getPushStatus() {
  if (!pushSupported()) {
    return {
      supported: false,
      permission: 'denied',
      subscribed: false
    }
  }

  try {
    const permission = Notification.permission
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()

    return {
      supported: true,
      permission,
      subscribed: subscription !== null
    }
  } catch (err) {
    console.error('Failed to get push status:', err)
    return {
      supported: true,
      permission: 'error',
      subscribed: false
    }
  }
}
