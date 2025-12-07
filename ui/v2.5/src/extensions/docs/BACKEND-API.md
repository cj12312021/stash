# Backend API Reference

This document defines all custom backend endpoints and modifications required for the extension system to function.

> ⚠️ **Important**: These backend changes must be preserved when merging upstream updates.
>
> 📁 **See also**: `/patches/` directory for merge instructions and patch files.

## Custom GraphQL Queries

### Facets Endpoints

The facets system adds 6 new GraphQL queries for fetching aggregated filter counts:

| Query | Purpose | Frontend Hook |
|-------|---------|---------------|
| `sceneFacets` | Scene filter counts | `useSceneFacetCounts` |
| `performerFacets` | Performer filter counts | `usePerformerFacetCounts` |
| `galleryFacets` | Gallery filter counts | `useGalleryFacetCounts` |
| `groupFacets` | Group filter counts | `useGroupFacetCounts` |
| `studioFacets` | Studio filter counts | `useStudioFacetCounts` |
| `tagFacets` | Tag filter counts | `useTagFacetCounts` |

### Query Signatures

```graphql
# graphql/schema/schema.graphql

type Query {
  # Scene facets - all facets computed in parallel
  sceneFacets(
    scene_filter: SceneFilterType
    limit: Int
  ): SceneFacetsResult!
  
  # Standard facets queries
  performerFacets(performer_filter: PerformerFilterType, limit: Int): PerformerFacetsResult!
  galleryFacets(gallery_filter: GalleryFilterType, limit: Int): GalleryFacetsResult!
  groupFacets(group_filter: GroupFilterType, limit: Int): GroupFacetsResult!
  studioFacets(studio_filter: StudioFilterType, limit: Int): StudioFacetsResult!
  tagFacets(tag_filter: TagFilterType, limit: Int): TagFacetsResult!
}
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `*_filter` | FilterType | `null` | Filter criteria (same as list queries) |
| `limit` | Int | `100` | Max facets per category |

---

## Custom GraphQL Types

### Facet Count Types

```graphql
# graphql/schema/types/facets.graphql

# Entity facet (tags, performers, studios, etc.)
type FacetCount {
  id: ID!
  label: String!   # Display name (critical for UI)
  count: Int!
}

# Boolean facet (organized, favorite, etc.)
type BooleanFacetCount {
  value: Boolean!
  count: Int!
}

# Video resolution facet
type ResolutionFacetCount {
  resolution: ResolutionEnum!
  count: Int!
}

# Video orientation facet
type OrientationFacetCount {
  orientation: OrientationEnum!
  count: Int!
}

# Gender facet
type GenderFacetCount {
  gender: GenderEnum!
  count: Int!
}

# Rating facet (1-5 stars as 20-100)
type RatingFacetCount {
  rating: Int!
  count: Int!
}

# Caption language facet
type CaptionFacetCount {
  language: String!
  count: Int!
}

# Circumcised status facet
type CircumcisedFacetCount {
  value: CircumisedEnum!
  count: Int!
}
```

### Result Types

```graphql
# Scene facets result - all 11 facets always included
type SceneFacetsResult {
  tags: [FacetCount!]!
  performers: [FacetCount!]!
  studios: [FacetCount!]!
  groups: [FacetCount!]!
  performer_tags: [FacetCount!]!      # Always included
  resolutions: [ResolutionFacetCount!]!
  orientations: [OrientationFacetCount!]!
  organized: [BooleanFacetCount!]!
  interactive: [BooleanFacetCount!]!
  ratings: [RatingFacetCount!]!
  captions: [CaptionFacetCount!]!     # Always included
}

# Performer facets result
type PerformerFacetsResult {
  tags: [FacetCount!]!
  studios: [FacetCount!]!
  genders: [GenderFacetCount!]!
  countries: [FacetCount!]!
  circumcised: [CircumcisedFacetCount!]!
  favorite: [BooleanFacetCount!]!
  ratings: [RatingFacetCount!]!
}

