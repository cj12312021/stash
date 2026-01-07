---
type: debug
status: complete
started: 2026-01-06
completed: 2026-01-06
problem: "Filter search UX issues - jumping order, missing counts, slow search"
tags: [ux, filters, search, performance]
related_files:
  - extensions/filters/TagsFilter.tsx
  - extensions/filters/PerformersFilter.tsx
  - extensions/filters/StudiosFilter.tsx
  - extensions/filters/GroupsFilter.tsx
  - extensions/filters/PerformerTagsFilter.tsx
  - extensions/filters/SidebarListFilter.tsx
solution_doc: null
---

# Debug Session: Filter Search UX Issues

## Problem Statement

**Observed behavior:**
When typing in sidebar filter search boxes (Tags, Performers, etc.):
1. Items jump from count-sorted to alphabetical order
2. Counts disappear temporarily
3. No loading indicator while search is in progress
4. Search query is slow (~5+ seconds)

**Expected behavior:**
Smooth search experience with loading feedback and fast results.

---

## Environment

- **Branch:** develop
- **Relevant files:** All filter components in `extensions/filters/`

---

## Investigation

### Issue 1: Sorting During Search

Initially fixed to sort by count, but **changed to alphabetical** because:
- Most search results don't have counts (outside top 100 facets)
- Alphabetical is more predictable when searching by name

### Issue 2: No Loading Indicator

When search query is loading, stale facet data was shown instead of loading spinner.

**Fix:** Added early return when `hasSearchQuery && state.loading`:
```typescript
if (hasSearchQuery && state.loading) {
  return modifierOptions;
}
```

### Issue 3: Counts Disappear

This is **expected behavior**, not a bug. Facet query only returns top 100 items. When searching:
- Items IN facet cache (top 100) → show counts
- Items OUTSIDE facet cache → show no counts

**Fix:** Show "n/a" indicator for items without counts.

### Issue 4: Slow Search Query

`queryVariables()` called `setObjectFilter()` unconditionally, adding full filter criteria even when searching.

**Fix:** Skip `scenes_filter` when searching - counts come from pre-loaded cache:
```typescript
if (f && !query) {
  const filterOutput = f.makeFilter();
  setObjectFilter(tagFilter, f.mode, filterOutput, "tags");
}
```

---

## Progress Log

### Port 9999 vs Port 3000 Discovery

Fix wasn't working on port 9999 because:
- Port 9999 = Go binary with **embedded** UI (requires rebuild)
- Port 3000 = Vite dev server (hot reload)

After `npm run build`, must also run `mingw32-make stash` and restart server.

### Performance Verification

- Before: ~5+ seconds (full filter evaluation)
- After: ~100-500ms (simple name search)

---

## Solution

**Files modified:**

| File | Changes |
|------|---------|
| `TagsFilter.tsx` | Added sort, loading check, skip scenes_filter when searching |
| `PerformersFilter.tsx` | Same changes |
| `StudiosFilter.tsx` | Same changes |
| `GroupsFilter.tsx` | Same changes |
| `PerformerTagsFilter.tsx` | Same changes |
| `SidebarListFilter.tsx` | Added "n/a" indicator for items without counts |
| `_list-components.scss` | Added `.count-unavailable` styling |

**Code changes:**

1. **Sort alphabetically during search:**
```typescript
.sort((a, b) => {
  if (a.className === "modifier-object") return -1;
  if (b.className === "modifier-object") return 1;
  return a.label.localeCompare(b.label);
});
```

2. **Show loading during search:**
```typescript
if (hasSearchQuery && state.loading) {
  return modifierOptions;
}
```

3. **Visual indicator for unavailable counts:**
```typescript
<span className="object-count count-unavailable" title="Count unavailable">
  n/a
</span>
```

---

## Verification

**All 5 filters verified via Docker deployment:**
- [x] TagsFilter
- [x] PerformersFilter
- [x] StudiosFilter
- [x] GroupsFilter
- [x] PerformerTagsFilter

**Deployed to:** `cj1213/plex:latest`
