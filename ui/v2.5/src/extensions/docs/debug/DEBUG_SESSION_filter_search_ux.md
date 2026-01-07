# Debug Session: Filter Search UX Issues

## Session Summary (2026-01-06)

**Status:** ✅ COMPLETE - All fixes verified via Docker deployment

**Original Problem:** When typing in sidebar filter search boxes (Tags, Performers, etc.):
1. Items jump from count-sorted to alphabetical order - ✅ REVISED to alphabetical (intentional)
2. Counts disappear temporarily - ✅ FIXED with "n/a" indicator for unavailable counts
3. No loading indicator while search is in progress - ✅ FIXED
4. Search query is slow (~5+ seconds) - ✅ FIXED & VERIFIED

---

## Root Cause Analysis

### Issue 1: Alphabetical Sorting During Search (REVISED)
Initially fixed to sort by count, but later **changed to alphabetical sorting** because:
- Most search results don't have counts (outside top 100 facets)
- Alphabetical is more predictable when searching by name
- Counts are shown as supplementary info, not the primary sort

**Final Fix:** Sort search results alphabetically by label in all 5 filter components.

### Issue 2: No Loading Indicator During Search (VERIFIED WORKING)
When search query is loading, stale facet data was shown instead of a loading spinner.

**Fix:** Added early return when `hasSearchQuery && state.loading` to show only modifier options, triggering the loading spinner.

**Status (2026-01-06 Session 3):** ✅ FIX VERIFIED WORKING on dev server (port 3000)
- Console logs confirm: `hasSearchQuery: true state.loading: true state.query: bru`
- Loading indicator logic is triggered: `Returning modifierOptions for loading state`
- The fix works correctly when code is fresh from source

**Why it didn't work on port 9999:**
- Port 9999 is the production Stash server (Go binary)
- The Go binary **embeds** the UI at build time
- Even after `npm run build`, must rebuild Go binary with `mingw32-make stash`
- Then **restart** the running stash.exe process to serve new code
- The browser was loading stale cached bundle (`index-DVu4oGQN.js`) from old build

**Port Differences:**
| Port | Server | Hot Reload | Use Case |
|------|--------|------------|----------|
| 3000 | Vite dev server | Yes | Development - serves source directly |
| 9999 | Stash Go binary | No | Production - embedded UI in binary |

**Debug console.log added at TagsFilter.tsx:133:**
```typescript
console.log('[TagsFilter] hasSearchQuery:', hasSearchQuery, 'state.loading:', state.loading, 'state.query:', state.query);
```

**Root Cause (RESOLVED):** The fix was working all along - we were just testing against stale code on port 9999

### Issue 2 & 3: Counts Disappear / Missing Counts (INVESTIGATED - Session 4)

**What the user sees:**
- Before searching: All items show counts (Brunette 306,340, Blowjob 272,919, etc.)
- After searching for "b": Some items have counts, others don't (Babes, Babydoll, Babysitter - no counts)

**Root Cause:** This is **expected behavior**, not a bug. The facet query only returns top 100 items with counts. When searching:
- Items IN the facet cache (top 100) → show counts
- Items OUTSIDE the facet cache → show no counts

**Example from testing (search "b"):**
```
WITH counts (from facet cache):
- Brunette (306,340)
- Blowjob (272,919)
- Big Tits (205,665)

WITHOUT counts (outside top 100):
- Babes - no count
- Babydoll - no count
- Babysitter - no count
```

**The "disappearing" perception:** Users see all counts before searching (because only facet items are shown), then see mixed results after searching.

**Possible solutions:**
1. **Accept limitation** - Items without counts sorted to bottom (current behavior)
2. **Fetch individual counts** - Query counts for each search result (expensive, ~N queries)
3. **Increase facet limit** - Return more than 100 items (memory/performance tradeoff)
4. **Client-side indication** - Show "?" or dash instead of blank for items without counts
5. **Hybrid query** - For search results not in cache, do a batch count query

