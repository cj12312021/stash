# Extensions Changelog

This document tracks what has been added/modified from the upstream Stash codebase.

---

## 2026-01-06: Facet Cache System Fixes

Major bugfixes for the facet cache system that was causing incorrect cached data.

### Fixed Issues (6)

| Issue | Severity | Fix |
|-------|----------|-----|
| **Fingerprint Bug** | Critical | Nested filter values were stripped during serialization. Implemented `deepSortKeys()` for full recursive key sorting |
| **Cache Resurrection** | High | Stale data resurrected from localStorage after failed invalidation. Added `invalidatedTypes` Set to block resurrection |
| **No Mutation Invalidation** | High | Editing data didn't refresh facet counts. Added `facetCacheLink` Apollo Link to invalidate on mutations |
| **Memory/localStorage Inconsistency** | Medium | Documented as accepted behavior - memory cache is authoritative, localStorage is best-effort |
| **Dead Code** | Low | Removed unused `isFilterEmpty` function |
| **Expired Entries Not Cleaned** | Low | `loadCacheFromStorage()` now cleans up expired entries during load |

### New Files

- `ui/v2.5/src/extensions/hooks/facetCacheLink.ts` - Apollo Link for mutation-based cache invalidation
- `ui/v2.5/src/extensions/docs/FACET-CACHE-ISSUES.md` - Comprehensive documentation of all cache issues and fixes

### Modified Files

- `ui/v2.5/src/extensions/hooks/useFacetCounts.ts` - `deepSortKeys()`, `invalidatedTypes` Set, improved `loadCacheFromStorage()`
- `ui/v2.5/src/core/createClient.ts` - Added `facetCacheLink` to Apollo link chain

### Mutation Invalidation Mapping

The new `facetCacheLink` maps mutations to affected entity types:

| Mutation | Invalidates |
|----------|-------------|
| Scene* | scenes |
| Performer* | performers, scenes, galleries |
| Tag* | tags, scenes, performers, galleries, groups, studios |
| Studio* | studios, scenes, galleries, groups |
| Group* | groups, scenes |
| Gallery* | galleries |

---

## January 2026: Facet Query Performance & Cache Documentation

### Backend Performance Improvements

**Query Optimization:**
- Replaced CTE-based facet queries with IN subquery pattern (5x+ faster on large datasets)
- All `*_facets.go` files now use `WHERE x IN (SELECT id FROM ...)` instead of `WITH filtered AS (...)`
- Added 60-second context timeout to prevent runaway queries

**New Extension Indexes (8 added):**
- `idx_ext_scene_markers_scene` - has_markers facet optimization
- `idx_ext_galleries_chapters_gallery` - has_chapters facet optimization
- `idx_ext_video_captions_file` - captions facet optimization
- `idx_ext_scenes_files_scene_primary` - video metadata facet optimization
- `idx_ext_tags_relations_parent` - tag hierarchy optimization
- `idx_ext_tags_relations_child` - tag hierarchy optimization
- `idx_ext_groups_scenes_scene` - group performers facet optimization
- `idx_ext_groups_tags_group_tag` - group tags facet optimization

**Benchmark Test Suite:**
- Added `pkg/sqlite/facets_benchmark_test.go` (649 lines)
- Run with: `go test -v -tags=benchmark -bench=. ./pkg/sqlite/... -run=^$`
- Tests CTE vs IN-subquery performance, cache effectiveness

### Frontend Changes

**Cache System:**
- All list components now properly pass filter context to `useFacetCounts`
- Added filter fingerprint-based caching for any filter pattern

**Documentation:**
- Added `docs/FACET-CACHE-ISSUES.md` - Known cache system issues with test scripts
- Documents 6 issues: fingerprint bug, cache resurrection, mutation staleness, etc.

### Files Modified

**Backend:**
- `pkg/sqlite/scene_facets.go` - IN-subquery pattern, context timeout
- `pkg/sqlite/performer_facets.go` - IN-subquery pattern
- `pkg/sqlite/gallery_facets.go` - IN-subquery pattern
- `pkg/sqlite/studio_facets.go` - IN-subquery pattern
- `pkg/sqlite/group_facets.go` - IN-subquery pattern
- `pkg/sqlite/tag_facets.go` - IN-subquery pattern
- `pkg/sqlite/extension_indexes.go` - 8 new indexes

**Frontend:**
- `ui/v2.5/src/extensions/hooks/useFacetCounts.ts` - Cache refinements
- `ui/v2.5/src/extensions/lists/*.tsx` - Filter context improvements

