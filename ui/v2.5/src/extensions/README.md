# Extensions

Fork-specific features isolated from upstream Stash code for easier maintenance.

**Baseline:** Stash v0.29.3 | **Upstream:** `stashapp/stash` develop branch

## Quick Start

```tsx
// Import everything you need from one place
import { 
  PerformerList,           // List components
  SidebarTagsFilter,       // Filter components  
  useSceneFacetCounts,     // Hooks
} from "src/extensions";

// Or from specific modules
import { PerformerList } from "src/extensions/lists";
import { SidebarTagsFilter } from "src/extensions/filters";
import { useSceneFacetCounts } from "src/extensions/hooks";
```

## Directory Structure

```
extensions/
├── index.ts            # Main entry - exports everything
├── registry.tsx        # Extension registration
├── README.md           # This file
│
├── lists/              # 7 enhanced list components
├── filters/            # 29 custom filter components
├── hooks/              # 8 custom React hooks
├── ui/                 # 6 reusable UI components
├── player/             # 3 VideoJS plugins (settings, icons, chapters)
├── components/         # Full page components & detail panels (10 files)
├── facets/             # Facets extension registration
├── styles/             # 15 custom SCSS files (~10,800 lines)
├── __tests__/          # Extension tests (4 files)
│
└── docs/               # Documentation
    ├── ARCHITECTURE.md # Full architecture guide
    ├── CHANGELOG.md    # What changed from upstream
    └── CONTRIBUTING.md # How to add features
```

## What's Included

### Lists (6)
Full list page implementations with facet counts, custom sidebars, and extended features.

| Component | Key Features |
|-----------|--------------|
| `PerformerList` | Merge dialog, random performer (`p r`), facets |
| `SceneList` | Merge dialog, play queue, scene stats |
| `GalleryList` | Edit dialog, facets, custom filters |
| `GroupList` | Edit dialog, hierarchical groups |
| `StudioList` | Edit dialog, tagger integration |
| `TagList` | Merge dialog, facets |

### Scene Detail Page
| Component | Key Features |
|-----------|--------------|
| `Scene.tsx` | Merge action, studio background, discover queue |

### Player Plugins (3)
VideoJS plugins for enhanced video player functionality:

| Plugin | Key Features |
|--------|--------------|
| `SettingsMenuPlugin` | YouTube-style settings with speed, quality, autoplay |
| `PlayerIconsPlugin` | SVG icons matching YouTube's 2024 design |
| `ChapterIndicatorPlugin` | Marker display in control bar with CRUD menu |

### Filters (29)
13 NEW + 16 enhanced filter components with facet counts, quick presets, and better UX.

### Hooks (8)
Facet counting and filter management:
- `useFacetCounts` - Main facet counting with entity-specific variants
- `useSceneFacets` - Scene-specific facet queries
- `useSidebarFilters`, `useBatchedFilterCounts`
- `useFacetsContext` - React context for facets state
- `facetCacheLink` - Apollo Link for mutation-based cache invalidation

### Styles (~10,300 lines)
SCSS files loaded last (can override anything):
- Component styles: `_list-`, `_scene-`, `_player-`, `_shared-`, `_gallery-`, `_image-components.scss`
- Feature styles: `_facets.scss`, `_sidebar.scss`, `_filter-tags.scss`
- Optional theme: `_plex-theme*.scss`

**ModernDark coordination:** Extension styles follow Stash's default patterns. The ModernDark plugin (`plugins/ModernDark/`) overrides these at runtime. New extension UI may require ModernDark follow-up - see main `CLAUDE.md` "Frontend/UX Workflow".

## Documentation

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full architecture guide |
| [UPGRADE-GUIDE.md](docs/UPGRADE-GUIDE.md) | **How to upgrade from upstream** ⭐ |
| [MIGRATION-PLAN.md](docs/MIGRATION-PLAN.md) | Migration status & patch list |
| [BACKEND-API.md](docs/BACKEND-API.md) | Custom GraphQL endpoints & backend files |
| [CHANGELOG.md](docs/CHANGELOG.md) | What changed from upstream |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md) | How to add features |
| [FACETS-SYSTEM.md](docs/FACETS-SYSTEM.md) | Facets technical reference |
| [FILTER-COMPONENTS.md](docs/FILTER-COMPONENTS.md) | Filter components reference |
| [facets/README.md](facets/README.md) | Facets overview |

## Key Principles

1. **All fork code in `extensions/`** - Clean separation from upstream
2. **Upstream files untouched** - `components/List/Filters/` is clean v0.29.3
3. **Absolute imports** - `src/components/...` not `../components/...`
4. **Index exports** - Clean imports via `index.ts` files
5. **SCSS loads last** - Can override any upstream style

## Merging from Upstream

Since `src/components/List/Filters/` is clean:
- Upstream can overwrite those files without conflict
- All customizations are in `extensions/filters/`
- Extension lists import from `extensions/filters`, not upstream

## Migration Status ✅ Complete

All fork changes are documented. See [MIGRATION-PLAN.md](docs/MIGRATION-PLAN.md).

| Category | Files | Status |
|----------|-------|--------|
| List components | 7 | ✅ In extensions |
| Filter components | 29 | ✅ In extensions |
| UI components | 6 | ✅ In extensions |
| Hooks | 8 | ✅ In extensions |
| SCSS | 14 | ✅ In extensions (~10,300 lines) |
| Tests | 4 | ✅ In extensions |
| Component modifications | ~40 | ✅ Documented (12 patch files) |
| GraphQL | 11 | ✅ Documented |
| Core config | 2 | ✅ Documented |

**Upgrading?** See [UPGRADE-GUIDE.md](docs/UPGRADE-GUIDE.md) for step-by-step instructions.
