# Facet Counts Extension Plan

This document outlines the plan for extending facet counts support to additional filters across all list pages.

## Current State Analysis

### Ratings Filter - Missing Facet Count Display

**Issue**: The backend already returns `ratings` facet data for scenes, galleries, and performers, but the frontend `SidebarRatingFilter` component does NOT consume this data from `FacetCountsContext`.

**Current behavior**: 
- User clicks a star rating → selects a modifier (equals, greater than, etc.)
- No count information is shown

**Desired behavior**:
- Show rating distribution with counts before the star picker
- Example display:
  ```
  ★★★★★  (12,345)
  ★★★★   (23,456)
  ★★★    (15,678)
  ★★     (8,901)
  ★      (2,345)
  Unrated (654,321)
  ```

**Implementation**:
1. Import `FacetCountsContext` in `RatingFilter.tsx`
2. Build candidate list from `facetCounts.ratings` map
3. Display counts alongside star rating options
4. Keep existing modifier selection flow after rating is chosen

---

## Facet Extension Matrix

### Priority 1: Fix Existing Facets (Ratings)

| Entity | Facet | Backend Support | Frontend Support | Status |
|--------|-------|:---------------:|:----------------:|--------|
| Scene | `ratings` | ✅ | ✅ | **✅ COMPLETE** |
| Gallery | `ratings` | ✅ | ✅ | **✅ COMPLETE** |
| Performer | `ratings` | ✅ | ✅ | **✅ COMPLETE** |

### Priority 2: High-Value New Facets

| Entity | Facet | Complexity | Rationale | Status |
|--------|-------|:----------:|-----------|--------|
| **Group** | `ratings` | Low | Simple join on groups.rating | ✅ Phase 7.2 |
| **Studio** | `ratings` | Low | Simple join on studios.rating | ✅ Phase 7.2 |
| **Performer** | `groups` | Medium | 3-way join: groups → groups_scenes → performers_scenes | ✅ Phase 7.3 |
| **Scene** | `performer_favorite` | Medium | Join performers_scenes → performers.favorite | ✅ Phase 7.4 |
| **Gallery** | `performer_favorite` | Medium | Join performers_galleries → performers.favorite | ✅ Phase 7.4 |

### Priority 3: Medium-Value New Facets

| Entity | Facet | Complexity | Rationale | Status |
|--------|-------|:----------:|-----------|--------|
| Scene | `has_markers` | Low | EXISTS check on scene_markers table | ✅ Phase 7.4 |
| Gallery | `has_chapters` | Low | EXISTS check on gallery_chapters table | ✅ Phase 7.4 |
| Performer | `ethnicity` | Low | Direct field, string-based | ✅ Phase 7.5 |
| Performer | `hair_color` | Low | Direct field, string-based | ✅ Phase 7.5 |
| Performer | `eye_color` | Low | Direct field, string-based | ✅ Phase 7.5 |

### Priority 4: Complex/Low-Value Facets

| Entity | Facet | Complexity | Notes |
|--------|-------|:----------:|-------|
| Scene | `video_codec` | High | Requires joining video_files table |
| Scene | `audio_codec` | High | Requires joining video_files table |
| Scene | `duration_bucket` | Medium | Need to define buckets |
| Scene | `date_bucket` | Medium | Year/month buckets |
| Group | `containing_groups` | Medium | Hierarchical |
| Group | `sub_groups` | Medium | Hierarchical |

---

## Implementation Plan

### Phase 7.1: Fix Ratings Facet Display ✅ COMPLETE

**Goal**: Make ratings filter show counts from existing backend data

**Status**: ✅ Completed - Rating filter now displays counts for all star levels

**Changes Made**:

#### 1. Update `RatingFilter.tsx`

```typescript
// Add import
import { FacetCountsContext } from "src/extensions/hooks/useFacetCounts";

// In SidebarRatingFilter component:
const { counts: facetCounts, loading: facetsLoading } = useContext(FacetCountsContext);

// Convert rating values (20,40,60,80,100) to star display (1-5)
const ratingCandidates = useMemo(() => {
  const candidates: Option[] = [];
  
  // Star ratings 5→1 (stored as 100→20)
  [100, 80, 60, 40, 20].forEach(ratingValue => {
    const count = facetCounts.ratings.get(ratingValue) ?? 0;
    const stars = ratingValue / 20;
    candidates.push({
      id: `rating-${ratingValue}`,
      label: '★'.repeat(stars),
      count,
    });
  });
  
  return candidates;
}, [facetCounts.ratings]);
```

