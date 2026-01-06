# Debug Session: Facet Counts Not Showing on Large Tables

## Session Summary (Last Updated: 2025-01-06)

**Status:** ✅ FIXED - Query optimization implemented and verified via benchmark.

**What was done:**
1. ✅ Identified root cause: 30-second timeout killing slow facet queries
2. ✅ Implemented IN subquery optimization across all entity facets (11 functions, 4 files)
3. ✅ Re-added 60-second timeout to all 6 facet files
4. ✅ Benchmarked: Tags 5.8x faster (41s→7s), Performers 3.4x faster (10s→3s)
5. ✅ Debug logging removed from `useFacetCounts.ts`
6. ✅ Production testing passed - facet counts showing correctly with filtered queries

**Performance improvement verified:**
| Facet | Before | After | Speedup |
|-------|--------|-------|---------|
| Tags | 41s | 7s | 5.8x |
| Performers | 10s | 3s | 3.4x |
| PerformerTags | 9s | 7s | 1.3x |

**To continue:** See "Remaining Work" section. Main tasks: remove debug logging, test in production.

---

## Original Problem

When navigating to the scene list page with a filter applied (e.g., excluding a studio), expanding the Tags filter shows:
1. Tags in **alphabetical order** instead of sorted by count (highest to lowest)
2. **No count numbers** displayed next to tag names
3. Works correctly on smaller data tables, fails on large ones (~700k scenes)

**Test URL (Production - different machine):**
```
http://192.168.4.144:6969/scenes?c=(%22type%22:%22studios%22,%22modifier%22:%22INCLUDES%22,%22value%22:(%22items%22:%5B%5D,%22excluded%22:%5B(%22id%22:%222560%22,%22label%22:%22Game%20Clips%22)%5D,%22depth%22:%22-1%22))&sortby=date&perPage=65
```

**Test URL (Local - use this for testing):**
```
http://localhost:9999/scenes?c=(%22type%22:%22studios%22,%22modifier%22:%22INCLUDES%22,%22value%22:(%22items%22:%5B%5D,%22excluded%22:%5B(%22id%22:%222560%22,%22label%22:%22Game%20Clips%22)%5D,%22depth%22:%22-1%22))&sortby=date&perPage=65
```

**Note:** The production server (192.168.4.144:6969) is deployed on a different machine. For local testing, use localhost:9999 which has an equally large database (~700k scenes).

## Key Discoveries

### 1. Cache Has Data But Wrong Fingerprint
The localStorage cache (`stash:facetCache:scenes`) contains valid facet data:
- `fingerprint: "empty"` (for unfiltered queries)
- `tagsCount: 100` with real counts like "Brunette: 308063", "Blowjob: 274871"

But the current page has a **studio filter applied**, so the cache fingerprint doesn't match. The lookup fails and a fresh fetch is needed.

### 2. Fresh Fetch Appears to Not Complete or Get Discarded
After cache miss:
- `setLoading(true)` is called
- GraphQL query starts (takes 10+ seconds for large tables)
- Query may complete but data isn't being used
- Loading indicators disappear but counts never show

### 3. Stale Response Detection May Be the Culprit
The code has stale response detection:
```javascript
// In doFetch:
if (lastFilterRef.current !== requestFingerprint) {
  return; // Discard stale response
}
```

If `filterFingerprint` changes during the slow fetch (due to filter object reference changes), the response gets discarded.

## Current Hypothesis (UPDATED - was wrong)

~~**The filter fingerprint is changing during page load**, causing the stale response check to discard valid data.~~

**ACTUAL ROOT CAUSE: Backend timeout on `performer_tags` facet query**

The GraphQL query returns with an error:
```
ApolloError: performer_tags facet: context deadline exceeded
networkStatus: 8 (error)
data: undefined
```

The `performer_tags` facet is too slow on large datasets (~700k scenes) and hits the Go context deadline. When ANY facet times out, the entire response fails and returns `data: undefined`.

## Files Involved

### Frontend
- `ui/v2.5/src/extensions/hooks/useFacetCounts.ts` - Main hook with fetch logic
- `ui/v2.5/src/extensions/filters/TagsFilter.tsx` - Consumes facet counts, decides sort order
- `ui/v2.5/src/extensions/lists/SceneList.tsx` - Provides FacetCountsContext

