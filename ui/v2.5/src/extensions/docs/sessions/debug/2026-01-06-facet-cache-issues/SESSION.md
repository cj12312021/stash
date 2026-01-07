---
type: debug
status: complete
started: 2026-01-06
completed: 2026-01-06
problem: "Facet cache system bugs causing stale/incorrect data"
tags: [cache, localstorage, apollo, mutations, fingerprint]
related_files:
  - extensions/hooks/useFacetCounts.ts
  - extensions/hooks/facetCacheLink.ts
  - core/createClient.ts
solution_doc: null
---

# Debug Session: Facet Cache System Issues

## Problem Statement

**Observed behavior:**
Multiple cache-related bugs causing incorrect facet count display:
1. Different filters getting same cache fingerprint
2. Stale data resurrecting after invalidation
3. No cache invalidation on data mutations
4. Expired entries accumulating in localStorage

**Expected behavior:**
Cache should correctly store and retrieve facet data per unique filter combination.

---

## Environment

- **Branch:** develop
- **File:** `ui/v2.5/src/extensions/hooks/useFacetCounts.ts`

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Component      │────▶│  Memory Cache    │────▶│  localStorage   │
│  (useFacetCounts)     │  (per entity type)│     │  (persistent)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

---

## Issues Found & Fixed

### Issue 1: Fingerprint Bug - Nested Values Stripped

**Severity:** CRITICAL
**Status:** FIXED

**Problem:** `JSON.stringify` replacer array only included top-level keys, stripping nested values. Different filters got same fingerprint!

**Fix:** Implemented `deepSortKeys()` for full nested serialization:
```typescript
function deepSortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepSortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as object).sort()) {
    sorted[key] = deepSortKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}
```

---

### Issue 2: Cache Resurrection After Failed Invalidation

**Severity:** HIGH
**Status:** FIXED

**Problem:** When `localStorage.removeItem()` failed silently, `getCachedCounts()` would resurrect stale data.

**Fix:** Added `invalidatedTypes` Set to track and block resurrection:
```typescript
const invalidatedTypes = new Set<string>();

export function invalidateFacetCache(entityType?: string): void {
  if (entityType) {
    memoryCache[entityType].clear();
    invalidatedTypes.add(entityType);  // Mark as invalidated
    try {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${entityType}`);
      invalidatedTypes.delete(entityType);  // Only clear if successful
    } catch (e) {
      console.warn(`Failed to clear localStorage, resurrection blocked`);
    }
  }
}
```

---

### Issue 3: No Invalidation on Data Mutations

**Severity:** HIGH
**Status:** FIXED

**Problem:** Cache only invalidated on scan complete, not when users edited data.

**Fix:** Created Apollo Link (`facetCacheLink.ts`) that intercepts mutations and invalidates affected caches:
```typescript
const MUTATION_TO_ENTITY_TYPES: Record<string, string[]> = {
  SceneUpdate: ["scenes"],
  PerformerUpdate: ["performers", "scenes", "galleries"],
  TagUpdate: ["tags", "scenes", "performers", "galleries", "groups", "studios"],
  // ...
};
```

---

### Issue 4: Memory/localStorage Inconsistency

**Severity:** LOW
**Status:** RESOLVED (documented as accepted)

**Problem:** If localStorage save fails, memory and storage become inconsistent.

**Resolution:** Documented as acceptable - memory cache is authoritative during session, TTL protects against stale data on refresh.

---

### Issue 5: Dead Code

**Severity:** LOW
**Status:** FIXED

**Problem:** `isFilterEmpty` function defined but never called.

**Fix:** Removed the dead code.

---

### Issue 6: Expired Entries Not Cleaned

**Severity:** LOW
**Status:** FIXED

**Problem:** Expired entries in localStorage were skipped but not removed.

**Fix:** `loadCacheFromStorage()` now cleans up expired entries and writes back.

---

## Verification

Tested via Playwright browser automation:

| Issue | Status |
|-------|--------|
| Issue 1: Fingerprint Bug | FIXED |
| Issue 2: Cache Resurrection | FIXED |
| Issue 3: No Mutation Invalidation | FIXED |
| Issue 4: Memory/localStorage Inconsistency | RESOLVED |
| Issue 5: Dead Code | FIXED |
| Issue 6: Expired Entries | FIXED |

---

## Files Modified

| File | Changes |
|------|---------|
| `useFacetCounts.ts` | Fingerprint fix, resurrection block, expired cleanup |
| `facetCacheLink.ts` | NEW - Apollo Link for mutation invalidation |
| `createClient.ts` | Added facetCacheLink to Apollo chain |