**Recommendation:** Option 4 (visual indication) is low-effort UX improvement. Option 5 would be ideal but more complex.

### Issue 4: Slow Search Query (FIXED - Session 4)
The search query was slow because `setObjectFilter()` adds `scenes_filter` with ALL current filters to the tag/performer/etc. search query.

**Root Cause:** `queryVariables()` in each filter component called `setObjectFilter()` unconditionally, adding the full filter criteria even when user is typing a search query.

**Location:** Each filter's `queryVariables()` function:
- `TagsFilter.tsx:31-51`
- `PerformersFilter.tsx:32-55`
- `StudiosFilter.tsx:33-45`
- `GroupsFilter.tsx:30-42`
- `PerformerTagsFilter.tsx:31-56`

**The slow query pattern:**
```typescript
// Before fix - always added scenes_filter:
if (f) {
  const filterOutput = f.makeFilter();
  setObjectFilter(tagFilter, f.mode, filterOutput, "tags");
}
```

This generated SQL like:
```sql
SELECT * FROM tags
INNER JOIN scenes_tags ON scenes_tags.tag_id = tags.id
WHERE scenes_tags.scene_id IN (
    SELECT scenes.id FROM scenes
    WHERE studios.id = ... AND performers.id = ...
)
AND tags.name LIKE '%bru%'
```

**The Fix:** Skip `scenes_filter` when user is searching. Counts come from pre-loaded facet cache.

```typescript
// After fix - only add scenes_filter when NOT searching:
if (f && !query) {
  const filterOutput = f.makeFilter();
  setObjectFilter(tagFilter, f.mode, filterOutput, "tags");
}
```

**Why this works:**
1. Facet cache already provides accurate counts for top 100 items
2. Search results merge with facet cache to show counts (line 159 in TagsFilter)
3. Items outside top 100 show `count: undefined` and appear at bottom
4. The trade-off is acceptable: fast search vs slightly less accurate results

**Expected Performance Improvement:**
- Before: ~5+ seconds (full filter evaluation across all scenes)
- After: ~100-500ms (simple name/alias search)

---

## Files Modified

| File | Changes |
|------|---------|
| `TagsFilter.tsx` | Added sort, added loading check, added `state.loading` to deps, **skip scenes_filter when searching**, removed debug console.log |
| `PerformersFilter.tsx` | Added sort, added loading check, added `state.loading` to deps, **skip scenes_filter when searching** |
| `StudiosFilter.tsx` | Added sort, added loading check, added `state.loading` to deps, **skip scenes_filter when searching** |
| `GroupsFilter.tsx` | Added sort, added loading check, added `state.loading` to deps, **skip scenes_filter when searching** |
| `PerformerTagsFilter.tsx` | Added sort, added loading check, added `state.loading` to deps, **skip scenes_filter when searching** |
| `SidebarListFilter.tsx` | **Added "n/a" indicator for items without counts** (count-unavailable class) |
| `_list-components.scss` | **Added `.count-unavailable` styling** (dimmed, italic) |

---

## Code Changes Made

### 1. Sort Search Results Alphabetically
Added to all 5 filter files in the `else` branch (when `hasSearchQuery` is true):

```typescript
.sort((a, b) => {
  // Modifiers stay at top
  if (a.className === "modifier-object") return -1;
  if (b.className === "modifier-object") return 1;
  // Sort alphabetically by label during search
  return a.label.localeCompare(b.label);
});
```

### 2. Show Loading During Search
Added to all 5 filter files before the main if/else:

```typescript
// When search is in progress, return only modifiers to show loading indicator
if (hasSearchQuery && state.loading) {
  return modifierOptions;
}
```

### 3. Updated Dependency Arrays
Added `state.loading` to useMemo dependency arrays in all 5 files.

### 4. Debug Console Logging (TagsFilter.tsx only)
Added at line 133:
```typescript
console.log('[TagsFilter] hasSearchQuery:', hasSearchQuery, 'state.loading:', state.loading, 'state.query:', state.query);
```

