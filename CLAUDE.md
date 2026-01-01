# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stash is a self-hosted media organizer written in Go (backend) and React/TypeScript (frontend). This is a **fork** of `stashapp/stash` with custom extensions for faceted filtering, AI recommendations, and enhanced UI. The fork baseline is **Stash v0.29.3**.

## Build Commands

### Backend (Go)
```bash
make stash              # Build stash binary
make build              # Build stash + phasher binaries
make build-release      # Build release binaries (stripped)
make generate           # Regenerate GraphQL files (backend + frontend)
make generate-backend   # Regenerate Go GraphQL files only
make test               # Run unit tests
make it                 # Run all tests including integration tests
make lint               # Run golangci-lint
make server-start       # Run dev server (uses .local/ directory)
```

### Frontend (React/TypeScript)
```bash
cd ui/v2.5
pnpm install --frozen-lockfile  # Install dependencies (or use: make pre-ui from root)
npm run build           # Production build
npm run start           # Dev server (connects to localhost:9999)
npm run validate        # Run lint + type check + format check
npm run test            # Run vitest tests
npm run test --run extensions   # Run extension tests only
npm run gqlgen          # Regenerate GraphQL client code
```

### Full Release Build
```bash
make pre-ui             # Install UI dependencies
make generate           # Generate GraphQL files
make ui                 # Build frontend
make build-release      # Build optimized binaries
```

## Fork Extension Strategy

**CRITICAL: All fork-specific code must follow the extension strategy to minimize merge conflicts.**

### Frontend Code Isolation
All frontend fork code goes in `ui/v2.5/src/extensions/`:
- `extensions/lists/` - Enhanced list components (6 files)
- `extensions/filters/` - Filter components (29 files)
- `extensions/hooks/` - Custom React hooks
- `extensions/components/` - Full page components & detail panels
- `extensions/styles/` - Custom SCSS (~5,700 lines)
- `extensions/__tests__/` - Extension tests

**NEVER modify these upstream directories directly:**
- `ui/v2.5/src/components/List/Filters/` - Kept at v0.29.3 baseline
- `ui/v2.5/src/components/Scenes/` - Use extensions/components/ instead

### Backend Code Strategy
**New files (won't conflict):**
- `pkg/sqlite/*_facets.go` - Facet query implementations
- `pkg/sqlite/extension_indexes.go` - Fork-specific database indexes
- `pkg/models/facets.go` - Facet data models
- `pkg/recommendation/*.go` - Recommendation system
- `graphql/schema/types/facets.graphql` - Facet GraphQL types
- `internal/api/resolver_query_facets.go` - Facet resolvers

**Modified upstream files (documented in `/patches/`):**
- `graphql/schema/schema.graphql` - See `patches/schema-queries.md`
- `pkg/models/repository_*.go` - See `patches/repository-interfaces.md`
- `internal/manager/init.go` - See `patches/extension-indexes.md`

### Database Index Strategy
- Fork-specific indexes go in `pkg/sqlite/extension_indexes.go`
- All indexes must use `idx_ext_` prefix
- All indexes must use `CREATE INDEX IF NOT EXISTS`
- Created via startup hook, not migrations

## Import Patterns

Use absolute imports in extensions:
```typescript
// Correct
import { Component } from "src/components/Shared/Component";
import { useHook } from "src/extensions/hooks";

// Wrong
import { Component } from "../../../components/Shared/Component";
```

Export from index files for clean imports:
```typescript
import { SidebarTagsFilter, useSceneFacetCounts } from "src/extensions";
```

## Testing

### Frontend Tests
```bash
cd ui/v2.5
npm run test --run extensions   # Extension tests only
```

### Backend Tests
```bash
go test -v -tags=integration ./pkg/sqlite/... -run Facet   # Facet tests
go test ./...                                               # All unit tests
```

### Production Database
A production database copy is at `test-data/stash-go.sqlite` (~700k scenes, ~800k galleries) for performance testing.

## Architecture

### Backend Structure
- `cmd/stash/` - Main application entry point
- `internal/api/` - GraphQL resolvers
- `internal/manager/` - Application initialization and task management
- `internal/dlna/` - DLNA server (has fork enhancements)
- `pkg/models/` - Data models and repository interfaces
- `pkg/sqlite/` - SQLite database implementation
- `pkg/ffmpeg/` - FFmpeg integration
- `pkg/scraper/` - Scraping system
- `pkg/plugin/` - Plugin system
- `graphql/schema/` - GraphQL schema definitions

### Frontend Structure
- `ui/v2.5/src/components/` - React components (upstream)
- `ui/v2.5/src/extensions/` - Fork-specific code (see above)
- `ui/v2.5/src/core/` - Core services (StashService, config)
- `ui/v2.5/src/hooks/` - Shared React hooks
- `ui/v2.5/src/models/` - Frontend data models
- `ui/v2.5/graphql/` - GraphQL queries and fragments

### GraphQL Code Generation
- Backend: `go generate ./cmd/stash` generates resolvers from schema
- Frontend: `npm run gqlgen` (in ui/v2.5) generates TypeScript types and hooks

## Git Workflow

### Commit Rules
- **Do NOT include AI attribution in commits** - No "Generated with Claude", "Co-Authored-By: Claude", or similar markers
- Use conventional commit format: `type: description` (e.g., `feat:`, `fix:`, `chore:`, `docs:`)

### Remotes
- `origin` - Your fork (`cj12312021/stash`) - push here
- `upstream` - Upstream (`stashapp/stash`) - pull updates only

**NEVER push directly to upstream.**

### Branches
- `develop` - Main working branch, all PRs target this
- Feature branches created from `develop`

### Syncing with Upstream
```bash
git fetch upstream
git checkout develop
git merge upstream/develop
# Resolve conflicts using /patches/ documentation
git push origin develop
```

## Key Documentation

- `patches/README.md` - Backend patch overview and merge guide
- `ui/v2.5/src/extensions/README.md` - Frontend extensions overview
- `ui/v2.5/src/extensions/docs/ARCHITECTURE.md` - Full architecture guide
- `ui/v2.5/src/extensions/docs/UPGRADE-GUIDE.md` - Upstream merge guide
- `docs/DEVELOPMENT.md` - General development setup
