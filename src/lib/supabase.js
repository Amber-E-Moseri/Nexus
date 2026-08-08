import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// --- IndexedDB storage adapter for Supabase auth ---
// Supabase's default storage (localStorage) is unreliable in iOS/Android PWA
// standalone mode: each installed app gets its own isolated storage context,
// separate from the browser it was installed from. IndexedDB is more durable
// and survives background suspension on both iOS and Android.
// The SDK stores session as a serialised string; we store/retrieve as-is.

const AUTH_IDB_NAME  = 'nexus-auth'
const AUTH_IDB_STORE = 'kv'

let _authDB = null

function _openAuthDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(AUTH_IDB_NAME, 1)
    req.onerror       = () => reject(req.error)
    req.onsuccess     = () => resolve(req.result)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(AUTH_IDB_STORE)) {
        db.createObjectStore(AUTH_IDB_STORE)
      }
    }
  })
}

async function getAuthDB() {
  if (!_authDB) _authDB = await _openAuthDB()
  return _authDB
}

// Safe localStorage accessor — returns null in Node/SSR environments
const _ls = {
  get:    (k) => typeof localStorage !== 'undefined' ? localStorage.getItem(k)    : null,
  set:    (k, v) => typeof localStorage !== 'undefined' ? localStorage.setItem(k, v)  : undefined,
  remove: (k) => typeof localStorage !== 'undefined' ? localStorage.removeItem(k) : undefined,
}

const idbAuthStorage = {
  async getItem(key) {
    if (typeof indexedDB === 'undefined') return _ls.get(key)
    try {
      const db = await getAuthDB()
      return new Promise((resolve, reject) => {
        const tx  = db.transaction(AUTH_IDB_STORE, 'readonly')
        const req = tx.objectStore(AUTH_IDB_STORE).get(key)
        req.onerror   = () => reject(req.error)
        req.onsuccess = () => resolve(req.result ?? null)
      })
    } catch {
      return _ls.get(key)
    }
  },

  async setItem(key, value) {
    if (typeof indexedDB === 'undefined') { _ls.set(key, value); return }
    try {
      const db = await getAuthDB()
      await new Promise((resolve, reject) => {
        const tx  = db.transaction(AUTH_IDB_STORE, 'readwrite')
        const req = tx.objectStore(AUTH_IDB_STORE).put(value, key)
        req.onerror   = () => reject(req.error)
        req.onsuccess = () => resolve()
      })
    } catch {
      _ls.set(key, value)
    }
  },

  async removeItem(key) {
    if (typeof indexedDB === 'undefined') { _ls.remove(key); return }
    try {
      const db = await getAuthDB()
      await new Promise((resolve, reject) => {
        const tx  = db.transaction(AUTH_IDB_STORE, 'readwrite')
        const req = tx.objectStore(AUTH_IDB_STORE).delete(key)
        req.onerror   = () => reject(req.error)
        req.onsuccess = () => resolve()
      })
    } catch {
      _ls.remove(key)
    }
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: idbAuthStorage,
  },
})
