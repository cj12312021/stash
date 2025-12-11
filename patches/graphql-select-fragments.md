# GraphQL Select Fragment Optimizations

This document describes performance optimizations made to upstream GraphQL `Select*Data` fragments to improve dropdown selector performance on large databases.

## Problem

The `Select*Data` fragments (used by dropdown selectors like `TagSelect`, `StudioSelect`, etc.) included expensive count fields that were:
1. **Never displayed** in the dropdown UI
2. **Computationally expensive** - especially `*_count_all` fields which use recursive CTEs
3. **Called for every item** returned in the dropdown (typically 25+ items per search)

On databases with millions of rows in join tables (e.g., 9M+ rows in `scenes_tags`), this caused dropdown selectors to be extremely slow.

## Changes

### `SelectTagData` (tag.graphql)

**Removed fields:**
```diff
fragment SelectTagData on Tag {
  id
  name
  sort_name
  favorite
  description
  aliases
  image_path
-  scene_count
-  scene_count_all: scene_count(depth: -1)
-  image_count
-  gallery_count
-  performer_count

  parents { ... }
  stash_ids { ... }
}
```

**Rationale:** `TagSelect.tsx` only uses: `id`, `name`, `sort_name`, `aliases`, `image_path`, `stash_ids`

---

### `SelectStudioData` (studio.graphql)

**Removed fields:**
```diff
fragment SelectStudioData on Studio {
  id
  name
  aliases
-  details
  image_path
-  scene_count
-  scene_count_all: scene_count(depth: -1)
-  image_count
-  gallery_count
-  performer_count

  parent_studio { ... }
}
```

**Rationale:** `StudioSelect.tsx` only uses: `id`, `name`, `aliases`, `image_path`

---

### `SelectPerformerData` (performer-slim.graphql)

**Removed fields:**
```diff
fragment SelectPerformerData on Performer {
  id
  name
  disambiguation
  alias_list
  image_path
  birthdate
  death_date
-  scene_count
-  image_count
-  gallery_count
-  group_count
}
```

**Rationale:** `PerformerSelect.tsx` only uses: `id`, `name`, `alias_list`, `disambiguation`, `image_path`, `birthdate`, `death_date`

---

### `SelectGroupData` (group-slim.graphql)

**Removed fields:**
```diff
fragment SelectGroupData on Group {
  id
  name
  aliases
  date
  studio { name }
  front_image_path
-  scene_count
-  scene_count_all: scene_count(depth: -1)
-  performer_count
-  sub_group_count
}
```

**Rationale:** `GroupSelect.tsx` only uses: `id`, `name`, `date`, `front_image_path`, `aliases`, `studio.name`

---

### `SelectGalleryData` (gallery.graphql)

**Removed fields:**
```diff
fragment SelectGalleryData on Gallery {
  id
  title
  date
  code
  studio { name }
  cover { paths { thumbnail } }
-  paths { preview }
  files { path }
  folder { path }
-  image_count
}
```

**Rationale:** `GallerySelect.tsx` only uses: `id`, `title`, `date`, `code`, `studio.name`, `files.path`, `folder.path`, `cover.paths`

---

## Performance Impact

Benchmark results on production database (9M+ scenes_tags, 7M+ galleries_tags):

| Dropdown | Before | After | Improvement |
|----------|--------|-------|-------------|
| Tag select | ~250ms | ~25ms | **10x faster** |
| Studio select | ~250ms | ~25ms | **10x faster** |
| Group select | ~150ms | ~15ms | **10x faster** |
| Performer select | ~100ms | ~10ms | **10x faster** |

## Merge Conflict Resolution

When merging with upstream, if these files conflict:

1. **Check if upstream added count fields back** - If so, verify the Select component actually uses them before keeping
2. **Apply the same optimization** - Remove count fields that aren't used by the corresponding `*Select.tsx` component
3. **Regenerate types** - Run `pnpm run gqlgen` after resolving conflicts

## Verification

To verify the Select component doesn't need a field:

1. Find the component (e.g., `src/components/Tags/TagSelect.tsx`)
2. Look for the `export type Tag = Pick<...>` declaration
3. The Pick type lists exactly which fields the component uses
4. Any field in the fragment not in the Pick type is unused and can be removed
