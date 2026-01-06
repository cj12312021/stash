# Debug Session: React Error #310 - Too Many Re-renders

## Original Problem
All Stash List pages (Tags, Scenes, Performers, etc.) crash with:
```
Error: Minified React error #310; visit https://reactjs.org/docs/error-decoder.html?invariant=310
```
React error #310 = "Too many re-renders. React limits the number of renders to prevent an infinite loop."

## Error Stack Trace (from production build)
```
at STn (index-DDPjv9uD.js:112:853245)
at ZEn
at Hs
at t (index-DDPjv9uD.js:41:9263)
at Xs (Tags-gshtW-2r.js:1:14739)  <-- Tags chunk, position 14739
...
```

## When It Started
After these commits:
1. `81b1f9136` - Merge upstream/develop into develop
2. `4c97b615b` - fix: Resolve fork-specific TypeScript errors after upstream merge

## Key Changes in Fix Commit (4c97b615b)
Files changed:
- `ui/v2.5/src/components/Galleries/GalleryDetails/Gallery.tsx` - FormattedDate API
- `ui/v2.5/src/components/Images/ImageDetails/Image.tsx` - FormattedDate API
- `ui/v2.5/src/extensions/__tests__/useFacetCounts.test.ts` - mock types
- `ui/v2.5/src/extensions/components/AISceneRecommendationRow.tsx` - link prop
- `ui/v2.5/src/extensions/components/GalleryPopover.tsx` - useConfigurationContext
- `ui/v2.5/src/extensions/filters/DateFilter.tsx` - null check
- `ui/v2.5/src/extensions/filters/IsMissingFilter.tsx` - Option type handling
- `ui/v2.5/src/extensions/filters/PathFilter.tsx` - useConfigurationContext
- `ui/v2.5/src/extensions/filters/RatingFilter.tsx`
- `ui/v2.5/src/extensions/hooks/useSidebarFilters.ts` - useConfigurationContext
- `ui/v2.5/src/extensions/ui/FilterTags.tsx` - type assertions

## Upstream Merge Changes (81b1f9136)
Key files changed:
- `ui/v2.5/src/components/Shared/GridCard/GridCard.tsx` - Wrapped with PatchComponent
- Various Card components wrapped with PatchComponent
- `ui/v2.5/src/patch.tsx` - Plugin patching system using Proxy

## Suspicious Changes Investigated

### 1. IsMissingFilter.tsx Change
```typescript
// OLD:
const optValue = typeof opt === "string" ? opt : opt.value;
const optLabel = typeof opt === "string" ? opt : opt.messageID;

// NEW:
const optValue = typeof opt === "string" ? opt : typeof opt === "number" ? String(opt) : opt.id;
const optLabel = typeof opt === "string" ? opt : typeof opt === "number" ? String(opt) : (opt.name ?? opt.id);
```
- IsMissingCriterion options are strings like "title", "cover", etc.
- For strings, both old and new code should return the string directly
- Probably NOT the cause

### 2. useConfigurationContext Change
```typescript
// OLD:
const { configuration } = React.useContext(ConfigurationContext);

// NEW:
const { configuration } = useConfigurationContext();
```
- The hook throws if context is null (not infinite re-render)
- Probably NOT the cause

### 3. PatchComponent (from upstream)
- Uses JavaScript Proxy to wrap components
- All Card components now wrapped with it
- Could potentially cause issues with React's reconciliation

## Architecture Notes
- Tags page: `src/components/Tags/Tags.tsx` imports `EnhancedTagList` from `src/extensions/facets/enhanced`
- `enhanced/index.ts` re-exports `TagList` from `src/extensions/lists`
- `extensions/lists/TagList.tsx` exports `MyFilteredTagList`

## List Page Shared Components
All list pages use:
- `useFilteredItemList` hook (from `src/components/List/ItemList.tsx`)
- `useFacetCounts` hook (from `src/extensions/hooks/useFacetCounts.ts`)
- `useSidebarState` hook (from `src/components/Shared/Sidebar.tsx`)
- `FacetCountsContext.Provider`
- Various filter components in `src/extensions/filters/`

## Dev Server Setup (for unminified errors)
Proxy config added to `vite.config.js`:
```javascript
proxy: {
  "/graphql": { target: "http://192.168.4.144:6969", changeOrigin: true, ws: true },
  "/css": { target: "http://192.168.4.144:6969", changeOrigin: true },
  // ... other routes
}
```
Run with: `cd ui/v2.5 && npm run start`
Access at: http://localhost:3000/tags
Login: archivist / 9Yyo8mxv$q^MuAHU

## Next Steps to Try
1. **Get unminified error** - Dev server is configured, need to check browser console
2. **Git bisect** - Find exact breaking commit:
   ```bash
   git bisect start HEAD fa8045489
   git bisect run npm run build
   ```