# Gallery facets result
type GalleryFacetsResult {
  tags: [FacetCount!]!
  performers: [FacetCount!]!
  studios: [FacetCount!]!
  organized: [BooleanFacetCount!]!
  ratings: [RatingFacetCount!]!
}

# Group facets result
type GroupFacetsResult {
  tags: [FacetCount!]!
  performers: [FacetCount!]!
  studios: [FacetCount!]!
}

# Studio facets result
type StudioFacetsResult {
  tags: [FacetCount!]!
  parents: [FacetCount!]!
  favorite: [BooleanFacetCount!]!
}

# Tag facets result
type TagFacetsResult {
  parents: [FacetCount!]!
  children: [FacetCount!]!
  favorite: [BooleanFacetCount!]!
}
```

---

## Extension Database Indexes

The extension system includes fork-safe database indexes for optimal facet query performance.

### How Indexes Are Applied

Indexes are created **automatically on every startup**, immediately after the database opens:

```
Stash Startup
    │
    ▼
s.Database.Open(...)                    ← Opens DB, runs migrations
    │
    ▼
s.Database.EnsureExtensionIndexes(ctx)  ← Creates indexes HERE
    │
    ▼
(rest of startup continues...)
```

### Index Definitions

| Index Name | Table | Columns | Purpose |
|------------|-------|---------|---------|
| `idx_ext_scenes_tags_scene_tag` | scenes_tags | (scene_id, tag_id) | Tag facet counts |
| `idx_ext_performers_scenes_scene_performer` | performers_scenes | (scene_id, performer_id) | Performer facet counts |
| `idx_ext_groups_scenes_scene_group` | groups_scenes | (scene_id, group_id) | Group facet counts |
| `idx_ext_performers_tags_performer_tag` | performers_tags | (performer_id, tag_id) | Performer tags facet |
| `idx_ext_video_files_facets` | video_files | (file_id, height, width, interactive) | Resolution/orientation facets |
| `idx_ext_scenes_studio_not_null` | scenes | studio_id WHERE NOT NULL | Studio facet (partial) |
| `idx_ext_scenes_rating_not_null` | scenes | rating WHERE NOT NULL | Rating facet (partial) |

### Fork-Safe Design

The index system is designed to avoid conflicts with upstream stash:

1. **Outside Migration System** - Indexes are NOT created via numbered migrations
2. **Idempotent** - Uses `CREATE INDEX IF NOT EXISTS` 
3. **Unique Prefix** - All indexes use `idx_ext_` prefix
4. **Non-Blocking** - If creation fails, startup continues (indexes are optimization only)

### Implementation Files

| File | Purpose |
|------|---------|
| `pkg/sqlite/extension_indexes.go` | Index definitions and creation logic |
| `internal/manager/init.go` | Startup hook that calls `EnsureExtensionIndexes` |

### First Startup Behavior

On first startup after building with extension indexes:

```
INFO: Ensuring extension indexes exist...
INFO: Extension indexes verified (7 indexes)
```

**First creation** takes 10-60 seconds depending on database size.
**Subsequent startups** are instant (indexes already exist).

### Manual Index Management

```go
// Create all extension indexes
db.EnsureExtensionIndexes(ctx)