---

## Added

### Performance
- **Select Fragment Optimization**: Removed unused count fields from `Select*Data` GraphQL fragments
  - Affects: `SelectTagData`, `SelectStudioData`, `SelectPerformerData`, `SelectGroupData`, `SelectGalleryData`
  - Removed expensive `*_count_all` recursive CTE queries that were never displayed in dropdown selectors
  - **Impact**: Dropdown selectors now ~10x faster on large databases
  - See: `/patches/graphql-select-fragments.md` for full details

### Added
- **Rating Facet Display (Phase 7.1)**: Improved rating filter UX with bucket-based selection
  - **Bucket-based options**: 5★, 4★, 3★, 2★, 1★ with aggregated counts
    - 5★ = exactly 5.0 stars
    - 4★ = 4.0-4.9 stars (sums all ratings 80-99)
    - 3★ = 3.0-3.9 stars (sums all ratings 60-79)
    - etc.
  - **Unrated option**: Filter for items without ratings, with calculated count
    - Count calculated as: `totalCount - sum(ratedCounts)`
  - **Custom mode**: For advanced users needing specific modifiers (=, ≠, >, <)
  - Counts shown match actual filter results (no more misleading counts)
  - 21 new tests for rating facet functionality

### Changed
- `RatingFilter.tsx` - Complete rewrite with bucket-based UX, added `totalCount` prop
- All list pages now pass `totalCount` to rating filter
- Test count: 88 → 109 tests

---

## December 2024: Facets Performance Optimization

Major performance improvements for the facets system targeting large databases (700k+ scenes).

### Changes

**Backend:**
- Refactored `scene_facets.go` from 3 goroutines to 8 fully parallel goroutines
- Each facet type now runs in its own goroutine for maximum parallelism
- Removed `SceneFacetOptions` struct - all facets always computed
- Removed `include_performer_tags` and `include_captions` GraphQL parameters
- Added fork-safe extension indexes via `pkg/sqlite/extension_indexes.go`
- Added startup hook in `internal/manager/init.go` to create indexes

**Frontend:**
- Simplified `useFacetCounts.ts` - removed lazy loading state management
- Removed `includePerformerTags` and `includeCaptions` from options
- Updated GraphQL queries to remove lazy loading parameters

**New Files:**
- `pkg/sqlite/extension_indexes.go` - Extension index definitions and creation
- `ui/v2.5/src/extensions/docs/FACETS-BENCHMARK-RESULTS.md` - Performance data
- `ui/v2.5/src/extensions/docs/FACETS-OPTIMIZATION-PLAN.md` - Optimization documentation

### Performance Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Wall-Clock Time | 3,776 ms | ~3,000 ms | 21% faster |
| Data Completeness | Core facets only | All 11 facets | +performer_tags, +captions |
| UX | Staggered loading | All at once | Better UX |

### Extension Indexes

7 new indexes created automatically at startup:
- `idx_ext_scenes_tags_scene_tag`
- `idx_ext_performers_scenes_scene_performer`
- `idx_ext_groups_scenes_scene_group`
- `idx_ext_performers_tags_performer_tag`
- `idx_ext_video_files_facets`
- `idx_ext_scenes_studio_not_null`
- `idx_ext_scenes_rating_not_null`

**Fork-safe:** Uses `IF NOT EXISTS` and `idx_ext_` prefix to avoid upstream conflicts.

---

## Upstream Files Reverted (Latest)

**Baseline:** Stash v0.29.3

The upstream filter files in `src/components/List/Filters/` have been reverted to clean v0.29.3 versions:

### Reverted Files (14)
- `BooleanFilter.tsx`
- `CustomFieldsFilter.tsx`
- `DateFilter.tsx`
- `HierarchicalLabelValueFilter.tsx`
- `LabeledIdFilter.tsx`
- `NumberFilter.tsx`
- `PathFilter.tsx`
- `PerformersFilter.tsx`
- `PhashFilter.tsx`
- `RatingFilter.tsx`
- `SidebarListFilter.tsx`
- `StashIDFilter.tsx`
- `StudiosFilter.tsx`
- `TagsFilter.tsx`

### Moved to Extensions (18)
Fork-created files moved from `components/List/Filters/` to `extensions/filters/`:
- `AgeFilter.tsx`, `CaptionsFilter.tsx`, `CircumcisedFilter.tsx`
- `CountryFilter.tsx`, `GenderFilter.tsx`, `GroupsFilter.tsx`
- `IsMissingFilter.tsx`, `OrientationFilter.tsx`
- `PerformerTagsFilter.tsx`, `ResolutionFilter.tsx`, `SidebarDurationFilter.tsx`
- `SidebarFilterSelector.tsx`, `StringFilter.tsx`, `facetCandidateUtils.ts`
- Test files moved to `extensions/__tests__/`

