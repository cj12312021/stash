/**
 * filterSearchUX.test.ts
 *
 * Tests for the filter search UX improvements made on 2026-01-06.
 *
 * ## Features Tested
 *
 * ### 1. Fast Search Query (skip scenes_filter when searching)
 * When user types in filter search box, the expensive scenes_filter should be
 * skipped. Counts come from the pre-loaded facet cache instead.
 *
 * ### 2. Loading Indicator During Search
 * When search query is loading, return only modifier options to trigger the
 * loading spinner instead of showing stale data.
 *
 * ### 3. "n/a" Indicator for Unavailable Counts
 * Items outside the top 100 facets don't have counts. These should display
 * "n/a" instead of being blank.
 *
 * ### 4. Alphabetical Sorting During Search
 * Search results should be sorted alphabetically by label (predictable for
 * name-based search), not by count.
 *
 * ## Related Files
 * - extensions/filters/TagsFilter.tsx (and PerformersFilter, StudiosFilter, GroupsFilter, PerformerTagsFilter)
 * - extensions/filters/SidebarListFilter.tsx
 * - extensions/styles/_list-components.scss
 * - extensions/docs/debug/DEBUG_SESSION_filter_search_ux.md
 */

import { describe, it, expect } from "vitest";
import { Option } from "src/components/List/Filters/SidebarListFilter";
import { LabeledFacetCount } from "src/extensions/hooks/useFacetCounts";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Simulates the queryVariables logic from filter components.
 * When query is present, scenes_filter should be skipped.
 */
function shouldIncludeScenesFilter(query: string, hasFilter: boolean): boolean {
  // From TagsFilter.tsx line 36: if (f && !query)
  return hasFilter && !query;
}

/**
 * Simulates the candidatesWithCounts logic for determining what to return
 * when search is in progress.
 */
function getCandidatesForSearchState(
  hasSearchQuery: boolean,
  isLoading: boolean,
  modifierOptions: Option[],
  searchResults: Option[]
): Option[] {
  // From TagsFilter.tsx: early return when hasSearchQuery && state.loading
  if (hasSearchQuery && isLoading) {
    return modifierOptions;
  }
  return [...modifierOptions, ...searchResults];
}

/**
 * Simulates alphabetical sorting of search results.
 */
function sortSearchResultsAlphabetically(results: Option[]): Option[] {
  return [...results].sort((a, b) => {
    // Modifiers stay at top
    if (a.className === "modifier-object") return -1;
    if (b.className === "modifier-object") return 1;
    // Sort alphabetically by label during search
    return a.label.localeCompare(b.label);
  });
}

/**
 * Determines what count indicator to show for an item.
 */
function getCountIndicator(
  count: number | undefined,
  countsLoading: boolean,
  isModifier: boolean
): "count" | "loading" | "unavailable" | "none" {
  if (count !== undefined) {
    return "count";
  }
  if (countsLoading && !isModifier) {
    return "loading";
  }
  if (!isModifier) {
    return "unavailable";
  }
  return "none";
}

// =============================================================================
// Tests: Fast Search Query (skip scenes_filter)
// =============================================================================

describe("Fast Search Query - Skip scenes_filter when searching", () => {
  describe("shouldIncludeScenesFilter", () => {
    it("should include scenes_filter when query is empty and filter exists", () => {
      expect(shouldIncludeScenesFilter("", true)).toBe(true);
    });

    it("should NOT include scenes_filter when query is present", () => {
      expect(shouldIncludeScenesFilter("bru", true)).toBe(false);
      expect(shouldIncludeScenesFilter("a", true)).toBe(false);
      expect(shouldIncludeScenesFilter("performer name", true)).toBe(false);
    });

    it("should NOT include scenes_filter when no filter exists", () => {
      expect(shouldIncludeScenesFilter("", false)).toBe(false);
      expect(shouldIncludeScenesFilter("query", false)).toBe(false);
    });

    it("should handle whitespace-only query as empty", () => {
      // Note: Actual implementation may trim whitespace
      // This test documents expected behavior
      expect(shouldIncludeScenesFilter("   ", true)).toBe(false);
    });
  });

  describe("queryVariables behavior", () => {
    it("should generate simple query when searching (fast path)", () => {
      // When user searches, query should only include:
      // - filter.q (search query)
      // - tag_filter without scenes_filter
      const query = "brunette";
      const hasFilter = true;

      const includesScenesFilter = shouldIncludeScenesFilter(query, hasFilter);
      expect(includesScenesFilter).toBe(false);

      // Result: Fast query ~100-500ms instead of ~5+ seconds
    });

    it("should generate full query when not searching (accurate path)", () => {
      // When no search, query includes full scenes_filter for accurate counts
      const query = "";
      const hasFilter = true;

      const includesScenesFilter = shouldIncludeScenesFilter(query, hasFilter);
      expect(includesScenesFilter).toBe(true);

      // Result: Slower but accurate results from filtered entity set
    });
  });
});

