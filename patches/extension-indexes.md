# Extension Database Indexes

After merging from upstream, ensure the extension index system is preserved.

## New File (Won't Conflict)

`pkg/sqlite/extension_indexes.go` - This is a new file that won't exist upstream.

## Modified File: `internal/manager/init.go`

After `s.Database.Open(...)` (around line 230), add the extension index hook:

```go
if err := s.Database.Open(s.Config.GetDatabasePath()); err != nil {
    var migrationNeededErr *sqlite.MigrationNeededError
    if errors.As(err, &migrationNeededErr) {
        logger.Warn(err)
    } else {
        return err
    }
}

// ADD THESE LINES:
// Ensure extension-specific indexes exist (safe for fork/upstream compatibility)
// These are created outside the migration system to avoid version conflicts
if err := s.Database.EnsureExtensionIndexes(ctx); err != nil {
    logger.Warnf("Failed to ensure extension indexes: %v", err)
    // Don't fail startup - indexes are optimization only
}
```

## Purpose

Extension indexes are created at startup (not via migrations) to:

1. **Avoid migration conflicts** - No numbered migration file that could conflict with upstream
2. **Be idempotent** - Uses `CREATE INDEX IF NOT EXISTS`
3. **Be safe** - Index creation failure doesn't block startup
4. **Use unique prefix** - All indexes use `idx_ext_` prefix

## Indexes Created

### Scene Facet Indexes

| Index | Table | Purpose |
|-------|-------|---------|
| `idx_ext_scenes_tags_scene_tag` | scenes_tags | Tag facet optimization |
| `idx_ext_performers_scenes_scene_performer` | performers_scenes | Performer facet optimization |
| `idx_ext_groups_scenes_scene_group` | groups_scenes | Group facet optimization |
| `idx_ext_performers_tags_performer_tag` | performers_tags | Performer tags facet optimization |
| `idx_ext_video_files_facets` | video_files | Video metadata facets |
| `idx_ext_scenes_studio_not_null` | scenes | Studio facet (partial index) |
| `idx_ext_scenes_rating_not_null` | scenes | Rating facet (partial index) |

### Gallery Facet Indexes

| Index | Table | Purpose |
|-------|-------|---------|
| `idx_ext_galleries_tags_gallery_tag` | galleries_tags | Tag facet optimization |
| `idx_ext_performers_galleries_gallery_performer` | performers_galleries | Performer facet optimization |
| `idx_ext_galleries_studio_not_null` | galleries | Studio facet (partial index) |
| `idx_ext_galleries_rating_not_null` | galleries | Rating facet (partial index) |

### Group Facet Indexes

| Index | Table | Purpose |
|-------|-------|---------|
| `idx_ext_groups_tags_group_tag` | groups_tags | Tag facet optimization |

## Verification

After merge, verify:

1. `pkg/sqlite/extension_indexes.go` exists
2. `internal/manager/init.go` contains `EnsureExtensionIndexes` call
3. Build succeeds: `go build ./...`
4. On first startup, logs show: `INFO: Ensuring extension indexes exist...`

## Drop Indexes

If needed, the extension provides `DropExtensionIndexes()` to cleanly remove all fork-specific indexes.