### Key Logic in TagsFilter.tsx (lines 122-159)
```javascript
const hasValidFacets = facetCounts.tags.size > 0 && !facetsLoading;

if (hasValidFacets && !hasSearchQuery) {
  // Use facet results - sorted by count
  facetCandidates.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
} else {
  // Fallback - alphabetical from search results, no counts
}
```

If `hasValidFacets` is false (either `tags.size === 0` or `facetsLoading === true`), we get alphabetical order with no counts.

## Debug Logging Added

Added console.log statements to `useSceneFacetCounts` in `useFacetCounts.ts`:

1. **Effect triggered** - logs isOpen, filterFingerprint, lastFilterRef
2. **Effect checks** - logs isFirstFetch, filterChanged
3. **doFetch called** - logs requestFingerprint, cacheFingerprint, lastFilterRef
4. **Stale response discarded** - logs when response is thrown away
5. **Setting counts** - logs tagsCount, performersCount when data is set
6. **Clearing loading** - logs when loading state clears
7. **NOT clearing loading (stale)** - logs when loading stays true due to stale check

## What We Tried

- [x] Verified cache has data (for "empty" fingerprint)
- [x] Confirmed current page has different fingerprint (filtered)
- [x] Checked network requests - GraphQL queries are being made
- [x] Waited 15+ seconds - counts still don't appear
- [x] Added debug logging to trace execution flow
- [x] Tested on localhost:9999 with debug build (2025-01-06)
- [x] Opened Tags filter section to trigger facet fetch
- [x] Captured console logs showing the actual error

## Console Log Sequence (2025-01-06)

```
1. Effect triggered with filterFingerprint: {} (empty) → immediate first fetch
2. Effect triggered with filterFingerprint: {"studios":...} → debounced fetch scheduled
3. First fetch (empty) completes → correctly discarded as stale
4. Second fetch (with filter) completes with ERROR:
   - data: undefined
   - networkStatus: 8 (error)
   - error: ApolloError: performer_tags facet: context deadline exceeded
5. Loading cleared, but no counts to display
```

## Next Steps

1. **Investigate backend `performer_tags` facet query** - Why is it timing out?
   - Check `pkg/sqlite/scene_facets.go` for the performer_tags implementation
   - Look for missing indexes or inefficient JOINs
   - Compare query plan with other facets that work

2. **Potential fixes:**
   - **Option A: Optimize the query** - Add indexes, simplify JOINs
   - **Option B: Increase timeout** - Quick fix but may just delay the problem
   - **Option C: Graceful degradation** - If one facet fails, return the others
   - **Option D: Remove performer_tags from default facets** - Skip it for large datasets

3. **Backend files to check:**
   - `pkg/sqlite/scene_facets.go` - Scene facet implementations
   - `internal/api/resolver_query_facets.go` - GraphQL resolver
   - `pkg/sqlite/extension_indexes.go` - Fork-specific indexes

## Fix Applied (2025-01-06)

**Root cause:** The 30-second timeout added during facet improvements was too aggressive for large filtered datasets.

**Fix:** Removed the `context.WithTimeout(ctx, 30*time.Second)` from all 6 facet files:
- `pkg/sqlite/scene_facets.go`
- `pkg/sqlite/gallery_facets.go`
- `pkg/sqlite/group_facets.go`
- `pkg/sqlite/performer_facets.go`
- `pkg/sqlite/studio_facets.go`
- `pkg/sqlite/tag_facets.go`

**Rationale:**
- A fixed timeout is fragile as database size and hardware vary
- Users are already waiting for results - a slow result is better than no result
- The timeout didn't exist before the facet improvements and queries worked fine
- Queries will now complete naturally without artificial cutoff

## Performance Benchmark Results (2025-01-06)

Ran comprehensive benchmark on all scene facets using `test-data/stash-go.sqlite` (~700k scenes).
Filter: Excluding one studio (simulates real filtered query).

| Facet | Run 1 | Run 2 | Run 3 | Status |
|-------|-------|-------|-------|--------|
| **Tags** | 53.6s | 41.4s | 42.3s | ❌ VERY SLOW |
| **Performers** | 12.2s | 10.4s | 10.0s | ❌ SLOW |
| **PerformerTags** | 9.4s | 8.7s | 8.6s | ❌ SLOW |
| Studios | 1.3s | 1.2s | 1.2s | ⚠️ Okay |
| Organized | 1.6s | 1.3s | 1.3s | ⚠️ Okay |
| Resolutions | 2.9s | 1.1s | 1.2s | ⚠️ Okay |
| Groups | 1.3s | 369ms | 393ms | ✅ Fast |
| HasMarkers | 403ms | 355ms | 359ms | ✅ Fast |
| PerformerFavorite | 574ms | 546ms | 505ms | ✅ Fast |
| Captions | 239ms | 65ms | 67ms | ✅ Fast |
| Ratings | 1ms | ~0ms | ~0ms | ✅ Very Fast |

