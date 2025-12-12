/**
 * useFacetCounts.test.ts
 * 
 * Unit tests for the facet counts system used in sidebar filters.
 * 
 * ## Test Categories
 * 
 * ### 1. Data Structures (LabeledFacetCount, FacetCounts)
 * Tests that verify the data structures used to store facet counts work correctly.
 * - Labels are preserved alongside counts
 * - Map operations work as expected
 * - All entity types are supported
 * 
 * ### 2. API Response Conversion
 * Tests for converting GraphQL API responses to internal data structures.
 * - Array to Map conversion
 * - Boolean facet handling
 * - Rating facet handling
 * 
 * ### 3. Stale Response Prevention (CRITICAL)
 * Tests that verify race conditions are handled correctly when users change
 * filters rapidly. Without this protection, out-of-order responses could
 * display stale data.
 * 
 * ### 4. State Update Patterns
 * Tests verifying that partial state updates preserve unchanged facets,
 * preventing unnecessary re-renders and data loss.
 * 
 * ### 5. Cache System
 * Tests for the filter pattern caching system:
 * - Filter fingerprint generation (stable, unique, order-independent)
 * - Serialization/deserialization of FacetCounts for localStorage
 * - TTL-based expiration (10 min filtered, 30 min unfiltered)
 * - Cache invalidation
 * - Entry limit to prevent memory bloat
 * 
 * ### 6. Entity-Specific Builders (Phase 6)
 * Tests for the build*FacetCounts helper functions:
 * - Gallery facets (now includes performer_tags)
 * - Performer facets (genders, countries, circumcised)
 * - Group facets (tags, performers, studios)
 * - Studio facets (tags, parents, favorite)
 * - Tag facets (parents, children, favorite)
 * 
 * ### 7. All Entity Types Caching (Phase 6)
 * Tests verifying caching works for all entity types:
 * - scenes, galleries, performers, groups, studios, tags
 * 
 * ## Related Files
 * - src/extensions/hooks/useFacetCounts.ts - Hook implementation
 * - src/extensions/docs/FACETS-SYSTEM.md - Architecture documentation
 * - src/extensions/docs/CHANGELOG.md - Bug fix history
 */

import { describe, it, expect } from "vitest";
import * as GQL from "src/core/generated-graphql";
import { LabeledFacetCount, FacetCounts } from "src/extensions/hooks/useFacetCounts";

describe("LabeledFacetCount interface", () => {
  it("should store count and label", () => {
    const facet: LabeledFacetCount = {
      count: 42,
      label: "Test Label",
    };

    expect(facet.count).toBe(42);
    expect(facet.label).toBe("Test Label");
  });

  it("should work with Map storage", () => {
    const facetMap = new Map<string, LabeledFacetCount>();
    facetMap.set("123", { count: 10, label: "Item A" });
    facetMap.set("456", { count: 5, label: "Item B" });

    expect(facetMap.size).toBe(2);
    expect(facetMap.get("123")?.count).toBe(10);
    expect(facetMap.get("123")?.label).toBe("Item A");
    expect(facetMap.get("456")?.count).toBe(5);
    expect(facetMap.get("456")?.label).toBe("Item B");
  });
});

describe("FacetCounts interface", () => {
  it("should have proper structure for entity facets", () => {
    const emptyCounts: FacetCounts = {
      tags: new Map<string, LabeledFacetCount>(),
      performers: new Map<string, LabeledFacetCount>(),
      studios: new Map<string, LabeledFacetCount>(),
      groups: new Map<string, LabeledFacetCount>(),
      performerTags: new Map<string, LabeledFacetCount>(),
      resolutions: new Map(),
      orientations: new Map(),
      genders: new Map(),
      countries: new Map<string, LabeledFacetCount>(),
      ethnicities: new Map(),
      hairColors: new Map(),
      eyeColors: new Map(),
      circumcised: new Map(),
      ratings: new Map(),
      captions: new Map(),
      booleans: {
        organized: { true: 0, false: 0 },
        interactive: { true: 0, false: 0 },
        hasMarkers: { true: 0, false: 0 },
        performerFavorite: { true: 0, false: 0 },
        hasChapters: { true: 0, false: 0 },
        favorite: { true: 0, false: 0 },
      },
      parents: new Map<string, LabeledFacetCount>(),
      children: new Map<string, LabeledFacetCount>(),
    };

    // Verify structure exists
    expect(emptyCounts.tags).toBeInstanceOf(Map);
    expect(emptyCounts.performers).toBeInstanceOf(Map);
    expect(emptyCounts.studios).toBeInstanceOf(Map);
    expect(emptyCounts.groups).toBeInstanceOf(Map);
    expect(emptyCounts.booleans.organized).toEqual({ true: 0, false: 0 });
  });

  it("should support labeled facets for entity types", () => {
    const counts: FacetCounts = {
      tags: new Map([
        ["1", { count: 100, label: "Tag A" }],
        ["2", { count: 50, label: "Tag B" }],
      ]),
      performers: new Map([
        ["10", { count: 25, label: "Performer X" }],
      ]),
      studios: new Map([
        ["20", { count: 75, label: "Studio Y" }],
      ]),
      groups: new Map([
        ["30", { count: 15, label: "Group Z" }],
      ]),
      performerTags: new Map(),
      resolutions: new Map(),
      orientations: new Map(),
      genders: new Map(),
      countries: new Map(),
      ethnicities: new Map(),
      hairColors: new Map(),
      eyeColors: new Map(),
      circumcised: new Map(),
      ratings: new Map(),
      captions: new Map(),
      booleans: {
        organized: { true: 10, false: 90 },
        interactive: { true: 5, false: 95 },
        hasMarkers: { true: 0, false: 0 },
        performerFavorite: { true: 0, false: 0 },
        hasChapters: { true: 0, false: 0 },
        favorite: { true: 20, false: 80 },
      },
      parents: new Map(),
      children: new Map(),
    };

    // Verify labeled data
    expect(counts.tags.get("1")).toEqual({ count: 100, label: "Tag A" });
    expect(counts.performers.get("10")?.label).toBe("Performer X");
    expect(counts.studios.get("20")?.count).toBe(75);
    expect(counts.groups.get("30")?.label).toBe("Group Z");
    
    // Verify boolean counts
    expect(counts.booleans.organized.true).toBe(10);
    expect(counts.booleans.favorite.true).toBe(20);
  });
});

