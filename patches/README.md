# Fork Patches

This directory contains documentation for merging fork changes after upstream updates.

## Overview

When merging from upstream, most fork code is isolated in:
- **Frontend:** `ui/v2.5/src/extensions/`
- **Backend:** New packages like `pkg/recommendation/`, new files like `*_facets.go`

However, some changes modify upstream files. This directory documents those changes.

## Baseline

This fork is based on **Stash v0.29.3**.

---

## Files

| File | Purpose | Priority |
|------|---------|----------|
| `schema-queries.md` | GraphQL query additions (facets + recommendations) | **High** |
| `repository-interfaces.md` | Faceter interface embeddings | **High** |
| `extension-indexes.md` | Database index optimization (init.go hook) | **High** |
| `dlna-enhancements.md` | DLNA alphabetical folders, pagination, activity tracking | **High** |
| `plugin-submodules.md` | Git submodule plugins (stash-react-plugin) | **High** |
| `tag-filter-extensions.md` | Tag filter additions (performers_filter, groups_filter) | Medium |
| `config-extensions.md` | Frontend config changes (recommendations, sidebar) | Medium |
| `utility-additions.md` | Small utility functions | Low |

---

## Quick Merge Guide

### Step 1: Check for Conflicts

```bash
git status
```

### Step 2: Handle Schema Conflicts

If `graphql/schema/schema.graphql` conflicts:
- See `schema-queries.md` for all queries to add

### Step 3: Handle Repository Conflicts

If `pkg/models/repository_*.go` files conflict:
- See `repository-interfaces.md` for Faceter interface lines

### Step 4: Handle Extension Indexes

If `internal/manager/init.go` conflicts:
- See `extension-indexes.md` for the startup hook

### Step 5: Handle Tag Filter Conflicts

If `pkg/sqlite/tag*.go` or `graphql/schema/types/filters.graphql` conflict:
- See `tag-filter-extensions.md` for tag filter additions

### Step 6: Handle DLNA Conflicts

If `internal/dlna/*.go` files conflict:
- See `dlna-enhancements.md` for:
  - Query interface additions to `dms.go`
  - Alphabetical folder logic in `cds.go`
  - Activity tracker integration in `service.go`

### Step 7: Regenerate & Build

```bash
go generate ./...
go build ./...
```

### Step 8: Build Plugins

If plugin submodules have changed:
```powershell
# Windows
.\scripts\build-plugins.ps1

# Linux/macOS
./scripts/build-plugins.sh
```

See `plugin-submodules.md` for details.

### Step 9: Test

```bash
# Backend tests
go test -v -tags=integration ./pkg/sqlite/... -run Facet

# Frontend
cd ui/v2.5
yarn build
yarn test
```

---

## New Files (Won't Conflict)

These files don't exist upstream - they'll merge cleanly:

### Facets System
```
graphql/schema/types/facets.graphql
pkg/models/facets.go
pkg/sqlite/*_facets.go (6 files + tests)
pkg/sqlite/extension_indexes.go      # Database indexes (created at startup)
internal/api/resolver_query_facets.go
internal/api/types_facets.go
```

### Recommendations System
```
pkg/recommendation/performer.go
pkg/recommendation/scene.go
internal/api/resolver_query_performer_recommendations.go
internal/api/resolver_query_scene_recommendations.go
internal/api/resolver_*_recommendations_result_type.go
```

### DLNA Activity Tracking
```
internal/dlna/activity.go            # Activity tracker for DLNA playback
internal/dlna/activity_test.go       # Activity tracker tests
```

### Frontend Extensions
```
ui/v2.5/src/extensions/           # All custom frontend code (~80 files)
├── lists/                        # List components (7 files)
├── filters/                      # Filter components (29 files)
├── hooks/                        # Custom hooks (7 files)
├── ui/                           # Shared UI components (6 files)
├── styles/                       # All custom SCSS (14 files, ~10,300 lines)
│   ├── _list-components.scss
│   ├── _scene-components.scss
│   ├── _player-components.scss
│   ├── _shared-components.scss
│   ├── _gallery-components.scss
│   └── _image-components.scss
└── docs/                         # Documentation
```

---

## Modified Files (May Conflict)

### Backend
| File | Changes | Patch Doc |
|------|---------|-----------|
| `graphql/schema/schema.graphql` | Facet + recommendation queries | `schema-queries.md` |
| `pkg/models/repository_*.go` | Faceter interfaces | `repository-interfaces.md` |
| `internal/manager/init.go` | Extension index startup hook | `extension-indexes.md` |
| `graphql/schema/types/filters.graphql` | Tag filter fields | `tag-filter-extensions.md` |
| `pkg/models/tag.go` | TagFilterType fields | `tag-filter-extensions.md` |
| `pkg/sqlite/tag.go` | Join repos + FindFavoriteTagIDs | `tag-filter-extensions.md`, `utility-additions.md` |
| `pkg/sqlite/tag_filter.go` | Filter handlers | `tag-filter-extensions.md` |
| `pkg/models/resolution.go` | ResolutionFromHeight | `utility-additions.md` |
| `pkg/sqlite/sql.go` | Random sort helper | `utility-additions.md` |
| `internal/api/resolver.go` | withDB method for parallel queries | `utility-additions.md` |
| `internal/dlna/dms.go` | Query interfaces, activity tracker | `dlna-enhancements.md` |
| `internal/dlna/cds.go` | A-Z folders, pagination, logging | `dlna-enhancements.md` |
| `internal/dlna/cds_test.go` | Alphabetical folder tests | `dlna-enhancements.md` |
| `internal/dlna/service.go` | Activity tracker lifecycle | `dlna-enhancements.md` |

### Frontend (Minimal - Most in Extensions)
| File | Changes | Status |
|------|---------|--------|
| `src/core/config.ts` | AI recommendations, sidebar filters | See `config-extensions.md` |
| `src/core/StashService.ts` | Scene recommendations query | See `config-extensions.md` |
| `App.tsx` | ExtensionRegistryProvider wrapper | Keep during merge |
| `src/index.scss` | Extensions import at end | Keep during merge |
| Route files (`Scenes.tsx`, etc.) | Import Enhanced* components | Keep during merge |

> **Note:** All SCSS modifications, filter components, list components, and hooks have been fully extracted to `extensions/` - these files are clean v0.29.3 in upstream locations.
