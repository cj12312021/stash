# Facets System Technical Reference

This document provides in-depth technical details about the facets aggregation system.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
│  ┌─────────────────┐    ┌──────────────────┐                   │
│  │ List Page       │───▶│ FacetCountsContext│                   │
│  │ (SceneList)     │    │ Provider          │                   │
│  └─────────────────┘    └────────┬─────────┘                   │
│                                  │                              │
│  ┌─────────────────┐    ┌────────▼─────────┐                   │
│  │ Filter Component│◀───│ useFacetCounts   │                   │
│  │ (SidebarTags)   │    │ Hook             │                   │
│  └─────────────────┘    └────────┬─────────┘                   │
│                                  │                              │
└──────────────────────────────────┼──────────────────────────────┘
                                   │ GraphQL Query
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Backend                                  │
│  ┌─────────────────┐    ┌──────────────────┐                   │
│  │ GraphQL Resolver│───▶│ Repository       │                   │
│  │ (sceneFacets)   │    │ GetFacets()      │                   │
│  └─────────────────┘    └────────┬─────────┘                   │
│                                  │                              │
│                         ┌────────▼─────────┐                   │
│                         │ 8 Parallel       │                   │
│                         │ Goroutines       │                   │
│                         └──────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

## Performance Optimization (December 2024)

The facets system has been optimized for large databases (700k+ scenes):

### Key Optimizations

1. **Parallel Query Execution** - All 8 facet queries run simultaneously
2. **Extension Indexes** - Fork-safe indexes created at startup
3. **Simplified API** - No lazy loading, all facets returned together

### Performance Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Wall-Clock Time | 3,776 ms | ~3,000 ms | 21% faster |
| Data Completeness | Core facets only | All 11 facets | +performer_tags, +captions |
| UX | Staggered loading | All at once | Better UX |

See [FACETS-BENCHMARK-RESULTS.md](./FACETS-BENCHMARK-RESULTS.md) for detailed benchmarks.

---

## Backend Implementation

### GraphQL Schema

```graphql
# graphql/schema/types/facets.graphql

type FacetCount {
  id: ID!
  label: String!
  count: Int!
}

type BooleanFacetCount {
  value: Boolean!
  count: Int!
}

type ResolutionFacetCount {
  resolution: ResolutionEnum!
  count: Int!
}
# ... etc
```

### Query Endpoints

```graphql
type Query {
  # All facets computed in parallel - no lazy loading options needed
  sceneFacets(
    scene_filter: SceneFilterType
    limit: Int
  ): SceneFacetsResult!
  
  performerFacets(performer_filter: PerformerFilterType, limit: Int): PerformerFacetsResult!
  galleryFacets(gallery_filter: GalleryFilterType, limit: Int): GalleryFacetsResult!
  groupFacets(group_filter: GroupFilterType, limit: Int): GroupFacetsResult!
  studioFacets(studio_filter: StudioFilterType, limit: Int): StudioFacetsResult!
  tagFacets(tag_filter: TagFilterType, limit: Int): TagFacetsResult!
}
```

### Parallel Query Architecture

Scene facets run 8 independent goroutines:

```go
// pkg/sqlite/scene_facets.go

func (qb *SceneStore) GetFacets(ctx context.Context, filter *SceneFilterType, limit int) (*SceneFacets, error) {
    var wg sync.WaitGroup
    var mu sync.Mutex
    
    // All 8 facets run in parallel
    wg.Add(1); go qb.getTagsFacet(...)
    wg.Add(1); go qb.getPerformersFacet(...)
    wg.Add(1); go qb.getStudiosFacet(...)
    wg.Add(1); go qb.getGroupsFacet(...)
    wg.Add(1); go qb.getVideoFacets(...)        // resolution, orientation, interactive
    wg.Add(1); go qb.getSimpleFacets(...)       // organized, rating
    wg.Add(1); go qb.getPerformerTagsFacet(...) // always included
    wg.Add(1); go qb.getCaptionsFacet(...)      // always included
    
    wg.Wait()
    return result, nil
}
```

**Why This Is Fast:**
- Wall-clock time = max(slowest query), not sum of queries
- All queries share the same filtered CTE
- Extension indexes optimize each query

### CTE Query Structure

Each facet query uses the same filtered scene set:

