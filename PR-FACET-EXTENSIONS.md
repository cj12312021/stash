# PR: Facet Counts Extension - Phases 7.3, 7.4, 7.5

## Summary

This PR extends the facet counting system with new facets for performers, scenes, and galleries. These additions enable users to see count-based breakdowns for additional filter options in the sidebar.

## What's New

### Phase 7.3: Performer Groups Facet
Shows which groups performers appear in (via their scene appearances).

- **New facet**: `groups` on PerformerFacetsResult
- **Query path**: performers → performers_scenes → groups_scenes → groups
- **Use case**: Filter performers by the groups they've appeared in

### Phase 7.4: Boolean Facets

#### Scene Facets
| Facet | Description |
|-------|-------------|
| `has_markers` | Count of scenes with/without scene markers |
| `performer_favorite` | Count of scenes with/without favorite performers |

#### Gallery Facets
| Facet | Description |
|-------|-------------|
| `has_chapters` | Count of galleries with/without chapters |
| `performer_favorite` | Count of galleries with/without favorite performers |

### Phase 7.5: Performer Attribute Facets
New string-based facets for performer physical attributes:

| Facet | Description |
|-------|-------------|
| `ethnicities` | Count breakdown by ethnicity |
| `hair_colors` | Count breakdown by hair color |
| `eye_colors` | Count breakdown by eye color |

Introduced new `StringFacetCount` GraphQL type for string-valued facets.

---

## Files Changed

### Backend (Go)

| File | Changes |
|------|---------|
| `pkg/models/facets.go` | Added `StringFacetCount` type; Extended `SceneFacets`, `GalleryFacets`, `PerformerFacets` with new fields |
| `pkg/sqlite/performer_facets.go` | Added `getGroupsFacet`, `getAttributeFacets` functions |
| `pkg/sqlite/scene_facets.go` | Added `getAdvancedBooleanFacets` for has_markers, performer_favorite |
| `pkg/sqlite/gallery_facets.go` | Added `getAdvancedBooleanFacets` for has_chapters, performer_favorite |
| `graphql/schema/types/facets.graphql` | Added `StringFacetCount` type; Extended result types with new fields |
| `internal/api/types_facets.go` | Added `StringFacetCount`; Extended result structs |
| `internal/api/resolver_query_facets.go` | Added `convertStringFacetCounts`; Updated converters |

### Frontend (TypeScript)

| File | Changes |
|------|---------|
| `ui/v2.5/graphql/data/facets.graphql` | Added `StringFacetCountData` fragment; Extended queries |
| `ui/v2.5/src/extensions/hooks/useFacetCounts.ts` | Added `ethnicities`, `hairColors`, `eyeColors` Maps; Added `hasMarkers`, `performerFavorite`, `hasChapters` booleans; Added `toStringMap` helper |

### Tests

| File | Tests Added |
|------|-------------|
| `pkg/sqlite/performer_facets_test.go` | `TestPerformerFacets_ReturnsGroups`, `TestPerformerFacets_GroupsWithFilter`, `TestPerformerFacets_ReturnsEthnicities`, `TestPerformerFacets_ReturnsHairColors`, `TestPerformerFacets_ReturnsEyeColors`, `TestPerformerFacets_AttributesWithFilter` |
| `pkg/sqlite/scene_facets_test.go` | `TestSceneFacets_ReturnsHasMarkers`, `TestSceneFacets_ReturnsPerformerFavorite` |
| `pkg/sqlite/gallery_facets_test.go` | `TestGalleryFacets_ReturnsHasChapters`, `TestGalleryFacets_ReturnsPerformerFavorite` |
| `ui/v2.5/src/extensions/__tests__/useFacetCounts.test.ts` | Updated all FacetCounts test structures with new fields; Added performer attribute tests |

### Documentation

| File | Changes |
|------|---------|
| `ui/v2.5/src/extensions/docs/FACETS-EXTENSION-PLAN.md` | Marked Phases 7.3-7.5 as complete; Updated priority matrices |

---

## GraphQL Schema Changes

### New Type
```graphql
type StringFacetCount {
  value: String!
  count: Int!
}
```

### SceneFacetsResult (additions)
```graphql
has_markers: [BooleanFacetCount!]!
performer_favorite: [BooleanFacetCount!]!
```

### GalleryFacetsResult (additions)
```graphql
has_chapters: [BooleanFacetCount!]!
performer_favorite: [BooleanFacetCount!]!
```

### PerformerFacetsResult (additions)
```graphql
groups: [FacetCount!]!
ethnicities: [StringFacetCount!]!
hair_colors: [StringFacetCount!]!
eye_colors: [StringFacetCount!]!
```

---

## SQL Query Examples

### Performer Groups Facet
```sql
SELECT g.id, g.name, COUNT(DISTINCT ps.performer_id) as count
FROM performers_scenes ps
INNER JOIN groups_scenes gs ON ps.scene_id = gs.scene_id
INNER JOIN groups g ON gs.group_id = g.id
GROUP BY g.id
ORDER BY count DESC
```

### Scene has_markers
```sql
SELECT 
  CASE WHEN marker_count > 0 THEN 'true' ELSE 'false' END as has_markers,
  COUNT(*) as count
FROM (
  SELECT s.id, COUNT(sm.id) as marker_count
  FROM scenes s
  LEFT JOIN scene_markers sm ON s.id = sm.scene_id
  GROUP BY s.id
)
GROUP BY has_markers
```

### Performer Attributes
```sql
SELECT ethnicity as value, COUNT(*) as count
FROM performers
WHERE ethnicity IS NOT NULL AND ethnicity != ''
GROUP BY ethnicity
ORDER BY count DESC
```

---

## Testing

### Backend Tests
```bash
go test -v -tags=integration ./pkg/sqlite/... -run Facet
```

### Frontend Tests
```bash
cd ui/v2.5
pnpm test --run extensions
```

---

## Performance Notes

- All new facet queries run in **parallel goroutines** alongside existing facets
- No additional round-trips to the database per facet type
- Unfiltered "fast path" optimizations applied to all new facets
- Index usage verified for performer_scenes and groups_scenes joins

---

## Breaking Changes

None. All changes are additive:
- New fields added to existing GraphQL types
- New properties added to FacetCounts interface (with defaults)
- Existing facets continue to work unchanged

---

## Checklist

- [x] Backend changes in `pkg/sqlite/` 
- [x] GraphQL schema updated
- [x] API types and resolvers updated
- [x] Frontend hook updated
- [x] Backend integration tests added
- [x] Frontend tests updated
- [x] Documentation updated
- [x] No linter errors
- [x] GraphQL codegen regenerated

