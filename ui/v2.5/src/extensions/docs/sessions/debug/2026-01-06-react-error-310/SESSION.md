---
type: debug
status: complete
started: 2026-01-06
completed: 2026-01-06
problem: "React Error #310 - Too many re-renders on all List pages"
tags: [react, hooks, rules-of-hooks, useMemo]
related_files:
  - extensions/lists/TagList.tsx
  - extensions/lists/SceneList.tsx
  - extensions/lists/PerformerList.tsx
  - extensions/lists/StudioList.tsx
  - extensions/lists/GalleryList.tsx
  - extensions/lists/GroupList.tsx
solution_doc: null
---

# Debug Session: React Error #310 - Too Many Re-renders

## Problem Statement

**Observed behavior:**
All Stash List pages (Tags, Scenes, Performers, etc.) crash with:
```
Error: Minified React error #310
```
React error #310 = "Too many re-renders. React limits the number of renders to prevent an infinite loop."

**Expected behavior:**
List pages should load normally without crashing.

**Reproduction steps:**
1. Navigate to any list page (Tags, Scenes, etc.)
2. Page crashes immediately

---

## Environment

- **Branch:** develop
- **When it started:** After upstream merge (`81b1f9136`) and fix commit (`4c97b615b`)
- **Relevant files:** All 6 List files in `extensions/lists/`

---

## Investigation

### Initial Hypothesis

Initially suspected the upstream merge changes (PatchComponent, useConfigurationContext) were causing the issue.

### Discovery: Stashed Changes

The error was NOT caused by upstream merge commits. It was caused by **stashed frontend changes** that were applied after the merge.

**Stashed changes:**
1. `useFacetCounts.ts` - Added `error` state to all facet hooks
2. All 6 List files - Added `useMemo` for `facetContextValue`

**Test result:** Without stash applied, error is gone. With stash applied, error occurs.

---

## Progress Log

### Debug Logging Added

Added console.log statements to trace the issue:
- Render counter in `useTagFacetCounts`
- Render counter in `MyFilteredTagList`
- useMemo execution tracking

### Key Log Findings

Pattern observed:
```
[MyFilteredTagList] Render #1
[MyFilteredTagList] facetFilter useMemo EXECUTING (correctly runs once)
...renders #2-6 continue...
[MyFilteredTagList] Render #7
CRASH: Error #310
```

### Ruled Out: Mousetrap useEffect

Disabled the Mousetrap useEffect (no dependency array) - Error still persists. NOT the cause.

### Root Cause Found: Rules of Hooks Violation

The `facetContextValue` useMemo was placed AFTER an early return statement:

```typescript
// ... hooks called here ...

if (sidebarStateLoading) return null;  // Early return

// ... more code ...

const facetContextValue = useMemo(  // BUG: Hook called AFTER early return!
  () => ({ counts: facetCounts, loading: facetLoading, error: facetError }),
  [facetCounts, facetLoading, facetError]
);
```

**What was happening:**
1. Renders #1-6: `sidebarStateLoading` was true → returned null → `useMemo` NOT called
2. Render #7: `sidebarStateLoading` became false → tried to call `useMemo` for first time
3. React detected inconsistent hook calls → Error #310

---

## Solution

**Root cause:** React Rules of Hooks violation - hook called after conditional early return.

**Fix:** Move `facetContextValue` useMemo to BEFORE the early return:

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

**Prevention:**
Never place hooks after conditional early returns. All hooks must be called unconditionally at the top level.

---

## Verification

**Files fixed (all 6 list files):**
- [x] `TagList.tsx`
- [x] `SceneList.tsx`
- [x] `PerformerList.tsx`
- [x] `StudioList.tsx`
- [x] `GalleryList.tsx`
- [x] `GroupList.tsx`

**Cleanup done:**
- [x] Removed debug console.logs
- [x] Removed render counter
- [x] Re-enabled Mousetrap useEffect
- [x] Restored error state in useTagFacetCounts

---

## Key Lesson

**Never place hooks after conditional early returns.** All hooks must be called unconditionally at the top level of the component, before any early returns. This is a fundamental React rule that's easy to violate when refactoring.