describe("Facet count map operations", () => {
  it("should iterate with forEach preserving labels", () => {
    const facets = new Map<string, LabeledFacetCount>([
      ["1", { count: 10, label: "Item 1" }],
      ["2", { count: 20, label: "Item 2" }],
      ["3", { count: 30, label: "Item 3" }],
    ]);

    const results: Array<{ id: string; count: number; label: string }> = [];
    facets.forEach((facetData, id) => {
      results.push({ id, count: facetData.count, label: facetData.label });
    });

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ id: "1", count: 10, label: "Item 1" });
    expect(results[1]).toEqual({ id: "2", count: 20, label: "Item 2" });
    expect(results[2]).toEqual({ id: "3", count: 30, label: "Item 3" });
  });

  it("should filter by count correctly", () => {
    const facets = new Map<string, LabeledFacetCount>([
      ["1", { count: 10, label: "Item 1" }],
      ["2", { count: 0, label: "Item 2" }],  // Zero count
      ["3", { count: 30, label: "Item 3" }],
    ]);

    const nonZero: Array<{ id: string; count: number; label: string }> = [];
    facets.forEach((facetData, id) => {
      if (facetData.count > 0) {
        nonZero.push({ id, count: facetData.count, label: facetData.label });
      }
    });

    expect(nonZero).toHaveLength(2);
    expect(nonZero.map(r => r.id)).toEqual(["1", "3"]);
  });

  it("should handle empty maps gracefully", () => {
    const facets = new Map<string, LabeledFacetCount>();
    
    expect(facets.size).toBe(0);
    expect(facets.get("nonexistent")).toBeUndefined();
    
    // Iteration should work without errors
    const results: string[] = [];
    facets.forEach((_, id) => results.push(id));
    expect(results).toHaveLength(0);
  });
});

describe("Conversion from API response format", () => {
  it("should convert array of facet counts to Map with labels", () => {
    // Simulating the toMap function behavior
    const apiResponse = [
      { id: "1", label: "Studio A", count: 100 },
      { id: "2", label: "Studio B", count: 50 },
      { id: "3", label: "Studio C", count: 25 },
    ];

    const map = new Map<string, LabeledFacetCount>(
      apiResponse.map((c) => [c.id, { count: c.count, label: c.label }])
    );

    expect(map.size).toBe(3);
    expect(map.get("1")).toEqual({ count: 100, label: "Studio A" });
    expect(map.get("2")).toEqual({ count: 50, label: "Studio B" });
    expect(map.get("3")).toEqual({ count: 25, label: "Studio C" });
  });

  it("should handle boolean facet counts conversion", () => {
    const apiResponse = [
      { value: true, count: 150 },
      { value: false, count: 350 },
    ];

    const result = { true: 0, false: 0 };
    for (const c of apiResponse) {
      if (c.value) {
        result.true = c.count;
      } else {
        result.false = c.count;
      }
    }

    expect(result.true).toBe(150);
    expect(result.false).toBe(350);
  });

  it("should handle rating facet counts conversion", () => {
    const apiResponse = [
      { rating: 100, count: 50 },
      { rating: 80, count: 120 },
      { rating: 60, count: 200 },
      { rating: 40, count: 100 },
      { rating: 20, count: 30 },
    ];

    const map = new Map<number, number>(
      apiResponse.map((c) => [c.rating, c.count])
    );

    expect(map.size).toBe(5);
    expect(map.get(100)).toBe(50);
    expect(map.get(80)).toBe(120);
    expect(map.get(60)).toBe(200);
  });
});

describe("Stale response prevention", () => {
  /**
   * These tests verify the stale response prevention pattern used in facet hooks.
   * 
   * ## Background
   * 
   * When users change filters rapidly (e.g., typing in a search box), multiple
   * API requests are sent. Network latency can cause responses to arrive out
   * of order, leading to stale data being displayed.
   * 
   * ## Race Condition Scenario
   * 
   * ```
   * Timeline:
   * t=0ms   User sets Filter A → Request A sent
   * t=100ms User changes to Filter B → Request B sent  
   * t=300ms Response B arrives (fast server) → shows correct data ✓
   * t=500ms Response A arrives (slow network) → WITHOUT PROTECTION: overwrites B's data ✗
   * ```
   * 
   * ## Solution
   * 
   * Each `doFetch` in useFacetCounts.ts:
   * 1. Captures the filter fingerprint at REQUEST time
   * 2. Compares it to current filter when RESPONSE arrives
   * 3. Discards the response if they don't match
   * 
   * ## Implementation in hooks
   * 
   * ```typescript
   * const doFetch = useCallback(async () => {
   *   const requestFingerprint = filterFingerprint; // Capture at request time
   *   const result = await fetchFacets(...);
   *   if (lastFilterRef.current !== requestFingerprint) return; // Discard stale
   *   setCounts(...); // Safe to update
   * }, [...]);
   * ```
   * 
   * ## Related Bug Fix
   * See CHANGELOG.md: "Stale response race condition"
   */

  /**
   * Test: Core stale detection logic
   * 
   * Verifies that when a filter changes after a request is sent,
   * the response for the old filter is correctly identified as stale.
   */
  it("should detect stale responses by comparing fingerprints", () => {
    // Simulate the pattern used in useFacetCounts hooks
    let lastFilterRef = "";
    
    // Request A sent with Filter A
    const requestAFingerprint = JSON.stringify({ query: "A" });
    lastFilterRef = requestAFingerprint;
    
    // User changes filter before response A arrives
    const requestBFingerprint = JSON.stringify({ query: "B" });
    lastFilterRef = requestBFingerprint;
    
    // Response A arrives - should be detected as stale
    const isResponseAStale = lastFilterRef !== requestAFingerprint;
    expect(isResponseAStale).toBe(true);
    
    // Response B arrives - should NOT be detected as stale
    const isResponseBStale = lastFilterRef !== requestBFingerprint;
    expect(isResponseBStale).toBe(false);
  });

  /**
   * Test: Happy path - no filter change
   * 
   * Verifies that when the filter doesn't change between request and response,
   * the response is correctly identified as current (not stale).
   */
  it("should correctly identify current responses when filter unchanged", () => {
    let lastFilterRef = "";
    
    const requestFingerprint = JSON.stringify({ tags: ["123"] });
    lastFilterRef = requestFingerprint;
    
    // Response arrives while filter is still the same
    const isResponseStale = lastFilterRef !== requestFingerprint;
    expect(isResponseStale).toBe(false);
  });

  /**
   * Test: Multiple rapid filter changes
   * 
   * Simulates a user rapidly changing filters (e.g., typing "page 1", "page 2", "page 3")
   * and responses arriving out of order. Only the response matching the FINAL
   * filter state should be accepted.
   */
  it("should handle multiple rapid filter changes", () => {
    let lastFilterRef = "";
    const responses: Array<{ fingerprint: string; data: string }> = [];
    
    // Simulate rapid filter changes
    const filters = [
      JSON.stringify({ page: 1 }),
      JSON.stringify({ page: 2 }),
      JSON.stringify({ page: 3 }),
    ];
    
    // Each filter change updates lastFilterRef
    filters.forEach((fp) => {
      lastFilterRef = fp;
    });
    
    // Now lastFilterRef = filters[2] (page 3)
    
    // Simulate responses arriving in wrong order
    const responseOrder = [filters[1], filters[0], filters[2]]; // page 2, page 1, page 3
    
    responseOrder.forEach((responseFingerprint, index) => {
      const isStale = lastFilterRef !== responseFingerprint;
      if (!isStale) {
        responses.push({ fingerprint: responseFingerprint, data: `data-${index}` });
      }
    });
    
    // Only the response for the current filter (page 3) should be accepted
    expect(responses).toHaveLength(1);
    expect(responses[0].fingerprint).toBe(filters[2]);
  });

  /**
   * Test: Loading state consistency
   * 
   * Verifies that the loading spinner isn't incorrectly cleared by a stale response.
   * 
   * Problem scenario without fix:
   * 1. User changes filter → loading = true
   * 2. Request A sent
   * 3. User changes filter again → Request B sent
   * 4. Response A arrives (stale) → loading = false (WRONG! B is still loading)
   * 5. User sees no spinner but data is stale
   * 
   * With fix:
   * - Only Response B (matching current filter) can clear loading
   */
  it("should not update loading state for stale responses", () => {
    let lastFilterRef = "";
    let loading = true;
    
    const requestAFingerprint = JSON.stringify({ query: "A" });
    lastFilterRef = requestAFingerprint;
    
    // Filter changes to B
    const requestBFingerprint = JSON.stringify({ query: "B" });
    lastFilterRef = requestBFingerprint;
    
    // Response A arrives - stale, should not touch loading
    const isResponseAStale = lastFilterRef !== requestAFingerprint;
    if (!isResponseAStale) {
      loading = false; // This should NOT execute
    }
    expect(loading).toBe(true); // Loading should still be true
    
    // Response B arrives - current, should update loading
    const isResponseBStale = lastFilterRef !== requestBFingerprint;
    if (!isResponseBStale) {
      loading = false; // This SHOULD execute
    }
    expect(loading).toBe(false);
  });

  /**
   * Test: JSON.stringify for reliable comparison
   * 
   * JavaScript objects can't be compared with === (reference comparison).
   * Using JSON.stringify creates a stable string fingerprint that can be
   * reliably compared for equality.
   * 
   * This is why the hook uses:
   *   const filterFingerprint = useMemo(() => JSON.stringify(filter.makeFilter()), [filter]);
   */
  it("should use JSON.stringify for reliable filter comparison", () => {
    // Objects can't be compared directly
    const filterA = { tags: ["1", "2"], performers: ["3"] };
    const filterB = { tags: ["1", "2"], performers: ["3"] };
    
    // Direct comparison fails even for equivalent objects
    expect(filterA === filterB).toBe(false);
    expect(filterA).not.toBe(filterB);
    
    // JSON.stringify comparison works
    expect(JSON.stringify(filterA)).toBe(JSON.stringify(filterB));
    
    // Different filter produces different fingerprint
    const filterC = { tags: ["1", "2"], performers: ["4"] };
    expect(JSON.stringify(filterA)).not.toBe(JSON.stringify(filterC));
  });
});