**Estimated effort**: 2-3 hours

---

### Phase 7.2: Add Group & Studio Ratings Facets ✅ COMPLETE

**Goal**: Add `ratings` facet to groups and studios (consistent with other entities)

**Status**: ✅ Completed - Groups and Studios now have ratings facets

**Changes Made**:

#### Backend
- **`graphql/schema/types/facets.graphql`**: Added `ratings: [RatingFacetCount!]!` to GroupFacetsResult and StudioFacetsResult
- **`pkg/models/facets.go`**: Added `Ratings []RatingFacetCount` to GroupFacets and StudioFacets structs
- **`pkg/sqlite/group_facets.go`**: Added `getRatingsFacet` function and parallel execution for ratings
- **`pkg/sqlite/studio_facets.go`**: Added ratings to UNION ALL query
- **`internal/api/resolver_query_facets.go`**: Added `Ratings: convertRatingFacetCounts(f.Ratings)` to converters

#### Frontend
- **`ui/v2.5/graphql/data/facets.graphql`**: Added `ratings { ...RatingFacetCountData }` to GroupFacets and StudioFacets queries
- **`ui/v2.5/src/extensions/hooks/useFacetCounts.ts`**: Updated `buildGroupFacetCounts` and `buildStudioFacetCounts` to use `toRatingMap(facets.ratings)`

#### Tests
- **`pkg/sqlite/group_facets_test.go`**: Added `TestGroupFacets_ReturnsRatings` and `TestGroupFacets_RatingsWithFilter`
- **`pkg/sqlite/studio_facets_test.go`**: Added `TestStudioFacets_ReturnsRatings` and `TestStudioFacets_RatingsWithFilter`

**Implementation Details**:

#### 1. GraphQL Schema Update

```graphql
type GroupFacetsResult {
  tags: [FacetCount!]!
  performers: [FacetCount!]!
  studios: [FacetCount!]!
  ratings: [RatingFacetCount!]!
}

type StudioFacetsResult {
  tags: [FacetCount!]!
  parents: [FacetCount!]!
  favorite: [BooleanFacetCount!]!
  ratings: [RatingFacetCount!]!
}
```

#### 2. Go Models Update

```go
type GroupFacets struct {
  Tags       []FacetCount
  Performers []FacetCount
  Studios    []FacetCount
  Ratings    []RatingFacetCount  // ADD
}

type StudioFacets struct {
  Tags     []FacetCount
  Parents  []FacetCount
  Favorite []BooleanFacetCount
  Ratings  []RatingFacetCount  // ADD
}
```

#### 3. Update `pkg/sqlite/group_facets.go` and `pkg/sqlite/studio_facets.go`

Add rating queries similar to existing implementations in scene_facets.go:

```sql
-- Group ratings
SELECT rating, COUNT(*) as count
FROM groups
WHERE rating IS NOT NULL
GROUP BY rating

-- Studio ratings
SELECT rating, COUNT(*) as count
FROM studios
WHERE rating IS NOT NULL
GROUP BY rating
```

**Frontend Changes**:

#### 4. Update `useFacetCounts.ts`

```typescript
// In buildGroupFacetCounts:
ratings: toRatingMap(facets.ratings ?? []),

// In buildStudioFacetCounts:
ratings: toRatingMap(facets.ratings ?? []),
```

#### 5. Update GraphQL queries

```graphql
query GroupFacets {
  groupFacets(filter: $filter) {
    ratings { rating count }  # ADD
  }
}

query StudioFacets {
  studioFacets(filter: $filter) {
    ratings { rating count }  # ADD
  }
}
```

**Estimated effort**: 4-6 hours

---

### Phase 7.3: Add Performer Groups Facet ✅ COMPLETE

**Goal**: Show which groups performers appear in

**Status**: ✅ Completed - Performers now have groups facet showing groups they appear in via scenes

**Changes Made**:

