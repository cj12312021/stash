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

| Entity | Facet | Complexity | Rationale |
|--------|-------|:----------:|-----------|
| **Group** | `ratings` | Low | Simple join on groups.rating |
| **Studio** | `ratings` | Low | Simple join on studios.rating |
| **Performer** | `groups` | Medium | 3-way join: groups → groups_scenes → performers_scenes |
| **Scene** | `performer_favorite` | Medium | Join performers_scenes → performers.favorite |
| **Gallery** | `performer_favorite` | Medium | Join performers_galleries → performers.favorite |

### Priority 3: Medium-Value New Facets

| Entity | Facet | Complexity | Rationale |
|--------|-------|:----------:|-----------|
| Scene | `has_markers` | Low | EXISTS check on scene_markers table |
| Gallery | `has_chapters` | Low | EXISTS check on gallery_chapters table |
| Performer | `ethnicity` | Low | Direct field, string-based |
| Performer | `hair_color` | Low | Direct field, string-based |
| Performer | `eye_color` | Low | Direct field, string-based |

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

### Phase 7.2: Add Group & Studio Ratings Facets

**Goal**: Add `ratings` facet to groups and studios (consistent with other entities)

**Backend Changes**:

#### 1. Update `graphql/schema/types/facets.graphql`

```graphql
type GroupFacetsResult {
  tags: [FacetCount!]!
  performers: [FacetCount!]!
  studios: [FacetCount!]!
  ratings: [RatingFacetCount!]!  # ADD
}

type StudioFacetsResult {
  tags: [FacetCount!]!
  parents: [FacetCount!]!
  favorite: [BooleanFacetCount!]!
  ratings: [RatingFacetCount!]!  # ADD
}
```

#### 2. Update `pkg/models/facets.go`

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

### Phase 7.3: Add Performer Groups Facet

**Goal**: Show which groups performers appear in

**Backend Changes**:

#### 1. Update GraphQL schema

```graphql
type PerformerFacetsResult {
  # ... existing fields ...
  groups: [FacetCount!]!  # ADD - groups this performer appears in
}
```

#### 2. Add query to `performer_facets.go`

```sql
-- Groups containing performer (via groups_scenes → performers_scenes)
SELECT g.id, g.name, COUNT(DISTINCT gs.group_id) as count
FROM performers p
JOIN performers_scenes ps ON p.id = ps.performer_id
JOIN groups_scenes gs ON ps.scene_id = gs.scene_id
JOIN groups g ON gs.group_id = g.id
-- Apply filter CTE here
GROUP BY g.id, g.name
ORDER BY count DESC
LIMIT 100
```

**Estimated effort**: 4-6 hours

---

### Phase 7.4: Add Boolean Facets (performer_favorite, has_markers, has_chapters)

**Goal**: Add boolean facets for common filter options

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

### Phase 7.5: Add Performer Attribute Facets

**Goal**: Add facets for performer physical attributes

#### Ethnicity, Hair Color, Eye Color

These are simple string fields, so the queries are straightforward:

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

**New GraphQL types needed**:

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