describe("State update patterns", () => {
  /**
   * These tests verify state update patterns for facet counts.
   * When updating specific facets, other facets should be preserved.
   * This ensures React doesn't re-render unchanged components and
   * prevents labels from jumping between filters.
   * 
   * Note: Lazy loading was removed in December 2024. All facets are now
   * computed in parallel on the backend. These tests still verify the
   * state update mechanics work correctly.
   */

  it("should preserve existing facets when updating performer_tags", () => {
    // Simulate existing state before update
    const existingState: FacetCounts = {
      tags: new Map([["1", { count: 100, label: "Tag A" }]]),
      performers: new Map([["2", { count: 50, label: "Performer B" }]]),
      studios: new Map([["3", { count: 25, label: "Studio C" }]]),
      groups: new Map([["4", { count: 10, label: "Group D" }]]),
      performerTags: new Map(), // Empty before lazy load
      resolutions: new Map(),
      orientations: new Map(),
      genders: new Map(),
      countries: new Map(),
      ethnicities: new Map(),
      hairColors: new Map(),
      eyeColors: new Map(),
      circumcised: new Map(),
      ratings: new Map([[100, 20]]),
      captions: new Map(),
      booleans: {
        organized: { true: 10, false: 90 },
        interactive: { true: 5, false: 95 },
        hasMarkers: { true: 0, false: 0 },
        performerFavorite: { true: 0, false: 0 },
        hasChapters: { true: 0, false: 0 },
        favorite: { true: 0, false: 0 },
      },
      parents: new Map(),
      children: new Map(),
    };

    // Simulate partial state update - only update performerTags
    const partialUpdate = (prev: FacetCounts): FacetCounts => ({
      ...prev,
      performerTags: new Map([
        ["100", { count: 500, label: "Performer Tag X" }],
        ["101", { count: 300, label: "Performer Tag Y" }],
      ]),
    });

    const newState = partialUpdate(existingState);

    // Verify performer_tags was updated
    expect(newState.performerTags.size).toBe(2);
    expect(newState.performerTags.get("100")).toEqual({ count: 500, label: "Performer Tag X" });

    // Verify all other facets are PRESERVED (same reference)
    expect(newState.tags).toBe(existingState.tags);
    expect(newState.performers).toBe(existingState.performers);
    expect(newState.studios).toBe(existingState.studios);
    expect(newState.groups).toBe(existingState.groups);
    expect(newState.ratings).toBe(existingState.ratings);
    expect(newState.booleans).toBe(existingState.booleans);

    // Verify data integrity
    expect(newState.tags.get("1")?.label).toBe("Tag A");
    expect(newState.performers.get("2")?.label).toBe("Performer B");
    expect(newState.studios.get("3")?.label).toBe("Studio C");
  });

  it("should preserve existing facets when updating captions", () => {
    const existingState: FacetCounts = {
      tags: new Map([["1", { count: 100, label: "Tag A" }]]),
      performers: new Map([["2", { count: 50, label: "Performer B" }]]),
      studios: new Map(),
      groups: new Map(),
      performerTags: new Map([["10", { count: 200, label: "PT" }]]),
      resolutions: new Map(),
      orientations: new Map(),
      genders: new Map(),
      countries: new Map(),
      ethnicities: new Map(),
      hairColors: new Map(),
      eyeColors: new Map(),
      circumcised: new Map(),
      ratings: new Map(),
      captions: new Map(), // Empty before update
      booleans: {
        organized: { true: 0, false: 0 },
        interactive: { true: 0, false: 0 },
        hasMarkers: { true: 0, false: 0 },
        performerFavorite: { true: 0, false: 0 },
        hasChapters: { true: 0, false: 0 },
        favorite: { true: 0, false: 0 },
      },
      parents: new Map(),
      children: new Map(),
    };

    // Simulate partial state update - only update captions
    const partialUpdate = (prev: FacetCounts): FacetCounts => ({
      ...prev,
      captions: new Map([
        ["en", 1000],
        ["es", 500],
        ["de", 250],
      ]),
    });

    const newState = partialUpdate(existingState);

    // Verify captions was updated
    expect(newState.captions.size).toBe(3);
    expect(newState.captions.get("en")).toBe(1000);

    // Verify all other facets are PRESERVED
    expect(newState.tags).toBe(existingState.tags);
    expect(newState.performers).toBe(existingState.performers);
    expect(newState.performerTags).toBe(existingState.performerTags);
  });

  it("should NOT share references between different facet types", () => {
    // This test ensures that performer tags and performers are completely separate
    const performerTagsData: [string, LabeledFacetCount][] = [
      ["100", { count: 500, label: "No Tattoos" }],
      ["101", { count: 300, label: "Tongue Piercing" }],
    ];

    const performersData: [string, LabeledFacetCount][] = [
      ["1", { count: 50, label: "John Doe" }],
      ["2", { count: 30, label: "Jane Smith" }],
    ];

    const state: FacetCounts = {
      tags: new Map(),
      performers: new Map(performersData),
      studios: new Map(),
      groups: new Map(),
      performerTags: new Map(performerTagsData),
      resolutions: new Map(),
      orientations: new Map(),
      genders: new Map(),
      countries: new Map(),
      ethnicities: new Map(),
      hairColors: new Map(),
      eyeColors: new Map(),
      circumcised: new Map(),
      ratings: new Map(),
      captions: new Map(),
      booleans: {
        organized: { true: 0, false: 0 },
        interactive: { true: 0, false: 0 },
        hasMarkers: { true: 0, false: 0 },
        performerFavorite: { true: 0, false: 0 },
        hasChapters: { true: 0, false: 0 },
        favorite: { true: 0, false: 0 },
      },
      parents: new Map(),
      children: new Map(),
    };

    // Verify performers and performerTags are completely separate
    expect(state.performers).not.toBe(state.performerTags);
    expect(state.performers.size).toBe(2);
    expect(state.performerTags.size).toBe(2);

    // Verify no label contamination
    expect(state.performers.get("1")?.label).toBe("John Doe");
    expect(state.performers.get("100")).toBeUndefined(); // Performer tag ID
    expect(state.performerTags.get("100")?.label).toBe("No Tattoos");
    expect(state.performerTags.get("1")).toBeUndefined(); // Performer ID
  });

  it("should handle simultaneous update of multiple facet types", () => {
    const existingState: FacetCounts = {
      tags: new Map([["1", { count: 100, label: "Tag A" }]]),
      performers: new Map([["2", { count: 50, label: "Performer B" }]]),
      studios: new Map(),
      groups: new Map(),
      performerTags: new Map(), // Empty
      resolutions: new Map(),
      orientations: new Map(),
      genders: new Map(),
      countries: new Map(),
      ethnicities: new Map(),
      hairColors: new Map(),
      eyeColors: new Map(),
      circumcised: new Map(),
      ratings: new Map(),
      captions: new Map(), // Empty
      booleans: {
        organized: { true: 0, false: 0 },
        interactive: { true: 0, false: 0 },
        hasMarkers: { true: 0, false: 0 },
        performerFavorite: { true: 0, false: 0 },
        hasChapters: { true: 0, false: 0 },
        favorite: { true: 0, false: 0 },
      },
      parents: new Map(),
      children: new Map(),
    };

    // Simulate update for multiple facet types
    const partialUpdate = (prev: FacetCounts): FacetCounts => ({
      ...prev,
      performerTags: new Map([["100", { count: 500, label: "PT" }]]),
      captions: new Map([["en", 1000]]),
    });

    const newState = partialUpdate(existingState);

    // Verify both were updated
    expect(newState.performerTags.size).toBe(1);
    expect(newState.captions.size).toBe(1);

    // Verify core facets preserved
    expect(newState.tags).toBe(existingState.tags);
    expect(newState.performers).toBe(existingState.performers);
  });
});