// Drop all extension indexes (if needed)
db.DropExtensionIndexes(ctx)
```

---

## Backend File Reference

### New Files (Must Preserve)

| File | Purpose | Lines |
|------|---------|-------|
| `graphql/schema/types/facets.graphql` | GraphQL type definitions | ~100 |
| `pkg/models/facets.go` | Go model structs | ~115 |
| `pkg/sqlite/scene_facets.go` | Scene facets - 8 parallel queries | ~500 |
| `pkg/sqlite/performer_facets.go` | Performer facets SQLite implementation | ~250 |
| `pkg/sqlite/gallery_facets.go` | Gallery facets SQLite implementation | ~200 |
| `pkg/sqlite/group_facets.go` | Group facets SQLite implementation | ~150 |
| `pkg/sqlite/studio_facets.go` | Studio facets SQLite implementation | ~150 |
| `pkg/sqlite/tag_facets.go` | Tag facets SQLite implementation | ~100 |
| `pkg/sqlite/extension_indexes.go` | Extension index definitions | ~116 |
| `internal/api/resolver_query_facets.go` | GraphQL resolvers | ~200 |
| `internal/api/types_facets.go` | API type mappings | ~100 |

### Modified Files (Merge Carefully)

| File | Changes |
|------|---------|
| `graphql/schema/schema.graphql` | Added facet + recommendation queries |
| `internal/manager/init.go` | Added `EnsureExtensionIndexes` call |
| `pkg/models/repository_scene.go` | Added `SceneFaceter` interface |
| `pkg/models/repository_performer.go` | Added `PerformerFaceter` interface |
| `pkg/models/repository_gallery.go` | Added `GalleryFaceter` interface |
| `pkg/models/repository_group.go` | Added `GroupFaceter` interface |
| `pkg/models/repository_studio.go` | Added `StudioFaceter` interface |
| `pkg/models/repository_tag.go` | Added `TagFaceter` interface + `FindFavoriteTagIDs` |
| `graphql/schema/types/filters.graphql` | Added tag filter fields |
| `pkg/models/tag.go` | Added `PerformersFilter`, `GroupsFilter` |
| `pkg/sqlite/tag.go` | Added join repos + `FindFavoriteTagIDs` |
| `pkg/sqlite/tag_filter.go` | Added performer/group filter handlers |
| `pkg/models/resolution.go` | Added `ResolutionFromHeight` |

### Test Files

| File | Tests |
|------|-------|
| `pkg/sqlite/scene_facets_test.go` | 14 integration tests |
| `pkg/sqlite/performer_facets_test.go` | 9 integration tests |
| `pkg/sqlite/gallery_facets_test.go` | 8 integration tests |
| `pkg/sqlite/group_facets_test.go` | 6 integration tests |
| `pkg/sqlite/studio_facets_test.go` | 6 integration tests |
| `pkg/sqlite/tag_facets_test.go` | 5 integration tests |
| `internal/api/resolver_query_facets_test.go` | 18 unit tests |

---

## Recommendations System

Provides personalized recommendations for scenes and performers based on user viewing history and preferences.

### GraphQL Queries

```graphql
# Scene recommendations
sceneRecommendations(limit: Int): SceneRecommendationsResultType!
sceneRecommendationsForScene(scene_id: ID!, limit: Int): SceneRecommendationsResultType!

# Performer recommendations  
performerRecommendations(limit: Int): PerformerRecommendationsResultType!
performerRecommendationsForPerformer(performer_id: ID!, limit: Int): PerformerRecommendationsResultType!
```

### Implementation Files

| File | Purpose | Lines |
|------|---------|-------|
| `pkg/recommendation/scene.go` | Scene recommendation logic | ~900 |
| `pkg/recommendation/performer.go` | Performer recommendation logic | ~525 |
| `internal/api/resolver_query_scene_recommendations.go` | Scene resolver | - |
| `internal/api/resolver_query_performer_recommendations.go` | Performer resolver | - |
| `internal/api/resolver_scene_recommendations_result_type.go` | Result type | - |
| `internal/api/resolver_performer_recommendations_result_type.go` | Result type | - |

### Algorithm Overview

The recommendation system analyzes:
- User viewing history (play counts, O counts)
- Favorite performers and tags
- Similar content based on shared attributes
- Recency weighting

---

## Tag Filter Extensions

Adds ability to filter tags by their related performers and groups.

### New Filter Fields

```graphql
input TagFilterType {
  # ... existing fields ...
  performers_filter: PerformerFilterType
  groups_filter: GroupFilterType
}
```

### Implementation Files

| File | Changes |
|------|---------|
| `graphql/schema/types/filters.graphql` | Added filter fields |
| `pkg/models/tag.go` | Added Go struct fields |
| `pkg/sqlite/tag.go` | Added join repositories |
| `pkg/sqlite/tag_filter.go` | Added filter handlers |

### Use Cases

- Find tags used by performers from a specific country
- Find tags associated with groups from a specific studio
- Complex multi-level filtering

---

## Utility Functions

### ResolutionFromHeight

**File:** `pkg/models/resolution.go`

```go
func ResolutionFromHeight(height int) ResolutionEnum
```

Converts a video height to the matching resolution enum. Used by facets system.

### FindFavoriteTagIDs

**File:** `pkg/sqlite/tag.go`

```go
func (qb *TagStore) FindFavoriteTagIDs(ctx context.Context) ([]int, error)
```

Efficiently fetches IDs of all favorite tags. Used by tag facets.

---

## Repository Interfaces

Each entity type has a Faceter interface added to its repository:

```go
// pkg/models/repository_scene.go

