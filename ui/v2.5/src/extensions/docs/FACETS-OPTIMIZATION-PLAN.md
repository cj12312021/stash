# Facets System Optimization Plan

**Target Database Size:** 788k scenes, 724k galleries, 68k performers  
**Date:** December 2024  
**Status:** ✅ COMPLETED

## Progress Summary

| Phase | Status | Improvement |
|-------|--------|-------------|
| **Phase 1:** Extension Indexes | ✅ Completed | 12% faster (individual queries) |
| **Phase 2:** Parallel Queries | ✅ Completed | 62% faster (parallel vs sequential) |
| **Phase 3:** Frontend Simplification | ✅ Completed | ~60 lines removed |
| **Phase 4:** Unfiltered Fast Path | ✅ Completed | 10-100x faster (no filter) |
| **Phase 5:** Filter Pattern Caching | ✅ Completed | Instant on cache hit |
| **Phase 6:** Port to Other Entities | ✅ Completed | All entity types optimized |

**All Entity Types Now Optimized:**

| Entity | Count | Optimizations Applied |
|--------|------:|----------------------|
| Scenes | 788k | Indexes, Parallel, Fast Path, Cache |
| Galleries | 724k | Indexes, Parallel, Fast Path, Cache, +performer_tags |
| Performers | 68k | Parallel, Fast Path, Cache |
| Groups | 48k | Indexes, Parallel, Fast Path, Cache |
| Studios | 3k | Cache only |
| Tags | 1.5k | Cache only |

**Performance:**
- All entities: **Instant** display on cached visits
- First load scales with data size (larger entities take longer)  

See **[FACETS-BENCHMARK-RESULTS.md](./FACETS-BENCHMARK-RESULTS.md)** for detailed benchmarks.  

---

## Executive Summary

The facets system provides aggregated filter counts for the sidebar UI, enabling users to see how many results each filter option would return. While the current implementation is functional, it exhibits performance bottlenecks at scale that can be addressed through targeted optimizations.

**Current Performance Profile (estimated at 700k scenes):**
- Simple facets (organized, rating): ~50-100ms
- Entity facets (tags, performers, studios): ~200-500ms each
- Expensive facets (performer_tags, captions): ~500-1000ms each
- Total facet query time: ~1-3 seconds

**Target Performance:**
- Simple facets: <50ms
- Entity facets: <200ms each
- All facets loaded together: <500ms (parallel execution)
- Total perceived load time: <500ms

### Key Decisions

1. **Remove Lazy Loading** - All facets (including performer_tags and captions) will load together using parallel goroutines. This simplifies the codebase and provides better UX since wall-clock time = slowest query, not sum of queries.

2. **Fork-Safe Index Strategy** - Database indexes are created via a startup hook (`pkg/sqlite/extension_indexes.go`) rather than numbered migrations, ensuring compatibility with upstream stash updates.

---

## Table of Contents