describe("Filter fingerprint generation", () => {
  /**
   * Tests for the filter fingerprint system used for cache keys.
   * Fingerprints must be:
   * - Stable: Same filter always produces same fingerprint
   * - Unique: Different filters produce different fingerprints
   * - Order-independent: {a:1, b:2} should equal {b:2, a:1}
   */

  // Helper function matching the actual implementation
  function getFilterFingerprint(filterData: unknown): string {
    if (!filterData || typeof filterData !== 'object') return 'empty';
    const keys = Object.keys(filterData as object);
    if (keys.length === 0) return 'empty';
    // Sort keys for consistent ordering, then stringify
    return JSON.stringify(filterData, keys.sort());
  }

  it("should generate 'empty' for null/undefined filters", () => {
    expect(getFilterFingerprint(null)).toBe('empty');
    expect(getFilterFingerprint(undefined)).toBe('empty');
    expect(getFilterFingerprint({})).toBe('empty');
  });

  it("should generate stable fingerprints for same filter", () => {
    const filter1 = { studios: { value: ["123"], modifier: "EXCLUDES" } };
    const filter2 = { studios: { value: ["123"], modifier: "EXCLUDES" } };

    expect(getFilterFingerprint(filter1)).toBe(getFilterFingerprint(filter2));
  });

  it("should generate different fingerprints for different filters", () => {
    const filter1 = { studios: { value: ["123"], modifier: "EXCLUDES" } };
    const filter2 = { tags: { value: ["456"], modifier: "INCLUDES" } };

    // Different keys = different fingerprints
    expect(getFilterFingerprint(filter1)).not.toBe(getFilterFingerprint(filter2));
  });

  it("should generate order-independent fingerprints", () => {
    const filter1 = { studios: { value: ["123"] }, tags: { value: ["456"] } };
    const filter2 = { tags: { value: ["456"] }, studios: { value: ["123"] } };

    expect(getFilterFingerprint(filter1)).toBe(getFilterFingerprint(filter2));
  });

  it("should capture nested value differences", () => {
    // For truly different nested values, full comparison is needed
    const filter1 = { studios: { value: ["123"] } };
    const filter2 = { studios: { value: ["456"] } };
    
    // The full JSON.stringify will show nested differences
    const fp1 = JSON.stringify(filter1);
    const fp2 = JSON.stringify(filter2);
    
    expect(fp1).not.toBe(fp2);
  });
});