```sql
WITH filtered_scenes AS (
    SELECT DISTINCT scenes.id FROM scenes
    WHERE ... -- base filter applied once
)

-- Each goroutine runs a query like this:
SELECT t.id, t.name as label, COUNT(DISTINCT st.scene_id) as count
FROM filtered_scenes fs
INNER JOIN scenes_tags st ON fs.id = st.scene_id
INNER JOIN tags t ON st.tag_id = t.id
GROUP BY t.id
ORDER BY count DESC
LIMIT ?
```

---

## Extension Indexes

The facets system includes fork-safe database indexes for optimal performance.

### When Indexes Are Applied

**Automatically on every startup:**

```
Stash Startup
    │
    ▼
s.Database.Open(...)              ← Opens DB, runs migrations
    │
    ▼
s.Database.EnsureExtensionIndexes(ctx)   ← Creates indexes HERE
    │
    ▼
(rest of startup continues...)
```

### Index List

| Index | Table | Columns | Purpose |
|-------|-------|---------|---------|
| `idx_ext_scenes_tags_scene_tag` | scenes_tags | (scene_id, tag_id) | Tag facet |
| `idx_ext_performers_scenes_scene_performer` | performers_scenes | (scene_id, performer_id) | Performer facet |
| `idx_ext_groups_scenes_scene_group` | groups_scenes | (scene_id, group_id) | Group facet |
| `idx_ext_performers_tags_performer_tag` | performers_tags | (performer_id, tag_id) | Performer tags facet |
| `idx_ext_video_files_facets` | video_files | (file_id, height, width, interactive) | Resolution/orientation facets |
| `idx_ext_scenes_studio_not_null` | scenes | studio_id WHERE NOT NULL | Studio facet |
| `idx_ext_scenes_rating_not_null` | scenes | rating WHERE NOT NULL | Rating facet |

### Fork-Safe Design

- **Prefix**: All indexes use `idx_ext_` prefix
- **Idempotent**: Uses `CREATE INDEX IF NOT EXISTS`
- **Outside Migrations**: Created at startup, not via numbered migrations
- **No Upstream Conflicts**: Won't conflict with future stash schema versions

### First Startup

On first startup after building with these changes:
```
INFO: Ensuring extension indexes exist...
INFO: Extension indexes verified (7 indexes)
```

Index creation takes **10-60 seconds** depending on database size.
Subsequent startups are instant (indexes already exist).

### Implementation

See: `pkg/sqlite/extension_indexes.go`

```go
var extensionIndexes = []string{
    `CREATE INDEX IF NOT EXISTS idx_ext_scenes_tags_scene_tag ON scenes_tags (scene_id, tag_id)`,
    // ... more indexes
}

func (db *Database) EnsureExtensionIndexes(ctx context.Context) error {
    for _, indexSQL := range extensionIndexes {
        conn.ExecContext(ctx, indexSQL)
    }
}
```

---

## Frontend Implementation

### Hooks

```typescript
// src/extensions/hooks/useFacetCounts.ts

interface UseFacetCountsOptions {
  isOpen: boolean;           // Only fetch when sidebar is open
  debounceMs?: number;       // Debounce filter changes (default: 500ms)
  limit?: number;            // Max facets per category (default: 100)
}

const { counts, loading } = useSceneFacetCounts(filter, {
  isOpen: showSidebar,
  debounceMs: 500,
});
```

### Context Provider

```tsx
<FacetCountsContext.Provider value={{ counts: facetCounts, loading: facetLoading }}>
  <SidebarPane>
    {/* Filter components can access counts via useContext */}
  </SidebarPane>
</FacetCountsContext.Provider>
```

### Apollo Cache Configuration

**Critical**: The `FacetCount` type must NOT be normalized by Apollo's cache.

```typescript
// src/core/createClient.ts
const typePolicies: TypePolicies = {
  FacetCount: {
    keyFields: false,  // Disable normalization
  },
  // ...
};
```

**Why this matters:**
- `FacetCount` objects have an `id` field
- Apollo normally normalizes objects by `__typename` + `id`
- `performer_tags` and `tags` facets both query from the `tags` table (sharing IDs)
- Without `keyFields: false`, Apollo would merge objects with the same ID
- This caused performer tag data to appear in studio/tag filters

### Simplified State Management

All facets are now returned in a single response:

```typescript
const doFetch = useCallback(async () => {
  const result = await fetchFacets({
    variables: {
      scene_filter: filter.makeFilter(),
      limit,
    },
  });

  if (result.data?.sceneFacets) {
    const facets = result.data.sceneFacets;
    // All facets updated together - no partial updates needed
    setCounts({
      tags: toMap(facets.tags),
      performers: toMap(facets.performers),
      studios: toMap(facets.studios),
      groups: toMap(facets.groups),
      performerTags: toMap(facets.performer_tags ?? []),
      captions: toCaptionMap(facets.captions ?? []),
      // ... all other facets
    });
  }
}, [fetchFacets, filter, limit]);
```

### Stale Response Prevention

When users change filters rapidly, responses can arrive out of order. Without protection, a slow response for an old filter could overwrite current data:

```
Timeline (RACE CONDITION):
1. User on Filter A → Request A sent
2. User changes to Filter B → Request B sent
3. Response B arrives → correct data shown
4. Response A arrives (slow) → OVERWRITES with stale data! ✗
```

**Solution**: Each request captures a filter fingerprint and compares it before applying the response:

```typescript
const doFetch = useCallback(async () => {
  // Capture fingerprint at request time
  const requestFingerprint = filterFingerprint;
  
  const result = await fetchFacets({ ... });

  // Discard if filter changed while request was in flight
  if (lastFilterRef.current !== requestFingerprint) {
    return; // Stale response - ignore it
  }

  // Safe to update state
  setCounts({ ... });
}, [fetchFacets, filter, filterFingerprint, limit]);
```

This pattern ensures:
- Out-of-order responses are discarded
- Loading state only clears for current requests
- Users always see data matching their current filter

### Facet Cache System

Facet counts are cached to provide instant display on subsequent page visits.

**Features:**
- **In-memory cache** for instant access
- **localStorage persistence** survives page refresh/browser close
- **Filter fingerprint keys** - caches ANY filter pattern, not just empty filters
- **Automatic invalidation** on scan complete
- **TTL-based expiration** (10 min filtered, 30 min unfiltered)

**Cache Flow:**
```
1. User opens sidebar with filter
2. Check cache for filter fingerprint
3. If cached: Display instantly, background refresh
4. If not cached: Show loading, fetch, cache result
```

**Implementation:**

```typescript
// useFacetCounts.ts

// Get cached counts (checks memory + localStorage)
const cached = getCachedCounts('scenes', filterFingerprint);
if (cached) {
  setCounts(cached);  // Instant display
  // Background refresh...
  return;
}

// Cache invalidation on scan complete (createClient.ts)
import("src/extensions/hooks/useFacetCounts").then(({ invalidateFacetCache }) => {
  invalidateFacetCache();
});
```

**Cache Statistics:**
```typescript
import { getFacetCacheStats } from "src/extensions/hooks/useFacetCounts";
console.log(getFacetCacheStats());
// { scenes: { entries: 3, oldestAge: 120 }, ... }
```

---

## Supported Facets by Entity

### Scene Facets (11 total)

| Facet | Type | Notes |
|-------|------|-------|
| `tags` | FacetCount | |
| `performers` | FacetCount | |
| `studios` | FacetCount | |
| `groups` | FacetCount | |
| `performer_tags` | FacetCount | 3-way join |
| `resolutions` | ResolutionFacetCount | |
| `orientations` | OrientationFacetCount | |
| `organized` | BooleanFacetCount | |
| `interactive` | BooleanFacetCount | |
| `ratings` | RatingFacetCount | |
| `captions` | CaptionFacetCount | File joins |

### Performer Facets
| Facet | Type |
|-------|------|
| `tags` | FacetCount |
| `studios` | FacetCount |
| `genders` | GenderFacetCount |
| `countries` | FacetCount |
| `circumcised` | CircumcisedFacetCount |
| `favorite` | BooleanFacetCount |
| `ratings` | RatingFacetCount |

### Gallery Facets
| Facet | Type |
|-------|------|
| `tags` | FacetCount |
| `performers` | FacetCount |
| `studios` | FacetCount |
| `organized` | BooleanFacetCount |
| `ratings` | RatingFacetCount |

### Group Facets
| Facet | Type |
|-------|------|
| `tags` | FacetCount |
| `performers` | FacetCount |
| `studios` | FacetCount |

