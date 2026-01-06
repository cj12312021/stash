# Debug Session: Facet Query Performance Issue

## Session Summary (2026-01-06)

**Status:** ✅ RESOLVED

**Original Problem:** Facet queries take ~60s through Go but only 1.2s via sqlite3 CLI
**Solution:** Changed `withReadTxn` to `withDB` for true parallel query execution
**Final Performance:** ~10s (compiled binary), ~57s (VSCode debugger)

---

## Root Cause Analysis

Two factors contributed to the 60s timeout:

### 1. Transaction Serialization (Code Fix Required)
`withReadTxn` created a single transaction that serialized all 10 parallel goroutines through one connection. Changed to `withDB` to allow true parallelism.

### 2. VSCode Debugger Overhead (5-10x slowdown)
The debugger adds massive overhead to SQLite operations.

**Why Delve (Go debugger) is slow:**

1. **Compiler optimizations disabled** - Delve compiles with `-gcflags="all=-N -l"`:
   - `-N` = Disable optimizations
   - `-l` = Disable inlining

2. **Delve instrumentation** - Even without breakpoints:
   - Intercepts every function call for potential breakpoints
   - Maintains goroutine tracking overhead
   - Adds memory barriers for debugger state inspection
   - Keeps stack traces available at all times

3. **CGO/SQLite impact** - `mattn/go-sqlite3` uses CGO (C code). The debugger has extra overhead at every Go↔C boundary crossing. Facet queries cross this boundary millions of times.

4. **No dead code elimination** - Debug builds keep all code paths for inspection.

**Why SQLite is hit hardest:** Facet queries do millions of row iterations (`rows.Next()`), CGO boundary crossings, and small allocations. Each pays the debugger overhead tax, compounding to 5-10x slowdown.

---

## Performance Comparison

| Facet | Compiled Binary | VSCode Debugger | Slowdown |
|-------|-----------------|-----------------|----------|
| Groups | 1.97s | 19.52s | 9.9x |
| Captions | 2.00s | 19.29s | 9.6x |
| HasMarkers | 2.87s | 20.83s | 7.3x |
| Studios | 3.13s | 20.28s | 6.5x |
| PerformerFavorite | 3.20s | 21.24s | 6.6x |
| Simple | 3.31s | 24.54s | 7.4x |
| Performers | 4.85s | 26.07s | 5.4x |
| Video | 5.84s | 39.25s | 6.7x |
| PerformerTags | 9.43s | 54.82s | 5.8x |
| Tags | 9.81s | 57.09s | 5.8x |
| **Total** | **9.81s** | **57.13s** | **5.8x** |

### Filter Building (Fast in both cases)
| Step | Compiled | Debugger |
|------|----------|----------|
| `makeQuery` | 3.67ms | 34.5ms |
| `getHierarchicalValues` | 3.16ms | 34.5ms |
| `toSQL` | 0ms | 0ms |

---

## Key Insights

### 1. Lazy Query Execution
```
Studios: Queryx returned in 513µs   ← cursor returns instantly
Studios: scanned 100 rows in 3.126s ← actual work happens during iteration
```
SQLite executes queries **lazily** during `rows.Next()` iteration.

### 2. Parallel Execution Works
All 10 facet queries now run in parallel. Wall-clock time = slowest query.

### 3. Debugger Overhead is Significant
For performance testing, always use compiled binary (`mingw32-make stash`).

---

## The Fix

**File:** `internal/api/resolver_query_facets.go`

```go
// Before (serialized)
if err := r.withReadTxn(ctx, func(ctx context.Context) error {

// After (parallel)
if err := r.withDB(ctx, func(ctx context.Context) error {
```

Also added `withDB` method to `internal/api/resolver.go`.

## Files Modified

| File | Change |
|------|--------|
| `internal/api/resolver.go` | Added `withDB` method |
| `internal/api/resolver_query_facets.go` | Changed all 6 resolvers from `withReadTxn` to `withDB`; Added timing logs |
| `pkg/sqlite/scene_facets.go` | Added timing logs at makeQuery, toSQL, each goroutine, and Studios facet query/scan |
| `pkg/sqlite/criterion_handlers.go` | Added timing logs to `getHierarchicalValues` function |

---

## Test Commands

```bash
# Build compiled binary (for accurate performance testing)
mingw32-make stash

# Run server
cd .local && ../stash.exe

# Test filtered facet query
curl -s -X POST http://localhost:9999/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ sceneFacets(scene_filter: {studios: {modifier: EXCLUDES, value: [\"2560\"], depth: -1}}) { studios { id } } }"}'
```