### Import Changes
Extension lists (`extensions/lists/`) now import from `extensions/filters/` instead of `components/List/Filters/`.

**Result:** The `src/components/List/Filters/` directory can be cleanly overwritten by upstream merges with no conflicts.

---

## Facets System

A comprehensive facets aggregation system providing dynamic filter counts in sidebar filters.

### Backend Changes

**New GraphQL endpoint** returning aggregated counts for multiple filter dimensions:

- Single query efficiency using CTE (Common Table Expression)
- Parallel execution with 8 goroutines (all facets computed simultaneously)
- Extension indexes for optimal query performance
- 500ms debouncing to prevent API spam

**Supported Entities:**

| Entity | Facets Available |
|--------|------------------|
| Scenes | tags, performers, studios, groups, performer_tags, captions, resolutions, orientations, organized, interactive, ratings |
| Performers | tags, studios, genders, countries, circumcised, favorite, ratings |
| Galleries | tags, performers, studios, organized, ratings |
| Groups | tags, performers, studios, containing_groups, sub_groups |
| Studios | tags, parents, favorite |
| Tags | parents, children, favorite |

### Frontend Changes

**New files:**
- `graphql/data/facets.graphql` - GraphQL queries
- `src/hooks/useFacetCounts.ts` - React hooks and context
- `src/extensions/hooks/useFacetCounts.ts` - Extended hooks
- `src/extensions/hooks/useSceneFacets.ts` - Batched facets
- `src/extensions/hooks/useSidebarFilters.ts` - Sidebar state

---

## Filter Components (29 total)

### NEW Filter Types (13)

| Component | Purpose |
|-----------|---------|
| `AgeFilter` | Age range filter with presets |
| `CaptionsFilter` | Caption language filter with country codes |
| `CircumcisedFilter` | Cut/Uncut with icons (was incorrectly using StringFilter) |
| `CountryFilter` | Country selector with flags |
| `GenderFilter` | Gender filter with icons |
| `GroupsFilter` | Hierarchical groups (containing_groups, sub_groups) |
| `IsMissingFilter` | Missing metadata filter |
| `FilterSidebar` | Sidebar search, saved filters, keybinds |
| `OrientationFilter` | Video orientation (landscape, portrait, square) |
| `PerformerTagsFilter` | Tags filter for performers specifically |
| `ResolutionFilter` | Quality resolution presets |
| `SidebarFilterSelector` | Filter visibility selector |
| `StringFilter` | Multi-value with OR logic, comma/newline to regex |

### Enhanced Filter Types (16)

| Component | Enhancements |
|-----------|--------------|
| `BooleanFilter` | Context-specific labels, icons, zero-count dimming |
| `DateFilter` | Quick presets (Today, Last 7/30/90 days, Last year), cancel button |
| `DurationFilter` | Range presets, cancel button |
| `LabeledIdFilter` | Better labels, facet counts |
| `NumberFilter` | Quick preset values, "Custom..." with cancel, filter-specific ranges |
| `PathFilter` | Autocomplete, path validation |
| `PerformersFilter` | Facet counts |
| `PhashFilter` | Distance presets (Exact, Very Similar, Similar, etc.) |
| `RatingFilter` | Star preset buttons |
| `SelectableFilter` | Hierarchical support |
| `SidebarDurationFilter` | Range presets |
| `SidebarListFilter` | Multi-select improvements |
| `StashIDFilter` | URL paste auto-detection, automatic parsing |
| `StudiosFilter` | Facet counts, parent studios |
| `TagsFilter` | Facet counts |
| `facetCandidateUtils` | Utilities for facet processing |

---

## List Components (6)

Complete list page implementations extracted from `My*List` components:

| Component | Features |
|-----------|----------|
| `PerformerList` | Custom sidebar, facet counts, random performer (`p r`) |
| `SceneList` | Facets, play queue, scene stats |
| `GalleryList` | Facets, custom filters |
| `GroupList` | Facets, hierarchical groups |
| `StudioList` | Facets, tagger integration |
| `TagList` | Facets, merge dialog |

---

## UI Components

