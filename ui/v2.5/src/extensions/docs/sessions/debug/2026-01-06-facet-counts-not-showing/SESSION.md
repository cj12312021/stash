---
type: debug
status: complete
started: 2026-01-06
completed: 2026-01-06
problem: "Facet counts not showing on large tables (700k scenes)"
tags: [performance, sqlite, facets, timeout, query-optimization]
related_files:
  - pkg/sqlite/scene_facets.go
  - pkg/sqlite/gallery_facets.go
  - pkg/sqlite/group_facets.go
  - pkg/sqlite/performer_facets.go
  - extensions/hooks/useFacetCounts.ts
solution_doc: null
---

# Debug Session: Facet Counts Not Showing on Large Tables

## Problem Statement

**Observed behavior:**
When navigating to scene list with a filter applied, expanding Tags filter shows:
1. Tags in alphabetical order instead of sorted by count
2. No count numbers displayed next to tag names

**Expected behavior:**
Tags should display with counts sorted highest to lowest.

**Reproduction steps:**
1. Navigate to `/scenes` with studio filter applied
2. Expand Tags filter in sidebar
3. Observe no counts displayed

---

## Environment

- **Branch:** develop
- **Database:** ~700k scenes, 9 million scenes_tags rows
- **Relevant files:** `pkg/sqlite/*_facets.go`, `extensions/hooks/useFacetCounts.ts`

---

## Investigation

### Initial Hypothesis

Filter fingerprint changing during page load, causing stale response to be discarded.

### Discovery: Backend Timeout

The GraphQL query returns with error:
```
ApolloError: performer_tags facet: context deadline exceeded
networkStatus: 8 (error)
data: undefined
```

The 30-second timeout was killing slow facet queries on large datasets.

### Benchmark Results (Before Fix)

| Facet | Time | Status |
|-------|------|--------|
| Tags | 41-53s | VERY SLOW |
| Performers | 10-12s | SLOW |
| PerformerTags | 8-9s | SLOW |
| Studios | 1.2s | Okay |
| Groups | 0.4s | Fast |

---

## Progress Log

### Phase 1: Remove Timeout

Removed 30-second timeout from all 6 facet files. Queries now complete but still slow.

### Phase 2: Query Analysis

**Database Statistics:**
- scenes_tags: 9 million rows
- groups_scenes: 203k rows (44.5x smaller)

**Query Plan Analysis:**

Current CTE approach (SLOW - 40s):
```
SCAN t                                          <- Scans ALL tags first
SEARCH st USING INDEX index_scenes_tags_on_tag_id (tag_id=?)  <- WRONG INDEX!
```

IN subquery approach (FAST - 7.5s):
```
SEARCH st USING COVERING INDEX idx_ext_scenes_tags_scene_tag (scene_id=?)  <- OUR INDEX!
```

### Phase 3: Optimization Applied

Changed from CTE-based queries to IN subquery:

```sql
-- Before (CTE - slow):
WITH filtered_scenes AS (%s)
SELECT t.id, t.name, COUNT(DISTINCT st.scene_id)
FROM filtered_scenes fs
INNER JOIN scenes_tags st ON fs.id = st.scene_id
...

-- After (IN subquery - 5x faster):
SELECT t.id, t.name, COUNT(DISTINCT st.scene_id)
FROM scenes_tags st
INNER JOIN tags t ON st.tag_id = t.id
WHERE st.scene_id IN (%s)
...
```

---

## Solution

**Root cause:** 30-second timeout + inefficient CTE queries not using extension indexes.

**Fix:**
1. Changed query structure from CTE to IN subquery (uses `idx_ext_` indexes)
2. Re-added 60-second timeout (was 30s)

**Files modified:**

| File | Functions Updated |
|------|-------------------|
| `scene_facets.go` | `getTagsFacet`, `getPerformersFacet`, `getGroupsFacet`, `getPerformerTagsFacet` |
| `gallery_facets.go` | `getTagsFacet`, `getPerformersFacet`, `getPerformerTagsFacet` |
| `group_facets.go` | `getTagsFacet`, `getPerformersFacet` |
| `performer_facets.go` | `getTagsFacet`, `getStudiosFacet` |

---

## Verification

**Benchmark Results (After Fix):**

| Facet | Before | After | Speedup |
|-------|--------|-------|---------|
| Tags | 41s | 7.0s | **5.8x** |
| Performers | 10.4s | 3.1s | **3.4x** |
| PerformerTags | 8.9s | 7.0s | **1.3x** |

All facets now complete well within 60s timeout.

**Production testing:** Passed - facet counts showing correctly with filtered queries.