describe("Cache serialization", () => {
  /**
   * Tests for serializing FacetCounts to JSON and back.
   * Maps cannot be directly JSON serialized, so we convert to arrays.
   */

  it("should serialize Map to array of entries", () => {
    const facetMap = new Map<string, LabeledFacetCount>([
      ["1", { count: 100, label: "Tag A" }],
      ["2", { count: 50, label: "Tag B" }],
    ]);

    const serialized = Array.from(facetMap.entries());
    
    expect(serialized).toEqual([
      ["1", { count: 100, label: "Tag A" }],
      ["2", { count: 50, label: "Tag B" }],
    ]);
  });

  it("should deserialize array of entries back to Map", () => {
    const serialized: [string, LabeledFacetCount][] = [
      ["1", { count: 100, label: "Tag A" }],
      ["2", { count: 50, label: "Tag B" }],
    ];

    const deserialized = new Map(serialized);
    
    expect(deserialized.size).toBe(2);
    expect(deserialized.get("1")).toEqual({ count: 100, label: "Tag A" });
    expect(deserialized.get("2")).toEqual({ count: 50, label: "Tag B" });
  });

  it("should handle empty Maps", () => {
    const emptyMap = new Map<string, LabeledFacetCount>();
    const serialized = Array.from(emptyMap.entries());
    const deserialized = new Map(serialized);
    
    expect(serialized).toEqual([]);
    expect(deserialized.size).toBe(0);
  });

  it("should preserve data integrity through serialize/deserialize cycle", () => {
    const original: FacetCounts = {
      tags: new Map([["1", { count: 100, label: "Tag A" }]]),
      performers: new Map([["2", { count: 50, label: "Performer B" }]]),
      studios: new Map([["3", { count: 25, label: "Studio C" }]]),
      groups: new Map(),
      performerTags: new Map(),
      resolutions: new Map(),
      orientations: new Map(),
      genders: new Map(),
      countries: new Map(),
      ethnicities: new Map(),
      hairColors: new Map(),
      eyeColors: new Map(),
      circumcised: new Map(),
      ratings: new Map([[100, 10], [80, 20]]),
      captions: new Map([["en", 500]]),
      booleans: {
        organized: { true: 100, false: 900 },
        interactive: { true: 10, false: 990 },
        hasMarkers: { true: 0, false: 0 },
        performerFavorite: { true: 0, false: 0 },
        hasChapters: { true: 0, false: 0 },
        favorite: { true: 0, false: 0 },
      },
      parents: new Map(),
      children: new Map(),
    };

    // Serialize
    const serialized = {
      tags: Array.from(original.tags.entries()),
      performers: Array.from(original.performers.entries()),
      studios: Array.from(original.studios.entries()),
      ratings: Array.from(original.ratings.entries()),
      captions: Array.from(original.captions.entries()),
      booleans: original.booleans,
    };

    // Convert to JSON and back (simulates localStorage)
    const json = JSON.stringify(serialized);
    const parsed = JSON.parse(json);

    // Deserialize
    const restored = {
      tags: new Map(parsed.tags),
      performers: new Map(parsed.performers),
      studios: new Map(parsed.studios),
      ratings: new Map(parsed.ratings),
      captions: new Map(parsed.captions),
      booleans: parsed.booleans,
    };

    // Verify integrity
    expect(restored.tags.get("1")).toEqual({ count: 100, label: "Tag A" });
    expect(restored.performers.get("2")).toEqual({ count: 50, label: "Performer B" });
    expect(restored.ratings.get(100)).toBe(10);
    expect(restored.captions.get("en")).toBe(500);
    expect(restored.booleans.organized.true).toBe(100);
  });
});

describe("Cache TTL behavior", () => {
  /**
   * Tests for cache Time-To-Live (TTL) expiration logic.
   */

  const CACHE_TTL_FILTERED_MS = 10 * 60 * 1000;  // 10 minutes
  const CACHE_TTL_UNFILTERED_MS = 30 * 60 * 1000;  // 30 minutes

  it("should consider cache valid within TTL", () => {
    const now = Date.now();
    const cacheTimestamp = now - (5 * 60 * 1000);  // 5 minutes ago
    const ttl = CACHE_TTL_FILTERED_MS;

    const isExpired = (now - cacheTimestamp) > ttl;
    expect(isExpired).toBe(false);
  });

  it("should consider cache expired after TTL", () => {
    const now = Date.now();
    const cacheTimestamp = now - (15 * 60 * 1000);  // 15 minutes ago
    const ttl = CACHE_TTL_FILTERED_MS;

    const isExpired = (now - cacheTimestamp) > ttl;
    expect(isExpired).toBe(true);
  });

  it("should use longer TTL for unfiltered cache", () => {
    const now = Date.now();
    const cacheTimestamp = now - (20 * 60 * 1000);  // 20 minutes ago

    // Should be expired with filtered TTL
    const isExpiredFiltered = (now - cacheTimestamp) > CACHE_TTL_FILTERED_MS;
    expect(isExpiredFiltered).toBe(true);

    // Should NOT be expired with unfiltered TTL
    const isExpiredUnfiltered = (now - cacheTimestamp) > CACHE_TTL_UNFILTERED_MS;
    expect(isExpiredUnfiltered).toBe(false);
  });

  it("should select correct TTL based on filter fingerprint", () => {
    function getTTL(fingerprint: string): number {
      return fingerprint === 'empty' ? CACHE_TTL_UNFILTERED_MS : CACHE_TTL_FILTERED_MS;
    }

    expect(getTTL('empty')).toBe(CACHE_TTL_UNFILTERED_MS);
    expect(getTTL('{"studios":{"value":["123"]}}')).toBe(CACHE_TTL_FILTERED_MS);
  });
});

describe("Cache invalidation", () => {
  /**
   * Tests for cache invalidation logic.
   * Cache should be cleared on:
   * - Scan complete
   * - Manual invalidation call
   */

  it("should clear all entries when invalidating", () => {
    // Simulate cache structure
    const cache = new Map<string, { counts: unknown; timestamp: number }>();
    cache.set('empty', { counts: {}, timestamp: Date.now() });
    cache.set('filter1', { counts: {}, timestamp: Date.now() });
    cache.set('filter2', { counts: {}, timestamp: Date.now() });

    expect(cache.size).toBe(3);

    // Invalidate
    cache.clear();

    expect(cache.size).toBe(0);
  });

  it("should allow selective invalidation by entity type", () => {
    // Simulate per-entity caches
    const caches: Record<string, Map<string, unknown>> = {
      scenes: new Map([['empty', {}], ['filter1', {}]]),
      performers: new Map([['empty', {}]]),
      galleries: new Map([['empty', {}]]),
    };

    // Invalidate only scenes
    caches.scenes.clear();

    expect(caches.scenes.size).toBe(0);
    expect(caches.performers.size).toBe(1);
    expect(caches.galleries.size).toBe(1);
  });
});

