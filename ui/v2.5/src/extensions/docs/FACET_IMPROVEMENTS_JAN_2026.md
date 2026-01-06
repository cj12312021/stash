# Facet System Assessment & Improvement Plan

## Benchmark Results (Actual Measurements)

**Database:** 788,736 scenes, 724,530 galleries, 68,888 performers

| Query | Current (EXISTS) | Optimized (LEFT JOIN) | Improvement |
|-------|-----------------|----------------------|-------------|
| HasMarkers (unfiltered) | 448ms | 347ms | **1.3x faster** |
| PerformerFavorite (unfiltered) | **2,067ms** | 570ms | **3.6x faster** |

**Key Finding:** The PerformerFavorite query shows massive improvement due to the nested join in the EXISTS subquery being evaluated per row.

---

## Executive Summary

The facet system is well-architected with solid fundamentals (shared query builders, parallel execution, fast-path optimization, 3-tier caching). However, there are **8 performance issues** and **4 frontend issues** that could be addressed for improved speed and reliability.

**Database Scale:** ~700k scenes, ~800k galleries, ~68k performers

---

## Current Architecture Strengths

| Aspect | Implementation | Grade |
|--------|---------------|-------|
| Query Reuse | Facets use same `makeQuery()` as main queries | A |
| Parallel Execution | 10 goroutines for scene facets (wall-clock = slowest) | A |
| Fast Path | Unfiltered queries skip CTE (10-100x faster) | A |
| Filter Consistency | Same `filterHandler` for main + facet queries | A |
| Frontend Caching | Memory + localStorage + background refresh | A- |
| Debouncing | 500ms debounce on filter changes | A |

---

## Benefits by Phase

### Phase 1: Backend Performance (Critical)
**Expected Impact: 5-50x faster filtered facet queries**

| Fix | Benefit | Metric |
|-----|---------|--------|
| **Add Missing Indexes** | Eliminates full table scans on `scene_markers`, `video_captions`, `galleries_chapters`, `tags_relations` | Query time: seconds → milliseconds |
| **Fix N+1 Has Markers** | Replaces 700k EXISTS evaluations with single LEFT JOIN | Single query instead of per-row subquery |
| **Fix N+1 Performer Favorite** | Replaces 700k EXISTS evaluations with single LEFT JOIN | Single query instead of per-row subquery |
| **Fix Gallery N+1s** | Same benefits for gallery facets (~800k rows) | Consistent fast performance |

**Real-world scenario:** When user filters scenes by a tag, the has_markers facet currently runs an EXISTS check for every matching scene. With 50k filtered scenes, that's 50k subquery evaluations. After fix: 1 query.

---

### Phase 2: Backend Robustness (Medium)
**Expected Impact: Better reliability, clearer failure modes**

| Fix | Benefit | Metric |
|-----|---------|--------|
| **Query Timeout (30s)** | Prevents runaway queries from blocking UI indefinitely | Guaranteed response within 30s |
| **Error Channel Fix** | Ensures all errors are captured (not silently dropped) | Zero lost error reports |

**Real-world scenario:** Complex filter combination causes slow query. Currently blocks forever. After fix: Fails gracefully after 30s with clear error.

---

### Phase 3: Frontend Improvements (Medium)
**Expected Impact: Better UX, minor performance gains**

| Fix | Benefit | Priority | Effort |
|-----|---------|----------|--------|
| **Memoize Context Values** | Prevents filter components from re-rendering when unrelated list state changes | Medium | Low |
| **Add Error State** | Users see error message instead of blank counts on network failure | Medium | Low |
| **Add AbortController** | Cancels unnecessary network requests (data already handled correctly via fingerprint check) | Low | Low |
| **Optimize Rating Sum** | Minor: iterates ~20 values instead of ~100 per bucket | Very Low | Low |

**Note on Race Condition:** After re-reading the code, the race condition is already handled via `requestFingerprint` comparison (lines 636, 656). The background refresh won't overwrite newer data. An AbortController would only save bandwidth, not fix correctness.

**Real priority:** Backend fixes (N+1 patterns, indexes) will have 10-50x more impact than these frontend tweaks.

---

### Combined Benefits Summary