### Studio Facets
| Facet | Type |
|-------|------|
| `tags` | FacetCount |
| `parents` | FacetCount |
| `favorite` | BooleanFacetCount |

### Tag Facets
| Facet | Type |
|-------|------|
| `parents` | FacetCount |
| `children` | FacetCount |
| `favorite` | BooleanFacetCount |

---

## Performance Considerations

### Large Databases (>100k items)

1. **Parallel Execution**: Wall-clock time = slowest query (~3s for 100k filter)
2. **Extension Indexes**: Created automatically at startup
3. **Debouncing**: Delay facet fetches when filter changes rapidly (500ms default)
4. **Limit**: Default limit of 100 facets per category

### Query Parallelism Diagram

```
Sequential (old approach):
Tags (2.1s) → Performers (3.0s) → Groups (0.2s) → Studios (0.2s) → ...
Total: ~8s

Parallel (current approach):
┌─ Tags (2.1s) ─────────────────────┐
├─ Performers (3.0s) ───────────────┼─► Total: ~3.0s
├─ Groups (0.2s) ──┐                │   (max of all)
├─ Studios (0.2s) ─┤                │
├─ PerfTags (1.5s) ────────┤        │
├─ Video (0.2s) ──┐        │        │
├─ Simple (0.3s) ─┤        │        │
└─ Captions (0.4s) ────────┴────────┘
```

---

## Testing

### Backend Tests

```bash
# Run facet integration tests
go test -v -tags=integration ./pkg/sqlite/... -run Facet
```

| File | Tests |
|------|-------|
| `scene_facets_test.go` | 14 |
| `performer_facets_test.go` | 9 |
| `gallery_facets_test.go` | 8 |
| `group_facets_test.go` | 6 |
| `studio_facets_test.go` | 6 |
| `tag_facets_test.go` | 5 |

### Frontend Tests

```bash
cd ui/v2.5
yarn test --run extensions
```

| File | Tests | Categories |
|------|-------|------------|
| `useFacetCounts.test.ts` | 63 | Data structures, API conversion, stale prevention, cache system, entity builders, rating facets |
| `facetCandidateUtils.test.ts` | 18 | Candidate filtering, count merging |
| `GroupsFilter.test.ts` | 8 | Hierarchical group filtering |
| `upgrade-verification.test.ts` | 12 | Extension integrity checks |

**Total: 101 tests**

#### Cache System Tests (17 tests)

The cache system is thoroughly tested in `useFacetCounts.test.ts`:

| Category | Tests | Coverage |
|----------|-------|----------|
| Filter fingerprint generation | 5 | Stability, uniqueness, order-independence |
| Cache serialization | 4 | Map↔Array conversion, round-trip integrity |
| Cache TTL behavior | 4 | Expiration logic, filtered vs unfiltered TTL |
| Cache invalidation | 2 | Full and selective cache clearing |
| Cache entry limit | 2 | Max entries, LRU-like pruning |

#### Entity-Specific Builder Tests (Phase 6 - 14 tests)

Tests for the build*FacetCounts helper functions:

| Category | Tests | Coverage |
|----------|-------|----------|
| Gallery facets builder | 3 | performer_tags field, all facets, scene-only exclusions |
| Performer facets builder | 2 | All facets, non-performer exclusions |
| Group facets builder | 2 | All facets, non-group exclusions |
| Studio facets builder | 2 | All facets, non-studio exclusions |
| Tag facets builder | 2 | All facets, non-tag exclusions |
| All entity caching | 3 | Cache per entity, filter variations, invalidation |

#### Rating Facet Display Tests (Phase 7.1 - 13 tests)

Tests for the rating facet display functionality:

| Category | Tests | Coverage |
|----------|-------|----------|
| Rating value conversion | 5 | DB value (20-100) to stars (1-5) mapping |
| Rating counts storage | 3 | Map operations, missing values, zero counts |
| Rating candidate generation | 3 | Count display, zero filtering, loading state |
| Rating selection flow | 2 | ID parsing, candidate identification |

---

## Known Issues & Solutions

### Labels Showing as IDs
**Cause**: `toMap()` discarded labels
**Fix**: Store both count and label in `LabeledFacetCount`

### Stale Counts Filtering Candidates
**Cause**: Missing loading state check
**Fix**: Added `!facetsLoading` check

### Slow First Startup
**Cause**: Extension indexes being created
**Fix**: Normal behavior - indexes only created once

