# Cache System Analysis

## Overview
The application uses browser storage (localStorage and sessionStorage) to persist user preferences and temporary state. However, the current implementation has several issues related to cache cleanup, data staling, and navigation handling.

---

## Current Cache Usage

### 1. **Sidebar State** (`src/components/layout/Sidebar.jsx`)
**Key**: `hidden-space-ids`  
**Storage**: localStorage  
**Purpose**: Tracks which spaces the user has hidden from view

```javascript
// Lines 252-259: Load on mount
const [hiddenSpaceIds, setHiddenSpaceIds] = useState(() => {
  try {
    const raw = window.localStorage.getItem('hidden-space-ids')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
})

// Lines 280-285: Save on change
useEffect(() => {
  try {
    window.localStorage.setItem('hidden-space-ids', JSON.stringify(hiddenSpaceIds))
  } catch {
    // ignore local preference persistence failures
  }
}, [hiddenSpaceIds])
```

**Issues**:
- ✗ No cleanup when spaces are deleted → stale space IDs remain
- ✗ Persists across sessions → old hidden spaces stay hidden even if re-added
- ✗ No invalidation when user logs out

---

### 2. **Space Tree Expansion** (`src/components/layout/SidebarSpaceTree.jsx`)
**Key**: `space-tree-expanded-{spaceId}` (one per space)  
**Storage**: localStorage  
**Purpose**: Persists which folders are expanded/collapsed in each space's sidebar tree

```javascript
// Lines 27-34: Load on mount
const [expanded, setExpanded] = useState(() => {
  try {
    const raw = window.localStorage.getItem(`space-tree-expanded-${spaceId}`)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
})

// Lines 62-68: Save on change
useEffect(() => {
  try {
    window.localStorage.setItem(`space-tree-expanded-${spaceId}`, JSON.stringify(expanded))
  } catch {
    // ignore
  }
}, [expanded, spaceId])
```

**Issues**:
- ✗ Keys accumulate in localStorage for deleted spaces
- ✗ No cleanup on logout → expansion state visible to next user
- ✗ Multiple keys (one per space) → potential clutter
- ✗ Stale folder/list data not reflected if deleted

---

### 3. **Campaign Draft** (`src/pages/communications/CampaignPage.jsx`)
**Key**: `comm_draft_campaign_id`  
**Storage**: sessionStorage  
**Purpose**: Preserves draft campaign ID during multi-step form

```javascript
// Line 93: Initialize state
const [draftCampaignId, setDraftCampaignId] = useState(initial?.id ?? null)

// Lines 136-139: Save when draft created
if (!err && data) {
  setDraftCampaignId(data.id)
  sessionStorage.setItem('comm_draft_campaign_id', data.id)
}

// Line 247: Only cleared on submit
sessionStorage.removeItem('comm_draft_campaign_id')
```

**Issues**:
- ✗ **CRITICAL**: Not cleared when user navigates away without submitting
- ✗ User can abandon form, then revisit → stale draft ID from previous session
- ✗ No cleanup on logout
- ✗ If user opens campaign page on a different tab/window, cache confusion

**Scenario**: User starts creating campaign (draft ID: `abc123`), navigates away, logs out, logs back in, starts new campaign → old `abc123` ID might be loaded from sessionStorage.

---

### 4. **My Tasks View & Collapse State** (`src/pages/personal/MyTasks.jsx`)
**Keys**: `blw_mytasks_view`, `blw_mytasks_collapsed`  
**Storage**: localStorage  
**Purpose**: Remembers list/board view toggle and which status groups are collapsed

```javascript
// Lines 345-355: Load on mount
function loadCollapsed() {
  try {
    return { ...DEFAULT_COLLAPSED, ...JSON.parse(localStorage.getItem('blw_mytasks_collapsed') ?? '{}') }
  } catch {
    return { ...DEFAULT_COLLAPSED }
  }
}

function loadViewMode() {
  return localStorage.getItem('blw_mytasks_view') ?? 'list'
}

// Lines 412, 418: Save on change
localStorage.setItem('blw_mytasks_view', mode)
localStorage.setItem('blw_mytasks_collapsed', JSON.stringify(next))
```