| Category | Before | After | Impact |
|----------|--------|-------|--------|
| **Filtered facet query time** | 1-10 seconds | 100-500ms | **HIGH** |
| **Has markers/performer favorite** | N+1 pattern | Single JOIN | **HIGH** |
| **Missing index tables** | Full scans | Index seeks | **HIGH** |
| **Long-running queries** | Block indefinitely | Timeout after 30s | Medium |
| **Frontend re-renders** | On every list update | Only on facet changes | Low |
| **Error visibility** | Silent console.error | Exposed to UI | Low |
| **Race conditions** | Already handled | (No change needed) | N/A |

**Bottom line:** The backend fixes are the big wins. Frontend changes are polish.

---

## Performance Issues (Priority Order)

### CRITICAL (Immediate Impact)

#### 1. N+1 Pattern in Boolean Facet Queries
**Files:** `pkg/sqlite/scene_facets.go:1142-1183`, `pkg/sqlite/gallery_facets.go:708-751`

**Problem:** `getHasMarkersFacet()` and `getPerformerFavoriteFacet()` use scalar EXISTS subquery per row:
```sql
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM scene_markers sm WHERE sm.scene_id = fs.id)
  THEN 'true' ELSE 'false' END as has_markers,
  COUNT(*) as count
FROM filtered_scenes fs
GROUP BY has_markers
```

SQLite evaluates the EXISTS for every row in `filtered_scenes` (up to 700k evaluations).

**Fix:** Use LEFT JOIN with GROUP BY:
```sql
SELECT
  CASE WHEN sm.scene_id IS NOT NULL THEN 'true' ELSE 'false' END as has_markers,
  COUNT(*) as count
FROM filtered_scenes fs
LEFT JOIN (SELECT DISTINCT scene_id FROM scene_markers) sm ON fs.id = sm.scene_id
GROUP BY has_markers
```

**Impact:** Could reduce query time from seconds to milliseconds for filtered queries.

---

#### 2. Missing Database Indexes
**File:** `pkg/sqlite/extension_indexes.go`

**Current Indexes:** 12 (well-covered: tags, performers, studios, groups)

**Missing Indexes:**
| Table | Index Needed | Used By |
|-------|--------------|---------|
| `scene_markers` | `(scene_id)` | has_markers facet |
| `video_captions` | `(file_id)` | captions facet |
| `galleries_chapters` | `(gallery_id)` | has_chapters facet |
| `tags_relations` | `(parent_id)`, `(child_id)` | tag parent/child facets |
| `scenes_files` | `(scene_id, "primary")` | video metadata facets |
| `groups_scenes` | `(scene_id)` | group performers facet |

---

## Files to Modify

### Backend (pkg/sqlite/)
- `extension_indexes.go` - Add 7 missing indexes
- `scene_facets.go` - Fix N+1 queries (has_markers, performer_favorite), add timeout
- `gallery_facets.go` - Fix N+1 queries (has_chapters, performer_favorite)
- `performer_facets.go` - Add timeout
- `group_facets.go` - Add timeout
- `studio_facets.go` - Add timeout
- `tag_facets.go` - Add timeout

### Frontend (ui/v2.5/src/extensions/)
- `hooks/useFacetCounts.ts` - Add error state, fix race condition
- `lists/SceneList.tsx` - Memoize FacetCountsContext value
- `lists/PerformerList.tsx` - Memoize FacetCountsContext value
- `lists/GalleryList.tsx` - Memoize FacetCountsContext value
- `lists/GroupList.tsx` - Memoize FacetCountsContext value
- `lists/StudioList.tsx` - Memoize FacetCountsContext value
- `lists/TagList.tsx` - Memoize FacetCountsContext value

### New Files
- `pkg/sqlite/facets_benchmark_test.go` - Performance benchmarks

---

## Implementation Order

| Step | Files | Risk | Dependencies |
|------|-------|------|--------------|
| 1.1 | extension_indexes.go | Low | None |
| 1.2 | scene_facets.go | Medium | 1.1 (index) |
| 1.3 | scene_facets.go | Medium | 1.1 (index) |
| 1.4 | gallery_facets.go | Medium | 1.1 (index) |
| 2.1 | All *_facets.go | Low | None |
| 2.2 | scene_facets.go | Low | None |
| 3.1 | 6 List components | Low | None |
| 3.2 | useFacetCounts.ts | Medium | None |
| 3.3 | useFacetCounts.ts | Medium | 3.2 |
| 3.4 | Filter components | Low | None |

**Total files to modify:** ~12 files