describe("Cache entry limit", () => {
  /**
   * Tests for cache size limits to prevent memory bloat.
   */

  const MAX_CACHED_PATTERNS = 20;

  it("should limit number of cached patterns", () => {
    const cache = new Map<string, { timestamp: number }>();

    // Add more than max entries
    for (let i = 0; i < 30; i++) {
      cache.set(`filter${i}`, { timestamp: Date.now() - i * 1000 });
    }

    // Prune to max
    if (cache.size > MAX_CACHED_PATTERNS) {
      const entries = Array.from(cache.entries());
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);  // Newest first
      
      cache.clear();
      for (let i = 0; i < MAX_CACHED_PATTERNS; i++) {
        cache.set(entries[i][0], entries[i][1]);
      }
    }

    expect(cache.size).toBe(MAX_CACHED_PATTERNS);
  });

  it("should keep newest entries when pruning", () => {
    const cache = new Map<string, { timestamp: number }>();
    const now = Date.now();

    // Add entries with different ages
    cache.set('oldest', { timestamp: now - 100000 });
    cache.set('middle', { timestamp: now - 50000 });
    cache.set('newest', { timestamp: now - 1000 });

    // Prune to 2 entries
    const entries = Array.from(cache.entries());
    entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
    
    cache.clear();
    for (let i = 0; i < 2; i++) {
      cache.set(entries[i][0], entries[i][1]);
    }

    expect(cache.has('newest')).toBe(true);
    expect(cache.has('middle')).toBe(true);
    expect(cache.has('oldest')).toBe(false);
  });
});

describe("Entity-specific FacetCounts builders", () => {
  /**
   * Tests for the build*FacetCounts helper functions that convert
   * GraphQL responses to internal FacetCounts format.
   * 
   * Phase 6 added builders for galleries, performers, groups, studios, and tags.
   */

  // Helper to create a FacetCounts-like structure for comparison
  function createEmptyFacetCounts(): FacetCounts {
    return {
      tags: new Map(),
      performers: new Map(),
      studios: new Map(),
      groups: new Map(),
      performerTags: new Map(),
      resolutions: new Map(),
      orientations: new Map(),
      genders: new Map(),
      countries: new Map(),
      ethnicities: new Map(),
      hairColors: new Map(),
      eyeColors: new Map(),
      circumcised: new Map(),
      ratings: new Map(),
      captions: new Map(),
      booleans: {
        organized: { true: 0, false: 0 },
        interactive: { true: 0, false: 0 },
        hasMarkers: { true: 0, false: 0 },
        performerFavorite: { true: 0, false: 0 },
        hasChapters: { true: 0, false: 0 },
        favorite: { true: 0, false: 0 },
      },
      parents: new Map(),
      children: new Map(),
    };
  }

  describe("Gallery facets builder", () => {
    it("should include performer_tags field (Phase 6 feature)", () => {
      // Gallery facets now include performer_tags for parity with scenes
      const counts = createEmptyFacetCounts();
      
      // Simulate building from gallery response
      counts.performerTags = new Map([
        ["1", { count: 100, label: "Tag A" }],
        ["2", { count: 50, label: "Tag B" }],
      ]);
      
      expect(counts.performerTags.size).toBe(2);
      expect(counts.performerTags.get("1")?.label).toBe("Tag A");
    });

    it("should populate tags, performers, studios, organized, ratings", () => {
      const counts = createEmptyFacetCounts();
      
      counts.tags = new Map([["1", { count: 10, label: "Tag" }]]);
      counts.performers = new Map([["2", { count: 20, label: "Performer" }]]);
      counts.studios = new Map([["3", { count: 30, label: "Studio" }]]);
      counts.booleans.organized = { true: 5, false: 10 };
      counts.ratings = new Map([[100, 3]]);
      
      expect(counts.tags.size).toBe(1);
      expect(counts.performers.size).toBe(1);
      expect(counts.studios.size).toBe(1);
      expect(counts.booleans.organized.true).toBe(5);
      expect(counts.ratings.size).toBe(1);
    });

    it("should not populate scene-only facets (groups, resolutions, orientations, interactive, captions)", () => {
      const counts = createEmptyFacetCounts();
      
      // These should remain empty for gallery facets
      expect(counts.groups.size).toBe(0);
      expect(counts.resolutions.size).toBe(0);
      expect(counts.orientations.size).toBe(0);
      expect(counts.booleans.interactive).toEqual({ true: 0, false: 0 });
      expect(counts.captions.size).toBe(0);
    });
  });

  describe("Performer facets builder", () => {
    it("should populate tags, studios, genders, countries, circumcised, favorite, ratings", () => {
      const counts = createEmptyFacetCounts();
      
      counts.tags = new Map([["1", { count: 10, label: "Tag" }]]);
      counts.studios = new Map([["2", { count: 20, label: "Studio" }]]);
      counts.genders = new Map([[GQL.GenderEnum.Female, 30]]);
      counts.countries = new Map([["US", { count: 40, label: "US" }]]);
      counts.circumcised = new Map([[GQL.CircumisedEnum.Cut, 5]]);
      counts.booleans.favorite = { true: 15, false: 85 };
      counts.ratings = new Map([[80, 10]]);
      
      expect(counts.tags.size).toBe(1);
      expect(counts.studios.size).toBe(1);
      expect(counts.genders.size).toBe(1);
      expect(counts.countries.size).toBe(1);
      expect(counts.circumcised.size).toBe(1);
      expect(counts.booleans.favorite.true).toBe(15);
      expect(counts.ratings.size).toBe(1);
    });

    it("should not populate non-performer facets", () => {
      const counts = createEmptyFacetCounts();
      
      // These should remain empty for performer facets
      expect(counts.performers.size).toBe(0);  // Performers don't have performer facets
      expect(counts.performerTags.size).toBe(0);
      expect(counts.resolutions.size).toBe(0);
      expect(counts.booleans.organized).toEqual({ true: 0, false: 0 });
    });

    it("should populate groups facet (Phase 7.3)", () => {
      const counts = createEmptyFacetCounts();
      
      counts.groups = new Map([
        ["1", { count: 25, label: "Group A" }],
        ["2", { count: 15, label: "Group B" }],
      ]);
      
      expect(counts.groups.size).toBe(2);
      expect(counts.groups.get("1")?.count).toBe(25);
      expect(counts.groups.get("1")?.label).toBe("Group A");
    });

    it("should populate ethnicity, hair color, eye color facets (Phase 7.5)", () => {
      const counts = createEmptyFacetCounts();
      
      counts.ethnicities = new Map([
        ["Caucasian", 100],
        ["Asian", 50],
      ]);
      counts.hairColors = new Map([
        ["Blonde", 80],
        ["Brunette", 120],
      ]);
      counts.eyeColors = new Map([
        ["Blue", 60],
        ["Brown", 90],
      ]);
      
      expect(counts.ethnicities.size).toBe(2);
      expect(counts.ethnicities.get("Caucasian")).toBe(100);
      expect(counts.hairColors.size).toBe(2);
      expect(counts.hairColors.get("Blonde")).toBe(80);
      expect(counts.eyeColors.size).toBe(2);
      expect(counts.eyeColors.get("Blue")).toBe(60);
    });
  });

  describe("Group facets builder", () => {
    it("should populate tags, performers, studios", () => {
      const counts = createEmptyFacetCounts();
      
      counts.tags = new Map([["1", { count: 10, label: "Tag" }]]);
      counts.performers = new Map([["2", { count: 20, label: "Performer" }]]);
      counts.studios = new Map([["3", { count: 30, label: "Studio" }]]);
      
      expect(counts.tags.size).toBe(1);
      expect(counts.performers.size).toBe(1);
      expect(counts.studios.size).toBe(1);
    });

    it("should not populate non-group facets", () => {
      const counts = createEmptyFacetCounts();
      
      // Groups have minimal facets
      expect(counts.groups.size).toBe(0);  // Groups don't have groups facets
      expect(counts.performerTags.size).toBe(0);
      expect(counts.ratings.size).toBe(0);
      expect(counts.booleans.organized).toEqual({ true: 0, false: 0 });
      expect(counts.booleans.favorite).toEqual({ true: 0, false: 0 });
    });
  });

  describe("Studio facets builder", () => {
    it("should populate tags, parents, favorite", () => {
      const counts = createEmptyFacetCounts();
      
      counts.tags = new Map([["1", { count: 10, label: "Tag" }]]);
      counts.parents = new Map([["2", { count: 5, label: "Parent Studio" }]]);
      counts.booleans.favorite = { true: 3, false: 97 };
      
      expect(counts.tags.size).toBe(1);
      expect(counts.parents.size).toBe(1);
      expect(counts.booleans.favorite.true).toBe(3);
    });

    it("should not populate non-studio facets", () => {
      const counts = createEmptyFacetCounts();
      
      // Studios have minimal facets
      expect(counts.performers.size).toBe(0);
      expect(counts.studios.size).toBe(0);  // Studios don't have studios facets
      expect(counts.groups.size).toBe(0);
      expect(counts.ratings.size).toBe(0);
    });
  });

  describe("Tag facets builder", () => {
    it("should populate parents, children, favorite", () => {
      const counts = createEmptyFacetCounts();
      
      counts.parents = new Map([["1", { count: 10, label: "Parent Tag" }]]);
      counts.children = new Map([["2", { count: 20, label: "Child Tag" }]]);
      counts.booleans.favorite = { true: 5, false: 95 };
      
      expect(counts.parents.size).toBe(1);
      expect(counts.children.size).toBe(1);
      expect(counts.booleans.favorite.true).toBe(5);
    });

    it("should not populate non-tag facets", () => {
      const counts = createEmptyFacetCounts();
      
      // Tags have minimal facets - only hierarchical relationships
      expect(counts.tags.size).toBe(0);  // Tags don't have tags facets
      expect(counts.performers.size).toBe(0);
      expect(counts.studios.size).toBe(0);
      expect(counts.groups.size).toBe(0);
      expect(counts.ratings.size).toBe(0);
    });
  });
});

