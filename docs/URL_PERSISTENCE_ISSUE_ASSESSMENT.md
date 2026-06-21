# URL Persistence Issue Assessment

## Problem Statement
Subgroup selection via URL query parameter (`?subgroup=SubgroupName`) is **not persisting** in the public report view. When user clicks a subgroup tab, the URL bar does not update.

---

## Current Code Flow

### 1. State & Initialization (Lines 148-149)
```javascript
const [activeSubgroup, setActiveSubgroup] = useState('')
const isInitialMount = useRef(true)
```
- activeSubgroup initialized to empty string ✓
- useRef for tracking mount status ✓

### 2. Mount Effect - Read URL Params (Lines 151-159)
```javascript
useEffect(() => {
  const subgroupFromUrl = searchParams.get('subgroup') || ''
  console.log('Reading subgroup from URL:', subgroupFromUrl)
  if (subgroupFromUrl !== activeSubgroup) {
    setActiveSubgroup(subgroupFromUrl)
  }
  isInitialMount.current = false
}, [])  // ← Only runs on mount
```
**Status:** ✓ Correct
- Reads URL param on mount
- Sets activeSubgroup if param exists
- Marks initial mount complete

### 3. Sync Effect - Update URL (Lines 161-179)
```javascript
useEffect(() => {
  console.log('useEffect fired. isInitialMount:', isInitialMount.current, 'activeSubgroup:', activeSubgroup)
  if (isInitialMount.current) {
    console.log('Skipping - still on initial mount')
    return
  }

  console.log('✓ activeSubgroup changed to:', activeSubgroup)

  if (activeSubgroup) {
    const newUrl = `${window.location.pathname}?subgroup=${encodeURIComponent(activeSubgroup)}`
    console.log('✓ Updating URL to:', newUrl)
    window.history.replaceState(null, '', newUrl)
  } else {
    console.log('✓ Clearing URL params')
    window.history.replaceState(null, '', window.location.pathname)
  }
}, [activeSubgroup])  // ← Dependency array has only activeSubgroup
```
**Status:** ⚠️ Potentially Correct Code

### 4. Data Filtering (Lines 253-287)
```javascript
const visibleReport = useMemo(() => {
  if (!report) return null
  
  // If no subgroup filtering or activeSubgroup not set, show all data
  if (!activeSubgroup || !report.bySubgroup || !report.bySubgroup[activeSubgroup]) {
    return { /* aggregate data */ }
  }
  
  // Show data for selected subgroup
  const subgroupData = report.bySubgroup[activeSubgroup]
  return { /* subgroup-filtered data */ }
}, [report, activeSubgroup])
```
**Status:** ✓ Correct - filtering logic is sound

### 5. Subgroup Tab Click Handlers (Lines 428, 447)
```javascript
// All button
onClick={() => setActiveSubgroup('')}

// Individual subgroup button
onClick={() => setActiveSubgroup(subgroup)}
```
**Status:** ✓ Correct - updating state properly

---

## Issue Assessment

### What Should Happen (Expected Flow)
1. User clicks subgroup tab → `setActiveSubgroup(subgroupName)`
2. State updates → component re-renders
3. Sync effect (line 161) detects activeSubgroup changed
4. Logs show "✓ Updating URL to: ..."
5. `window.history.replaceState()` updates URL bar
6. URL now shows `?subgroup=SubgroupName`
7. Data filters via visibleReport memoization
8. Share Report modal includes new URL

### What's Actually Happening (Observed)
- State updates (tabs highlight correctly)
- Data filters (KPI numbers change) ✓
- **BUT:** URL bar does NOT update ❌

### Root Cause Analysis

**Hypothesis 1: Effect not firing**
- Check console: Does "✓ Updating URL to:" log appear?
- If NO → effect is returning early (still on mount?)
- If YES → effect fires but replaceState doesn't work

**Hypothesis 2: replaceState not working**
- Most likely issue: `window.history.replaceState()` might not be triggering browser UI update
- Or React Router might be intercepting/ignoring the URL change

**Hypothesis 3: React Router interference**
- React Router might be monitoring URL changes and reverting them
- Or preventing manual history manipulation

---

## Diagnostic Checklist

### Console Check
When you click a subgroup tab, look for:
- [ ] "useEffect fired. isInitialMount: false activeSubgroup: ..." → Effect IS firing
- [ ] "✓ activeSubgroup changed to: ..." → activeSubgroup IS updating
- [ ] "✓ Updating URL to: ..." → Code IS reaching replaceState call
- [ ] If these don't appear → Effect is not firing (likely stuck on mount)

### URL Check
- [ ] Does URL change in address bar? (Most critical)
- [ ] Does page reload when clicking tab? (If yes, router is re-routing)
- [ ] Can you manually paste `?subgroup=Youth` in URL? (If yes, feature exists but sync is broken)

### Data Check
- [ ] Do KPI numbers change when clicking tab? (YES - data filtering works)
- [ ] Do names in tables change? (YES - filtering works)
- [ ] Only URL fails to update (The issue)

---

## Possible Solutions to Try

### Solution A: Remove React Router - Use Direct History API
Replace entire sync effect with simpler approach:
```javascript
useEffect(() => {
  if (isInitialMount.current) return
  
  const url = new URL(window.location)
  if (activeSubgroup) {
    url.searchParams.set('subgroup', activeSubgroup)
  } else {
    url.searchParams.delete('subgroup')
  }
  window.history.replaceState({}, '', url)
}, [activeSubgroup])
```

### Solution B: Disable React Router Route Matching
Problem: React Router might monitor URL changes and interpret them as navigation
- May need to prevent React Router from handling the URL change
- Or use a router-aware API instead of raw History API

### Solution C: Store subgroup in Context/Session
Skip URL entirely:
- Store selection in React Context
- Or localStorage
- But this breaks deep-linking (original requirement)

### Solution D: Use React Router's useNavigate Differently
```javascript
// Instead of navigate with replace:true
navigate(`?subgroup=${activeSubgroup}`, { replace: true, state: { preserveScroll: true } })
```

---

## Questions to Answer Before Proceeding

1. **What console logs appear when you click a tab?**
   - This tells us if effect is firing

2. **Does the data filter correctly?**
   - Yes (observed) → filtering logic is fine, only URL sync is broken

3. **Can you manually add `?subgroup=Youth` to URL?**
   - Test: Type in address bar, press Enter
   - Does it work? (loads with Youth selected)
   - This confirms feature can work, just not auto-sync

4. **Are you using other URL params elsewhere?**
   - Are there other features using `?list=` or similar?
   - How do they persist URL state?

---

## Next Steps

**Before trying solutions:**
1. Check the 4 console questions above
2. Share the exact console output
3. This will reveal if it's:
   - Effect not firing (mount tracking issue)
   - replaceState not working (browser API issue)
   - React Router intercepting (routing issue)

Once we know which, the fix is straightforward.

