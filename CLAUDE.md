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

**Development Ports:**
| Port | Server | Use Case |
|------|--------|----------|
| **3000** | Vite dev server (`npm run start`) | Development - hot reload, source maps, fast iteration |
| **9999** | Stash Go binary | Production - embedded UI, requires rebuild + restart |

**Recommended workflow:** Use port 3000 for development and debugging (hot reload, source maps). The Go binary on 9999 embeds UI at build time, so changes require `npm run build` + `mingw32-make stash` + server restart. Final verification should be done on 9999 before committing.

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
- `extensions/lists/` - Enhanced list components (7 files)
- `extensions/filters/` - Filter components (29 files)
- `extensions/hooks/` - Custom React hooks (7 files)
- `extensions/components/` - Full page components & detail panels (8 files)
- `extensions/ui/` - Shared UI components (6 files)
- `extensions/styles/` - Custom SCSS (14 files, ~10,300 lines)
- `extensions/__tests__/` - Extension tests (4 files)

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

### Test Modification Rules

**NEVER remove or weaken tests without explicit justification.**

Before modifying any test:
1. **Identify the scenario** - What specific scenario was this test covering?
2. **Check coverage impact** - Does modifying/removing this test reduce coverage for that scenario?
3. **Preserve intent** - If a test fails, fix the test setup or the code, don't just remove the test
4. **Ask if uncertain** - If a test seems wrong but you're not sure why it exists, ask before removing

**Only modify tests when:**
- The test is genuinely incorrect (tests wrong behavior)
- The tested behavior has intentionally changed
- The test is a true duplicate of another test
- Improving the test to cover MORE scenarios

**Red flags that suggest you should NOT modify a test:**
- Test fails because mocking is complex → Fix the mock, don't remove the test
- Test seems redundant → Check if it covers a different code path or edge case
- Test is "too strict" → The strictness may be catching real bugs

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

**After merging, run `/check-upstream-extensions`** to verify extension components have feature parity with upstream changes.

## Key Documentation

- `patches/README.md` - Backend patch overview and merge guide
- `ui/v2.5/src/extensions/README.md` - Frontend extensions overview
- `ui/v2.5/src/extensions/docs/ARCHITECTURE.md` - Full architecture guide
- `ui/v2.5/src/extensions/docs/UPGRADE-GUIDE.md` - Upstream merge guide
- `ui/v2.5/src/extensions/docs/sessions/` - Session logs for multi-conversation work
- `docs/DEVELOPMENT.md` - General development setup
- `.claude/skills/session-log/SKILL.md` - Session logging skill documentation

## Submodules

| Submodule | Purpose | Details |
|-----------|---------|---------|
| `scrapers/SiteJsonScraper/` | Python scraper for site.json files | See [`scrapers/SiteJsonScraper/CLAUDE.md`](scrapers/SiteJsonScraper/CLAUDE.md) |
| `plugins/stash-react-plugin/` | UI plugin for Tagger confidence display | See [`plugins/stash-react-plugin/CLAUDE.md`](plugins/stash-react-plugin/CLAUDE.md) |
| `plugins/ModernDark/` | CSS theme plugin (visual styling reference) | See [`plugins/ModernDark/CLAUDE.md`](plugins/ModernDark/CLAUDE.md) |

**Coordination notes:**
- SiteJsonScraper and stash-react-plugin share a metadata format - changes to one may require changes to the other
- ModernDark overrides Stash's default styles - new UI may require ModernDark follow-up (see Frontend/UX Workflow below)

## Frontend/UX Workflow

**All frontend work in the Stash repo follows Stash's default styling.** ModernDark is a separate plugin that overrides these styles at runtime.

### Styling Cascade

```
Stash SCSS ($variables)  →  Extensions CSS (--ext-*)  →  ModernDark CSS (--color-*)
       ↓                           ↓                            ↓
   Compiled                    Compiled                   Runtime Override
```

### When Adding New UI

1. **Write styles using Stash patterns** - Use Stash's SCSS variables (`$primary`, `$secondary`, etc.) or match existing component styles
2. **Test with default theme first** - Ensure UI works without ModernDark
3. **Check if ModernDark needs updates** - New components (cards, buttons, forms, modals) may need theme overrides
4. **Update ModernDark if needed** - Add overrides in the corresponding `components/` file

### Common Elements Requiring ModernDark Updates

| New UI Element | ModernDark File to Update |
|----------------|---------------------------|
| Cards, grid items | `components/Shared/styles.scss` |
| Buttons, forms | `styles/_buttons.scss`, `styles/_forms.scss` |
| Modals, dialogs | `styles/_modals.scss` |
| Navigation, tabs | `styles/_navigation.scss` |
| Feature-specific | `components/[Feature]/styles.scss` |

See [`plugins/ModernDark/CLAUDE.md`](plugins/ModernDark/CLAUDE.md) for the complete theme structure.

## Stash Server & Deployment

### Server Details

Server URL, credentials, and path mappings are in `.claude/credentials.local` (gitignored).