| Component | Purpose |
|-----------|---------|
| `FilterTags` | Visual filter criteria tags |
| `ListToolbar` | Enhanced list toolbar |
| `ListResultsHeader` | Pagination & sort controls |
| `FilterSidebar` | Sidebar header with search |

---

## Custom Styles

Located in `extensions/styles/` (~5,700 lines total):

### Core Styles
| File | Purpose |
|------|---------|
| `_variables.scss` | CSS custom properties |
| `_facets.scss` | Facets feature styles |
| `_sidebar.scss` | Sidebar styles |
| `_filter-tags.scss` | Filter tag styles |

### Component Styles (Extracted from Upstream)
| File | Lines | Source |
|------|-------|--------|
| `_list-components.scss` | 1,726 | `List/styles.scss` |
| `_scene-components.scss` | 1,305 | `Scenes/styles.scss` |
| `_player-components.scss` | 830 | `ScenePlayer/styles.scss` |
| `_shared-components.scss` | 1,086 | `Shared/styles.scss` |
| `_gallery-components.scss` | 528 | `Galleries/styles.scss` |
| `_image-components.scss` | 197 | `Images/styles.scss` |

### Optional Theme
| File | Purpose |
|------|---------|
| `_plex-theme.scss` | Plex-inspired theme (disabled) |
| `_plex-theme-extended.scss` | Extended theme components |
| `_plex-theme-desktop.scss` | Desktop responsive styles |

---

## Loading Indicators

- **Candidate loading**: Spinner while candidates load
- **Count loading**: Pulsing dots (`···`) while facet counts load
- **Unique key prefixes**: Prevents React DOM recycling issues

---

## Bug Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Labels showing as IDs | `toMap()` discarded labels | Store both count and label in `LabeledFacetCount` |
| Stale counts filtering candidates | Missing loading state check | Added `!facetsLoading` check |
| Search/facet results mismatch | Different result sets merged incorrectly | Use facet results directly when no search query |
| Gallery facets SQL error | Wrong table name | Changed `galleries_performers` to `performers_galleries` |
| Groups filter wrong component | Used `SidebarStudiosFilter` | Created `SidebarGroupsFilter` |
| Stale response race condition | Out-of-order responses overwrote current data | Added filter fingerprint check before applying response |
| Facet data mixing between filters | Apollo cache merged FacetCount objects with same ID | Added `keyFields: false` type policy for FacetCount |

---

## Performance Optimizations

### Unfiltered Fast Path (Backend)

When no filter is applied, the backend now uses optimized "fast path" queries that:
- Skip the expensive CTE (Common Table Expression) that materializes 700k+ scene IDs
- Use direct `COUNT(*)` on junction tables instead of `COUNT(DISTINCT)`
- Are 10-100x faster for large databases

**Implementation**: `pkg/sqlite/scene_facets.go` - `getFacetsUnfiltered()`

### Frontend Caching

Unfiltered facet results are cached in memory for 5 minutes:
- Instant display on subsequent page visits
- Background refresh keeps cache current
- Cache key per entity type (scenes, performers, etc.)

**Implementation**: `useFacetCounts.ts` - `unfilteredFacetCache`

---

## Performance Optimizations

### Backend Optimizations

- **CTE-based queries**: Base filter executes only once
- **Parallel execution**: All 8 facet queries run concurrently in goroutines
- **Extension indexes**: Fork-safe database indexes created at startup
- **Unfiltered fast path**: Skip CTE when no filter applied (10-100x faster)

### Frontend Optimizations

- **Filter pattern caching**: Caches ANY filter pattern, not just empty filters
- **localStorage persistence**: Cache survives page refresh/browser close
- **Background refresh**: Instant display from cache while refreshing in background
- **Automatic invalidation**: Cache cleared on scan complete
- **Debouncing**: Reduces API calls during rapid filter changes (300ms)

### Cache Configuration

| Setting | Value |
|---------|-------|
| TTL (unfiltered) | 30 minutes |
| TTL (filtered) | 10 minutes |
| Max patterns cached | 20 per entity type |
| Storage | Memory + localStorage |

### Apollo Client Fix

- **FacetCount normalization disabled**: Added `keyFields: false` to prevent data mixing between facet types

---

## Migration History

### Phase 1: List Components
Moved `My*List` files from `src/components/` to `src/extensions/lists/`

### Phase 2: Filter Components
Extracted 29 filter components to `src/extensions/filters/`

### Phase 3: Hooks
Moved facet hooks to `src/extensions/hooks/`

### Phase 4: Documentation
Consolidated docs into `src/extensions/docs/`

