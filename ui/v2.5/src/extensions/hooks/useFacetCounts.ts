import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ListFilterModel } from "src/models/list-filter/filter";
import * as GQL from "src/core/generated-graphql";

/**
 * Labeled facet count with id, label, and count
 */
export interface LabeledFacetCount {
  count: number;
  label: string;
}

/**
 * Facet count data organized by filter type
 */
export interface FacetCounts {
  tags: Map<string, LabeledFacetCount>;
  performers: Map<string, LabeledFacetCount>;
  studios: Map<string, LabeledFacetCount>;
  groups: Map<string, LabeledFacetCount>;
  performerTags: Map<string, LabeledFacetCount>;
  resolutions: Map<GQL.ResolutionEnum, number>;
  orientations: Map<GQL.OrientationEnum, number>;
  genders: Map<GQL.GenderEnum, number>;
  countries: Map<string, LabeledFacetCount>;
  circumcised: Map<GQL.CircumisedEnum, number>;
  ratings: Map<number, number>;
  captions: Map<string, number>;
  booleans: {
    organized: { true: number; false: number };
    interactive: { true: number; false: number };
    hasMarkers: { true: number; false: number };
    performerFavorite: { true: number; false: number };
    hasChapters: { true: number; false: number };
    favorite: { true: number; false: number };
  };
  parents: Map<string, LabeledFacetCount>;
  children: Map<string, LabeledFacetCount>;
}

/**
 * Creates a fresh empty counts object.
 * Important: This must return NEW Map instances each time to prevent
 * shared references between different hook instances.
 */
function createEmptyCounts(): FacetCounts {
  return {
    tags: new Map<string, LabeledFacetCount>(),
    performers: new Map<string, LabeledFacetCount>(),
    studios: new Map<string, LabeledFacetCount>(),
    groups: new Map<string, LabeledFacetCount>(),
    performerTags: new Map<string, LabeledFacetCount>(),
    resolutions: new Map<GQL.ResolutionEnum, number>(),
    orientations: new Map<GQL.OrientationEnum, number>(),
    genders: new Map<GQL.GenderEnum, number>(),
    countries: new Map<string, LabeledFacetCount>(),
    circumcised: new Map<GQL.CircumisedEnum, number>(),
    ratings: new Map<number, number>(),
    captions: new Map<string, number>(),
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
}

// For backward compatibility in tests
const EMPTY_COUNTS: FacetCounts = createEmptyCounts();

// ============================================================================
// FACET CACHE SYSTEM
// ============================================================================
// Provides fast facet count display by caching results in memory and localStorage.
// Features:
// - In-memory cache for instant access
// - localStorage persistence survives page refresh
// - Filter fingerprint-based keys (works for any filter pattern)
// - Automatic invalidation on scan complete
// - TTL-based expiration
// ============================================================================

/** Cache TTL: 10 minutes for filtered, 30 minutes for unfiltered */
const CACHE_TTL_FILTERED_MS = 10 * 60 * 1000;
const CACHE_TTL_UNFILTERED_MS = 30 * 60 * 1000;

/** Maximum number of filter patterns to cache per entity type */
const MAX_CACHED_PATTERNS = 20;

/** localStorage key prefix */
const STORAGE_KEY_PREFIX = 'stash:facetCache:';

interface CacheEntry {
  counts: SerializedFacetCounts;
  timestamp: number;
  filterFingerprint: string;
}

interface SerializedFacetCounts {
  tags: [string, LabeledFacetCount][];
  performers: [string, LabeledFacetCount][];
  studios: [string, LabeledFacetCount][];
  groups: [string, LabeledFacetCount][];
  performerTags: [string, LabeledFacetCount][];
  resolutions: [string, number][];
  orientations: [string, number][];
  genders: [string, number][];
  countries: [string, LabeledFacetCount][];
  circumcised: [string, number][];
  ratings: [number, number][];
  captions: [string, number][];
  booleans: {
    organized: { true: number; false: number };
    interactive: { true: number; false: number };
    hasMarkers: { true: number; false: number };
    performerFavorite: { true: number; false: number };
    hasChapters: { true: number; false: number };
    favorite: { true: number; false: number };
  };
  parents: [string, LabeledFacetCount][];
  children: [string, LabeledFacetCount][];
}

/** In-memory cache: entityType -> filterFingerprint -> CacheEntry */
const memoryCache: Record<string, Map<string, CacheEntry>> = {
  scenes: new Map(),
  performers: new Map(),
  galleries: new Map(),
  groups: new Map(),
  studios: new Map(),
  tags: new Map(),
};

/** Generate a stable fingerprint for a filter */
function getFilterFingerprint(filterData: unknown): string {
  if (!filterData || typeof filterData !== 'object') return 'empty';
  const keys = Object.keys(filterData as object);
  if (keys.length === 0) return 'empty';
  // Sort keys for consistent fingerprinting
  return JSON.stringify(filterData, Object.keys(filterData as object).sort());
}

/** Check if a filter is empty */
function isFilterEmpty(filterData: unknown): boolean {
  return getFilterFingerprint(filterData) === 'empty';
}

/** Serialize FacetCounts for storage (Maps can't be JSON serialized) */
function serializeCounts(counts: FacetCounts): SerializedFacetCounts {
  return {
    tags: Array.from(counts.tags.entries()),
    performers: Array.from(counts.performers.entries()),
    studios: Array.from(counts.studios.entries()),
    groups: Array.from(counts.groups.entries()),
    performerTags: Array.from(counts.performerTags.entries()),
    resolutions: Array.from(counts.resolutions.entries()).map(([k, v]) => [k as string, v]),
    orientations: Array.from(counts.orientations.entries()).map(([k, v]) => [k as string, v]),
    genders: Array.from(counts.genders.entries()).map(([k, v]) => [k as string, v]),
    countries: Array.from(counts.countries.entries()),
    circumcised: Array.from(counts.circumcised.entries()).map(([k, v]) => [k as string, v]),
    ratings: Array.from(counts.ratings.entries()),
    captions: Array.from(counts.captions.entries()),
    booleans: counts.booleans,
    parents: Array.from(counts.parents.entries()),
    children: Array.from(counts.children.entries()),
  };
}

/** Deserialize FacetCounts from storage */
function deserializeCounts(data: SerializedFacetCounts): FacetCounts {
  return {
    tags: new Map(data.tags),
    performers: new Map(data.performers),
    studios: new Map(data.studios),
    groups: new Map(data.groups),
    performerTags: new Map(data.performerTags),
    resolutions: new Map(data.resolutions.map(([k, v]) => [k as GQL.ResolutionEnum, v])),
    orientations: new Map(data.orientations.map(([k, v]) => [k as GQL.OrientationEnum, v])),
    genders: new Map(data.genders.map(([k, v]) => [k as GQL.GenderEnum, v])),
    countries: new Map(data.countries),
    circumcised: new Map(data.circumcised.map(([k, v]) => [k as GQL.CircumisedEnum, v])),
    ratings: new Map(data.ratings),
    captions: new Map(data.captions),
    booleans: data.booleans,
    parents: new Map(data.parents),
    children: new Map(data.children),
  };
}

/** Load cache from localStorage on startup */
function loadCacheFromStorage(entityType: string): void {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${entityType}`);
    if (!stored) return;
    
    const entries: CacheEntry[] = JSON.parse(stored);
    const cache = memoryCache[entityType];
    
    for (const entry of entries) {
      // Skip expired entries
      const ttl = entry.filterFingerprint === 'empty' ? CACHE_TTL_UNFILTERED_MS : CACHE_TTL_FILTERED_MS;
      if (Date.now() - entry.timestamp > ttl) continue;
      
      cache.set(entry.filterFingerprint, entry);
    }
  } catch (e) {
    console.warn(`Failed to load facet cache for ${entityType}:`, e);
  }
}

/** Save cache to localStorage */
function saveCacheToStorage(entityType: string): void {
  try {
    const cache = memoryCache[entityType];
    const entries = Array.from(cache.values());
    
    // Prune old entries if we have too many
    if (entries.length > MAX_CACHED_PATTERNS) {
      entries.sort((a, b) => b.timestamp - a.timestamp);
      entries.length = MAX_CACHED_PATTERNS;
      
      // Rebuild cache with pruned entries
      cache.clear();
      for (const entry of entries) {
        cache.set(entry.filterFingerprint, entry);
      }
    }
    
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${entityType}`, JSON.stringify(entries));
  } catch (e) {
    console.warn(`Failed to save facet cache for ${entityType}:`, e);
  }
}