#### Backend
- **`pkg/models/facets.go`**: Added `Groups []FacetCount` to PerformerFacets struct
- **`pkg/sqlite/performer_facets.go`**: Added `getGroupsFacet` function with 3-way join (performers → performers_scenes → groups_scenes → groups)
- **`graphql/schema/types/facets.graphql`**: Added `groups: [FacetCount!]!` to PerformerFacetsResult
- **`internal/api/types_facets.go`**: Added `Groups []*FacetCount` to PerformerFacetsResult
- **`internal/api/resolver_query_facets.go`**: Added `Groups: convertFacetCounts(f.Groups)` to convertPerformerFacets

#### Frontend
- **`ui/v2.5/graphql/data/facets.graphql`**: Added `groups { ...FacetCountData }` to PerformerFacets query
- **`ui/v2.5/src/extensions/hooks/useFacetCounts.ts`**: Updated `buildPerformerFacetCounts` to use `toMap(facets.groups ?? [])`

#### Tests
- **`pkg/sqlite/performer_facets_test.go`**: Added `TestPerformerFacets_ReturnsGroups` and `TestPerformerFacets_GroupsWithFilter`

**Estimated effort**: 4-6 hours

---

### Phase 7.4: Add Boolean Facets (performer_favorite, has_markers, has_chapters) ✅ COMPLETE

**Goal**: Add boolean facets for common filter options

**Status**: ✅ Completed - Scenes have has_markers and performer_favorite; Galleries have has_chapters and performer_favorite

**Changes Made**:

#### Backend
- **`pkg/models/facets.go`**: Added `HasMarkers`, `PerformerFavorite` to SceneFacets; Added `HasChapters`, `PerformerFavorite` to GalleryFacets
- **`pkg/sqlite/scene_facets.go`**: Added `getAdvancedBooleanFacets` function for has_markers and performer_favorite
- **`pkg/sqlite/gallery_facets.go`**: Added `getAdvancedBooleanFacets` function for has_chapters and performer_favorite
- **`graphql/schema/types/facets.graphql`**: Added `has_markers`, `performer_favorite` to SceneFacetsResult; Added `has_chapters`, `performer_favorite` to GalleryFacetsResult
- **`internal/api/types_facets.go`**: Added corresponding fields to SceneFacetsResult and GalleryFacetsResult
- **`internal/api/resolver_query_facets.go`**: Added conversion for new boolean facets

#### Frontend
- **`ui/v2.5/graphql/data/facets.graphql`**: Added new boolean facet fields to SceneFacets and GalleryFacets queries
- **`ui/v2.5/src/extensions/hooks/useFacetCounts.ts`**: Updated FacetCounts interface and builders with new booleans (hasMarkers, performerFavorite, hasChapters)

#### Tests
- **`pkg/sqlite/scene_facets_test.go`**: Added `TestSceneFacets_ReturnsHasMarkers` and `TestSceneFacets_ReturnsPerformerFavorite`
- **`pkg/sqlite/gallery_facets_test.go`**: Added `TestGalleryFacets_ReturnsHasChapters` and `TestGalleryFacets_ReturnsPerformerFavorite`
- **`ui/v2.5/src/extensions/__tests__/useFacetCounts.test.ts`**: Updated all FacetCounts test structures with new boolean fields

#### Scene `performer_favorite`

```sql
-- Scenes with favorite performers
SELECT 
  CASE WHEN EXISTS (
    SELECT 1 FROM performers_scenes ps 
    JOIN performers p ON ps.performer_id = p.id 
    WHERE ps.scene_id = s.id AND p.favorite = 1
  ) THEN 1 ELSE 0 END as has_favorite,
  COUNT(*) as count
FROM scenes s
GROUP BY has_favorite
```

#### Scene `has_markers`

```sql
SELECT 
  CASE WHEN EXISTS (
    SELECT 1 FROM scene_markers sm WHERE sm.scene_id = s.id
  ) THEN 1 ELSE 0 END as has_markers,
  COUNT(*) as count
FROM scenes s
GROUP BY has_markers
```

#### Gallery `has_chapters`

```sql
SELECT 
  CASE WHEN EXISTS (
    SELECT 1 FROM gallery_chapters gc WHERE gc.gallery_id = g.id
  ) THEN 1 ELSE 0 END as has_chapters,
  COUNT(*) as count
FROM galleries g
GROUP BY has_chapters
```

**Estimated effort**: 6-8 hours

---

### Phase 7.5: Add Performer Attribute Facets ✅ COMPLETE