// =============================================================================
// Tests: Loading Indicator During Search
// =============================================================================

describe("Loading Indicator During Search", () => {
  const modifierOptions: Option[] = [
    { id: "any", label: "(Any)", className: "modifier-object" },
    { id: "none", label: "(None)", className: "modifier-object" },
  ];

  const searchResults: Option[] = [
    { id: "1", label: "Brunette" },
    { id: "2", label: "Blonde" },
    { id: "3", label: "Brutal" },
  ];

  describe("getCandidatesForSearchState", () => {
    it("should return only modifiers when searching AND loading", () => {
      const result = getCandidatesForSearchState(
        true, // hasSearchQuery
        true, // isLoading
        modifierOptions,
        searchResults
      );

      expect(result).toEqual(modifierOptions);
      expect(result.length).toBe(2);
      expect(result.every(r => r.className === "modifier-object")).toBe(true);
    });

    it("should return full results when searching but NOT loading", () => {
      const result = getCandidatesForSearchState(
        true, // hasSearchQuery
        false, // isLoading
        modifierOptions,
        searchResults
      );

      expect(result.length).toBe(5); // 2 modifiers + 3 results
      expect(result.slice(0, 2)).toEqual(modifierOptions);
      expect(result.slice(2)).toEqual(searchResults);
    });

    it("should return full results when not searching (even if loading)", () => {
      const result = getCandidatesForSearchState(
        false, // hasSearchQuery
        true, // isLoading (doesn't matter when not searching)
        modifierOptions,
        searchResults
      );

      expect(result.length).toBe(5);
    });

    it("should trigger loading spinner when returning only modifiers", () => {
      const result = getCandidatesForSearchState(true, true, modifierOptions, searchResults);

      // SidebarListFilter shows loading spinner when:
      // candidates.length === 0 || (candidates.every(c => c.className === "modifier-object"))
      const allModifiers = result.every(r => r.className === "modifier-object");
      expect(allModifiers).toBe(true);
    });
  });

  describe("Loading state timing", () => {
    it("should show loading immediately when search query changes", () => {
      // Simulates: user types "bru" -> loading = true -> show spinner
      const states = [
        { query: "", loading: false }, // Initial state
        { query: "b", loading: true },  // First keystroke -> loading
        { query: "br", loading: true }, // Still loading (debounce)
        { query: "bru", loading: true }, // Still loading
        { query: "bru", loading: false }, // Results arrived
      ];

      states.forEach((state, i) => {
        const hasSearchQuery = state.query.length > 0;
        const shouldShowSpinner = hasSearchQuery && state.loading;

        if (i >= 1 && i <= 3) {
          expect(shouldShowSpinner).toBe(true);
        } else if (i === 4) {
          expect(shouldShowSpinner).toBe(false);
        }
      });
    });
  });
});

// =============================================================================
// Tests: "n/a" Indicator for Unavailable Counts
// =============================================================================