/** Get cached counts for a filter */
function getCachedCounts(entityType: string, filterFingerprint: string): FacetCounts | null {
  // Ensure cache is loaded from storage
  if (memoryCache[entityType].size === 0) {
    loadCacheFromStorage(entityType);
  }
  
  const entry = memoryCache[entityType].get(filterFingerprint);
  if (!entry) return null;
  
  // Check TTL
  const ttl = filterFingerprint === 'empty' ? CACHE_TTL_UNFILTERED_MS : CACHE_TTL_FILTERED_MS;
  if (Date.now() - entry.timestamp > ttl) {
    memoryCache[entityType].delete(filterFingerprint);
    return null;
  }
  
  return deserializeCounts(entry.counts);
}

/** Set cached counts for a filter */
function setCachedCounts(entityType: string, filterFingerprint: string, counts: FacetCounts): void {
  const entry: CacheEntry = {
    counts: serializeCounts(counts),
    timestamp: Date.now(),
    filterFingerprint,
  };
  
  memoryCache[entityType].set(filterFingerprint, entry);
  
  // Persist to localStorage (debounced would be better, but simple for now)
  saveCacheToStorage(entityType);
}

/** Invalidate all cached facet counts (call on scan complete, etc.) */
export function invalidateFacetCache(entityType?: string): void {
  if (entityType) {
    memoryCache[entityType].clear();
    try {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${entityType}`);
    } catch (e) {
      // Ignore storage errors
    }
  } else {
    // Invalidate all
    for (const type of Object.keys(memoryCache)) {
      memoryCache[type].clear();
      try {
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${type}`);
      } catch (e) {
        // Ignore storage errors
      }
    }
  }
}