### 5. Visual Indicator for Unavailable Counts (Session 5)
Added to `SidebarListFilter.tsx` in the `CandidateItem` component:

```typescript
) : !modifier ? (
  <span className="object-count count-unavailable" title="Count unavailable (outside top results)">
    n/a
  </span>
) : null}
```

**Note:** Changed from "—" (em dash) to "n/a" to avoid confusion with loading indicator.

Added CSS styling in `_list-components.scss`:

```scss
&.count-unavailable {
  opacity: 0.35;
  font-style: italic;
}

.object-count.count-unavailable {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.05);
  padding: 0.1rem 0.4rem;
  border-radius: 0.75rem;
  min-width: 1.5rem;
  text-align: center;
  font-style: italic;
}
```

### 6. Skip scenes_filter When Searching (Session 4)
Modified `queryVariables()` in all 5 filter files to skip the expensive filter when user is typing:

```typescript
// Only apply scenes_filter when NOT searching (query is empty)
// When searching, skip the expensive filter - counts come from facet cache
if (f && !query) {
  const filterOutput = f.makeFilter();
  // ... process filter ...
  setObjectFilter(tagFilter, f.mode, filterOutput, "tags");
}
```

---

## Testing Done

### Session 2 (port 9999 - stale build)
- Built frontend: `npm run build` - SUCCESS
- Built Go binary: `mingw32-make stash` - SUCCESS
- Tested in browser at http://localhost:9999/scenes
- Opened Tags filter, typed "bru"
- Results:
  - Brunette (306,340) sorted first by count - WORKING
  - Big Tits (205,665) second - WORKING
  - Items without counts at end - WORKING
  - Loading indicator during search - NOT WORKING (server was running old binary)

### Session 3 (port 3000 - dev server)
- Tested in browser at http://localhost:3000/scenes (Vite dev server)
- Opened Tags filter, typed "bru"
- Console output confirmed fix is working:
  ```
  [TagsFilter] hasSearchQuery: true state.loading: true state.query: bru
  [TagsFilter] Returning modifierOptions for loading state
  ```
- **Loading indicator - ✅ VERIFIED WORKING**

### Session 4 (port 3000 - performance fix verification)
- Modified `queryVariables()` in all 5 filter files to skip `scenes_filter` when searching
- Tested in browser at http://localhost:3000/scenes
- Opened Tags filter, typed "bru"
- Results appeared **almost instantly** (vs. ~5+ seconds before)
- Console output confirmed loading state:
  ```
  [TagsFilter] hasSearchQuery: true state.loading: true state.query: bru
  [TagsFilter] Returning modifierOptions for loading state
  [TagsFilter] hasSearchQuery: true state.loading: false state.query: bru
  ```
- Results correctly sorted by count:
  - Brunette (306,340) - count from facet cache
  - Big Tits (205,665) - count from facet cache
  - Brunette (Female) - no count (outside top N facets)
  - Brunette (Male) - no count
  - Brutal - no count
- **Performance fix - ✅ VERIFIED WORKING**

---

## Remaining Work

### Must Do
- [x] **Debug loading indicator** - ✅ VERIFIED WORKING on port 3000
- [x] **Improve search query speed** - ✅ FIXED & VERIFIED on port 3000 (Session 4)
- [x] **Investigate Issue 2 (counts disappear)** - ✅ INVESTIGATED - expected behavior (Session 4)
- [x] Remove debug console.log statements from TagsFilter.tsx - ✅ REMOVED
- [x] **Counts UX** - ✅ IMPLEMENTED Option 4: Show "n/a" for items without counts
- [x] **Sorting decision** - ✅ Changed to alphabetical sorting during search (more predictable)
- [x] **Verify all 5 filters work** - ✅ VERIFIED via Docker deployment (2026-01-06)
- [x] **Final verification** - ✅ COMPLETE - Deployed to `cj1213/plex:latest`