**Key Insight:** The `Tags` facet is the **slowest at 41+ seconds** - this is the exact facet the user is trying to display! The 30-second timeout would kill Tags before PerformerTags even became an issue.

**Root Cause Analysis:**
- The CTE-based approach for filtered queries creates massive intermediate result sets
- Tags query joins `scenes_tags` (~millions of rows) with the full filtered CTE (~600k+ scenes)
- The `COUNT(DISTINCT scene_id) GROUP BY tag_id` aggregation is expensive
- Run 1 is always slower due to cold cache; subsequent runs benefit from SQLite page cache

**Potential Optimizations to Investigate:**
1. Add covering indexes for the Tags facet query
2. Consider materialized views or pre-computed counts
3. Lazy-load slow facets (Tags, Performers, PerformerTags) only when user expands that section
4. Skip slow facets entirely for filtered queries and show "Filter to see counts"

## Benchmark Test Added

Added `TestTimeAllSceneFacets` to `pkg/sqlite/facets_benchmark_test.go` for comprehensive performance testing.

Run with:
```bash
go test -v -tags=benchmark ./pkg/sqlite/... -run=TestTimeAllSceneFacets -timeout=5m
```

## Deep Dive: Why Tags Facet is Slow (2025-01-06)

### Database Statistics
```
Scenes:                   788,736
Tags:                     1,546
scenes_tags rows:         9,038,093  (9 million!)
groups_scenes rows:       203,276
Ratio:                    44.5x more scene-tag rows than group-scene rows
```

The `scenes_tags` junction table has **9 million rows** - this is why Tags is slow while Groups (only 203k rows) is fast.

### Indexes on scenes_tags
```
sqlite_autoindex_scenes_tags_1      (primary key)
index_scenes_tags_on_tag_id         (upstream index)
idx_ext_scenes_tags_scene_tag       (our extension index: scene_id, tag_id)
```

### Query Plan Analysis

**Current CTE approach (SLOW - 40s):**
```
SCAN t                                          <- Scans ALL 1,546 tags first
SEARCH st USING INDEX index_scenes_tags_on_tag_id (tag_id=?)  <- WRONG INDEX!
BLOOM FILTER ON s (id=?)                        <- Expensive filter
SEARCH s USING INTEGER PRIMARY KEY (rowid=?)
USE TEMP B-TREE FOR count(DISTINCT)             <- Expensive
USE TEMP B-TREE FOR ORDER BY
```

**IN subquery approach (FAST - 7.5s):**
```
SEARCH st USING COVERING INDEX idx_ext_scenes_tags_scene_tag (scene_id=?)  <- OUR INDEX!
LIST SUBQUERY 1
SCAN s USING COVERING INDEX index_scenes_on_studio_id
SEARCH t USING INTEGER PRIMARY KEY (rowid=?)
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR count(DISTINCT)
USE TEMP B-TREE FOR ORDER BY
```

**Key difference:** The IN subquery approach uses our extension index `idx_ext_scenes_tags_scene_tag`, while the CTE approach uses the wrong index `index_scenes_tags_on_tag_id`.

### Alternative Query Approaches Tested

| Query Structure | Cold | Warm | Speedup |
|----------------|------|------|---------|
| **2_Subquery in WHERE** | **7.6s** | **7.5s** | **5.3x faster!** |
| 5_Count without DISTINCT | 38.0s | 34.8s | 1.15x |
| 1_Current (CTE first) | 40.1s | 40.1s | baseline |
| 4_Direct JOIN | 42.9s | 40.4s | slower |
| 3_EXISTS | 42.5s | 42.1s | slower |

### Proposed Fix for Tags Facet

**Current query in `getTagsFacet()` (slow):**
```sql
WITH filtered_scenes AS (%s)
SELECT t.id, t.name as label, COUNT(DISTINCT st.scene_id) as count
FROM filtered_scenes fs
INNER JOIN scenes_tags st ON fs.id = st.scene_id
INNER JOIN tags t ON st.tag_id = t.id
GROUP BY t.id
ORDER BY count DESC
LIMIT ?
```