/** Get cache statistics (for debugging) */
export function getFacetCacheStats(): Record<string, { entries: number; oldestAge: number }> {
  const stats: Record<string, { entries: number; oldestAge: number }> = {};
  const now = Date.now();
  
  for (const [type, cache] of Object.entries(memoryCache)) {
    let oldestAge = 0;
    for (const entry of cache.values()) {
      const age = now - entry.timestamp;
      if (age > oldestAge) oldestAge = age;
    }
    stats[type] = { entries: cache.size, oldestAge: Math.round(oldestAge / 1000) };
  }
  
  return stats;
}

/**
 * Convert facet count array to Map with labels
 */
function toMap(counts: { id: string; label: string; count: number }[]): Map<string, LabeledFacetCount> {
  return new Map(counts.map((c) => [c.id, { count: c.count, label: c.label }]));
}

/**
 * Convert resolution facet counts to Map
 */
function toResolutionMap(
  counts: { resolution: GQL.ResolutionEnum; count: number }[]
): Map<GQL.ResolutionEnum, number> {
  return new Map(counts.map((c) => [c.resolution, c.count]));
}

/**
 * Convert orientation facet counts to Map
 */
function toOrientationMap(
  counts: { orientation: GQL.OrientationEnum; count: number }[]
): Map<GQL.OrientationEnum, number> {
  return new Map(counts.map((c) => [c.orientation, c.count]));
}

/**
 * Convert gender facet counts to Map
 */
function toGenderMap(
  counts: { gender: GQL.GenderEnum; count: number }[]
): Map<GQL.GenderEnum, number> {
  return new Map(counts.map((c) => [c.gender, c.count]));
}

/**
 * Convert boolean facet counts to object
 */
function toBooleanCounts(
  counts: { value: boolean; count: number }[]
): { true: number; false: number } {
  const result = { true: 0, false: 0 };
  for (const c of counts) {
    if (c.value) {
      result.true = c.count;
    } else {
      result.false = c.count;
    }
  }
  return result;
}

/**
 * Convert circumcised facet counts to Map
 */
function toCircumcisedMap(
  counts: { value: GQL.CircumisedEnum; count: number }[]
): Map<GQL.CircumisedEnum, number> {
  return new Map(counts.map((c) => [c.value, c.count]));
}

/**
 * Convert rating facet counts to Map
 */
function toRatingMap(
  counts: { rating: number; count: number }[]
): Map<number, number> {
  return new Map(counts.map((c) => [c.rating, c.count]));
}

/**
 * Convert caption facet counts to Map
 */
function toCaptionMap(
  counts: { language: string; count: number }[]
): Map<string, number> {
  return new Map(counts.map((c) => [c.language, c.count]));
}

interface UseFacetCountsOptions {
  /** Only fetch when sidebar is open */
  isOpen?: boolean;
  /** Debounce delay in ms (default 500) */
  debounceMs?: number;
  /** Limit number of facets per category (default 100) */
  limit?: number;
}

/** Build FacetCounts from GraphQL scene facets response */
function buildSceneFacetCounts(facets: NonNullable<GQL.SceneFacetsQuery['sceneFacets']>): FacetCounts {
  return {
    tags: toMap(facets.tags),
    performers: toMap(facets.performers),
    studios: toMap(facets.studios),
    groups: toMap(facets.groups),
    performerTags: toMap(facets.performer_tags ?? []),
    resolutions: toResolutionMap(facets.resolutions),
    orientations: toOrientationMap(facets.orientations),
    genders: new Map(),
    countries: new Map(),
    circumcised: new Map(),
    ratings: toRatingMap(facets.ratings),
    captions: toCaptionMap(facets.captions ?? []),
    booleans: {
      organized: toBooleanCounts(facets.organized),
      interactive: toBooleanCounts(facets.interactive),
      hasMarkers: toBooleanCounts(facets.has_markers ?? []),
      performerFavorite: toBooleanCounts(facets.performer_favorite ?? []),
      hasChapters: { true: 0, false: 0 },
      favorite: { true: 0, false: 0 },
    },
    parents: new Map(),
    children: new Map(),
  };
}

/** Build FacetCounts from GraphQL gallery facets response */
function buildGalleryFacetCounts(facets: NonNullable<GQL.GalleryFacetsQuery['galleryFacets']>): FacetCounts {
  return {
    tags: toMap(facets.tags),
    performers: toMap(facets.performers),
    studios: toMap(facets.studios),
    groups: new Map(),
    performerTags: toMap(facets.performer_tags ?? []),
    resolutions: new Map(),
    orientations: new Map(),
    genders: new Map(),
    countries: new Map(),
    circumcised: new Map(),
    ratings: toRatingMap(facets.ratings),
    captions: new Map(),
    booleans: {
      organized: toBooleanCounts(facets.organized),
      interactive: { true: 0, false: 0 },
      hasMarkers: { true: 0, false: 0 },
      performerFavorite: toBooleanCounts(facets.performer_favorite ?? []),
      hasChapters: toBooleanCounts(facets.has_chapters ?? []),
      favorite: { true: 0, false: 0 },
    },
    parents: new Map(),
    children: new Map(),
  };
}

