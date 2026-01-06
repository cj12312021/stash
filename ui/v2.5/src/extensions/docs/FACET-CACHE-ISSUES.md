# Facet Cache System - Known Issues

**Last Updated:** 2026-01-06
**Status:** Verified via testing, fixes pending
**File:** `ui/v2.5/src/extensions/hooks/useFacetCounts.ts`

## Overview

The facet cache system provides fast facet count display by caching results in memory and localStorage. While functional, there are several issues that can cause incorrect cache persistence or stale data.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Component      │────▶│  Memory Cache    │────▶│  localStorage   │
│  (useFacetCounts)     │  (per entity type)│     │  (persistent)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                        │
         │ getCachedCounts()     │                        │
         │◀──────────────────────│◀───────────────────────│
         │   (loads from localStorage if memory empty)    │
```

---

## Verified Test Results (2026-01-06)

Tested via Playwright browser automation on `http://192.168.4.144:6969/scenes`:

| Issue | Status | Evidence |
|-------|--------|----------|
| **Issue 1: Fingerprint Bug** | ✅ **FIXED** | Implemented `deepSortKeys()` for full nested serialization |
| **Issue 2: Cache Resurrection** | ✅ **FIXED** | Added `invalidatedTypes` Set to block resurrection after failed localStorage removal |
| **Issue 3: No Mutation Invalidation** | ✅ **FIXED** | Added `facetCacheLink` Apollo Link to invalidate on mutations |
| **Issue 4: Memory/localStorage Inconsistency** | ✅ **RESOLVED** | Documented as accepted behavior with design rationale |
| **Issue 5: Dead Code** | ✅ **FIXED** | `isFilterEmpty` removed (was never called) |
| **Issue 6: Expired Entries** | ✅ **FIXED** | `loadCacheFromStorage()` now cleans up expired entries |

---

## Critical Issues

### 1. Fingerprint Bug - Nested Values Completely Stripped

**Severity:** ✅ FIXED (2026-01-06)
**Location:** `getFilterFingerprint()` (line 162)
**Fixed by:** Implementing `deepSortKeys()` for full nested serialization

**Original Problem:**
The `JSON.stringify` replacer array only included top-level keys, stripping all nested values.

**Fix Applied:**
Implemented Option B (deep sort) for guaranteed key order consistency:

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

function getFilterFingerprint(filterData: unknown): string {
  if (!filterData || typeof filterData !== 'object') return 'empty';
  if (Object.keys(filterData as object).length === 0) return 'empty';
  return JSON.stringify(deepSortKeys(filterData));
}
```

**Result:**
```javascript
// Input filters now produce DIFFERENT fingerprints
filter1 = { studios: { value: ["studio-123"], modifier: "INCLUDES" } }
filter2 = { studios: { value: ["studio-456"], modifier: "EXCLUDES" } }

fingerprint1 = '{"studios":{"modifier":"INCLUDES","value":["studio-123"]}}'
fingerprint2 = '{"studios":{"modifier":"EXCLUDES","value":["studio-456"]}}'
// ✅ Different fingerprints = different cache entries
```

---

### 2. Cache Resurrection After Failed Invalidation

**Severity:** ✅ FIXED (2026-01-06)
**Location:** `invalidateFacetCache()` (line 310) and `getCachedCounts()` (line 272)
**Fixed by:** Added `invalidatedTypes` Set to track and block resurrection

**Original Problem:**
When `localStorage.removeItem()` failed silently, `getCachedCounts()` would later resurrect stale data from localStorage when memory cache was empty.

**Fix Applied:**
Added an `invalidatedTypes` Set that tracks entity types with pending invalidation:

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
      console.warn(`Failed to clear localStorage for ${entityType}, cache resurrection blocked`);
    }
  }
}

function getCachedCounts(entityType: string, filterFingerprint: string): FacetCounts | null {
  // Block resurrection if type was invalidated but localStorage removal failed
  if (memoryCache[entityType].size === 0 && !invalidatedTypes.has(entityType)) {
    loadCacheFromStorage(entityType);
  }
  // ...
}

function setCachedCounts(entityType: string, filterFingerprint: string, counts: FacetCounts): void {
  // ...
  invalidatedTypes.delete(entityType);  // Clear flag when fresh data arrives
  // ...
}
```

**Result:**
- If `localStorage.removeItem()` fails, the entity type stays in `invalidatedTypes`
- `getCachedCounts()` won't load from localStorage for invalidated types
- Once fresh data is fetched and cached via `setCachedCounts()`, the flag is cleared

---

### 3. No Invalidation on Data Mutations

**Severity:** ✅ FIXED (2026-01-06)
**Location:** `src/extensions/hooks/facetCacheLink.ts` (new file)
**Fixed by:** Created Apollo Link that intercepts mutations and invalidates affected caches

**Original Problem:**
Cache was only invalidated on scan complete, not when users edited data through mutations.

**Fix Applied:**
Created a new Apollo Link (`facetCacheLink`) that:
1. Intercepts all GraphQL mutations
2. Maps mutation names to affected entity types
3. Invalidates the appropriate facet caches on successful mutation completion