// SceneFaceter provides methods to get facet counts for scenes.
// All facets are computed in parallel - no lazy loading options.
type SceneFaceter interface {
    GetFacets(ctx context.Context, filter *SceneFilterType, limit int) (*SceneFacets, error)
}
```

```go
// pkg/models/repository_performer.go

type PerformerFaceter interface {
    GetFacets(ctx context.Context, filter *PerformerFilterType, limit int) (*PerformerFacets, error)
}
```

---

## SQLite Implementation

### Parallel Query Strategy

Scene facets use 8 parallel goroutines:

```go
// pkg/sqlite/scene_facets.go

func (qb *SceneStore) GetFacets(ctx context.Context, filter *SceneFilterType, limit int) (*SceneFacets, error) {
    var wg sync.WaitGroup
    var mu sync.Mutex
    errChan := make(chan error, 8)
    
    // Build base CTE once
    baseSQL := query.toSQL(false)
    baseArgs := query.args
    
    // Launch 8 parallel goroutines
    wg.Add(1); go qb.getTagsFacet(ctx, baseSQL, baseArgs, limit, result, &mu)
    wg.Add(1); go qb.getPerformersFacet(ctx, baseSQL, baseArgs, limit, result, &mu)
    wg.Add(1); go qb.getStudiosFacet(ctx, baseSQL, baseArgs, limit, result, &mu)
    wg.Add(1); go qb.getGroupsFacet(ctx, baseSQL, baseArgs, limit, result, &mu)
    wg.Add(1); go qb.getVideoFacets(ctx, baseSQL, baseArgs, result, &mu)
    wg.Add(1); go qb.getSimpleFacets(ctx, baseSQL, baseArgs, result, &mu)
    wg.Add(1); go qb.getPerformerTagsFacet(ctx, baseSQL, baseArgs, limit, result, &mu)
    wg.Add(1); go qb.getCaptionsFacet(ctx, baseSQL, baseArgs, result, &mu)
    
    wg.Wait()
    return result, nil
}
```

### CTE Query Structure

```sql
-- Base filter applied ONCE
WITH filtered_scenes AS (
    SELECT DISTINCT scenes.id FROM scenes
    WHERE ... -- all filter criteria
)

-- Each goroutine runs one of these queries
SELECT t.id, t.name as label, COUNT(DISTINCT st.scene_id) as count
FROM filtered_scenes fs
INNER JOIN scenes_tags st ON fs.id = st.scene_id
INNER JOIN tags t ON st.tag_id = t.id
GROUP BY t.id
ORDER BY count DESC
LIMIT ?
```

---

## Frontend GraphQL Queries

The frontend queries are defined in:

```graphql
# ui/v2.5/graphql/data/facets.graphql

query SceneFacets($scene_filter: SceneFilterType, $limit: Int) {
  sceneFacets(scene_filter: $scene_filter, limit: $limit) {
    tags { id label count }
    performers { id label count }
    studios { id label count }
    groups { id label count }
    performer_tags { id label count }
    resolutions { resolution count }
    orientations { orientation count }
    organized { value count }
    interactive { value count }
    ratings { rating count }
    captions { language count }
  }
}

# Similar queries for other entity types...
```

---

## Testing

### Run Backend Tests

```bash
# Integration tests (requires test database)
go test -v -tags=integration ./pkg/sqlite/... -run Facet

# Unit tests
go test -v ./internal/api/... -run Facet