The deployment uses SMB to map a Windows drive letter to the Linux server's config directory.

### Deployment Paths

| Component | Source (GitHub) | Deployed (Stash Config) |
|-----------|-----------------|-------------------------|
| **SiteJsonScraper** | `scrapers/SiteJsonScraper/` | `<CONFIG_PATH>/scrapers/SiteJsonScraper/` |
| **stash-pro** | `plugins/stash-react-plugin/` | `<CONFIG_PATH>/plugins/stash-pro/` |
| **ModernDark** | `plugins/ModernDark/` | `<CONFIG_PATH>/plugins/ModernDark/` |

### Critical Rules

**NEVER edit files directly in the deployed config directory.**

- Always edit source code in the GitHub repo
- The config drive is a live deployment - changes there affect the running Stash server immediately
- Changes in config are not version controlled and will be lost on next deployment
- See each submodule's CLAUDE.md for build and deploy commands

## Browser Testing (Playwright MCP)

A Playwright MCP server is configured for browser automation and visual testing.

### Capabilities

- Navigate to any Stash page
- Take accessibility snapshots (`browser_snapshot`) for element inspection
- Click, type, and interact with UI elements
- Take screenshots for visual verification
- Verify UI changes after deploying plugin updates

### Common Workflows

**Testing plugin changes:**
```
1. Build plugin: cd plugins/stash-react-plugin && yarn build
2. Deploy: copy dist files to <CONFIG_PATH>/plugins/stash-pro/
3. Navigate: browser_navigate to <STASH_URL>
4. Refresh and verify: browser_snapshot to check UI renders correctly
```

**Debugging Tagger UI:**
```
1. browser_navigate to <STASH_URL>/scenes?c=("type":"performers","value":[],"modifier":"NOT_NULL")
2. Click on a scene to open it
3. Open Tagger tab
4. browser_snapshot to inspect confidence badges and metadata display
```

**Useful pages:**
- Tagger: `/scenes` → click scene → Tagger tab
- Settings: `/settings?tab=tasks` (plugin tasks)
- Performers: `/performers`

## Debugging Complex Issues

For long debugging sessions, use these strategies to maintain focus and avoid spiraling.

### Session Logging (Preferred)

For complex work that may span multiple conversations, use the `/session-log` skill:

```bash
/session-log start debug filter-search-performance
```

This creates structured session documents in `ui/v2.5/src/extensions/docs/sessions/` with:
- Dated folders for easy tracking
- Type-specific templates (debug/design/feature/refactor)
- Progress logs with timestamps
- Hypothesis tracking

**To resume a session**, point to the SESSION.md file:
```
Read docs/sessions/debug/2026-01-06-filter-performance/SESSION.md and continue
```

See `.claude/skills/session-log/SKILL.md` for full documentation.

### Quick Debugging Scratchpad (Alternative)

For quick debugging that won't span sessions, create a `DEBUG_SESSION.md` file in the working directory:

```markdown
# Debug Session: [Brief Issue Description]

## Original Problem
[What we're actually trying to solve - don't lose sight of this]

## Current Hypothesis
[What we think is causing it right now]

## Tried & Results
- [x] Checked X → Found Y (not the issue)
- [x] Tried Z → Didn't work because...
- [ ] Next: Try W

## Key Discoveries
[Important findings to remember, even if not the solution]
```

Update this file as we go. If context is lost, re-read it.

### Hypothesis-Driven Debugging

Before each attempt, I should state:
1. **Hypothesis**: "I think X is causing this because..."
2. **Test**: "To verify, I'll check Y"
3. **Result**: "This confirms/refutes because..."

If I'm not doing this, prompt with **"What's your hypothesis?"**

### User Intervention Phrases

Use these phrases to redirect debugging:

| Phrase | What I'll Do |
|--------|--------------|
| "Step back and summarize" | List what we've tried, current state, and options |
| "Try a different approach" | Abandon current path, brainstorm alternatives |
| "What's your hypothesis?" | State what I think is wrong before continuing |
| "Check the scratchpad" | Re-read DEBUG_SESSION.md to regain context |
| "We already tried that" | Note it and try something different |
| "Time-box this" | If 3 more attempts fail, switch approaches |

### Verification Requirements

**NEVER mark anything as "FIXED" or "RESOLVED" until it has been verified.**

This rule exists because:
- Code that compiles may not work at runtime
- Tests that pass locally may fail in production conditions
- Cached bundles, stale data, or timing issues can mask whether a fix actually works

Verification methods vary by fix type:

| Fix Type | Verification Method |
|----------|---------------------|
| UI changes | Manual browser testing |
| Performance | Benchmark tests with real data |
| Backend logic | Unit/integration tests |
| GraphQL | Query in GraphQL playground |
| Database queries | EXPLAIN QUERY PLAN + timing |

If verification cannot be completed in the current session, mark the fix as **"CODE WRITTEN - NEEDS VERIFICATION"** instead of "FIXED".

### After Solving Issues

When we solve a tricky issue, add it to the relevant CLAUDE.md's "Known Gotchas" section so we don't rediscover it later.