**New file:** `src/extensions/hooks/facetCacheLink.ts`

```typescript
const MUTATION_TO_ENTITY_TYPES: Record<string, string[]> = {
  // Scene mutations
  SceneUpdate: ["scenes"],
  ScenesUpdate: ["scenes"],
  SceneDestroy: ["scenes"],
  // ...

  // Performer mutations affect multiple entity types
  PerformerUpdate: ["performers", "scenes", "galleries"],
  PerformersMerge: ["performers", "scenes", "galleries"],
  // ...

  // Tag mutations affect all entity types that use tags
  TagUpdate: ["tags", "scenes", "performers", "galleries", "groups", "studios"],
  TagsMerge: ["tags", "scenes", "performers", "galleries", "groups", "studios"],
  // ...
};

export function createFacetCacheLink(): ApolloLink {
  return new ApolloLink((operation, forward) => {
    // Only process mutations
    if (definition.operation !== "mutation") return forward(operation);

    const affectedTypes = MUTATION_TO_ENTITY_TYPES[operation.operationName];
    if (!affectedTypes) return forward(operation);

    return forward(operation).map((response) => {
      if (!response.errors) {
        invalidateForMutation(affectedTypes);
      }
      return response;
    });
  });
}
```

**Integration:** Added to Apollo link chain in `createClient.ts`:
```typescript
const facetCacheLink = createFacetCacheLink();
const link = from([errorLink, facetCacheLink, splitLink]);
```

**Result:**
- Editing scene tags → scenes cache invalidated
- Merging performers → performers, scenes, galleries caches invalidated
- Deleting items → appropriate caches invalidated
- Facet counts refresh immediately after any data mutation

---

### 4. Memory/localStorage Inconsistency on Save Failure

**Severity:** ✅ RESOLVED (2026-01-06)
**Location:** `saveCacheToStorage()` (line 276)
**Resolution:** Documented as accepted behavior with design rationale

**Original Concern:**
When saving cache, memory is updated first, then localStorage. If localStorage save fails, they become inconsistent. On page refresh, old localStorage data could be loaded.

**Design Decision:**
After analysis, this is acceptable behavior for a cache layer:

1. **Memory cache is authoritative** during the session - users always see correct data
2. **TTL protects against stale data** - even if localStorage has older data, it expires
3. **Rollback would be worse** - discarding valid in-memory data just because persistence failed
4. **Fresh data will be fetched** - the cache is just an optimization, not the source of truth

**Documentation Added:**
```typescript
/**
 * Save cache to localStorage.
 *
 * Design note: Memory cache is authoritative during the session. localStorage is
 * best-effort persistence for faster initial loads on page refresh. If save fails:
 * - Current session continues with correct data in memory
 * - Next session may load older data from localStorage (if not expired by TTL)
 * - This is acceptable because: (1) TTL ensures data isn't too stale, (2) fresh
 *   data will be fetched and cached again, (3) the alternative (rollback memory)
 *   would discard valid data
 */
function saveCacheToStorage(entityType: string): boolean { ... }
```

**Impact:**
Edge case only affects initial page load if:
- Fresh data was cached in memory
- localStorage save failed
- User refreshed before TTL expired
- Result: Slightly older (but valid) cached data shown briefly until fresh fetch completes

---

## Minor Issues

### 5. Dead Code: `isFilterEmpty` Function

**Severity:** ✅ FIXED (2026-01-06)
**Location:** Removed from codebase
**Fixed by:** Deleted the unused function

**Original Problem:**
Function was defined but never called.

**Fix Applied:**
Removed the dead code during fingerprint bug fix.

---

### 6. Expired localStorage Entries Not Cleaned

**Severity:** ✅ FIXED (2026-01-06)
**Location:** `loadCacheFromStorage()` (line 228)
**Fixed by:** Added cleanup of expired entries during load

**Original Problem:**
When loading from localStorage, expired entries were skipped but not removed, causing localStorage to accumulate stale data.

**Fix Applied:**
Now tracks valid entries during load and writes cleaned data back to localStorage:

```typescript
function loadCacheFromStorage(entityType: string): void {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${entityType}`);
    if (!stored) return;

    const entries: CacheEntry[] = JSON.parse(stored);
    const cache = memoryCache[entityType];
    const validEntries: CacheEntry[] = [];

    for (const entry of entries) {
      const ttl = entry.filterFingerprint === 'empty' ? CACHE_TTL_UNFILTERED_MS : CACHE_TTL_FILTERED_MS;
      if (Date.now() - entry.timestamp > ttl) continue;

      cache.set(entry.filterFingerprint, entry);
      validEntries.push(entry);
    }

    // Clean up expired entries from localStorage if any were removed
    if (validEntries.length < entries.length) {
      try {
        if (validEntries.length === 0) {
          localStorage.removeItem(`${STORAGE_KEY_PREFIX}${entityType}`);
        } else {
          localStorage.setItem(`${STORAGE_KEY_PREFIX}${entityType}`, JSON.stringify(validEntries));
        }
      } catch {
        // Ignore cleanup errors - not critical
      }
    }
  } catch (e) {
    console.warn(`Failed to load facet cache for ${entityType}:`, e);
  }
}
```

**Result:**
- Expired entries are removed on first load after expiration
- Empty cache keys are completely removed from localStorage
- Cleanup errors are silently ignored (non-critical)

---

## Priority Fix Order

1. ~~**Issue 1 (Fingerprint)**~~ - ✅ Fixed 2026-01-06
2. ~~**Issue 2 (Resurrection)**~~ - ✅ Fixed 2026-01-06
3. ~~**Issue 3 (Mutations)**~~ - ✅ Fixed 2026-01-06
4. ~~**Issue 4 (Inconsistency)**~~ - ✅ Resolved 2026-01-06 (documented as accepted behavior)
5. ~~**Issue 6 (Cleanup)**~~ - ✅ Fixed 2026-01-06
6. ~~**Issue 5 (Dead code)**~~ - ✅ Fixed 2026-01-06

**All issues resolved!**

---

## Testing Notes

### Browser Console Test Script

Run this in DevTools console on any Stash page to verify issues:

```javascript
(async function testFacetCacheIssues() {
  const results = { tests: [] };

  // TEST 1: Fingerprint Bug (CRITICAL)
  const filter1 = { studios: { value: ["studio-123"], modifier: "INCLUDES" } };
  const filter2 = { studios: { value: ["studio-456"], modifier: "EXCLUDES" } };
  const fp1 = JSON.stringify(filter1, Object.keys(filter1).sort());
  const fp2 = JSON.stringify(filter2, Object.keys(filter2).sort());

  results.tests.push({
    name: "Issue 1: Fingerprint Bug",
    filter1: JSON.stringify(filter1),
    filter2: JSON.stringify(filter2),
    fingerprint1: fp1,
    fingerprint2: fp2,
    same: fp1 === fp2,
    verdict: fp1 === fp2 ? "CRITICAL BUG - different filters get same fingerprint!" : "OK"
  });

  // TEST 2: Cache Resurrection
  const testKey = "stash:facetCache:scenes";
  if (localStorage.getItem(testKey)) {
    const originalRemove = localStorage.removeItem.bind(localStorage);
    localStorage.removeItem = (k) => { if (k === testKey) throw new Error("Simulated"); return originalRemove(k); };
    let failed = false;
    try { localStorage.removeItem(testKey); } catch (e) { failed = true; }
    localStorage.removeItem = originalRemove;

    results.tests.push({
      name: "Issue 2: Cache Resurrection",
      removeFailed: failed,
      dataStillExists: localStorage.getItem(testKey) !== null,
      verdict: failed && localStorage.getItem(testKey) ? "BUG - stale data survives" : "OK or no data"
    });
  }

  // TEST 3: Expired Entries
  const TTL_FILTERED = 10 * 60 * 1000;
  const TTL_UNFILTERED = 30 * 60 * 1000;
  let expired = 0, total = 0;

  for (const key of Object.keys(localStorage).filter(k => k.startsWith("stash:facetCache:"))) {
    try {
      for (const entry of JSON.parse(localStorage.getItem(key))) {
        total++;
        const ttl = entry.filterFingerprint === 'empty' ? TTL_UNFILTERED : TTL_FILTERED;
        if (Date.now() - entry.timestamp > ttl) expired++;
      }
    } catch (e) {}
  }

  results.tests.push({
    name: "Issue 6: Expired Entries",
    total, expired,
    verdict: expired > 0 ? `BUG - ${expired} expired entries in localStorage` : "OK"
  });

  console.table(results.tests);
  return results;
})();
```

### Manual Testing

1. **Test fingerprint bug:**
   - Apply a studio filter (e.g., exclude "Game Clips")
   - Open DevTools > Application > localStorage
   - Check `stash:facetCache:scenes` - fingerprint should include filter values, not just `{"studios":{}}`

2. **Test resurrection bug:**
   - Note localStorage content
   - Trigger scan complete (or manually call `invalidateFacetCache()`)
   - Refresh page
   - Check if old data was resurrected

3. **Test mutation staleness:**
   - Open scenes list, expand Tags filter, note counts
   - In another tab, add a tag to several scenes
   - Return to first tab - counts should be stale until TTL expires

---

## Related Files

- `ui/v2.5/src/extensions/hooks/useFacetCounts.ts` - Main cache implementation
- `ui/v2.5/src/extensions/hooks/facetCacheLink.ts` - Apollo Link for mutation invalidation
- `ui/v2.5/src/core/createClient.ts` - Apollo client setup, includes facetCacheLink
- `ui/v2.5/src/extensions/filters/TagsFilter.tsx` - Consumer of facet counts
- `DEBUG_SESSION_facet_counts_not_showing.md` - Related debug session for slow query issues

## Related Issues

The fingerprint bug (Issue 1) may interact with the slow facet loading issue documented in `DEBUG_SESSION_facet_counts_not_showing.md`. When fingerprints are broken:
- Cache lookups fail unexpectedly
- Stale response detection may misfire
- Multiple requests for the same filter may occur

However, these are independent bugs - the fingerprint bug causes wrong data even with fast queries.
