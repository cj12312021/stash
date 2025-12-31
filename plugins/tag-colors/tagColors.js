(function () {
  "use strict";

  const PluginApi = window.PluginApi;
  const React = PluginApi.React;
  const GQL = PluginApi.GQL;

  // Configuration: Parent tag names to color mappings (case-insensitive)
  const TAG_COLOR_CONFIG = {
    action: "tag-ancestor-action",
    people: "tag-ancestor-people",
    scene: "tag-ancestor-scene",
  };

  // Cache for tag ancestry data
  let tagAncestryCache = null;
  let cacheLoading = false;
  let cacheLoadPromise = null;

  /**
   * Query all tags with their parent relationships
   */
  async function loadAllTags() {
    const client = PluginApi.utils.StashService.getClient();

    // Query all tags with their parents - we need to do this in batches
    // to handle large tag libraries
    let allTags = [];
    let page = 1;
    const perPage = 1000;
    let hasMore = true;

    while (hasMore) {
      const result = await client.query({
        query: GQL.FindTagsDocument,
        variables: {
          filter: {
            page: page,
            per_page: perPage,
          },
        },
        fetchPolicy: "network-only",
      });

      const tags = result.data?.findTags?.tags || [];
      allTags = allTags.concat(tags);

      hasMore = tags.length === perPage;
      page++;
    }

    return allTags;
  }

  /**
   * Build a map of tag ID -> all ancestor IDs (recursive parents)
   */
  function buildAncestryMap(tags) {
    // First, build a map of tag ID -> immediate parent IDs
    const parentMap = new Map();
    const tagNameMap = new Map(); // ID -> name (lowercase)
    const tagNameToId = new Map(); // name (lowercase) -> ID

    for (const tag of tags) {
      const parentIds = (tag.parents || []).map((p) => p.id);
      parentMap.set(tag.id, parentIds);
      tagNameMap.set(tag.id, tag.name.toLowerCase());
      tagNameToId.set(tag.name.toLowerCase(), tag.id);
    }

    // Find the IDs of our target parent tags
    const targetParentIds = {};
    for (const [name, className] of Object.entries(TAG_COLOR_CONFIG)) {
      const id = tagNameToId.get(name.toLowerCase());
      if (id) {
        targetParentIds[id] = className;
      }
    }

    // Now compute all ancestors for each tag (memoized DFS)
    const ancestorCache = new Map();

    function getAncestors(tagId, visited = new Set()) {
      if (ancestorCache.has(tagId)) {
        return ancestorCache.get(tagId);
      }

      // Prevent infinite loops in case of circular references
      if (visited.has(tagId)) {
        return new Set();
      }
      visited.add(tagId);

      const ancestors = new Set();
      const immediateParents = parentMap.get(tagId) || [];

      for (const parentId of immediateParents) {
        ancestors.add(parentId);
        // Recursively get ancestors of this parent
        const parentAncestors = getAncestors(parentId, new Set(visited));
        for (const ancestorId of parentAncestors) {
          ancestors.add(ancestorId);
        }
      }

      ancestorCache.set(tagId, ancestors);
      return ancestors;
    }

    // Build the final map: tag ID -> CSS class (if any)
    const tagColorMap = new Map();

    for (const tag of tags) {
      const ancestors = getAncestors(tag.id);

      // Check if this tag itself is one of the target parents
      // (the parent tag itself should also be colored)
      const selfId = tag.id;

      // Priority order: check Action first, then People, then Scene
      for (const [targetId, className] of Object.entries(targetParentIds)) {
        if (selfId === targetId || ancestors.has(targetId)) {
          tagColorMap.set(tag.id, className);
          break; // First match wins (priority order)
        }
      }
    }

    return tagColorMap;
  }

  /**
   * Load and cache tag ancestry data
   */
  async function ensureTagAncestryLoaded() {
    if (tagAncestryCache !== null) {
      return tagAncestryCache;
    }

    if (cacheLoading) {
      return cacheLoadPromise;
    }

    cacheLoading = true;
    cacheLoadPromise = (async () => {
      try {
        console.log("[TagColors] Loading tag hierarchy...");
        const tags = await loadAllTags();
        console.log(`[TagColors] Loaded ${tags.length} tags`);
        tagAncestryCache = buildAncestryMap(tags);
        console.log(
          `[TagColors] Built ancestry map with ${tagAncestryCache.size} colored tags`
        );
        return tagAncestryCache;
      } catch (error) {
        console.error("[TagColors] Failed to load tags:", error);
        tagAncestryCache = new Map();
        return tagAncestryCache;
      } finally {
        cacheLoading = false;
      }
    })();

    return cacheLoadPromise;
  }

  /**
   * Get the color class for a tag ID
   */
  function getTagColorClass(tagId) {
    if (tagAncestryCache === null) {
      return null;
    }
    return tagAncestryCache.get(tagId) || null;
  }

  // =========================================================================
  // Patch TagLink component to add color classes
  // =========================================================================

  PluginApi.patch.after("TagLink", function (props, _ctx, result) {
    const tag = props.tag;
    if (!tag || !tag.id) {
      return result;
    }

    // Trigger loading of tag ancestry (async, non-blocking)
    ensureTagAncestryLoaded();

    const colorClass = getTagColorClass(tag.id);
    if (!colorClass) {
      return result;
    }

    // Clone the result and add the color class
    if (result && result.props) {
      const existingClassName = result.props.className || "";
      const newClassName = `${existingClassName} ${colorClass}`.trim();

      return React.cloneElement(result, {
        className: newClassName,
      });
    }

    return result;
  });

  // =========================================================================
  // Listen for navigation events to refresh cache when needed
  // =========================================================================

  // Refresh cache when tags might have changed
  PluginApi.Event.addEventListener("stash:location", (e) => {
    const path = e.detail?.data?.location?.pathname || "";
    // Invalidate cache when visiting tag pages (user might have edited tags)
    if (path.includes("/tags/")) {
      tagAncestryCache = null;
    }
  });

  // Initial load - start loading tags immediately
  ensureTagAncestryLoaded();

  console.log("[TagColors] Plugin loaded successfully");
})();




