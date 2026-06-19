/**
 * Cache utility functions for managing browser storage
 */

const CACHE_KEYS = {
  HIDDEN_SPACES: (userId) => `hidden-space-ids-${userId}`,
  SPACE_TREE_EXPANDED: (userId, spaceId) => `space-tree-expanded-${userId}-${spaceId}`,
  CAMPAIGN_DRAFT: 'comm_draft_campaign_id',
  MY_TASKS_VIEW: 'blw_mytasks_view',
  MY_TASKS_COLLAPSED: 'blw_mytasks_collapsed',
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