### Nice to Have
- [ ] Increase facet limit from 100 to higher value

---

## Key Code Locations

| Purpose | File:Line |
|---------|-----------|
| Tag filter component | `extensions/filters/TagsFilter.tsx:97-195` |
| Loading check (our fix) | `extensions/filters/TagsFilter.tsx:133-139` |
| Search query builder | `extensions/filters/TagsFilter.tsx:31-49` |
| QueryField (250ms debounce) | `extensions/filters/SidebarListFilter.tsx:203-233` |
| setObjectFilter (adds scenes_filter) | `extensions/filters/LabeledIdFilter.tsx:531-591` |
| SidebarListFilter (renders list) | `extensions/filters/SidebarListFilter.tsx` |
| Loading spinner logic | `extensions/filters/SidebarListFilter.tsx:267-270` |
| useLabeledIdFilterState hook | `extensions/filters/LabeledIdFilter.tsx:440-508` |
| useQueryState hook | `extensions/filters/LabeledIdFilter.tsx:334-348` |
| useCacheResults hook | `src/hooks/data.ts:8-20` |

---

## Architecture Overview

```
User types "bru" in Tags filter
         ↓
QueryField component
  - displayQuery updates immediately (what user sees)
  - debouncedSetQuery(250ms) delays actual setQuery call
         ↓
[250ms debounce period - stale data shown, NO LOADING INDICATOR]
         ↓
setQuery("bru") triggers useQueryState
         ↓
useFindTagsForFilterQuery GraphQL query starts
  - loading: true (should trigger spinner)
  - Includes: tag_filter.scenes_filter = { studios: {...}, ... }
  - This is WHY it's slow - joins across entities
         ↓
[5+ second query period - SHOULD show spinner but DOESN'T]
         ↓
Results arrive (sorted by relevance via sortByRelevance)
         ↓
candidatesWithCounts useMemo
  - Merges facet counts (if available)
  - Sorts alphabetically by label (search results)
  - Items not in top N facets show "n/a" indicator
         ↓
SidebarListFilter renders
  - Items with counts: show count (e.g., "306,340")
  - Items without counts: show "n/a" (dimmed, with tooltip)
```

---

## Next Steps to Debug Loading Indicator

1. **Check browser console** for the debug logs when typing in Tags filter
   - If `state.loading` is always false, the issue is in GraphQL/Apollo
   - If `state.loading` is true but no spinner, issue is in render logic

2. **Check useCacheResults** in `src/hooks/data.ts`
   - It caches results and returns `loading: data.loading`
   - May need to verify this is actually returning loading state

3. **Check Apollo query behavior**
   - Use Apollo DevTools to see if query is actually firing
   - Check network tab for GraphQL requests

4. **Consider alternative approach**
   - Instead of checking `state.loading`, check if `state.query !== displayQuery`
   - This would show loading during debounce AND during query

---

## Commands to Resume

```bash
# Start dev server (for testing)
cd ui/v2.5 && npm run start
# Dev server currently on port 3005: http://localhost:3005/scenes

# Build frontend (for production)
cd ui/v2.5 && npm run build

# Build Go binary (for production)
mingw32-make stash

# Kill existing server and start new one (production)
taskkill /IM stash.exe /F
cd .local && ../stash.exe

# Production URL
http://localhost:9999/scenes
```

---

## Related Debug Sessions

- `DEBUG_SESSION_facet_query_serialization.md` - Facet query performance (RESOLVED)
- `FACET-CACHE-ISSUES.md` - Facet cache bugs

---

## Session Notes

- The search query slowness is architectural - fixing it properly would require decoupling the typeahead search from the filtered entity counts
- The current approach of showing loading indicators is a UX improvement but doesn't fix the underlying performance issue
- Consider whether typeahead should show ALL matching tags (fast) vs only tags with scenes matching current filter (slow but accurate)
- **IMPORTANT:** Do not mark fixes as "FIXED" until verified in browser