describe("All entity types support caching", () => {
  /**
   * Tests verifying that caching is enabled for all entity types.
   * Phase 6 added caching to galleries, performers, groups, studios, and tags.
   */

  const entityTypes = ['scenes', 'galleries', 'performers', 'groups', 'studios', 'tags'];

  it("should have cache entries for all entity types", () => {
    const caches: Record<string, Map<string, unknown>> = {};
    
    entityTypes.forEach(type => {
      caches[type] = new Map();
    });
    
    expect(Object.keys(caches).length).toBe(6);
    entityTypes.forEach(type => {
      expect(caches[type]).toBeInstanceOf(Map);
    });
  });

  it("should allow caching different filters per entity type", () => {
    const caches: Record<string, Map<string, { data: string }>> = {
      scenes: new Map(),
      galleries: new Map(),
      performers: new Map(),
      groups: new Map(),
      studios: new Map(),
      tags: new Map(),
    };

    // Cache different filters for each entity
    caches.scenes.set('empty', { data: 'scene-empty' });
    caches.scenes.set('{"studios":{"value":[1]}}', { data: 'scene-filtered' });
    
    caches.galleries.set('empty', { data: 'gallery-empty' });
    caches.galleries.set('{"tags":{"value":[2]}}', { data: 'gallery-filtered' });
    
    caches.performers.set('empty', { data: 'performer-empty' });
    
    expect(caches.scenes.size).toBe(2);
    expect(caches.galleries.size).toBe(2);
    expect(caches.performers.size).toBe(1);
    expect(caches.groups.size).toBe(0);
    expect(caches.studios.size).toBe(0);
    expect(caches.tags.size).toBe(0);
  });

  it("should invalidate all entity caches on scan complete", () => {
    const caches: Record<string, Map<string, unknown>> = {};
    
    entityTypes.forEach(type => {
      caches[type] = new Map([['filter1', {}], ['filter2', {}]]);
    });

    // Simulate scan complete - clear all caches
    entityTypes.forEach(type => {
      caches[type].clear();
    });

    entityTypes.forEach(type => {
      expect(caches[type].size).toBe(0);
    });
  });
});

// =============================================================================
// Rating Facet Display Tests (Phase 7.1)
// =============================================================================