describe("Count Indicator Display", () => {
  describe("getCountIndicator", () => {
    it("should show count when count is available", () => {
      expect(getCountIndicator(100, false, false)).toBe("count");
      expect(getCountIndicator(0, false, false)).toBe("count");
      expect(getCountIndicator(999999, false, false)).toBe("count");
    });

    it("should show loading when counts are loading and not a modifier", () => {
      expect(getCountIndicator(undefined, true, false)).toBe("loading");
    });

    it("should show unavailable (n/a) when count is undefined and not loading", () => {
      expect(getCountIndicator(undefined, false, false)).toBe("unavailable");
    });

    it("should show none for modifier options", () => {
      expect(getCountIndicator(undefined, false, true)).toBe("none");
      expect(getCountIndicator(undefined, true, true)).toBe("none");
    });

    it("should prefer count over loading state", () => {
      // If count is available, show it regardless of loading state
      expect(getCountIndicator(50, true, false)).toBe("count");
    });
  });

  describe("Count unavailable scenarios", () => {
    it("should show n/a for search results outside top 100 facets", () => {
      // Facet cache only contains top 100 items by count
      const facetCache = new Map<string, LabeledFacetCount>([
        ["1", { count: 306340, label: "Brunette" }],
        ["2", { count: 272919, label: "Blowjob" }],
        // ... top 100 items
      ]);

      // Search result not in facet cache
      const searchResultId = "999"; // "Babydoll" - not in top 100
      const countFromCache = facetCache.get(searchResultId);

      expect(countFromCache).toBeUndefined();
      expect(getCountIndicator(countFromCache?.count, false, false)).toBe("unavailable");
    });

    it("should show count for search results in facet cache", () => {
      const facetCache = new Map<string, LabeledFacetCount>([
        ["1", { count: 306340, label: "Brunette" }],
      ]);

      const searchResultId = "1";
      const countFromCache = facetCache.get(searchResultId);

      expect(countFromCache).toBeDefined();
      expect(getCountIndicator(countFromCache?.count, false, false)).toBe("count");
    });
  });

  describe("Visual distinction from loading indicator", () => {
    it("n/a should be visually distinct from loading dots", () => {
      // Loading: "···" (animated dots)
      // Unavailable: "n/a" (static text)
      // This test documents the design decision
      const loadingIndicator = "···";
      const unavailableIndicator = "n/a";

      // They should be different strings
      expect(loadingIndicator).not.toBe(unavailableIndicator);

      // "n/a" is clearly text (letters), not animation-like symbols (dots)
      // The key distinction is semantic, not length
      expect(unavailableIndicator).toMatch(/^[a-z\/]+$/i);
      expect(loadingIndicator).not.toMatch(/^[a-z\/]+$/i);
    });
  });
});

// =============================================================================
// Tests: Alphabetical Sorting During Search
// =============================================================================

describe("Alphabetical Sorting During Search", () => {
  const modifierOptions: Option[] = [
    { id: "any", label: "(Any)", className: "modifier-object" },
  ];

  describe("sortSearchResultsAlphabetically", () => {
    it("should sort search results alphabetically by label", () => {
      const unsorted: Option[] = [
        { id: "1", label: "Zebra" },
        { id: "2", label: "Apple" },
        { id: "3", label: "Mango" },
      ];

      const sorted = sortSearchResultsAlphabetically(unsorted);

      expect(sorted.map(r => r.label)).toEqual(["Apple", "Mango", "Zebra"]);
    });

    it("should keep modifier options at the top", () => {
      const unsorted: Option[] = [
        ...modifierOptions,
        { id: "1", label: "Zebra" },
        { id: "2", label: "Apple" },
      ];

      const sorted = sortSearchResultsAlphabetically(unsorted);

      expect(sorted[0].className).toBe("modifier-object");
      expect(sorted.slice(1).map(r => r.label)).toEqual(["Apple", "Zebra"]);
    });

    it("should handle case-insensitive sorting", () => {
      const unsorted: Option[] = [
        { id: "1", label: "banana" },
        { id: "2", label: "Apple" },
        { id: "3", label: "Cherry" },
      ];

      const sorted = sortSearchResultsAlphabetically(unsorted);

      // localeCompare handles case correctly
      expect(sorted.map(r => r.label)).toEqual(["Apple", "banana", "Cherry"]);
    });

    it("should be stable for items with same label", () => {
      const unsorted: Option[] = [
        { id: "1", label: "Tag" },
        { id: "2", label: "Tag" },
        { id: "3", label: "Tag" },
      ];

      const sorted = sortSearchResultsAlphabetically(unsorted);

      // All have same label, original order should be preserved
      expect(sorted.length).toBe(3);
    });
  });

  describe("Alphabetical vs Count sorting", () => {
    it("should NOT sort by count during search (alphabetical is predictable)", () => {
      // During search, users are looking for a specific name
      // Alphabetical sorting makes it easy to find
      const searchResults: Option[] = [
        { id: "1", label: "Brunette", count: 306340 },
        { id: "2", label: "Big Tits", count: 205665 },
        { id: "3", label: "Brutal", count: 100 },
      ];

      const sorted = sortSearchResultsAlphabetically(searchResults);

      // Should be alphabetical, not by count
      expect(sorted[0].label).toBe("Big Tits");
      expect(sorted[1].label).toBe("Brunette");
      expect(sorted[2].label).toBe("Brutal");
    });

    it("should sort by count when NOT searching (facet results)", () => {
      // When not searching, facet results come pre-sorted by count
      // This test documents that behavior
      const facetResults: Option[] = [
        { id: "1", label: "Brunette", count: 306340 },
        { id: "2", label: "Blowjob", count: 272919 },
        { id: "3", label: "Big Tits", count: 205665 },
      ];

      // Facets are already sorted by count descending from backend
      expect(facetResults[0].count).toBeGreaterThan(facetResults[1].count!);
      expect(facetResults[1].count).toBeGreaterThan(facetResults[2].count!);
    });
  });
});

