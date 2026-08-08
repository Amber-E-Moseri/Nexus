/**
 * Cache utility functions for managing browser storage
 */

const CACHE_KEYS = {
  HIDDEN_SPACES: (userId) => `hidden-space-ids-${userId}`,
  SPACE_TREE_EXPANDED: (userId, spaceId) => `space-tree-expanded-${userId}-${spaceId}`,
  CAMPAIGN_DRAFT: 'comm_draft_campaign_id',
  MY_TASKS_VIEW: 'blw_mytasks_view',
  MY_TASKS_COLLAPSED: 'blw_mytasks_collapsed',
  SIDEBAR_COLLAPSED: 'blw_sidebar_collapsed',
  AI_EXTRACT_SEEN_AT: (meetingId) => `ai-extract-seen-at-${meetingId}`,
}

export { CACHE_KEYS }

export function clearAllAppCache() {
  try {
    // Clear all localStorage entries that start with our app prefixes
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.includes('hidden-space-ids-') ||
          key?.includes('space-tree-expanded-') ||
          key?.startsWith('blw_')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key))

    // Clear all sessionStorage entries
    const sessionKeysToRemove = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.includes('comm_draft') || key?.startsWith('blw_')) {
        sessionKeysToRemove.push(key)
      }
    }
    sessionKeysToRemove.forEach((key) => sessionStorage.removeItem(key))
  } catch (error) {
    console.error('Failed to clear cache:', error)
  }
}

export function getItemSafe(key) {
  try {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : null
  } catch {
    return null
  }
}

export function setItemSafe(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error(`Failed to set cache key ${key}:`, error)
  }
}

export function removeItemSafe(key) {
  try {
    localStorage.removeItem(key)
  } catch (error) {
    console.error(`Failed to remove cache key ${key}:`, error)
  }
}

// IndexedDB helpers for persistent session storage (iOS PWA session recovery)
const DB_NAME = 'nexus'
const DB_VERSION = 1
const STORE_NAME = 'session'
const SESSION_KEY = 'auth-session'
// 30-day TTL — this store is now a migration fallback only (the Supabase SDK
// manages its own IDB-backed session). The TTL just guards against infinitely
// old data sitting in the old store; Supabase handles its own token expiry.
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000 // 30 days

export async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

export async function saveSession(sessionData) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const payload = {
        ...sessionData,
        savedAt: Date.now(),
      }
      const request = store.put(payload, SESSION_KEY)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(payload)
    })
  } catch (error) {
    console.error('Failed to save session to IndexedDB:', error)
    return null
  }
}

export async function loadSession() {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(SESSION_KEY)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const session = request.result
        if (!session) {
          resolve(null)
          return
        }
        // Check TTL: if saved more than SESSION_TTL ago, consider expired
        const age = Date.now() - session.savedAt
        if (age > SESSION_TTL) {
          clearSession() // Async cleanup, don't await
          resolve(null)
        } else {
          resolve(session)
        }
      }
    })
  } catch (error) {
    console.error('Failed to load session from IndexedDB:', error)
    return null
  }
}

export async function clearSession() {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.delete(SESSION_KEY)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  } catch (error) {
    console.error('Failed to clear session from IndexedDB:', error)
  }
}