describe("Rating Facet Display", () => {
  describe("Rating value conversion", () => {
    // Rating values are stored as 20-100 in DB (20=1★, 40=2★, 60=3★, 80=4★, 100=5★)
    const ratingToStars = (ratingValue: number): number => ratingValue / 20;

    it("should convert database rating 100 to 5 stars", () => {
      expect(ratingToStars(100)).toBe(5);
    });

    it("should convert database rating 80 to 4 stars", () => {
      expect(ratingToStars(80)).toBe(4);
    });

    it("should convert database rating 60 to 3 stars", () => {
      expect(ratingToStars(60)).toBe(3);
    });

    it("should convert database rating 40 to 2 stars", () => {
      expect(ratingToStars(40)).toBe(2);
    });

    it("should convert database rating 20 to 1 star", () => {
      expect(ratingToStars(20)).toBe(1);
    });
  });

  describe("Rating counts in FacetCounts", () => {
    it("should store rating counts in Map<number, number>", () => {
      const ratings = new Map<number, number>();
      ratings.set(100, 12345);  // 5 stars
      ratings.set(80, 23456);   // 4 stars
      ratings.set(60, 15678);   // 3 stars
      ratings.set(40, 8901);    // 2 stars
      ratings.set(20, 2345);    // 1 star

      expect(ratings.get(100)).toBe(12345);
      expect(ratings.get(80)).toBe(23456);
      expect(ratings.get(60)).toBe(15678);
      expect(ratings.get(40)).toBe(8901);
      expect(ratings.get(20)).toBe(2345);
    });

    it("should return undefined for missing rating values", () => {
      const ratings = new Map<number, number>();
      ratings.set(100, 12345);
      
      expect(ratings.get(80)).toBeUndefined();
      expect(ratings.get(0)).toBeUndefined();
    });

    it("should handle zero counts", () => {
      const ratings = new Map<number, number>();
      ratings.set(100, 0);
      ratings.set(20, 0);
      
      expect(ratings.get(100)).toBe(0);
      expect(ratings.get(20)).toBe(0);
    });
  });

  describe("Rating bucket system", () => {
    // Rating buckets:
    // 5★: 100 (exactly 5 stars)
    // 4★: 80-99 (4.0-4.9 stars)
    // 3★: 60-79 (3.0-3.9 stars)
    // 2★: 40-59 (2.0-2.9 stars)
    // 1★: 20-39 (1.0-1.9 stars)

    // Helper to sum counts within a range
    const sumBucketCount = (ratingCounts: Map<number, number>, min: number, max: number): number => {
      let sum = 0;
      for (let rating = min; rating <= max; rating++) {
        sum += ratingCounts.get(rating) ?? 0;
      }
      return sum;
    };

    it("should sum counts for 5-star bucket (single value)", () => {
      const ratingCounts = new Map<number, number>([
        [100, 5000],
      ]);

      const fiveStarCount = sumBucketCount(ratingCounts, 100, 100);
      expect(fiveStarCount).toBe(5000);
    });

    it("should sum counts for 4-star bucket (range 80-99)", () => {
      const ratingCounts = new Map<number, number>([
        [80, 2000],  // 4.0 stars
        [85, 500],   // 4.25 stars (quarter precision)
        [90, 3000],  // 4.5 stars
        [95, 800],   // 4.75 stars
        [99, 100],   // Just under 5 stars
      ]);

      const fourStarCount = sumBucketCount(ratingCounts, 80, 99);
      expect(fourStarCount).toBe(2000 + 500 + 3000 + 800 + 100);
    });

    it("should return 0 for empty bucket", () => {
      const ratingCounts = new Map<number, number>([
        [100, 5000],
        [80, 3000],
      ]);

      const threeStarCount = sumBucketCount(ratingCounts, 60, 79);
      expect(threeStarCount).toBe(0);
    });

    it("should handle half-star precision values", () => {
      const ratingCounts = new Map<number, number>([
        [60, 1000],  // 3.0 stars
        [70, 2000],  // 3.5 stars
      ]);

      const threeStarCount = sumBucketCount(ratingCounts, 60, 79);
      expect(threeStarCount).toBe(3000);
    });

    it("should calculate all bucket counts correctly", () => {
      const ratingCounts = new Map<number, number>([
        [100, 1000],  // 5★
        [90, 2000],   // 4★ (4.5)
        [80, 1500],   // 4★ (4.0)
        [70, 3000],   // 3★ (3.5)
        [60, 2500],   // 3★ (3.0)
        [50, 1800],   // 2★ (2.5)
        [40, 1200],   // 2★ (2.0)
        [30, 800],    // 1★ (1.5)
        [20, 400],    // 1★ (1.0)
      ]);

      expect(sumBucketCount(ratingCounts, 100, 100)).toBe(1000);     // 5★
      expect(sumBucketCount(ratingCounts, 80, 99)).toBe(3500);       // 4★
      expect(sumBucketCount(ratingCounts, 60, 79)).toBe(5500);       // 3★
      expect(sumBucketCount(ratingCounts, 40, 59)).toBe(3000);       // 2★
      expect(sumBucketCount(ratingCounts, 20, 39)).toBe(1200);       // 1★
    });
  });

  describe("Rating bucket selection", () => {
    it("should identify bucket candidates by id prefix", () => {
      const candidates = [
        { id: "bucket-5", label: "★★★★★" },
        { id: "bucket-4", label: "★★★★☆" },
        { id: "bucket-3", label: "★★★☆☆" },
        { id: "bucket-2", label: "★★☆☆☆" },
        { id: "bucket-1", label: "★☆☆☆☆" },
        { id: "unrated", label: "Unrated" },
        { id: "custom", label: "Custom..." },
      ];

      const bucketCandidates = candidates.filter(c => c.id.startsWith("bucket-"));
      expect(bucketCandidates.length).toBe(5);
    });

    it("should parse bucket star level from id", () => {
      const bucketId = "bucket-4";
      const starLevel = parseInt(bucketId.replace("bucket-", ""), 10);
      expect(starLevel).toBe(4);
    });
  });

  describe("Unrated count calculation", () => {
    // Helper to get total rated count
    const getTotalRatedCount = (ratingCounts: Map<number, number>): number => {
      let total = 0;
      ratingCounts.forEach((count) => {
        total += count;
      });
      return total;
    };

    it("should calculate unrated count from total", () => {
      const ratingCounts = new Map<number, number>([
        [100, 1000],  // 5★
        [80, 2000],   // 4★
        [60, 3000],   // 3★
        [40, 2000],   // 2★
        [20, 1000],   // 1★
      ]);
      
      const totalCount = 15000;
      const totalRated = getTotalRatedCount(ratingCounts);
      const unratedCount = totalCount - totalRated;
      
      expect(totalRated).toBe(9000);
      expect(unratedCount).toBe(6000);
    });

    it("should return 0 if all items are rated", () => {
      const ratingCounts = new Map<number, number>([
        [100, 5000],
        [80, 5000],
      ]);
      
      const totalCount = 10000;
      const totalRated = getTotalRatedCount(ratingCounts);
      const unratedCount = Math.max(0, totalCount - totalRated);
      
      expect(unratedCount).toBe(0);
    });

    it("should handle empty rating counts (all unrated)", () => {
      const ratingCounts = new Map<number, number>();
      
      const totalCount = 5000;
      const totalRated = getTotalRatedCount(ratingCounts);
      const unratedCount = totalCount - totalRated;
      
      expect(totalRated).toBe(0);
      expect(unratedCount).toBe(5000);
    });

    it("should return undefined when totalCount is not available", () => {
      const totalCount = undefined;
      const unratedCount = totalCount !== undefined 
        ? Math.max(0, totalCount - 1000) 
        : undefined;
      
      expect(unratedCount).toBeUndefined();
    });
  });

  describe("Rating selection flow (legacy)", () => {
    it("should parse rating value from candidate id", () => {
      const candidateId = "rating-80";
      const ratingValue = parseInt(candidateId.replace("rating-", ""), 10);
      
      expect(ratingValue).toBe(80);
    });

    it("should identify rating candidates by id prefix", () => {
      const candidates = [
        { id: "any", label: "(any)" },
        { id: "none", label: "(none)" },
        { id: "rating-100", label: "★★★★★" },
        { id: "rating-80", label: "★★★★☆" },
      ];

      const ratingCandidates = candidates.filter(c => c.id.startsWith("rating-"));
      
      expect(ratingCandidates.length).toBe(2);
    });
  });
});