**Goal**: Add facets for performer physical attributes

**Status**: ✅ Completed - Performers now have ethnicity, hair_color, and eye_color facets

**Changes Made**:

#### Backend
- **`pkg/models/facets.go`**: Added `StringFacetCount` type; Added `Ethnicities`, `HairColors`, `EyeColors` to PerformerFacets
- **`pkg/sqlite/performer_facets.go`**: Added `getAttributeFacets` function with queries for ethnicity, hair_color, eye_color
- **`graphql/schema/types/facets.graphql`**: Added `StringFacetCount` type; Added `ethnicities`, `hair_colors`, `eye_colors` to PerformerFacetsResult
- **`internal/api/types_facets.go`**: Added `StringFacetCount` type; Added fields to PerformerFacetsResult
- **`internal/api/resolver_query_facets.go`**: Added `convertStringFacetCounts` helper; Added conversion for new attributes

#### Frontend
- **`ui/v2.5/graphql/data/facets.graphql`**: Added `StringFacetCountData` fragment; Added `ethnicities`, `hair_colors`, `eye_colors` to PerformerFacets query
- **`ui/v2.5/src/extensions/hooks/useFacetCounts.ts`**: Added `ethnicities`, `hairColors`, `eyeColors` Maps to FacetCounts interface; Added `toStringMap` helper; Updated all builders

#### Tests
- **`pkg/sqlite/performer_facets_test.go`**: Added `TestPerformerFacets_ReturnsEthnicities`, `TestPerformerFacets_ReturnsHairColors`, `TestPerformerFacets_ReturnsEyeColors`, `TestPerformerFacets_AttributesWithFilter`

#### SQL Queries Used

```sql
-- Ethnicity facet
SELECT ethnicity, COUNT(*) as count
FROM performers
WHERE ethnicity IS NOT NULL AND ethnicity != ''
GROUP BY ethnicity
ORDER BY count DESC

-- Hair color facet
SELECT hair_color, COUNT(*) as count
FROM performers
WHERE hair_color IS NOT NULL AND hair_color != ''
GROUP BY hair_color
ORDER BY count DESC

-- Eye color facet
SELECT eye_color, COUNT(*) as count
FROM performers
WHERE eye_color IS NOT NULL AND eye_color != ''
GROUP BY eye_color
ORDER BY count DESC
```

**GraphQL types added**:

```graphql
type StringFacetCount {
  value: String!
  count: Int!
}

type PerformerFacetsResult {
  # ... existing ...
  ethnicities: [StringFacetCount!]!
  hair_colors: [StringFacetCount!]!
  eye_colors: [StringFacetCount!]!
}
```

**Estimated effort**: 6-8 hours

---

## Summary Table

| Phase | Description | Entities | Effort | Priority | Status |
|-------|-------------|----------|--------|----------|--------|
| 7.1 | Fix ratings display | Scene, Gallery, Performer | 2-3h | 🔴 High | ✅ Complete |
| 7.2 | Add ratings facets | Group, Studio | 4-6h | 🔴 High | Pending |
| 7.3 | Add groups facet | Performer | 4-6h | 🔴 High | Pending |
| 7.4 | Add boolean facets | Scene, Gallery | 6-8h | 🟡 Medium | Pending |
| 7.5 | Add attribute facets | Performer | 6-8h | 🟡 Medium | Pending |

**Total estimated effort**: 22-31 hours (Phase 7.1 complete: ~2h)

---

## Notes

### Rating Value Mapping

The database stores ratings as integers 1-100 (in steps of 20 for 5-star system):
- 100 = 5 stars
- 80 = 4 stars
- 60 = 3 stars
- 40 = 2 stars
- 20 = 1 star
- NULL = unrated

The frontend converts these using the `convertToRatingFormat` utility function.

### Performance Considerations

All new facets should follow the established patterns:
1. Use the unfiltered fast path when no filter is applied
2. Run queries in parallel using goroutines
3. Add appropriate indexes for new joins
4. Limit results to prevent excessive data transfer

### Database Indexes

New indexes may be needed for:
- `performers.ethnicity` (if frequently filtered)
- `performers.hair_color` (if frequently filtered)
- `performers.eye_color` (if frequently filtered)

However, these are only needed if query performance is poor. Start without indexes and add if needed.