# All facet tests
go test -v -tags=integration ./... -run Facet
```

### Test Coverage

| Component | Tests | Coverage |
|-----------|-------|----------|
| Scene Facets | 14 | All facet types, filters |
| Performer Facets | 9 | Tags, genders, studios, countries |
| Gallery Facets | 8 | Tags, performers, studios, organized |
| Group Facets | 6 | Tags, performers, studios |
| Studio Facets | 6 | Tags, parents, favorite |
| Tag Facets | 5 | Parents, children, favorite |
| API Resolvers | 18 | Type conversions, error handling |

---

## Merge Guide

When merging upstream changes, refer to the `extensions/patches/` directory for frontend patches. Backend changes require manual re-application.

### Quick Reference

For backend merge conflicts, re-add:
1. **GraphQL queries** - Add facet queries to `schema.graphql`
2. **Repository interfaces** - Add `*Faceter` interfaces to `repository_*.go` files
3. **Type definitions** - Preserve `types/facets.graphql`
4. **Extension indexes** - Preserve `extension_indexes.go` and init.go hook

### 1. Preserve New Files

These files don't exist upstream - they won't conflict:
```
graphql/schema/types/facets.graphql
pkg/models/facets.go
pkg/models/facets_interfaces.go
pkg/sqlite/*_facets.go
pkg/sqlite/*_facets_test.go
pkg/sqlite/extension_indexes.go      # NEW: Extension indexes
internal/api/resolver_query_facets.go
internal/api/types_facets.go
```

### 2. Re-add Schema Queries

If `graphql/schema/schema.graphql` conflicts:

Add after `findTags` query:
```graphql
  sceneFacets(scene_filter: SceneFilterType, limit: Int): SceneFacetsResult!
  performerFacets(performer_filter: PerformerFilterType, limit: Int): PerformerFacetsResult!
  galleryFacets(gallery_filter: GalleryFilterType, limit: Int): GalleryFacetsResult!
  groupFacets(group_filter: GroupFilterType, limit: Int): GroupFacetsResult!
  studioFacets(studio_filter: StudioFilterType, limit: Int): StudioFacetsResult!
  tagFacets(tag_filter: TagFilterType, limit: Int): TagFacetsResult!
```

### 3. Re-add Repository Interfaces

If `pkg/models/repository_*.go` files conflict:

```bash
# See exact lines to add
cat patches/repository-interfaces.md
```

Add Faceter interface to each Reader:
```go
type SceneReader interface {
    // ... existing interfaces ...
    SceneFaceter  // <-- Add this line
}
```

### 4. Re-add Extension Index Hook

If `internal/manager/init.go` conflicts, add after `s.Database.Open(...)`:

```go
// Ensure extension-specific indexes exist (safe for fork/upstream compatibility)
if err := s.Database.EnsureExtensionIndexes(ctx); err != nil {
    logger.Warnf("Failed to ensure extension indexes: %v", err)
    // Don't fail startup - indexes are optimization only
}
```

### 5. Regenerate GraphQL

After resolving conflicts:
```bash
go generate ./...
```

### 6. Run Tests

```bash
# Backend
go build ./...
go test -v -tags=integration ./pkg/sqlite/... -run Facet
go test -v ./internal/api/...

# Frontend
cd ui/v2.5
yarn build
yarn test
```

---

## Troubleshooting

### "Unknown field 'sceneFacets'"

**Cause**: GraphQL schema not regenerated after merge
**Fix**: Run `go generate ./...`

### "No such table: performers_galleries"

**Cause**: Wrong join table name (was `galleries_performers`)
**Fix**: Use correct table name `performers_galleries`

### Slow facets on large database

**Cause**: Missing extension indexes or expensive filter
**Mitigations**:
- Wait for first startup to complete (creates indexes)
- Use `limit` parameter (default 100)
- Add more specific filters to reduce working set

### Empty facet counts

**Cause**: Filter too restrictive or no matching items
**Check**: Try with no filter to verify endpoint works

### Slow first startup

**Cause**: Extension indexes being created
**Fix**: Normal behavior - wait 10-60 seconds for indexes to be created
**Subsequent startups**: Instant (indexes already exist)