3. **Revert fix commit** - Test if `4c97b615b` is the culprit:
   ```bash
   git revert 4c97b615b --no-commit
   npm run build
   ```
4. **Add console.trace** - To key components to trace re-render loop

## Files to Focus On
- `ui/v2.5/src/extensions/lists/TagList.tsx` - Line 796 has useEffect with NO dependency array (runs every render)
- `ui/v2.5/src/extensions/filters/IsMissingFilter.tsx` - Type changes
- `ui/v2.5/src/components/List/ItemList.tsx` - useFilteredItemList hook
- `ui/v2.5/src/patch.tsx` - PatchComponent implementation

## Potential Root Causes (Hypotheses)
1. **useEffect without deps** in TagList.tsx line 796-813 (Mousetrap bindings) - **RULED OUT**
2. **PatchComponent Proxy** causing React reconciliation issues
3. **Type mismatch** in IsMissingFilter causing undefined values
4. **Context provider** re-creating value object on every render

---

## Investigation Progress (2026-01-06)

### Discovery: Stashed Changes Are the Cause

The error was NOT caused by the upstream merge commits. It was caused by **stashed frontend changes** that were applied after the merge.

**Stashed changes (in `stash@{0}`):**
1. `ui/v2.5/src/extensions/hooks/useFacetCounts.ts` - Added `error` state to all facet hooks
2. All 6 List files - Added `useMemo` for `facetContextValue`:
   - `extensions/lists/SceneList.tsx`
   - `extensions/lists/PerformerList.tsx`
   - `extensions/lists/TagList.tsx`
   - `extensions/lists/StudioList.tsx`
   - `extensions/lists/GroupList.tsx`
   - `extensions/lists/GalleryList.tsx`

**Test result:** Without stash applied, error is gone. With stash applied, error occurs.

### Debug Logging Added

Added console.log statements to trace the issue:

**In useTagFacetCounts hook:**
```typescript
// Render counter
let tagFacetRenderCount = 0;
console.log(`[useTagFacetCounts] Render #${tagFacetRenderCount}, isOpen=${options.isOpen}`);

// In useEffect
console.log(`[useTagFacetCounts] useEffect triggered, isOpen=${isOpen}`);
console.log(`[useTagFacetCounts] isFirstFetch=${isFirstFetch}, filterChanged=${filterChanged}`);
console.log(`[useTagFacetCounts] Calling setLoading(true)`);

// Return value
console.log(`[useTagFacetCounts] Returning: loading=${loading}, error=${error}, counts keys=${...}`);
```

**In MyFilteredTagList component:**
```typescript
let tagListRenderCount = 0;
console.log(`[MyFilteredTagList] Render #${tagListRenderCount}`);
console.log(`[MyFilteredTagList] Before facetFilter useMemo`);
// Inside useMemo: console.log(`[MyFilteredTagList] facetFilter useMemo EXECUTING`);
console.log(`[MyFilteredTagList] Before useMemo - facetLoading=${facetLoading}, facetError=${facetError}`);
// Inside useMemo: console.log(`[MyFilteredTagList] useMemo EXECUTING - creating new context value`);
```

### Key Log Findings

Pattern observed:
```
[MyFilteredTagList] Render #1
[MyFilteredTagList] facetFilter useMemo EXECUTING  (correctly runs once)
[useTagFacetCounts] Render #1, isOpen=true
[useTagFacetCounts] useEffect triggered
[useTagFacetCounts] isFirstFetch=true, filterChanged=true
[useTagFacetCounts] Calling setLoading(true)
[useTagFacetCounts] Returning: loading=false  <-- PROBLEM: should be true on next render!

[MyFilteredTagList] Render #2
[MyFilteredTagList] facetFilter useMemo NOT re-executing (memoized correctly)
[useTagFacetCounts] Render #2, isOpen=true
[useTagFacetCounts] Returning: loading=false  <-- Still false!

... renders #3-7 continue ...