**Proposed query (5x faster):**
```sql
SELECT t.id, t.name as label, COUNT(DISTINCT st.scene_id) as count
FROM scenes_tags st
INNER JOIN tags t ON st.tag_id = t.id
WHERE st.scene_id IN (%s)
GROUP BY t.id
ORDER BY count DESC
LIMIT ?
```

### Files to Modify

1. `pkg/sqlite/scene_facets.go` - Update `getTagsFacet()` function (line ~677)
2. Consider same optimization for:
   - `getPerformersFacet()` - also slow at 10s
   - `getPerformerTagsFacet()` - slow at 8.7s
   - Other entity facet files (gallery_facets.go, etc.)

### Next Steps

1. [x] Update `getTagsFacet()` to use IN subquery approach
2. [x] Test if same optimization helps Performers facet
3. [x] Test if same optimization helps PerformerTags facet
4. [ ] Run full benchmark to verify improvements
5. [x] Apply same pattern to other facet files if beneficial
6. [ ] Remove debug logging from `useFacetCounts.ts` after fix is confirmed

## Optimization Implemented (2025-01-06)

Applied IN subquery optimization to all junction table facets across all entity types:

### Files Modified

| File | Functions Updated |
|------|-------------------|
| `scene_facets.go` | `getTagsFacet`, `getPerformersFacet`, `getGroupsFacet`, `getPerformerTagsFacet` |
| `gallery_facets.go` | `getTagsFacet`, `getPerformersFacet`, `getPerformerTagsFacet` |
| `group_facets.go` | `getTagsFacet`, `getPerformersFacet` |
| `performer_facets.go` | `getTagsFacet`, `getStudiosFacet` |

### Query Pattern Change

```sql
-- Before (CTE - slow, uses wrong index):
WITH filtered_scenes AS (%s)
SELECT t.id, t.name as label, COUNT(DISTINCT st.scene_id) as count
FROM filtered_scenes fs
INNER JOIN scenes_tags st ON fs.id = st.scene_id
...

-- After (IN subquery - 5x faster, uses extension index):
SELECT t.id, t.name as label, COUNT(DISTINCT st.scene_id) as count
FROM scenes_tags st
INNER JOIN tags t ON st.tag_id = t.id
WHERE st.scene_id IN (%s)
...
```

### Timeout Re-added

Added 60-second timeout to all 6 facet files:
- `scene_facets.go`
- `gallery_facets.go`
- `group_facets.go`
- `performer_facets.go`
- `studio_facets.go`
- `tag_facets.go`

```go
ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
defer cancel()
```

### Benchmark Results (Verified 2025-01-06)

| Facet | CTE (old) | IN (new) | Speedup |
|-------|-----------|----------|---------|
| **Tags** | 41s | 7.0s | **5.8x faster** |
| **Performers** | 10.4s | 3.1s | **3.4x faster** |
| **PerformerTags** | 8.9s | 7.0s | **1.3x faster** |
| Groups | 400ms | 750ms | 0.5x (slower) |

**Key findings:**
- Tags: 5.8x faster - the main problem facet now completes in 7s
- Performers: 3.4x faster - from 10s to 3s
- PerformerTags: 1.3x faster - modest improvement
- Groups: Slower with IN but already fast (<1s), negligible impact

All facets now complete well within the 60s timeout.

### Remaining Work

1. [x] Run benchmark to verify improvements
2. [x] Remove debug logging from `useFacetCounts.ts`
3. [x] Test in production - PASSED (2025-01-06)
4. [ ] Consider reverting Groups facet to CTE (IN is slower for small tables) - optional, negligible impact

## Build Status

Frontend build completed successfully:
```
npm run build  # in ui/v2.5
```

Output in `ui/v2.5/build/` directory.

## Relevant CLAUDE.md Sections

- Frontend extension strategy: `ui/v2.5/src/extensions/`
- Test data: `test-data/stash-go.sqlite` (~700k scenes)
- Server: `http://192.168.4.144:6969` (credentials in `.claude/credentials.local`)

## Related Files Changed

Debug logging has been removed from:
- `ui/v2.5/src/extensions/hooks/useFacetCounts.ts` ✅ cleaned up