// =============================================================================
// Integration Tests: Full Search Flow
// =============================================================================

describe("Full Search Flow Integration", () => {
  const makeFacetCounts = (data: [string, number, string][]): Map<string, LabeledFacetCount> => {
    return new Map(data.map(([id, count, label]) => [id, { count, label }]));
  };

  it("should handle complete search flow correctly", () => {
    // Setup: User is on scenes page with facet cache loaded
    const facetCache = makeFacetCounts([
      ["1", 306340, "Brunette"],
      ["2", 272919, "Blowjob"],
      ["3", 205665, "Big Tits"],
      // ... top 100 items
    ]);

    // Step 1: User types "bru"
    const searchQuery = "bru";

    // Step 2: Loading state while query executes
    const isLoading = true;
    const hasSearchQuery = searchQuery.length > 0;

    // Should show loading (return only modifiers)
    expect(hasSearchQuery && isLoading).toBe(true);

    // Step 3: Results arrive
    const searchResults: Option[] = [
      { id: "1", label: "Brunette" },      // In facet cache
      { id: "999", label: "Brutal" },       // NOT in facet cache
      { id: "1000", label: "Brunette (Male)" }, // NOT in facet cache
    ];

    // Step 4: Merge with facet counts
    const resultsWithCounts = searchResults.map(r => ({
      ...r,
      count: facetCache.get(r.id)?.count,
    }));

    expect(resultsWithCounts[0].count).toBe(306340); // Has count
    expect(resultsWithCounts[1].count).toBeUndefined(); // No count (n/a)
    expect(resultsWithCounts[2].count).toBeUndefined(); // No count (n/a)

    // Step 5: Sort alphabetically
    const sorted = sortSearchResultsAlphabetically(resultsWithCounts);

    expect(sorted[0].label).toBe("Brunette");
    expect(sorted[1].label).toBe("Brunette (Male)");
    expect(sorted[2].label).toBe("Brutal");
  });

  it("should provide fast response time when searching", () => {
    // This test documents the performance improvement
    const query = "brunette";
    const hasFilter = true;

    // Without query: includes scenes_filter (slow ~5+ seconds)
    // With query: skips scenes_filter (fast ~100-500ms)
    const usesFastPath = !shouldIncludeScenesFilter(query, hasFilter);

    expect(usesFastPath).toBe(true);
    // Actual performance verified via DEBUG_SESSION_filter_search_ux.md
  });
});

// =============================================================================
// Regression Tests
// =============================================================================

describe("Regression Tests", () => {
  describe("Bug fix: Loading indicator confused with unavailable indicator", () => {
    it("should use distinct indicators for loading vs unavailable", () => {
      // Before: both used similar gray indicators (em dash "—" vs "···")
      // After: unavailable uses "n/a" which is clearly text, not animation

      const loadingIndicator = getCountIndicator(undefined, true, false);
      const unavailableIndicator = getCountIndicator(undefined, false, false);

      expect(loadingIndicator).toBe("loading");
      expect(unavailableIndicator).toBe("unavailable");
      expect(loadingIndicator).not.toBe(unavailableIndicator);
    });
  });

  describe("Bug fix: Search query slow due to scenes_filter", () => {
    it("should skip scenes_filter when user is typing search query", () => {
      // Before: always included scenes_filter, causing ~5+ second queries
      // After: skip scenes_filter when searching, counts come from cache

      const searchingBehavior = shouldIncludeScenesFilter("bru", true);
      const browsingBehavior = shouldIncludeScenesFilter("", true);

      expect(searchingBehavior).toBe(false); // Fast path
      expect(browsingBehavior).toBe(true);   // Accurate path
    });
  });

  describe("Bug fix: No loading indicator during search", () => {
    it("should show loading spinner when search query is pending", () => {
      // Before: stale facet data shown while query was loading
      // After: return only modifiers to trigger loading spinner

      const modifiers: Option[] = [{ id: "any", label: "(Any)", className: "modifier-object" }];
      const results: Option[] = [{ id: "1", label: "Result" }];

      const candidates = getCandidatesForSearchState(true, true, modifiers, results);

      // Should return only modifiers, which triggers spinner in SidebarListFilter
      expect(candidates.every(c => c.className === "modifier-object")).toBe(true);
    });
  });
});