**Issues**:
- ✓ Relatively benign (UI preferences)
- ~ Persists across logout (minor issue)
- ✗ Could cause confusion if status categories change

---

## Common Issues Across All Caches

### 1. **No Cleanup on Logout**
None of the cache entries are cleared when a user logs out. The next user to log in will see the previous user's cached state.

```javascript
// No cleanup in logout handler
```

### 2. **No Unmount Cleanup**
Components don't have cleanup effects that clear cache when navigating away.

```javascript
// Missing in all components:
useEffect(() => {
  return () => {
    // cleanup cache on unmount
  }
}, [])
```

### 3. **No Cache Invalidation**
If backend data changes (spaces deleted, folders renamed), the cache doesn't refresh. Users must reload the page.

### 4. **No Cache Versioning**
If the cache structure changes during an update, old cache entries cause errors or unexpected behavior.

### 5. **Stale Data Persistence**
Cache from old deleted items (spaces, lists, campaigns) remains forever.

---

## Impact Scenarios

### Scenario A: Shared Computer
**Steps**:
1. Alice logs in, hides spaces, collapses folders
2. Alice logs out
3. Bob logs in
4. Bob sees Alice's hidden spaces and folder expansions ← **BUG**

### Scenario B: Campaign Draft Abandonment
**Steps**:
1. User starts creating campaign (draft ID stored in sessionStorage)
2. User navigates to a different page without submitting
3. User returns to CampaignPage
4. Old draft ID is loaded → form references wrong campaign ← **BUG**

### Scenario C: Deleted Space
**Steps**:
1. User hides Space A
2. Space A deleted by admin
3. User space-tree key remains in localStorage forever
4. Local storage grows unnecessarily

### Scenario D: Multi-Tab Confusion
**Steps**:
1. Tab A: Start creating campaign (stores draft ID)
2. Tab B: Start creating different campaign (overwrites draft ID)
3. Tab A: Submit → references Tab B's campaign ← **BUG**

---

## Recommendations

### HIGH PRIORITY

1. **Clear cache on logout** (`src/hooks/useAuth.js`)
   - Add logout handler that clears all app-specific cache keys
   - Implement whitelist of cache keys to clear

2. **Fix campaign draft cache** (`src/pages/communications/CampaignPage.jsx`)
   - Add cleanup effect on component unmount
   - Use component-level state instead of sessionStorage, or use versioned keys

3. **Scope cache keys** 
   - Include user ID in cache keys (e.g., `hidden-space-ids-${userId}`)
   - Prevents cross-user contamination

### MEDIUM PRIORITY

4. **Add cache versioning**
   - Version cache structure to handle migrations
   - Validate cache before using (type/structure checks)

5. **Implement cache cleanup effects**
   - Clear campaign draft when form closes
   - Clear sidebar state when user logs out

6. **Add cache expiration**
   - sessionStorage items should expire after 1 hour
   - localStorage items should have a version timestamp

### LOW PRIORITY

7. **Add cache stats/debug**
   - Log what's being cached for debugging
   - Add dev tools to inspect/clear cache

8. **Consolidate cache keys**
   - Use a single cache object with version field
   - Easier to manage and clear

---

## Implementation Order

1. **Phase 1**: Clear cache on logout + scope keys by user ID
2. **Phase 2**: Add unmount cleanup in CampaignPage + other forms
3. **Phase 3**: Add cache versioning + validation
4. **Phase 4**: Consider cache TTL/expiration

---

## Files That Need Updates

- `src/hooks/useAuth.js` - Add logout cache clearing
- `src/pages/communications/CampaignPage.jsx` - Add unmount cleanup
- `src/components/layout/Sidebar.jsx` - Scope by user ID
- `src/components/layout/SidebarSpaceTree.jsx` - Scope by user ID, cleanup old keys
- `src/pages/personal/MyTasks.jsx` - Scope by user ID (lower priority)

---

## Testing Checklist

After implementing fixes:
- [ ] Logout clears all UI preferences
- [ ] Login as different user doesn't see previous user's state
- [ ] Abandon campaign form → old draft not loaded on return
- [ ] Delete space → key removed from localStorage
- [ ] Multi-tab: each tab has independent draft state
- [ ] Page reload after deleting a space shows accurate state