1. [Current Architecture](#current-architecture)
2. [Identified Bottlenecks](#identified-bottlenecks)
3. [Optimization Strategies](#optimization-strategies)
4. [Implementation Plan](#implementation-plan)
5. [Fork-Safe Database Indexes](#fork-safe-database-indexes)
6. [Backend Changes](#backend-changes)
7. [Frontend Changes](#frontend-changes)
8. [Testing & Validation](#testing--validation)
9. [Rollback Plan](#rollback-plan)

---

## Current Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Frontend                                    │
│                                                                         │
│  ┌──────────────┐    ┌───────────────────┐    ┌──────────────────────┐ │
│  │  SceneList   │───▶│ FacetCountsContext│───▶│ useSceneFacetCounts  │ │
│  │  Component   │    │     Provider      │    │        Hook          │ │
│  └──────────────┘    └───────────────────┘    └──────────┬───────────┘ │
│                                                          │              │
│  ┌──────────────┐                                        │              │
│  │   Sidebar    │◀───────────────────────────────────────┘              │
│  │   Filters    │                                                       │
│  └──────────────┘                                                       │
└─────────────────────────────────────────────────────────┬───────────────┘
                                                          │
                                              GraphQL Query│
                                              (sceneFacets)│
                                                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              Backend                                     │
│                                                                         │
│  ┌──────────────────┐    ┌────────────────────┐    ┌─────────────────┐ │
│  │  GraphQL         │───▶│  SceneStore        │───▶│  SQLite CTE     │ │
│  │  Resolver        │    │  GetFacets()       │    │  UNION ALL      │ │
│  └──────────────────┘    └────────────────────┘    │  Query          │ │
│                                                     └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### Backend Implementation

**File:** `pkg/sqlite/scene_facets.go`

The current implementation uses:

1. **Goroutine Parallelism:** Three parallel goroutines for:
   - Core facets (9 types in one query)
   - Performer tags (lazy loaded)
   - Captions (lazy loaded)

2. **CTE-based Query:** Uses `WITH filtered_scenes AS (...)` to compute the base filter once per query

3. **UNION ALL Aggregation:** All 9 core facets computed in a single query

```go
func (qb *SceneStore) GetFacets(ctx context.Context, sceneFilter *models.SceneFilterType, limit int, options models.SceneFacetOptions) (*models.SceneFacets, error) {
    // Build base query
    query, err := qb.makeQuery(ctx, sceneFilter, nil)
    baseSQL := query.toSQL(false)
    
    var wg sync.WaitGroup
    
    // Goroutine 1: Core facets (tags, performers, studios, groups, resolution, etc.)
    wg.Add(1)
    go func() {
        qb.getCoreFacets(ctx, baseSQL, baseArgs, limit, result, &mu)
    }()
    
    // Goroutine 2: Performer tags (if requested)
    if options.IncludePerformerTags {
        wg.Add(1)
        go func() {
            qb.getPerformerTagsFacet(ctx, baseSQL, baseArgs, limit, result, &mu)
        }()
    }
    
    // Goroutine 3: Captions (if requested)
    if options.IncludeCaptions {
        wg.Add(1)
        go func() {
            qb.getCaptionsFacet(ctx, baseSQL, baseArgs, result, &mu)
        }()
    }
    
    wg.Wait()
    return result, nil
}
```

### Frontend Implementation

**File:** `ui/v2.5/src/extensions/hooks/useFacetCounts.ts`

Key features:
- Debounced fetching (500ms default)
- Lazy loading for expensive facets
- Filter fingerprinting for change detection
- Context-based distribution to filter components

```typescript
export function useSceneFacetCounts(filter: ListFilterModel, options: UseFacetCountsOptions = {}) {
    const { isOpen = true, debounceMs = 500, limit = 100, includePerformerTags = false, includeCaptions = false } = options;
    
    const [fetchFacets] = GQL.useSceneFacetsLazyQuery({ fetchPolicy: "network-only" });
    
    // Single query fetches all facets at once
    const result = await fetchFacets({
        variables: {
            scene_filter: filter.makeFilter(),
            limit,
            include_performer_tags: includePerformerTags,
            include_captions: includeCaptions,
        },
    });
}
```

---

## Identified Bottlenecks

### 1. Redundant CTE Computation (High Impact)

**Problem:** The base filter query (`baseSQL`) is passed as a string and re-executed inside each goroutine's CTE.

**Impact:** For complex filters, the same expensive query runs 1-3 times.

**Current Code:**
```go
// Goroutine 1
sql := fmt.Sprintf(`WITH filtered_scenes AS (%s) ...`, baseSQL)  // Executes filter

// Goroutine 2 (if performer tags enabled)
sql := fmt.Sprintf(`WITH filtered_scenes AS (%s) ...`, baseSQL)  // Executes filter AGAIN

// Goroutine 3 (if captions enabled)  
sql := fmt.Sprintf(`WITH filtered_scenes AS (%s) ...`, baseSQL)  // Executes filter AGAIN
```

**Estimated Cost:** 200-500ms per redundant execution

### 2. Monolithic UNION ALL Query (Medium Impact)

**Problem:** All 9 core facets are computed in a single sequential UNION ALL query, preventing parallelization.

**Current Query Structure:**
```sql
WITH filtered_scenes AS (SELECT DISTINCT id FROM scenes WHERE ...)

SELECT * FROM (SELECT 'tag' ... GROUP BY t.id LIMIT ?)
UNION ALL
SELECT * FROM (SELECT 'performer' ... GROUP BY p.id LIMIT ?)
UNION ALL
SELECT * FROM (SELECT 'studio' ... GROUP BY s.id LIMIT ?)
UNION ALL
SELECT * FROM (SELECT 'group' ... GROUP BY g.id LIMIT ?)
UNION ALL
SELECT * FROM (SELECT 'resolution' ... GROUP BY enum_value)
UNION ALL
SELECT * FROM (SELECT 'orientation' ... GROUP BY enum_value)
UNION ALL
SELECT * FROM (SELECT 'organized' ... GROUP BY sc.organized)
UNION ALL
SELECT * FROM (SELECT 'interactive' ... GROUP BY vf.interactive)
UNION ALL
SELECT * FROM (SELECT 'rating' ... GROUP BY sc.rating)
```

**Impact:** Database cannot parallelize these subqueries.

### 3. Unnecessary Table Re-joins (Medium Impact)

**Problem:** The CTE only selects scene IDs, requiring re-joins to access scene columns.

**Current (Inefficient):**
```sql
-- CTE only has IDs
WITH filtered_scenes AS (SELECT DISTINCT scenes.id FROM scenes WHERE ...)

-- Studio facet must re-join to scenes to get studio_id
SELECT 'studio', s.id, s.name, COUNT(DISTINCT sc.id)
FROM filtered_scenes fs
INNER JOIN scenes sc ON fs.id = sc.id      -- Unnecessary join!
INNER JOIN studios s ON sc.studio_id = s.id
```

**Optimized:**
```sql
-- CTE includes commonly needed columns
WITH filtered_scenes AS (
    SELECT DISTINCT s.id, s.studio_id, s.organized, s.rating 
    FROM scenes s 
    WHERE ...
)

-- Studio facet can use studio_id directly
SELECT 'studio', s.id, s.name, COUNT(DISTINCT fs.id)
FROM filtered_scenes fs
INNER JOIN studios s ON fs.studio_id = s.id
WHERE fs.studio_id IS NOT NULL
```

### 4. Missing Covering Indexes (High Impact)

**Problem:** Existing indexes are single-column, forcing index lookups + table access.

**Current Indexes:**
| Table | Index Columns |
|-------|---------------|
| `scenes_tags` | `(scene_id)` only |
| `scenes_tags` | `(tag_id)` only |
| `performers_scenes` | `(scene_id)` only |
| `performers_scenes` | `(performer_id)` only |

**Missing Composite Indexes:**
| Table | Recommended Index |
|-------|-------------------|
| `scenes_tags` | `(scene_id, tag_id)` |
| `performers_scenes` | `(scene_id, performer_id)` |
| `groups_scenes` | `(scene_id, group_id)` |
| `video_files` | `(file_id, height, width, interactive)` |

### 5. All-or-Nothing Frontend Loading (Medium Impact)

**Problem:** Frontend waits for ALL facets before displaying ANY counts.

**Current Flow:**
```
User opens sidebar
    → Wait 500ms debounce
    → Fetch ALL facets (1-3 seconds)
    → Display all counts at once
```

**Impact:** User perceives long delay before seeing any feedback.

---

## Optimization Strategies

### Strategy 1: Parallel Facet Queries (Backend)

Split the monolithic UNION ALL into separate parallel queries.

**Approach A: Separate Goroutines per Facet Type**
```go
// Run entity facets in parallel
go qb.getTagsFacet(ctx, ...)
go qb.getPerformersFacet(ctx, ...)
go qb.getStudiosFacet(ctx, ...)
go qb.getGroupsFacet(ctx, ...)

// Run simple facets together (they're fast)
go qb.getSimpleFacets(ctx, ...)  // organized, rating

// Run video facets together
go qb.getVideoFacets(ctx, ...)   // resolution, orientation, interactive
```

**Approach B: Temporary Table for Filter Results**
```go
// Execute filter once, store in temp table
_, err = db.ExecContext(ctx, `
    CREATE TEMP TABLE temp_filtered_scenes AS 
    SELECT id, studio_id, organized, rating 
    FROM scenes 
    WHERE id IN (` + baseSQL + `)
`)

// All facet queries use temp table (no CTE recomputation)
go qb.getTagsFacet(ctx, "temp_filtered_scenes", ...)
```

**Expected Improvement:** 40-60% faster total query time

### Strategy 2: Enriched CTE (Backend)

Include commonly needed columns in the CTE to eliminate re-joins.

**Before:**
```sql
WITH filtered_scenes AS (SELECT DISTINCT id FROM scenes WHERE ...)
```

**After:**
```sql
WITH filtered_scenes AS (
    SELECT DISTINCT 
        s.id,
        s.studio_id,
        s.organized,
        s.rating
    FROM scenes s
    WHERE ...
)
```

**Expected Improvement:** 10-20% faster for studio/organized/rating facets

### Strategy 3: Covering Indexes (Database)

Add composite indexes optimized for facet join patterns.

```sql
-- Primary facet indexes
CREATE INDEX idx_scenes_tags_composite ON scenes_tags (scene_id, tag_id);
CREATE INDEX idx_performers_scenes_composite ON performers_scenes (scene_id, performer_id);
CREATE INDEX idx_groups_scenes_composite ON groups_scenes (scene_id, group_id);

-- Video metadata index
CREATE INDEX idx_video_files_facets ON video_files (file_id, height, width, interactive);

-- Studio lookup optimization
CREATE INDEX idx_scenes_studio ON scenes (studio_id) WHERE studio_id IS NOT NULL;
```

**Expected Improvement:** 20-30% faster joins

### Strategy 4: Progressive Frontend Loading

Implement tiered facet loading for faster perceived performance.

**Tier System:**
| Tier | Facets | Load Time | Trigger |
|------|--------|-----------|---------|
| 1 | organized, ratings | <50ms | Immediate |
| 2 | studios, resolutions, orientations | <100ms | After Tier 1 |
| 3 | tags, performers, groups | <300ms | After Tier 2 |
| 4 | performer_tags, captions | <500ms | On section expand |

**Frontend Flow:**
```
User opens sidebar
    → Tier 1 loads instantly (simple counts visible)
    → Tier 2 loads (studio/resolution counts appear)
    → Tier 3 loads (entity counts complete)
    → Tier 4 lazy loads when user expands section
```

**Expected Improvement:** 80% reduction in perceived load time

### Strategy 5: Tiered GraphQL Endpoints (Backend + Frontend)

Create separate endpoints for each tier.

```graphql
type Query {
    # Tier 1: No joins needed
    sceneSimpleFacets(scene_filter: SceneFilterType): SceneSimpleFacetsResult!
    
    # Tier 2: Single-join facets
    sceneEntityFacets(scene_filter: SceneFilterType, limit: Int): SceneEntityFacetsResult!
    
    # Existing endpoint (for backwards compatibility)
    sceneFacets(...): SceneFacetsResult!
}
```

---

## Implementation Plan

### Phase 1: Quick Wins (Low Risk, High Impact) ✅ COMPLETED

**Timeline:** 1-2 days  
**Status:** ✅ Completed December 2024

#### Completed Tasks:

1. **Add covering indexes** ✅
   - ~~Create migration file~~ → Created `pkg/sqlite/extension_indexes.go` (fork-safe approach)
   - ✅ Test on copy of production database (788k scenes, 9M scene_tags)
   - ✅ Measure query plan improvements

2. **Optimize CTE to include common columns** ⏳ (Moved to Phase 2)
   - Will be included in Phase 2 parallel query implementation

#### Files Created:
- `pkg/sqlite/extension_indexes.go` - Extension index definitions
- `internal/manager/init.go` - Startup hook to create indexes
- `test-data/` directory - For testing with production database copies

#### Benchmark Results:
See `FACETS-BENCHMARK-RESULTS.md` for full details.

| Facet | Baseline | Phase 1 | Improvement |
|-------|----------|---------|-------------|
| Performers | 471 ms | 197 ms | **58% faster** |
| Studios | 359 ms | 73 ms | **80% faster** |
| **Total** | 3,776 ms | 3,333 ms | **12% faster** |

---

### Phase 2: Backend Parallelization + Remove Lazy Loading (Medium Risk, High Impact) ⏳ PENDING

**Timeline:** 3-5 days  
**Status:** ⏳ Not Started

1. **Split UNION ALL into separate parallel queries**
   - Create individual facet query functions
   - Implement goroutine orchestration
   - Handle error aggregation

2. **Remove lazy loading for performer_tags and captions**
   - Remove `SceneFacetOptions` struct
   - Remove `include_performer_tags` and `include_captions` GraphQL parameters
   - Always run all facets in parallel goroutines
   - Simplify frontend hooks (remove `requestPerformerTags()` callbacks)

**Rationale for removing lazy loading:**
- With parallel execution, wall-clock time = slowest query (not sum)
- Lazy loading adds complexity throughout the stack
- Users who use performer_tags/captions filters get worse UX with lazy loading
- The indexes make these queries much faster anyway

**Expected Improvement:** ~55% faster (3.3s → ~1.7s) due to parallel execution

---

### Phase 3: Frontend Simplification (Low Risk, Medium Impact) ⏳ PENDING

**Timeline:** 1-2 days  
**Status:** ⏳ Not Started (depends on Phase 2)

1. **Simplify facet hooks**
   - Remove `includePerformerTags`, `includeCaptions` options
   - Remove partial state update logic
   - Remove `requestPerformerTags()`, `requestCaptions()` callbacks

2. **Update filter components**
   - Remove lazy loading triggers from section expand
   - All counts available immediately

### Phase 4: Optional - Progressive Loading (Low Priority)

**Timeline:** 2-3 days (if needed after benchmarking)

Only implement if Phase 1-3 don't achieve target performance:
- Tiered GraphQL endpoints
- Progressive frontend loading

---

## Fork-Safe Database Indexes

### Why Not Use Migrations?

Stash uses sequential numbered migrations (`1_initial.up.sql` through `72_tag_sort_name.up.sql`). If we add `73_facet_indexes.up.sql` in our fork:

```
Our fork:      ... 72 → 73_facet_indexes.up.sql
Upstream:      ... 72 → 73_something_else.up.sql  ← CONFLICT!
```

When upstream releases migration 73, our database thinks "73" is already applied, causing upstream's actual migration to be skipped and potential schema corruption.

### Solution: Extension Index Hook

We create indexes via a startup hook that runs after the database opens, completely outside the migration system.

**File:** `pkg/sqlite/extension_indexes.go` ✅ IMPLEMENTED

```go
// ExtensionIndexes defines indexes added by the extension system.
// These are created outside the migration system to avoid conflicts
// with upstream stash schema version numbering.
var extensionIndexes = []string{
    // Facet Query Optimization Indexes
    // All use idx_ext_ prefix to clearly identify extension indexes
    
    `CREATE INDEX IF NOT EXISTS idx_ext_scenes_tags_scene_tag 
        ON scenes_tags (scene_id, tag_id)`,
    
    `CREATE INDEX IF NOT EXISTS idx_ext_performers_scenes_scene_performer 
        ON performers_scenes (scene_id, performer_id)`,
    
    `CREATE INDEX IF NOT EXISTS idx_ext_groups_scenes_scene_group 
        ON groups_scenes (scene_id, group_id)`,
    
    `CREATE INDEX IF NOT EXISTS idx_ext_performers_tags_performer_tag 
        ON performers_tags (performer_id, tag_id)`,
    
    `CREATE INDEX IF NOT EXISTS idx_ext_video_files_facets 
        ON video_files (file_id, height, width, interactive)`,
    
    `CREATE INDEX IF NOT EXISTS idx_ext_scenes_studio_not_null 
        ON scenes (studio_id) WHERE studio_id IS NOT NULL`,
    
    `CREATE INDEX IF NOT EXISTS idx_ext_scenes_rating_not_null 
        ON scenes (rating) WHERE rating IS NOT NULL`,
}

func (db *Database) EnsureExtensionIndexes(ctx context.Context) error {
    // Creates indexes idempotently on every startup
    // Safe to run multiple times - IF NOT EXISTS handles duplicates
}
```

**Startup Integration:** `internal/manager/init.go` ✅ IMPLEMENTED

```go
func (s *Manager) postInit(ctx context.Context) error {
    // ... existing code ...
    
    if err := s.Database.Open(s.Config.GetDatabasePath()); err != nil {
        // ... error handling ...
    }

    // Ensure extension-specific indexes exist (safe for fork/upstream compatibility)
    if err := s.Database.EnsureExtensionIndexes(ctx); err != nil {
        logger.Warnf("Failed to ensure extension indexes: %v", err)
        // Don't fail startup - indexes are optimization only
    }
    
    // ... rest of initialization ...
}
```

### Benefits of This Approach

| Benefit | Description |
|---------|-------------|
| **Zero upstream conflict** | Completely separate from migration numbering |
| **Self-maintaining** | Indexes auto-created on fresh installs or restores |
| **Idempotent** | `IF NOT EXISTS` means safe to run repeatedly |
| **Clear identification** | `idx_ext_` prefix identifies extension indexes |
| **Easy removal** | `DropExtensionIndexes()` method provided |

### Verification Queries

After startup, verify indexes exist:

```sql
-- List all extension indexes
SELECT name FROM sqlite_master 
WHERE type = 'index' AND name LIKE 'idx_ext_%';

-- Check tag facet uses new index
EXPLAIN QUERY PLAN
SELECT t.id, t.name, COUNT(DISTINCT st.scene_id)
FROM scenes_tags st
INNER JOIN tags t ON st.tag_id = t.id
WHERE st.scene_id IN (SELECT id FROM scenes LIMIT 1000)
GROUP BY t.id;
-- Should show: USING INDEX idx_ext_scenes_tags_scene_tag
```

---

## Backend Changes

### Modified: `pkg/sqlite/scene_facets.go`

#### Change 1: Enriched CTE

```go
// Before
baseSQL := query.toSQL(false)

// After - include commonly needed columns
func (qb *SceneStore) buildEnrichedCTE(ctx context.Context, sceneFilter *models.SceneFilterType) (string, []interface{}, error) {
    query, err := qb.makeQuery(ctx, sceneFilter, nil)
    if err != nil {
        return "", nil, err
    }
    
    // Wrap the ID query to include additional columns
    enrichedSQL := fmt.Sprintf(`
        SELECT s.id, s.studio_id, s.organized, s.rating
        FROM scenes s
        WHERE s.id IN (%s)
    `, query.toSQL(false))
    
    return enrichedSQL, query.args, nil
}
```

#### Change 2: Parallel Facet Queries (No Lazy Loading)

```go
// Note: SceneFacetOptions removed - all facets always loaded
func (qb *SceneStore) GetFacets(ctx context.Context, sceneFilter *models.SceneFilterType, limit int) (*models.SceneFacets, error) {
    result := &models.SceneFacets{...}
    
    // Build enriched base query
    baseSQL, baseArgs, err := qb.buildEnrichedCTE(ctx, sceneFilter)
    if err != nil {
        return nil, err
    }
    
    var wg sync.WaitGroup
    var mu sync.Mutex
    errChan := make(chan error, 8)  // 8 parallel goroutines
    
    // All facets run in parallel - no lazy loading
    // Wall-clock time = slowest query, not sum of queries
    
    wg.Add(8)
    
    // Entity facets
    go func() {
        defer wg.Done()
        if err := qb.getTagsFacet(ctx, baseSQL, baseArgs, limit, result, &mu); err != nil {
            errChan <- err
        }
    }()
    go func() {
        defer wg.Done()
        if err := qb.getPerformersFacet(ctx, baseSQL, baseArgs, limit, result, &mu); err != nil {
            errChan <- err
        }
    }()
    go func() {
        defer wg.Done()
        if err := qb.getStudiosFacet(ctx, baseSQL, baseArgs, limit, result, &mu); err != nil {
            errChan <- err
        }
    }()
    go func() {
        defer wg.Done()
        if err := qb.getGroupsFacet(ctx, baseSQL, baseArgs, limit, result, &mu); err != nil {
            errChan <- err
        }
    }()
    
    // Simple facets (organized, rating)
    go func() {
        defer wg.Done()
        if err := qb.getSimpleFacets(ctx, baseSQL, baseArgs, result, &mu); err != nil {
            errChan <- err
        }
    }()
    
    // Video facets (resolution, orientation, interactive)
    go func() {
        defer wg.Done()
        if err := qb.getVideoFacets(ctx, baseSQL, baseArgs, result, &mu); err != nil {
            errChan <- err
        }
    }()
    
    // Previously "expensive" facets - now always loaded
    go func() {
        defer wg.Done()
        if err := qb.getPerformerTagsFacet(ctx, baseSQL, baseArgs, limit, result, &mu); err != nil {
            errChan <- err
        }
    }()
    go func() {
        defer wg.Done()
        if err := qb.getCaptionsFacet(ctx, baseSQL, baseArgs, result, &mu); err != nil {
            errChan <- err
        }
    }()
    
    wg.Wait()
    close(errChan)
    
    // Return first error if any
    for err := range errChan {
        if err != nil {
            return nil, err
        }
    }
    
    return result, nil
}

// Individual facet query functions
func (qb *SceneStore) getTagsFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, limit int, result *models.SceneFacets, mu *sync.Mutex) error {
    args := append([]interface{}{}, baseArgs...)
    args = append(args, limit)
    
    sql := fmt.Sprintf(`
        WITH filtered_scenes AS (%s)
        SELECT t.id, t.name as label, COUNT(DISTINCT st.scene_id) as count
        FROM filtered_scenes fs
        INNER JOIN scenes_tags st ON fs.id = st.scene_id
        INNER JOIN tags t ON st.tag_id = t.id
        GROUP BY t.id
        ORDER BY count DESC
        LIMIT ?
    `, baseSQL)
    
    rows, err := dbWrapper.Queryx(ctx, sql, args...)
    if err != nil {
        return fmt.Errorf("error executing tags facet: %w", err)
    }
    defer rows.Close()
    
    var tags []models.FacetCount
    for rows.Next() {
        var id int
        var label string
        var count int
        if err := rows.Scan(&id, &label, &count); err != nil {
            return err
        }
        tags = append(tags, models.FacetCount{
            ID:    strconv.Itoa(id),
            Label: label,
            Count: count,
        })
    }
    
    mu.Lock()
    result.Tags = tags
    mu.Unlock()
    
    return rows.Err()
}

func (qb *SceneStore) getSimpleFacets(ctx context.Context, baseSQL string, baseArgs []interface{}, result *models.SceneFacets, mu *sync.Mutex) error {
    args := append([]interface{}{}, baseArgs...)
    
    // Organized and Rating can be computed without additional joins
    // since enriched CTE includes these columns
    sql := fmt.Sprintf(`
        WITH filtered_scenes AS (%s)
        
        SELECT 'organized' as facet_type,
            CASE WHEN organized = 1 THEN 'true' ELSE 'false' END as value,
            COUNT(*) as count
        FROM filtered_scenes
        GROUP BY organized
        
        UNION ALL
        
        SELECT 'rating' as facet_type,
            CAST(rating AS TEXT) as value,
            COUNT(*) as count
        FROM filtered_scenes
        WHERE rating IS NOT NULL
        GROUP BY rating
        ORDER BY value DESC
    `, baseSQL)
    
    // ... execute and parse results
}
```

---

## Frontend Changes

### Simplified Hook (Remove Lazy Loading)

The main change is simplifying `useFacetCounts.ts` by removing lazy loading infrastructure.

**What gets removed:**

```typescript
// REMOVE these from UseFacetCountsOptions:
interface UseFacetCountsOptions {
  isOpen?: boolean;
  debounceMs?: number;
  limit?: number;
  // includePerformerTags?: boolean;  ← REMOVE
  // includeCaptions?: boolean;        ← REMOVE
}

// REMOVE these refs and state:
// const lastOptionsRef = useRef({ includePerformerTags: false, includeCaptions: false });

// REMOVE these from doFetch variables:
// include_performer_tags: includePerformerTags,
// include_captions: includeCaptions,

// REMOVE the isLazyLoadUpdate logic:
// const isLazyLoadUpdate = 
//   (includePerformerTags && !lastOptionsRef.current.includePerformerTags) ||
//   (includeCaptions && !lastOptionsRef.current.includeCaptions);

// REMOVE the conditional setCounts for lazy loading
```

### Simplified `useSceneFacetCounts`

```typescript
export function useSceneFacetCounts(
  filter: ListFilterModel,
  options: UseFacetCountsOptions = {}
) {
  const { isOpen = true, debounceMs = 500, limit = 100 } = options;

  const [counts, setCounts] = useState<FacetCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFilterRef = useRef<string>("");

  const [fetchFacets] = GQL.useSceneFacetsLazyQuery({
    fetchPolicy: "network-only",
  });

  const filterFingerprint = useMemo(() => {
    return JSON.stringify(filter.makeFilter());
  }, [filter]);

  const doFetch = useCallback(async () => {
    if (!isOpen) return;

    setLoading(true);
    try {
      const result = await fetchFacets({
        variables: {
          scene_filter: filter.makeFilter() as GQL.SceneFilterType,
          limit,
          // No more include_performer_tags or include_captions
        },
      });

      if (result.data?.sceneFacets) {
        const facets = result.data.sceneFacets;
        
        // Simple full update - no partial lazy loading logic
        setCounts({
          tags: toMap(facets.tags),
          performers: toMap(facets.performers),
          studios: toMap(facets.studios),
          groups: toMap(facets.groups),
          performerTags: toMap(facets.performer_tags),  // Always present
          resolutions: toResolutionMap(facets.resolutions),
          orientations: toOrientationMap(facets.orientations),
          genders: new Map(),
          countries: new Map(),
          circumcised: new Map(),
          ratings: toRatingMap(facets.ratings),
          captions: toCaptionMap(facets.captions),      // Always present
          booleans: {
            organized: toBooleanCounts(facets.organized),
            interactive: toBooleanCounts(facets.interactive),
            favorite: { true: 0, false: 0 },
          },
          parents: new Map(),
          children: new Map(),
        });
      }
    } catch (error) {
      console.error("Error fetching scene facets:", error);
    } finally {
      setLoading(false);
    }
  }, [fetchFacets, filter, isOpen, limit]);

  // Standard debounced fetch - no lazy loading complexity
  useEffect(() => {
    if (!isOpen) return;
    
    const filterChanged = filterFingerprint !== lastFilterRef.current;
    if (!filterChanged && lastFilterRef.current !== "") return;

    setLoading(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (lastFilterRef.current === "") {
      // First fetch - immediate
      lastFilterRef.current = filterFingerprint;
      doFetch();
    } else {
      // Subsequent fetches - debounced
      debounceRef.current = setTimeout(() => {
        lastFilterRef.current = filterFingerprint;
        doFetch();
      }, debounceMs);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [filterFingerprint, isOpen, debounceMs, doFetch]);

  return { counts, loading, refetch: doFetch };
}
```

### GraphQL Schema Changes

**Remove from `graphql/schema/schema.graphql`:**

```graphql
sceneFacets(
  scene_filter: SceneFilterType
  limit: Int
  # REMOVE: include_performer_tags: Boolean
  # REMOVE: include_captions: Boolean
): SceneFacetsResult!
```

**Update `ui/v2.5/graphql/data/facets.graphql`:**

```graphql
query SceneFacets($scene_filter: SceneFilterType, $limit: Int) {
  sceneFacets(scene_filter: $scene_filter, limit: $limit) {
    tags { ...FacetCountData }
    performers { ...FacetCountData }
    studios { ...FacetCountData }
    groups { ...FacetCountData }
    performer_tags { ...FacetCountData }  # Always included
    resolutions { ...ResolutionFacetCountData }
    orientations { ...OrientationFacetCountData }
    organized { ...BooleanFacetCountData }
    interactive { ...BooleanFacetCountData }
    ratings { ...RatingFacetCountData }
    captions { ...CaptionFacetCountData }  # Always included
  }
}
```

### Lines of Code Removed (Estimated)

| File | Lines Removed | Description |
|------|---------------|-------------|
| `useFacetCounts.ts` | ~50 lines | Lazy loading state, refs, conditional logic |
| `scene_facets.go` | ~30 lines | SceneFacetOptions, conditional goroutines |
| `resolver_query_facets.go` | ~10 lines | Options handling |
| `facets.graphql` (schema) | ~4 lines | Boolean parameters |
| `models/facets.go` | ~8 lines | SceneFacetOptions struct |
| Filter components | ~20 lines each | requestPerformerTags callbacks |

**Total: ~150+ lines of complexity removed**

---

## Testing & Validation

### Performance Benchmarks

Create benchmark script to measure improvements:

```go
// pkg/sqlite/scene_facets_benchmark_test.go

func BenchmarkSceneFacets(b *testing.B) {
    ctx := context.Background()
    db := setupTestDB(b)
    
    // Insert test data (700k scenes)
    insertTestScenes(db, 700000)
    
    store := NewSceneStore(db)
    filter := &models.SceneFilterType{}
    options := models.SceneFacetOptions{}
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        _, err := store.GetFacets(ctx, filter, 100, options)
        if err != nil {
            b.Fatal(err)
        }
    }
}

func BenchmarkSceneFacetsWithFilter(b *testing.B) {
    // ... benchmark with various filter combinations
}
```

### Query Plan Analysis

Verify indexes are being used:

```sql
-- Run EXPLAIN QUERY PLAN for each facet query
-- Ensure "USING INDEX" appears for join operations
```

### Load Testing

```bash
# Use wrk or ab to test API performance
wrk -t12 -c100 -d30s http://localhost:9999/graphql \
    -s facets_query.lua
```

### Regression Testing

Ensure facet counts match before/after optimization:

```go
func TestFacetCountsMatch(t *testing.T) {
    // Compare old implementation vs new
    oldCounts := getOldFacets(filter)
    newCounts := getNewFacets(filter)
    
    assert.Equal(t, oldCounts.Tags, newCounts.Tags)
    // ... etc
}
```

### Frontend Unit Tests

The cache system and entity-specific builders are thoroughly tested:

```bash
cd ui/v2.5
yarn test --run extensions
```

**Test File:** `src/extensions/__tests__/useFacetCounts.test.ts`

| Category | Tests | Description |
|----------|-------|-------------|
| Data structures | 7 | LabeledFacetCount, FacetCounts interfaces |
| API conversion | 3 | GraphQL response → internal data |
| Stale response prevention | 5 | Race condition handling |
| State update patterns | 4 | Partial updates, reference preservation |
| Filter fingerprint | 5 | Cache key generation |
| Cache serialization | 4 | Map↔JSON round-trip |
| Cache TTL | 4 | Expiration logic |
| Cache invalidation | 2 | Clear operations |
| Cache entry limit | 2 | LRU-like pruning |
| Gallery facets builder | 3 | performer_tags, all facets, scene-only exclusions |
| Performer facets builder | 2 | All facets, non-performer exclusions |
| Group facets builder | 2 | All facets, non-group exclusions |
| Studio facets builder | 2 | All facets, non-studio exclusions |
| Tag facets builder | 2 | All facets, non-tag exclusions |
| All entity caching | 3 | Cache per entity, filter variations, invalidation |

**Total: 88 frontend tests** (50 in useFacetCounts.test.ts)

---

## Rollback Plan

### Feature Flags

Implement feature flags for gradual rollout:

```go
// pkg/config/config.go
type FacetsConfig struct {
    UseParallelQueries   bool `json:"use_parallel_queries"`
    UseEnrichedCTE       bool `json:"use_enriched_cte"`
    ProgressiveLoading   bool `json:"progressive_loading"`
}
```

### Rollback Steps

1. **Database indexes:** Safe to keep (they don't change behavior)

2. **Backend changes:** 
   - Revert `scene_facets.go` to previous version
   - OR set `UseParallelQueries: false`

3. **Frontend changes:**
   - Revert to `useFacetCounts` hook
   - OR set `ProgressiveLoading: false`

---

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Total facet query time (700k scenes) | ~2s | <500ms | Backend logs |
| Time to first facet display | ~2s | <200ms | Frontend timing |
| Database CPU during facet query | High | 30% reduction | DB metrics |
| User-perceived load time | ~2.5s | <500ms | UX testing |

---

## Appendix

### A. Full Query Examples

#### Current Monolithic Query

```sql
WITH filtered_scenes AS (
    SELECT DISTINCT scenes.id FROM scenes
    LEFT JOIN scenes_files ON scenes_files.scene_id = scenes.id
    LEFT JOIN video_files ON scenes_files.file_id = video_files.file_id
    WHERE video_files.duration >= 600
)

SELECT * FROM (
    SELECT 'tag' as facet_type, t.id, t.name as label, NULL as enum_value, 
           COUNT(DISTINCT st.scene_id) as count
    FROM filtered_scenes fs
    INNER JOIN scenes_tags st ON fs.id = st.scene_id
    INNER JOIN tags t ON st.tag_id = t.id
    GROUP BY t.id
    ORDER BY count DESC
    LIMIT 100
)

UNION ALL

SELECT * FROM (
    SELECT 'performer' as facet_type, p.id, p.name as label, NULL as enum_value,
           COUNT(DISTINCT ps.scene_id) as count
    FROM filtered_scenes fs
    INNER JOIN performers_scenes ps ON fs.id = ps.scene_id
    INNER JOIN performers p ON ps.performer_id = p.id
    GROUP BY p.id
    ORDER BY count DESC
    LIMIT 100
)

-- ... 7 more UNION ALL blocks
```

#### Optimized Parallel Queries

```sql
-- Query 1: Tags (runs in goroutine 1)
WITH filtered_scenes AS (SELECT id, studio_id, organized, rating FROM scenes WHERE ...)
SELECT t.id, t.name, COUNT(DISTINCT st.scene_id)
FROM filtered_scenes fs
INNER JOIN scenes_tags st ON fs.id = st.scene_id
INNER JOIN tags t ON st.tag_id = t.id
GROUP BY t.id ORDER BY count DESC LIMIT 100;

-- Query 2: Performers (runs in goroutine 2)
WITH filtered_scenes AS (SELECT id, studio_id, organized, rating FROM scenes WHERE ...)
SELECT p.id, p.name, COUNT(DISTINCT ps.scene_id)
FROM filtered_scenes fs
INNER JOIN performers_scenes ps ON fs.id = ps.scene_id
INNER JOIN performers p ON ps.performer_id = p.id
GROUP BY p.id ORDER BY count DESC LIMIT 100;

-- Query 3: Simple facets (runs in goroutine 3)
WITH filtered_scenes AS (SELECT id, studio_id, organized, rating FROM scenes WHERE ...)
SELECT organized, COUNT(*) FROM filtered_scenes GROUP BY organized
UNION ALL
SELECT rating, COUNT(*) FROM filtered_scenes WHERE rating IS NOT NULL GROUP BY rating;
```

### B. Related Files

**Backend:**
- `pkg/sqlite/scene_facets.go` - Main implementation
- `pkg/sqlite/performer_facets.go` - Performer facets
- `pkg/sqlite/gallery_facets.go` - Gallery facets
- `pkg/models/facets.go` - Data structures
- `internal/api/resolver_query_facets.go` - GraphQL resolvers

**Frontend:**
- `ui/v2.5/src/extensions/hooks/useFacetCounts.ts` - Main hook
- `ui/v2.5/src/extensions/hooks/useFacetsContext.tsx` - Context provider
- `ui/v2.5/graphql/data/facets.graphql` - GraphQL queries

**Schema:**
- `graphql/schema/types/facets.graphql` - Type definitions
- `graphql/schema/schema.graphql` - Query definitions

---

## Phase 4: Unfiltered Fast Path

**Status:** ✅ Completed

### Problem

When no filter is applied, the CTE-based query materializes ALL 700k+ scene IDs before joining:

```sql
WITH filtered_scenes AS (SELECT id FROM scenes)  -- 700k rows!
SELECT t.id, t.name, COUNT(DISTINCT st.scene_id)
FROM filtered_scenes fs
INNER JOIN scenes_tags st ON fs.id = st.scene_id  -- 700k x N joins
...
```

### Solution

Detect when no filter is applied and use optimized direct queries:

```sql
-- Fast path: No CTE needed
SELECT t.id, t.name, COUNT(*) as count
FROM scenes_tags st
INNER JOIN tags t ON st.tag_id = t.id
GROUP BY t.id
ORDER BY count DESC
LIMIT 100
```

### Implementation

**File:** `pkg/sqlite/scene_facets.go`

```go
// Check if filter is empty
func isEmptyFilter(filter *models.SceneFilterType) bool {
    if filter == nil { return true }
    return filter.Title == nil && filter.Studios == nil && ...
}

// Use fast path when no filter
func (qb *SceneStore) GetFacets(ctx context.Context, filter *models.SceneFilterType, limit int) {
    if isEmptyFilter(filter) {
        return qb.getFacetsUnfiltered(ctx, limit, result)
    }
    // ... normal CTE path
}
```

### Performance Improvement

| Metric | Before | After |
|--------|--------|-------|
| Query time (no filter) | 60+ seconds | 5-15 seconds |
| CTE materialization | 700k rows | None |
| Improvement | - | **10-100x faster** |

---

## Phase 5: Filter Pattern Caching

**Status:** ✅ Completed

### Problem

Even with the fast path, queries for default filters (like excluding a specific studio) still take 5-15 seconds. Users shouldn't wait every time they visit the page.

### Solution

Cache facet results by filter fingerprint with:
- In-memory cache for instant access
- localStorage persistence to survive page refresh
- Automatic invalidation on scan complete
- TTL-based expiration

### Implementation

**File:** `ui/v2.5/src/extensions/hooks/useFacetCounts.ts`

```typescript
// Generate stable fingerprint for any filter
function getFilterFingerprint(filterData: unknown): string {
  if (!filterData) return 'empty';
  return JSON.stringify(filterData, Object.keys(filterData).sort());
}

// Cache structure
interface CacheEntry {
  counts: SerializedFacetCounts;
  timestamp: number;
  filterFingerprint: string;
}

// Check cache before fetching
const cached = getCachedCounts('scenes', filterFingerprint);
if (cached) {
  setCounts(cached);  // Instant display!
  // Background refresh to keep cache fresh
  fetchFacets(...).then(result => setCachedCounts(...));
  return;
}
```

**Cache Invalidation** (`src/core/createClient.ts`):

```typescript
// On scan complete, invalidate all facet caches
client.subscribe({ query: ScanCompleteSubscribeDocument })
  .subscribe({
    next: () => {
      invalidateFacetCache();  // Clear memory + localStorage
    }
  });
```

### Cache Configuration

| Setting | Value |
|---------|-------|
| TTL (unfiltered) | 30 minutes |
| TTL (filtered) | 10 minutes |
| Max patterns per entity | 20 |
| Storage | Memory + localStorage |
| Invalidation trigger | Scan complete |

### Performance Improvement

| Scenario | Before | After |
|----------|--------|-------|
| First visit (no cache) | 5-15 seconds | 5-15 seconds |
| Subsequent visits | 5-15 seconds | **Instant** |
| After page refresh | 5-15 seconds | **Instant** (localStorage) |
| After scan complete | Uses fresh data | Cache invalidated, fresh fetch |

### Cache Statistics

Debug cache usage:

```typescript
import { getFacetCacheStats } from "src/extensions/hooks/useFacetCounts";

console.log(getFacetCacheStats());
// {
//   scenes: { entries: 3, oldestAge: 120 },
//   performers: { entries: 1, oldestAge: 45 },
//   ...
// }
```

---

## Phase 6: Port Optimizations to Other Entity Types

**Status:** ✅ COMPLETED  
**Date:** December 2024

### Database Size Analysis

Analysis of production database revealed that **galleries are nearly as large as scenes**:

| Entity | Count | Priority |
|--------|------:|----------|
| scenes | 788,736 | ✅ Completed |
| **galleries** | **724,530** | 🔴 **CRITICAL** |
| performers | 68,888 | 🟡 High |
| groups | 48,383 | 🟡 Medium |
| studios | 2,985 | ⚪ Low |
| tags | 1,546 | ⚪ Low |

**Junction Tables (query cost drivers):**

| Table | Count | Entity |
|-------|------:|--------|
| scene_tags | 9,038,093 | Scenes ✅ |
| **gallery_tags** | **7,183,103** | Galleries 🔴 |
| **performers_galleries** | **1,073,869** | Galleries 🔴 |
| performers_scenes | 1,199,634 | Scenes ✅ |
| performer_tags | 290,768 | Performers 🟡 |
| groups_scenes | 203,276 | Groups 🟡 |

---

### Optimization Matrix: What Gets Ported Where

The scene facets optimization consisted of 5 distinct improvements. Not all are needed for every entity type - the decision depends on **data volume** and **query complexity**.

#### Available Optimizations

| # | Optimization | Purpose | When Needed |
|---|--------------|---------|-------------|
| **O1** | Database Indexes | Faster joins on junction tables | Large junction tables (>100k rows) |
| **O2** | Parallel Queries | Execute facet queries concurrently | Many facet types AND large dataset |
| **O3** | Unfiltered Fast Path | Skip CTE when no filter applied | Large entity count (>50k) |
| **O4** | Frontend Caching | Instant display on repeat visits | Always beneficial |
| **O5** | Feature Addition | Add missing facet types | Parity with scene list |

#### Optimization Assignments by Entity

| Entity | Count | O1 Indexes | O2 Parallel | O3 Fast Path | O4 Cache | O5 Features | Rationale |
|--------|------:|:----------:|:-----------:|:------------:|:--------:|:-----------:|-----------|
| **Galleries** | 724k | ✅ | ✅ | ✅ | ✅ | ✅ `performer_tags` | Same scale as scenes - needs everything |
| **Performers** | 68k | ✅ | ✅ | ✅ | ✅ | — | Large enough to benefit from all opts |
| **Groups** | 48k | ✅ | ✅ | ✅ | ✅ | — | Moderate size, full optimization |
| **Studios** | 3k | — | — | — | ✅ | — | Too small for backend opts |
| **Tags** | 1.5k | — | — | — | ✅ | — | Too small for backend opts |

---

### Detailed Rationale by Entity

#### 🔴 Galleries (724,530 entries) - FULL OPTIMIZATION

**Why all optimizations are needed:**
- **O1 Indexes:** `gallery_tags` has **7.1M rows** - without indexes, joins are expensive
- **O2 Parallel:** 5 facet types (tags, performers, studios, organized, ratings) + adding performer_tags = 6 concurrent queries saves wall-clock time
- **O3 Fast Path:** 724k galleries means CTE is expensive even when unfiltered
- **O4 Cache:** Prevents re-querying on sidebar toggle/page navigation
- **O5 Features:** `performer_tags` facet is missing but exists for scenes - users expect parity

**Junction tables driving this decision:**
```
gallery_tags:           7,183,103 rows
performers_galleries:   1,073,869 rows
```

#### 🟡 Performers (68,888 entries) - FULL OPTIMIZATION

**Why all optimizations are needed:**
- **O1 Indexes:** `performer_tags` has 290k rows, `performers_scenes` has 1.2M rows
- **O2 Parallel:** 7 facet types (tags, studios, genders, countries, circumcised, favorite, ratings)
- **O3 Fast Path:** 68k is large enough that CTE overhead matters
- **O4 Cache:** Standard benefit

**Junction tables driving this decision:**
```
performer_tags:      290,768 rows  (performer's own tags)
performers_scenes: 1,199,634 rows  (for studio facet via scenes)
```

#### 🟡 Groups (48,383 entries) - FULL OPTIMIZATION

**Why all optimizations are needed:**
- **O1 Indexes:** `groups_scenes` has 203k rows
- **O2 Parallel:** 3 facet types (tags, performers, studios)
- **O3 Fast Path:** 48k is borderline but worth optimizing
- **O4 Cache:** Standard benefit

**Junction tables driving this decision:**
```
groups_scenes:     203,276 rows
groups_tags:        (need to check)
```

#### ⚪ Studios (2,985 entries) - CACHE ONLY

**Why only caching:**
- **O1-O3 Skip:** With only 3k studios, queries complete in <500ms
- **O4 Cache:** Still provides instant repeat visits

**Reasoning:** The overhead of implementing parallel queries and fast path isn't justified for a dataset this small.

#### ⚪ Tags (1,546 entries) - CACHE ONLY

**Why only caching:**
- **O1-O3 Skip:** With only 1.5k tags, queries complete in <200ms
- **O4 Cache:** Still provides instant repeat visits

**Reasoning:** Tag facets query `tags_relations` which is small. No optimization needed.

---

### Phase 6.1: Gallery Facets (CRITICAL)

**Status:** ✅ Completed

#### Changes Required

**1. Database Indexes (`pkg/sqlite/extension_indexes.go`):**
```sql
-- O1: Gallery junction table indexes
CREATE INDEX IF NOT EXISTS idx_ext_galleries_tags_gallery_tag 
  ON galleries_tags (gallery_id, tag_id);
CREATE INDEX IF NOT EXISTS idx_ext_performers_galleries_gallery_performer 
  ON performers_galleries (gallery_id, performer_id);
```

**2. Backend Parallel Queries (`pkg/sqlite/gallery_facets.go`):**
- [ ] Refactor from single UNION ALL to 6 parallel goroutines
- [ ] Add `isEmptyGalleryFilter()` helper function
- [ ] Add `getFacetsUnfiltered()` optimized direct queries
- [ ] **Add performer_tags facet query** (new feature)

**3. GraphQL Schema (`graphql/schema/types/facets.graphql`):**
```graphql
type GalleryFacetsResult {
  tags: [FacetCount!]!
  performers: [FacetCount!]!
  studios: [FacetCount!]!
  organized: [BooleanFacetCount!]!
  ratings: [RatingFacetCount!]!
  performer_tags: [FacetCount!]!  # NEW - parity with scenes
}
```

**4. Frontend Caching (`ui/v2.5/src/extensions/hooks/useFacetCounts.ts`):**
- [ ] Add `getCachedCounts('galleries', fingerprint)` calls
- [ ] Add `setCachedCounts('galleries', fingerprint, counts)` calls

**5. Frontend Filter UI:**
- [ ] Add PerformerTagsFilter to gallery list sidebar

#### Gallery Facets: Before vs After

| Facet | Before | After | Change |
|-------|--------|-------|--------|
| tags | ✅ Sequential | ✅ Parallel | O2 |
| performers | ✅ Sequential | ✅ Parallel | O2 |
| studios | ✅ Sequential | ✅ Parallel | O2 |
| organized | ✅ Sequential | ✅ Parallel | O2 |
| ratings | ✅ Sequential | ✅ Parallel | O2 |
| performer_tags | ❌ Missing | ✅ Parallel | **O5 NEW** |

---

### Phase 6.2: Performer Facets

**Status:** ✅ Completed

#### Changes Required

**1. Database Indexes (`pkg/sqlite/extension_indexes.go`):**
```sql
-- Note: idx_ext_performers_tags_performer_tag already exists (used by scene performer_tags)
-- May need additional indexes for performer-specific queries
```

**2. Backend Parallel Queries (`pkg/sqlite/performer_facets.go`):**
- [ ] Refactor from single UNION ALL to 7 parallel goroutines
- [ ] Add `isEmptyPerformerFilter()` helper function
- [ ] Add `getFacetsUnfiltered()` optimized direct queries

**3. Frontend Caching (`ui/v2.5/src/extensions/hooks/useFacetCounts.ts`):**
- [ ] Add caching to `usePerformerFacetCounts`

---

### Phase 6.3: Group Facets

**Status:** ✅ Completed

#### Changes Required

**1. Database Indexes (`pkg/sqlite/extension_indexes.go`):**
```sql
CREATE INDEX IF NOT EXISTS idx_ext_groups_tags_group_tag 
  ON groups_tags (group_id, tag_id);
CREATE INDEX IF NOT EXISTS idx_ext_groups_scenes_group_scene 
  ON groups_scenes (group_id, scene_id);
```

**2. Backend Parallel Queries (`pkg/sqlite/group_facets.go`):**
- [ ] Refactor from single UNION ALL to 3 parallel goroutines
- [ ] Add `isEmptyGroupFilter()` helper function
- [ ] Add `getFacetsUnfiltered()` optimized direct queries

**3. Frontend Caching (`ui/v2.5/src/extensions/hooks/useFacetCounts.ts`):**
- [ ] Add caching to `useGroupFacetCounts`

---

### Phase 6.4: Studio & Tag Facets (Cache Only)

**Status:** ✅ Completed

These entities have <3k entries - **only frontend caching is needed**.

**Frontend Caching (`ui/v2.5/src/extensions/hooks/useFacetCounts.ts`):**
- [ ] Add caching to `useStudioFacetCounts`
- [ ] Add caching to `useTagFacetCounts`

**Why skip backend optimizations:**
- Query time is already <500ms
- Implementation effort not justified
- Caching alone provides instant repeat visits

---

### Implementation Order

| Priority | Entity | Effort | Impact | Deliverables |
|----------|--------|--------|--------|--------------|
| 1 | **Galleries** | High | 🔴 Critical | Indexes, parallel, fast path, cache, performer_tags |
| 2 | **Performers** | Medium | 🟡 High | Parallel, fast path, cache |
| 3 | **Groups** | Medium | 🟡 Medium | Indexes, parallel, fast path, cache |
| 4 | **Studios/Tags** | Low | ⚪ Low | Cache only |

### Expected Performance Gains

| Entity | Current (est.) | After Optimization | Improvement |
|--------|----------------|-------------------|-------------|
| Galleries (724k) | 10-30 seconds | 5-15s first, **instant** cached | ~50% + cache |
| Performers (68k) | 2-5 seconds | <1s first, **instant** cached | ~70% + cache |
| Groups (48k) | 1-3 seconds | <500ms first, **instant** cached | ~60% + cache |
| Studios (3k) | <500ms | **Instant** cached | Cache only |
| Tags (1.5k) | <200ms | **Instant** cached | Cache only |

