import { ApolloLink } from "@apollo/client";
import { getMainDefinition } from "@apollo/client/utilities";

/**
 * Apollo Link that invalidates facet cache when relevant mutations complete.
 *
 * This ensures facet counts are refreshed after data changes, not just scans.
 * Mutations are mapped to the entity types they affect.
 */

/**
 * Map of mutation operation names to the entity types they affect.
 * When a mutation completes, the corresponding entity type caches are invalidated.
 */
const MUTATION_TO_ENTITY_TYPES: Record<string, string[]> = {
  // Scene mutations affect scene facets
  SceneUpdate: ["scenes"],
  ScenesUpdate: ["scenes"],
  SceneDestroy: ["scenes"],
  ScenesDestroy: ["scenes"],
  SceneCreate: ["scenes"],
  BulkSceneUpdate: ["scenes"],
  SceneAssignFile: ["scenes"],
  SceneMerge: ["scenes"],

  // Performer mutations affect performer facets AND scene facets (performer counts in scenes)
  PerformerUpdate: ["performers", "scenes", "galleries"],
  PerformersDestroy: ["performers", "scenes", "galleries"],
  PerformerCreate: ["performers"],
  BulkPerformerUpdate: ["performers", "scenes", "galleries"],
  PerformersMerge: ["performers", "scenes", "galleries"],

  // Tag mutations affect tag facets AND all entity types that use tags
  TagUpdate: ["tags", "scenes", "performers", "galleries", "groups", "studios"],
  TagDestroy: ["tags", "scenes", "performers", "galleries", "groups", "studios"],
  TagCreate: ["tags"],
  TagsMerge: ["tags", "scenes", "performers", "galleries", "groups", "studios"],

  // Studio mutations affect studio facets AND scene/gallery facets
  StudioUpdate: ["studios", "scenes", "galleries", "groups"],
  StudioDestroy: ["studios", "scenes", "galleries", "groups"],
  StudioCreate: ["studios"],
  StudiosMerge: ["studios", "scenes", "galleries", "groups"],

  // Group mutations affect group facets AND scene facets
  GroupUpdate: ["groups", "scenes"],
  GroupDestroy: ["groups", "scenes"],
  GroupCreate: ["groups"],
  BulkGroupUpdate: ["groups", "scenes"],

  // Gallery mutations affect gallery facets
  GalleryUpdate: ["galleries"],
  GalleryDestroy: ["galleries"],
  GalleryCreate: ["galleries"],
  BulkGalleryUpdate: ["galleries"],
  AddGalleryImages: ["galleries"],
  RemoveGalleryImages: ["galleries"],
};

/**
 * Invalidate facet cache for given entity types.
 * Uses dynamic import to avoid circular dependencies.
 */
async function invalidateForMutation(entityTypes: string[]): Promise<void> {
  try {
    const { invalidateFacetCache } = await import("./useFacetCounts");
    for (const entityType of entityTypes) {
      invalidateFacetCache(entityType);
    }
  } catch {
    // Extension may not be available, ignore
  }
}

/**
 * Creates an Apollo Link that invalidates facet cache after relevant mutations.
 */
export function createFacetCacheLink(): ApolloLink {
  return new ApolloLink((operation, forward) => {
    const definition = getMainDefinition(operation.query);

    // Only process mutations
    if (
      definition.kind !== "OperationDefinition" ||
      definition.operation !== "mutation"
    ) {
      return forward(operation);
    }

    const operationName = operation.operationName;
    const affectedTypes = MUTATION_TO_ENTITY_TYPES[operationName];

    // If this mutation doesn't affect any facets, pass through
    if (!affectedTypes) {
      return forward(operation);
    }

    // Forward the operation and invalidate cache on success
    return forward(operation).map((response) => {
      // Only invalidate if mutation succeeded (no errors)
      if (!response.errors || response.errors.length === 0) {
        // Invalidate asynchronously to not block the response
        invalidateForMutation(affectedTypes);
      }
      return response;
    });
  });
}