/** Build FacetCounts from GraphQL performer facets response */
function buildPerformerFacetCounts(facets: NonNullable<GQL.PerformerFacetsQuery['performerFacets']>): FacetCounts {
  return {
    tags: toMap(facets.tags),
    performers: new Map(),
    studios: toMap(facets.studios),
    groups: new Map(),
    performerTags: new Map(),
    resolutions: new Map(),
    orientations: new Map(),
    genders: toGenderMap(facets.genders),
    countries: toMap(facets.countries),
    circumcised: toCircumcisedMap(facets.circumcised),
    ratings: toRatingMap(facets.ratings),
    captions: new Map(),
    booleans: {
      organized: { true: 0, false: 0 },
      interactive: { true: 0, false: 0 },
      hasMarkers: { true: 0, false: 0 },
      performerFavorite: { true: 0, false: 0 },
      hasChapters: { true: 0, false: 0 },
      favorite: toBooleanCounts(facets.favorite),
    },
    parents: new Map(),
    children: new Map(),
  };
}

/** Build FacetCounts from GraphQL group facets response */
function buildGroupFacetCounts(facets: NonNullable<GQL.GroupFacetsQuery['groupFacets']>): FacetCounts {
  return {
    tags: toMap(facets.tags),
    performers: toMap(facets.performers),
    studios: toMap(facets.studios),
    groups: new Map(),
    performerTags: new Map(),
    resolutions: new Map(),
    orientations: new Map(),
    genders: new Map(),
    countries: new Map(),
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

/** Build FacetCounts from GraphQL studio facets response */
function buildStudioFacetCounts(facets: NonNullable<GQL.StudioFacetsQuery['studioFacets']>): FacetCounts {
  return {
    tags: toMap(facets.tags),
    performers: new Map(),
    studios: new Map(),
    groups: new Map(),
    performerTags: new Map(),
    resolutions: new Map(),
    orientations: new Map(),
    genders: new Map(),
    countries: new Map(),
    circumcised: new Map(),
    ratings: new Map(),
    captions: new Map(),
    booleans: {
      organized: { true: 0, false: 0 },
      interactive: { true: 0, false: 0 },
      hasMarkers: { true: 0, false: 0 },
      performerFavorite: { true: 0, false: 0 },
      hasChapters: { true: 0, false: 0 },
      favorite: toBooleanCounts(facets.favorite),
    },
    parents: toMap(facets.parents),
    children: new Map(),
  };
}

/** Build FacetCounts from GraphQL tag facets response */
function buildTagFacetCounts(facets: NonNullable<GQL.TagFacetsQuery['tagFacets']>): FacetCounts {
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
    circumcised: new Map(),
    ratings: new Map(),
    captions: new Map(),
    booleans: {
      organized: { true: 0, false: 0 },
      interactive: { true: 0, false: 0 },
      hasMarkers: { true: 0, false: 0 },
      performerFavorite: { true: 0, false: 0 },
      hasChapters: { true: 0, false: 0 },
      favorite: toBooleanCounts(facets.favorite),
    },
    parents: toMap(facets.parents),
    children: toMap(facets.children),
  };
}

/**
 * Hook that fetches aggregated facet counts using the facets endpoint.
 * This is much more efficient than making individual count queries.
 * 
 * All facets (including performer_tags and captions) are computed in parallel
 * on the backend for optimal performance.
 */
export function useSceneFacetCounts(
  filter: ListFilterModel,
  options: UseFacetCountsOptions = {}
) {
  const { 
    isOpen = true, 
    debounceMs = 500, 
    limit = 100,
  } = options;

  const [counts, setCounts] = useState<FacetCounts>(createEmptyCounts);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFilterRef = useRef<string>("");

  const [fetchFacets] = GQL.useSceneFacetsLazyQuery({
    fetchPolicy: "network-only",
  });

  const filterFingerprint = useMemo(() => {
    return JSON.stringify(filter.makeFilter());
  }, [filter]);

  const doFetch = useCallback(async () => {
    if (!isOpen) return;

    // Capture the filter fingerprint at request time to detect stale responses
    const requestFingerprint = filterFingerprint;
    const filterData = filter.makeFilter();
    const cacheFingerprint = getFilterFingerprint(filterData);
    
    // Check cache for ANY filter pattern (not just empty)
    const cached = getCachedCounts('scenes', cacheFingerprint);
    if (cached) {
      setCounts(cached);
      setLoading(false);
      // Still fetch in background to refresh cache
      fetchFacets({
        variables: { scene_filter: filterData as GQL.SceneFilterType, limit },
      }).then((result) => {
        if (result.data?.sceneFacets) {
          const newCounts = buildSceneFacetCounts(result.data.sceneFacets);
          setCachedCounts('scenes', cacheFingerprint, newCounts);
          // Only update if filter hasn't changed
          if (lastFilterRef.current === requestFingerprint) {
            setCounts(newCounts);
          }
        }
      }).catch((error) => {
        console.error("Error refreshing scene facets cache:", error);
      });
      return;
    }
    
    setLoading(true);
    try {
      const result = await fetchFacets({
        variables: {
          scene_filter: filterData as GQL.SceneFilterType,
          limit,
        },
      });

      // Check if filter changed while request was in flight (stale response)
      if (lastFilterRef.current !== requestFingerprint) {
        // Filter changed - discard this stale response
        return;
      }

      if (result.data?.sceneFacets) {
        const newCounts = buildSceneFacetCounts(result.data.sceneFacets);
        setCounts(newCounts);
        // Cache all filter patterns
        setCachedCounts('scenes', cacheFingerprint, newCounts);
      }
    } catch (error) {
      console.error("Error fetching scene facets:", error);
    } finally {
      // Only clear loading if this is still the current request
      if (lastFilterRef.current === requestFingerprint) {
        setLoading(false);
      }
    }
  }, [fetchFacets, filter, filterFingerprint, isOpen, limit]);

  // Fetch when filter changes or sidebar opens
  useEffect(() => {
    if (!isOpen) return;

    const isFirstFetch = lastFilterRef.current === "";
    const filterChanged = filterFingerprint !== lastFilterRef.current;

    if (!isFirstFetch && !filterChanged) return;

    setLoading(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // First fetch is immediate, subsequent fetches are debounced
    if (isFirstFetch) {
      lastFilterRef.current = filterFingerprint;
      doFetch();
    } else {
      debounceRef.current = setTimeout(() => {
        lastFilterRef.current = filterFingerprint;
        doFetch();
      }, debounceMs);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [filterFingerprint, isOpen, debounceMs, doFetch]);

  return { counts, loading, refetch: doFetch };
}

/**
 * Hook for performer facet counts
 * 
 * All facets are computed in parallel on the backend.
 * Results are cached in memory and localStorage for instant display on repeat visits.
 */
export function usePerformerFacetCounts(
  filter: ListFilterModel,
  options: UseFacetCountsOptions = {}
) {
  const { isOpen = true, debounceMs = 500, limit = 100 } = options;

  const [counts, setCounts] = useState<FacetCounts>(createEmptyCounts);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFilterRef = useRef<string>("");

  const [fetchFacets] = GQL.usePerformerFacetsLazyQuery({
    fetchPolicy: "network-only",
  });

  const filterFingerprint = useMemo(() => {
    return JSON.stringify(filter.makeFilter());
  }, [filter]);

  const doFetch = useCallback(async () => {
    if (!isOpen) return;

    // Capture the filter fingerprint at request time to detect stale responses
    const requestFingerprint = filterFingerprint;
    const filterData = filter.makeFilter();
    const cacheFingerprint = getFilterFingerprint(filterData);
    
    // Check cache for ANY filter pattern (not just empty)
    const cached = getCachedCounts('performers', cacheFingerprint);
    if (cached) {
      setCounts(cached);
      setLoading(false);
      // Still fetch in background to refresh cache
      fetchFacets({
        variables: { performer_filter: filterData as GQL.PerformerFilterType, limit },
      }).then((result) => {
        if (result.data?.performerFacets) {
          const newCounts = buildPerformerFacetCounts(result.data.performerFacets);
          setCachedCounts('performers', cacheFingerprint, newCounts);
          // Only update if filter hasn't changed
          if (lastFilterRef.current === requestFingerprint) {
            setCounts(newCounts);
          }
        }
      }).catch((error) => {
        console.error("Error refreshing performer facets cache:", error);
      });
      return;
    }
    
    setLoading(true);
    try {
      const result = await fetchFacets({
        variables: {
          performer_filter: filterData as GQL.PerformerFilterType,
          limit,
        },
      });

      // Check if filter changed while request was in flight (stale response)
      if (lastFilterRef.current !== requestFingerprint) {
        // Filter changed - discard this stale response
        return;
      }

      if (result.data?.performerFacets) {
        const newCounts = buildPerformerFacetCounts(result.data.performerFacets);
        setCounts(newCounts);
        // Cache all filter patterns
        setCachedCounts('performers', cacheFingerprint, newCounts);
      }
    } catch (error) {
      console.error("Error fetching performer facets:", error);
    } finally {
      // Only clear loading if this is still the current request
      if (lastFilterRef.current === requestFingerprint) {
        setLoading(false);
      }
    }
  }, [fetchFacets, filter, filterFingerprint, isOpen, limit]);

  // Fetch when filter changes or sidebar opens
  useEffect(() => {
    if (!isOpen) return;

    const isFirstFetch = lastFilterRef.current === "";
    const filterChanged = filterFingerprint !== lastFilterRef.current;

    if (!isFirstFetch && !filterChanged) return;

    setLoading(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // First fetch is immediate, subsequent fetches are debounced
    if (isFirstFetch) {
      lastFilterRef.current = filterFingerprint;
      doFetch();
    } else {
      debounceRef.current = setTimeout(() => {
        lastFilterRef.current = filterFingerprint;
        doFetch();
      }, debounceMs);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [filterFingerprint, isOpen, debounceMs, doFetch]);

  return { counts, loading, refetch: doFetch };
}

/**
 * Hook for gallery facet counts
 * 
 * All facets (including performer_tags) are computed in parallel on the backend.
 * Results are cached in memory and localStorage for instant display on repeat visits.
 */
export function useGalleryFacetCounts(
  filter: ListFilterModel,
  options: UseFacetCountsOptions = {}
) {
  const { isOpen = true, debounceMs = 500, limit = 100 } = options;

  const [counts, setCounts] = useState<FacetCounts>(createEmptyCounts);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFilterRef = useRef<string>("");

  const [fetchFacets] = GQL.useGalleryFacetsLazyQuery({
    fetchPolicy: "network-only",
  });

  const filterFingerprint = useMemo(() => {
    return JSON.stringify(filter.makeFilter());
  }, [filter]);

  const doFetch = useCallback(async () => {
    if (!isOpen) return;

    // Capture the filter fingerprint at request time to detect stale responses
    const requestFingerprint = filterFingerprint;
    const filterData = filter.makeFilter();
    const cacheFingerprint = getFilterFingerprint(filterData);
    
    // Check cache for ANY filter pattern (not just empty)
    const cached = getCachedCounts('galleries', cacheFingerprint);
    if (cached) {
      setCounts(cached);
      setLoading(false);
      // Still fetch in background to refresh cache
      fetchFacets({
        variables: { gallery_filter: filterData as GQL.GalleryFilterType, limit },
      }).then((result) => {
        if (result.data?.galleryFacets) {
          const newCounts = buildGalleryFacetCounts(result.data.galleryFacets);
          setCachedCounts('galleries', cacheFingerprint, newCounts);
          // Only update if filter hasn't changed
          if (lastFilterRef.current === requestFingerprint) {
            setCounts(newCounts);
          }
        }
      }).catch((error) => {
        console.error("Error refreshing gallery facets cache:", error);
      });
      return;
    }
    
    setLoading(true);
    try {
      const result = await fetchFacets({
        variables: {
          gallery_filter: filterData as GQL.GalleryFilterType,
          limit,
        },
      });

      // Check if filter changed while request was in flight (stale response)
      if (lastFilterRef.current !== requestFingerprint) {
        // Filter changed - discard this stale response
        return;
      }

      if (result.data?.galleryFacets) {
        const newCounts = buildGalleryFacetCounts(result.data.galleryFacets);
        setCounts(newCounts);
        // Cache all filter patterns
        setCachedCounts('galleries', cacheFingerprint, newCounts);
      }
    } catch (error) {
      console.error("Error fetching gallery facets:", error);
    } finally {
      // Only clear loading if this is still the current request
      if (lastFilterRef.current === requestFingerprint) {
        setLoading(false);
      }
    }
  }, [fetchFacets, filter, filterFingerprint, isOpen, limit]);

  // Fetch when filter changes or sidebar opens
  useEffect(() => {
    if (!isOpen) return;

    const isFirstFetch = lastFilterRef.current === "";
    const filterChanged = filterFingerprint !== lastFilterRef.current;

    if (!isFirstFetch && !filterChanged) return;

    setLoading(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // First fetch is immediate, subsequent fetches are debounced
    if (isFirstFetch) {
      lastFilterRef.current = filterFingerprint;
      doFetch();
    } else {
      debounceRef.current = setTimeout(() => {
        lastFilterRef.current = filterFingerprint;
        doFetch();
      }, debounceMs);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [filterFingerprint, isOpen, debounceMs, doFetch]);

  return { counts, loading, refetch: doFetch };
}

/**
 * Hook for group facet counts
 * 
 * All facets are computed in parallel on the backend.
 * Results are cached in memory and localStorage for instant display on repeat visits.
 */
export function useGroupFacetCounts(
  filter: ListFilterModel,
  options: UseFacetCountsOptions = {}
) {
  const { isOpen = true, debounceMs = 500, limit = 100 } = options;

  const [counts, setCounts] = useState<FacetCounts>(createEmptyCounts);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFilterRef = useRef<string>("");

  const [fetchFacets] = GQL.useGroupFacetsLazyQuery({
    fetchPolicy: "network-only",
  });

  const filterFingerprint = useMemo(() => {
    return JSON.stringify(filter.makeFilter());
  }, [filter]);

  const doFetch = useCallback(async () => {
    if (!isOpen) return;

    // Capture the filter fingerprint at request time to detect stale responses
    const requestFingerprint = filterFingerprint;
    const filterData = filter.makeFilter();
    const cacheFingerprint = getFilterFingerprint(filterData);
    
    // Check cache for ANY filter pattern (not just empty)
    const cached = getCachedCounts('groups', cacheFingerprint);
    if (cached) {
      setCounts(cached);
      setLoading(false);
      // Still fetch in background to refresh cache
      fetchFacets({
        variables: { group_filter: filterData as GQL.GroupFilterType, limit },
      }).then((result) => {
        if (result.data?.groupFacets) {
          const newCounts = buildGroupFacetCounts(result.data.groupFacets);
          setCachedCounts('groups', cacheFingerprint, newCounts);
          // Only update if filter hasn't changed
          if (lastFilterRef.current === requestFingerprint) {
            setCounts(newCounts);
          }
        }
      }).catch((error) => {
        console.error("Error refreshing group facets cache:", error);
      });
      return;
    }
    
    setLoading(true);
    try {
      const result = await fetchFacets({
        variables: {
          group_filter: filterData as GQL.GroupFilterType,
          limit,
        },
      });

      // Check if filter changed while request was in flight (stale response)
      if (lastFilterRef.current !== requestFingerprint) {
        // Filter changed - discard this stale response
        return;
      }

      if (result.data?.groupFacets) {
        const newCounts = buildGroupFacetCounts(result.data.groupFacets);
        setCounts(newCounts);
        // Cache all filter patterns
        setCachedCounts('groups', cacheFingerprint, newCounts);
      }
    } catch (error) {
      console.error("Error fetching group facets:", error);
    } finally {
      // Only clear loading if this is still the current request
      if (lastFilterRef.current === requestFingerprint) {
        setLoading(false);
      }
    }
  }, [fetchFacets, filter, filterFingerprint, isOpen, limit]);

  // Fetch when filter changes or sidebar opens
  useEffect(() => {
    if (!isOpen) return;

    const isFirstFetch = lastFilterRef.current === "";
    const filterChanged = filterFingerprint !== lastFilterRef.current;

    if (!isFirstFetch && !filterChanged) return;

    setLoading(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // First fetch is immediate, subsequent fetches are debounced
    if (isFirstFetch) {
      lastFilterRef.current = filterFingerprint;
      doFetch();
    } else {
      debounceRef.current = setTimeout(() => {
        lastFilterRef.current = filterFingerprint;
        doFetch();
      }, debounceMs);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [filterFingerprint, isOpen, debounceMs, doFetch]);

  return { counts, loading, refetch: doFetch };
}

/**
 * Hook for studio facet counts
 * 
 * Results are cached in memory and localStorage for instant display on repeat visits.
 */
export function useStudioFacetCounts(
  filter: ListFilterModel,
  options: UseFacetCountsOptions = {}
) {
  const { isOpen = true, debounceMs = 500, limit = 100 } = options;

  const [counts, setCounts] = useState<FacetCounts>(createEmptyCounts);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFilterRef = useRef<string>("");

  const [fetchFacets] = GQL.useStudioFacetsLazyQuery({
    fetchPolicy: "network-only",
  });

  const filterFingerprint = useMemo(() => {
    return JSON.stringify(filter.makeFilter());
  }, [filter]);

  const doFetch = useCallback(async () => {
    if (!isOpen) return;

    // Capture the filter fingerprint at request time to detect stale responses
    const requestFingerprint = filterFingerprint;
    const filterData = filter.makeFilter();
    const cacheFingerprint = getFilterFingerprint(filterData);
    
    // Check cache for ANY filter pattern (not just empty)
    const cached = getCachedCounts('studios', cacheFingerprint);
    if (cached) {
      setCounts(cached);
      setLoading(false);
      // Still fetch in background to refresh cache
      fetchFacets({
        variables: { studio_filter: filterData as GQL.StudioFilterType, limit },
      }).then((result) => {
        if (result.data?.studioFacets) {
          const newCounts = buildStudioFacetCounts(result.data.studioFacets);
          setCachedCounts('studios', cacheFingerprint, newCounts);
          // Only update if filter hasn't changed
          if (lastFilterRef.current === requestFingerprint) {
            setCounts(newCounts);
          }
        }
      }).catch((error) => {
        console.error("Error refreshing studio facets cache:", error);
      });
      return;
    }
    
    setLoading(true);
    try {
      const result = await fetchFacets({
        variables: {
          studio_filter: filterData as GQL.StudioFilterType,
          limit,
        },
      });

      // Check if filter changed while request was in flight (stale response)
      if (lastFilterRef.current !== requestFingerprint) {
        // Filter changed - discard this stale response
        return;
      }

      if (result.data?.studioFacets) {
        const newCounts = buildStudioFacetCounts(result.data.studioFacets);
        setCounts(newCounts);
        // Cache all filter patterns
        setCachedCounts('studios', cacheFingerprint, newCounts);
      }
    } catch (error) {
      console.error("Error fetching studio facets:", error);
    } finally {
      // Only clear loading if this is still the current request
      if (lastFilterRef.current === requestFingerprint) {
        setLoading(false);
      }
    }
  }, [fetchFacets, filter, filterFingerprint, isOpen, limit]);

  // Fetch when filter changes or sidebar opens
  useEffect(() => {
    if (!isOpen) return;

    const isFirstFetch = lastFilterRef.current === "";
    const filterChanged = filterFingerprint !== lastFilterRef.current;

    if (!isFirstFetch && !filterChanged) return;

    setLoading(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // First fetch is immediate, subsequent fetches are debounced
    if (isFirstFetch) {
      lastFilterRef.current = filterFingerprint;
      doFetch();
    } else {
      debounceRef.current = setTimeout(() => {
        lastFilterRef.current = filterFingerprint;
        doFetch();
      }, debounceMs);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [filterFingerprint, isOpen, debounceMs, doFetch]);

  return { counts, loading, refetch: doFetch };
}

/**
 * Hook for tag facet counts
 * 
 * Results are cached in memory and localStorage for instant display on repeat visits.
 */
export function useTagFacetCounts(
  filter: ListFilterModel,
  options: UseFacetCountsOptions = {}
) {
  const { isOpen = true, debounceMs = 500, limit = 100 } = options;

  const [counts, setCounts] = useState<FacetCounts>(createEmptyCounts);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFilterRef = useRef<string>("");

  const [fetchFacets] = GQL.useTagFacetsLazyQuery({
    fetchPolicy: "network-only",
  });

  const filterFingerprint = useMemo(() => {
    return JSON.stringify(filter.makeFilter());
  }, [filter]);

  const doFetch = useCallback(async () => {
    if (!isOpen) return;

    // Capture the filter fingerprint at request time to detect stale responses
    const requestFingerprint = filterFingerprint;
    const filterData = filter.makeFilter();
    const cacheFingerprint = getFilterFingerprint(filterData);
    
    // Check cache for ANY filter pattern (not just empty)
    const cached = getCachedCounts('tags', cacheFingerprint);
    if (cached) {
      setCounts(cached);
      setLoading(false);
      // Still fetch in background to refresh cache
      fetchFacets({
        variables: { tag_filter: filterData as GQL.TagFilterType, limit },
      }).then((result) => {
        if (result.data?.tagFacets) {
          const newCounts = buildTagFacetCounts(result.data.tagFacets);
          setCachedCounts('tags', cacheFingerprint, newCounts);
          // Only update if filter hasn't changed
          if (lastFilterRef.current === requestFingerprint) {
            setCounts(newCounts);
          }
        }
      }).catch((error) => {
        console.error("Error refreshing tag facets cache:", error);
      });
      return;
    }
    
    setLoading(true);
    try {
      const result = await fetchFacets({
        variables: {
          tag_filter: filterData as GQL.TagFilterType,
          limit,
        },
      });

      // Check if filter changed while request was in flight (stale response)
      if (lastFilterRef.current !== requestFingerprint) {
        // Filter changed - discard this stale response
        return;
      }

      if (result.data?.tagFacets) {
        const newCounts = buildTagFacetCounts(result.data.tagFacets);
        setCounts(newCounts);
        // Cache all filter patterns
        setCachedCounts('tags', cacheFingerprint, newCounts);
      }
    } catch (error) {
      console.error("Error fetching tag facets:", error);
    } finally {
      // Only clear loading if this is still the current request
      if (lastFilterRef.current === requestFingerprint) {
        setLoading(false);
      }
    }
  }, [fetchFacets, filter, filterFingerprint, isOpen, limit]);

  // Fetch when filter changes or sidebar opens
  useEffect(() => {
    if (!isOpen) return;

    const isFirstFetch = lastFilterRef.current === "";
    const filterChanged = filterFingerprint !== lastFilterRef.current;

    if (!isFirstFetch && !filterChanged) return;

    setLoading(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // First fetch is immediate, subsequent fetches are debounced
    if (isFirstFetch) {
      lastFilterRef.current = filterFingerprint;
      doFetch();
    } else {
      debounceRef.current = setTimeout(() => {
        lastFilterRef.current = filterFingerprint;
        doFetch();
      }, debounceMs);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [filterFingerprint, isOpen, debounceMs, doFetch]);

  return { counts, loading, refetch: doFetch };
}

/**
 * Universal hook that selects the appropriate facet hook based on filter mode
 */
export function useFacetCounts(
  filter: ListFilterModel,
  options: UseFacetCountsOptions = {}
) {
  const mode = filter.mode;

  // We call all hooks but only one will be active
  const sceneCounts = useSceneFacetCounts(filter, {
    ...options,
    isOpen: options.isOpen && mode === GQL.FilterMode.Scenes,
  });
  const performerCounts = usePerformerFacetCounts(filter, {
    ...options,
    isOpen: options.isOpen && mode === GQL.FilterMode.Performers,
  });
  const galleryCounts = useGalleryFacetCounts(filter, {
    ...options,
    isOpen: options.isOpen && mode === GQL.FilterMode.Galleries,
  });
  const groupCounts = useGroupFacetCounts(filter, {
    ...options,
    isOpen: options.isOpen && mode === GQL.FilterMode.Groups,
  });
  const studioCounts = useStudioFacetCounts(filter, {
    ...options,
    isOpen: options.isOpen && mode === GQL.FilterMode.Studios,
  });
  const tagCounts = useTagFacetCounts(filter, {
    ...options,
    isOpen: options.isOpen && mode === GQL.FilterMode.Tags,
  });

  switch (mode) {
    case GQL.FilterMode.Scenes:
      return sceneCounts;
    case GQL.FilterMode.Performers:
      return performerCounts;
    case GQL.FilterMode.Galleries:
      return galleryCounts;
    case GQL.FilterMode.Groups:
      return groupCounts;
    case GQL.FilterMode.Studios:
      return studioCounts;
    case GQL.FilterMode.Tags:
      return tagCounts;
    default:
      return sceneCounts;
  }
}

/**
 * Context for sharing facet counts with child filter components
 */
export const FacetCountsContext = React.createContext<{
  counts: FacetCounts;
  loading: boolean;
}>({
  counts: EMPTY_COUNTS,
  loading: false,
});

/**
 * Hook for filter components to access facet counts from context
 */
export function useFacetCountsContext() {
  return useContext(FacetCountsContext);
}