---

## Cleanup TODO

The timing logs (`[FACET TIMING]`) are currently at INFO level. Once debugging is complete:
- Change back to `logger.Debugf` or remove entirely
- Files: `scene_facets.go`, `criterion_handlers.go`, `resolver_query_facets.go`

---

## Database Stats

- Total scenes: 788,736
- Database path: `C:\Users\Admin\.stash\stash-go.sqlite`

---

## Key Code Locations

| Purpose | File:Line |
|---------|-----------|
| Facet timeout (60s) | `pkg/sqlite/scene_facets.go:74` |
| Filter building | `pkg/sqlite/scene_facets.go:100` |
| Hierarchy lookup | `pkg/sqlite/criterion_handlers.go:617` |
| Facet resolvers | `internal/api/resolver_query_facets.go` |
| withDB method | `internal/api/resolver.go` |

---
---

# Investigation Notes (Historical)

## Original Problem Statement

| Method | Studios Facet Time |
|--------|-------------------|
| sqlite3 CLI | 1.2s |
| Go application | 59-60s (timeout) |

**The same SQL query runs 50x slower through Go than through CLI.**

---

## What We Verified

### 1. IN-Subquery Optimization IS Applied
```bash
grep "WITH filtered_scenes AS" pkg/sqlite/scene_facets.go
# Returns: No matches - all CTEs removed
```

### 2. Extension Indexes ARE Present
All 19 `idx_ext_*` indexes exist in database:
```bash
sqlite3 "C:\Users\Admin\.stash\stash-go.sqlite" "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_ext%';"
```

### 3. Query Plan IS Efficient
```
EXPLAIN QUERY PLAN shows:
- SEARCH st USING COVERING INDEX idx_ext_scenes_tags_scene_tag
- BLOOM FILTER for NOT IN
- Efficient index usage
```

### 4. Individual Queries ARE Fast (via CLI)
| Facet | CLI Time |
|-------|----------|
| Tags | 7.5s |
| Performers | 2.5s |
| Studios | 1.3s |
| Groups | 0.76s |
| PerformerTags | 7s |
| Video | 0.03s |
| Organized | 1s |
| HasMarkers | 0.8s |

---

## Hypotheses Investigated

### Hypothesis 1: Transaction Serialization ✅ CONFIRMED
All 10 facet goroutines shared ONE transaction via `withReadTxn`, serializing queries through a single connection.

**Fix:** Changed to `withDB` for true parallel execution.

### Hypothesis 2: VSCode Debugger Overhead ✅ CONFIRMED
Running via `__debug_bin` adds 5-10x overhead to SQLite operations.

### Hypothesis 3: Filter Building Slow ❌ NOT THE ISSUE
`makeQuery` + `getHierarchicalValues` only takes 3-35ms.

### Hypothesis 4: Go SQLite Driver Issue ❌ NOT THE ISSUE
The driver works correctly; the issue was transaction serialization + debugger overhead.

---

## Test Commands Used

### Test via CLI (fast - 1.2s)
```bash
sqlite3 "C:\Users\Admin\.stash\stash-go.sqlite" "SELECT s.id, s.name as label, COUNT(DISTINCT sc.id) as count FROM scenes sc INNER JOIN studios s ON sc.studio_id = s.id WHERE sc.id IN (SELECT DISTINCT scenes.id FROM scenes WHERE scenes.studio_id NOT IN (SELECT column2 FROM (VALUES(2560,2560))) OR scenes.studio_id IS NULL) AND sc.studio_id IS NOT NULL GROUP BY s.id ORDER BY count DESC LIMIT 100;"
```

### Test via GraphQL
```bash
curl -s -X POST http://localhost:9999/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ sceneFacets(scene_filter: {studios: {modifier: EXCLUDES, value: [\"2560\"], depth: -1}}) { studios { id } } }"}'
```

---

## Commands Reference

```bash
# Build
mingw32-make stash

# Check indexes
sqlite3 "C:\Users\Admin\.stash\stash-go.sqlite" ".indexes" | findstr "idx_ext"

# Check for CTEs
grep -n "WITH filtered_scenes AS" pkg/sqlite/scene_facets.go

# Time CLI query
powershell -Command "Measure-Command { & 'sqlite3.exe' 'C:\Users\Admin\.stash\stash-go.sqlite' 'SELECT...' } | Select-Object TotalSeconds"

# Check what's on port 9999
netstat -ano | findstr "9999"
powershell -Command "Get-Process -Id <PID> | Select-Object Name, Path"
```
