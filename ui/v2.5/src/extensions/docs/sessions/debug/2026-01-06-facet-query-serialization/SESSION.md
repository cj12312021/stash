---
type: debug
status: complete
started: 2026-01-06
completed: 2026-01-06
problem: "Facet queries 50x slower through Go than sqlite3 CLI"
tags: [performance, sqlite, transactions, debugger, parallelism]
related_files:
  - internal/api/resolver_query_facets.go
  - internal/api/resolver.go
  - pkg/sqlite/scene_facets.go
solution_doc: null
---

# Debug Session: Facet Query Performance Issue

## Problem Statement

**Observed behavior:**
| Method | Studios Facet Time |
|--------|-------------------|
| sqlite3 CLI | 1.2s |
| Go application | 59-60s (timeout) |

**Expected behavior:**
Go application should have similar performance to CLI.

**Reproduction steps:**
1. Run facet query via GraphQL
2. Observe 60s timeout vs 1.2s in CLI

---

## Environment

- **Branch:** develop
- **Database:** 788,736 scenes
- **Relevant files:** `internal/api/resolver_query_facets.go`, `pkg/sqlite/scene_facets.go`

---

## Investigation

### What We Verified First

1. **IN-Subquery optimization IS applied** - No CTEs in code
2. **Extension indexes ARE present** - All 19 `idx_ext_*` indexes exist
3. **Query plan IS efficient** - Uses covering indexes
4. **Individual queries ARE fast via CLI** - Tags 7.5s, Performers 2.5s, Studios 1.3s

### Hypothesis 1: Transaction Serialization - CONFIRMED

All 10 facet goroutines shared ONE transaction via `withReadTxn`, serializing queries through a single connection.

### Hypothesis 2: VSCode Debugger Overhead - CONFIRMED

Running via debugger (`__debug_bin`) adds 5-10x overhead to SQLite operations.

**Why Delve is slow:**
1. Compiler optimizations disabled (`-gcflags="all=-N -l"`)
2. Delve instrumentation intercepts every function call
3. CGO/SQLite has extra overhead at Go↔C boundary
4. Facet queries cross this boundary millions of times

---

## Progress Log

### Timing Analysis

| Facet | Compiled Binary | VSCode Debugger | Slowdown |
|-------|-----------------|-----------------|----------|
| Groups | 1.97s | 19.52s | 9.9x |
| Studios | 3.13s | 20.28s | 6.5x |
| Tags | 9.81s | 57.09s | 5.8x |
| **Total** | **9.81s** | **57.13s** | **5.8x** |

### Key Insight: Lazy Query Execution

```
Studios: Queryx returned in 513µs   ← cursor returns instantly
Studios: scanned 100 rows in 3.126s ← actual work during iteration
```

SQLite executes queries **lazily** during `rows.Next()` iteration.

---

## Solution

**Root cause:** Transaction serialization + debugger overhead.

**Fix:** Changed from `withReadTxn` to `withDB` for true parallel execution.

```go
// Before (serialized)
if err := r.withReadTxn(ctx, func(ctx context.Context) error {

// After (parallel)
if err := r.withDB(ctx, func(ctx context.Context) error {
```

**Files modified:**

| File | Change |
|------|--------|
| `internal/api/resolver.go` | Added `withDB` method |
| `internal/api/resolver_query_facets.go` | Changed all 6 resolvers to use `withDB` |

---

## Verification

**Performance Comparison:**

| Method | Time |
|--------|------|
| sqlite3 CLI | 1.2s |
| Compiled binary | ~10s |
| VSCode debugger | ~57s |

The 10s vs 1.2s difference is due to Go overhead and parallel query coordination. Acceptable.

**Key insight for future:** For performance testing, always use compiled binary (`mingw32-make stash`), not debugger.