[MyFilteredTagList] Render #7
[MyFilteredTagList] Before useMemo
CRASH: Error #310
```

**Critical observations:**
1. `facetFilter useMemo` correctly only executes on render #1 (memoization working)
2. `loading` stays `false` even after `setLoading(true)` is called
3. Component re-renders 7 times before React throws error #310
4. Crash happens at the `facetContextValue` useMemo

### Ruled Out: Mousetrap useEffect

Disabled the Mousetrap useEffect (no dependency array) to test if it caused the loop:
```typescript
// DEBUG: Temporarily disabled to test if this causes the infinite loop
// useEffect(() => {
//   Mousetrap.bind("e", () => { ... });
//   ...
// });
```

**Result:** Error still persists. Mousetrap is NOT the cause.

### Current Hypothesis: State Batching Issue

The `loading` state never becomes `true` because of how React batches state updates:

1. `useEffect` runs on first render
2. `setLoading(true)` is called
3. `doFetch()` is called synchronously (not awaited)
4. Inside `doFetch`, if cache exists:
   - `setCounts(cached)` called
   - `setLoading(false)` called
5. All three state updates batched together
6. `setLoading(false)` overwrites `setLoading(true)`
7. Component re-renders with `loading=false`
8. Something triggers another re-render...

The question is: what keeps triggering re-renders after the cache hit?

Looking at `doFetch` dependencies:
```typescript
const doFetch = useCallback(async () => {
  // ...
}, [fetchFacets, filter, filterFingerprint, isOpen, limit]);
```

If `filter` changes reference every render, `doFetch` changes, and the useEffect depends on `doFetch`:
```typescript
useEffect(() => {
  // ...
}, [filterFingerprint, isOpen, debounceMs, doFetch]);
```

### Current Test: Removing Error State

Testing if removing just the `error` state fixes the issue:

**Changes made to useTagFacetCounts:**
```typescript
// Commented out:
// const [error, setError] = useState<Error | null>(null);
// setError(null);
// setError(err instanceof Error ? err : new Error(String(err)));

// Changed return to:
return { counts, loading, error: null, refetch: doFetch };
```

**Status:** Build succeeded, awaiting Docker deploy and test.

### Files Modified for Debugging

1. `ui/v2.5/src/extensions/hooks/useFacetCounts.ts`:
   - Added render counter and console logs
   - Commented out error state in useTagFacetCounts

2. `ui/v2.5/src/extensions/lists/TagList.tsx`:
   - Added render counter and console logs
   - Disabled Mousetrap useEffect

### RESOLVED (2026-01-06)

### Root Cause Found: Rules of Hooks Violation

The bug was caused by a **React Rules of Hooks violation**. The `facetContextValue` useMemo was placed AFTER an early return statement (`if (sidebarStateLoading) return null;`), which violates React's requirement that hooks must be called in the same order on every render.

**What was happening:**
1. Renders #1-6: `sidebarStateLoading` was true → component returned null at the early return → `useMemo` was NOT called
2. Render #7: `sidebarStateLoading` became false → component continued past early return → tried to call `useMemo` for the first time
3. React detected inconsistent hook calls and threw Error #310

**The problematic code pattern (in all 6 List files):**
```typescript
// ... hooks called here ...

if (sidebarStateLoading) return null;  // Early return

// ... more code ...

const facetContextValue = useMemo(  // ← BUG: Hook called AFTER early return!
  () => ({ counts: facetCounts, loading: facetLoading, error: facetError }),
  [facetCounts, facetLoading, facetError]
);
```

### The Fix

Move the `facetContextValue` useMemo to BEFORE the early return - specifically right after the facet counts hook call:

```typescript
const { counts: facetCounts, loading: facetLoading, error: facetError } = useTagFacetCounts(...);

// IMPORTANT: This useMemo must be BEFORE any early returns to satisfy React's Rules of Hooks
const facetContextValue = useMemo(
  () => ({ counts: facetCounts, loading: facetLoading, error: facetError }),
  [facetCounts, facetLoading, facetError]
);

// ... other hooks ...

if (sidebarStateLoading) return null;  // Early return is now AFTER all hooks
```

### Files Fixed

All 6 list files have been fixed:

- [x] `TagList.tsx` - Fixed and tested, working correctly
- [x] `SceneList.tsx` - Fixed (2026-01-06)
- [x] `PerformerList.tsx` - Fixed (2026-01-06)
- [x] `StudioList.tsx` - Fixed (2026-01-06)
- [x] `GalleryList.tsx` - Fixed (2026-01-06)
- [x] `GroupList.tsx` - Fixed (2026-01-06)

**The fix pattern applied to each file:**
1. Located where `use*FacetCounts` hook is called
2. Added `facetContextValue` useMemo immediately after it with comment:
   `// IMPORTANT: This useMemo must be BEFORE any early returns to satisfy React's Rules of Hooks`
3. Removed the duplicate useMemo that was after the early return

### Cleanup Done

- [x] Removed debug console.logs from TagList.tsx
- [x] Removed render counter from TagList.tsx
- [x] Re-enabled Mousetrap useEffect in TagList.tsx
- [x] Restored error state in useTagFacetCounts
- [x] Removed debug logs from useFacetCounts.ts

### Key Lesson Learned

**Never place hooks after conditional early returns.** All hooks must be called unconditionally at the top level of the component, before any early returns. This is a fundamental React rule that's easy to violate when refactoring.
