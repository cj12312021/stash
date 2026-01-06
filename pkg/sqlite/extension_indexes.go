package sqlite

import (
	"context"
	"fmt"

	"github.com/stashapp/stash/pkg/logger"
)

// ExtensionIndexes defines indexes added by the extension system.
// These are created outside the migration system to avoid conflicts
// with upstream schema version numbering.
//
// All indexes use IF NOT EXISTS to be idempotent and safe to run
// multiple times.
var extensionIndexes = []string{
	// ==========================================================================
	// Facet Query Optimization Indexes
	// ==========================================================================
	// These indexes optimize the faceted search aggregation queries used by
	// the sidebar filter UI. They are composite indexes that enable index-only
	// scans for count aggregations.

	// scenes_tags: Composite index for tag facet counts
	// Covers: SELECT tag_id, COUNT(scene_id) FROM scenes_tags WHERE scene_id IN (...) GROUP BY tag_id
	`CREATE INDEX IF NOT EXISTS idx_ext_scenes_tags_scene_tag ON scenes_tags (scene_id, tag_id)`,

	// performers_scenes: Composite index for performer facet counts
	// Covers: SELECT performer_id, COUNT(scene_id) FROM performers_scenes WHERE scene_id IN (...) GROUP BY performer_id
	`CREATE INDEX IF NOT EXISTS idx_ext_performers_scenes_scene_performer ON performers_scenes (scene_id, performer_id)`,

	// groups_scenes: Composite index for group facet counts
	// Covers: SELECT group_id, COUNT(scene_id) FROM groups_scenes WHERE scene_id IN (...) GROUP BY group_id
	`CREATE INDEX IF NOT EXISTS idx_ext_groups_scenes_scene_group ON groups_scenes (scene_id, group_id)`,

	// performers_tags: Composite index for performer_tags facet (3-way join optimization)
	// Covers the expensive performer_tags facet query that joins:
	// performers_scenes -> performers_tags -> tags
	`CREATE INDEX IF NOT EXISTS idx_ext_performers_tags_performer_tag ON performers_tags (performer_id, tag_id)`,

	// video_files: Covering index for resolution, orientation, and interactive facets
	// Enables index-only scan for video metadata aggregations
	`CREATE INDEX IF NOT EXISTS idx_ext_video_files_facets ON video_files (file_id, height, width, interactive)`,

	// scenes: Partial index for studio facet (only scenes with studios)
	// Optimizes: SELECT studio_id, COUNT(*) FROM scenes WHERE studio_id IS NOT NULL GROUP BY studio_id
	`CREATE INDEX IF NOT EXISTS idx_ext_scenes_studio_not_null ON scenes (studio_id) WHERE studio_id IS NOT NULL`,

	// scenes: Partial index for rating facet (only scenes with ratings)
	// Optimizes: SELECT rating, COUNT(*) FROM scenes WHERE rating IS NOT NULL GROUP BY rating
	`CREATE INDEX IF NOT EXISTS idx_ext_scenes_rating_not_null ON scenes (rating) WHERE rating IS NOT NULL`,

	// ==========================================================================
	// Gallery Facet Optimization Indexes
	// ==========================================================================

	// galleries_tags: Composite index for tag facet counts
	// Covers: SELECT tag_id, COUNT(gallery_id) FROM galleries_tags WHERE gallery_id IN (...) GROUP BY tag_id
	`CREATE INDEX IF NOT EXISTS idx_ext_galleries_tags_gallery_tag ON galleries_tags (gallery_id, tag_id)`,

	// performers_galleries: Composite index for performer facet counts
	// Covers: SELECT performer_id, COUNT(gallery_id) FROM performers_galleries WHERE gallery_id IN (...) GROUP BY performer_id
	`CREATE INDEX IF NOT EXISTS idx_ext_performers_galleries_gallery_performer ON performers_galleries (gallery_id, performer_id)`,

	// galleries: Partial index for studio facet (only galleries with studios)
	// Optimizes: SELECT studio_id, COUNT(*) FROM galleries WHERE studio_id IS NOT NULL GROUP BY studio_id
	`CREATE INDEX IF NOT EXISTS idx_ext_galleries_studio_not_null ON galleries (studio_id) WHERE studio_id IS NOT NULL`,

	// galleries: Partial index for rating facet (only galleries with ratings)
	// Optimizes: SELECT rating, COUNT(*) FROM galleries WHERE rating IS NOT NULL GROUP BY rating
	`CREATE INDEX IF NOT EXISTS idx_ext_galleries_rating_not_null ON galleries (rating) WHERE rating IS NOT NULL`,

	// ==========================================================================
	// Group Facet Optimization Indexes
	// ==========================================================================

	// groups_tags: Composite index for tag facet counts
	// Covers: SELECT tag_id, COUNT(group_id) FROM groups_tags WHERE group_id IN (...) GROUP BY tag_id
	`CREATE INDEX IF NOT EXISTS idx_ext_groups_tags_group_tag ON groups_tags (group_id, tag_id)`,

	// ==========================================================================
	// Boolean Facet Optimization Indexes
	// ==========================================================================
	// These indexes optimize the has_markers, has_chapters, and performer_favorite
	// facets which use LEFT JOIN patterns.

	// scene_markers: Index for has_markers facet
	// Covers: SELECT DISTINCT scene_id FROM scene_markers
	`CREATE INDEX IF NOT EXISTS idx_ext_scene_markers_scene ON scene_markers (scene_id)`,

	// galleries_chapters: Index for has_chapters facet
	// Covers: SELECT DISTINCT gallery_id FROM galleries_chapters
	`CREATE INDEX IF NOT EXISTS idx_ext_galleries_chapters_gallery ON galleries_chapters (gallery_id)`,

	// ==========================================================================
	// Caption and Video Metadata Optimization Indexes
	// ==========================================================================

	// video_captions: Index for captions facet
	// Covers: SELECT DISTINCT language_code FROM video_captions WHERE file_id IN (...)
	`CREATE INDEX IF NOT EXISTS idx_ext_video_captions_file ON video_captions (file_id)`,

	// scenes_files: Composite index for primary file lookups in video metadata facets
	// Covers: SELECT file_id FROM scenes_files WHERE scene_id = ? AND "primary" = 1
	`CREATE INDEX IF NOT EXISTS idx_ext_scenes_files_scene_primary ON scenes_files (scene_id, "primary")`,

	// ==========================================================================
	// Tag Hierarchy Optimization Indexes
	// ==========================================================================

	// tags_relations: Indexes for tag parent/child facets
	// Covers: SELECT parent_id, COUNT(*) FROM tags_relations GROUP BY parent_id
	`CREATE INDEX IF NOT EXISTS idx_ext_tags_relations_parent ON tags_relations (parent_id)`,
	`CREATE INDEX IF NOT EXISTS idx_ext_tags_relations_child ON tags_relations (child_id)`,

	// ==========================================================================
	// Group Performers Optimization Index
	// ==========================================================================

	// groups_scenes: Index for group performers facet (reverse direction from existing)
	// Covers: SELECT scene_id FROM groups_scenes WHERE group_id = ?
	`CREATE INDEX IF NOT EXISTS idx_ext_groups_scenes_scene ON groups_scenes (scene_id)`,
}

// EnsureExtensionIndexes creates all extension-specific database indexes.
// This function is idempotent and safe to call multiple times.
//
// It should be called after the database is opened and migrations are complete.
// These indexes are created outside the migration system to avoid conflicts
// with upstream stash schema version numbering.
func (db *Database) EnsureExtensionIndexes(ctx context.Context) error {
	logger.Info("Ensuring extension indexes exist...")

	conn := db.writeDB
	if conn == nil {
		return fmt.Errorf("database write connection not available")
	}

	created := 0
	for _, indexSQL := range extensionIndexes {
		result, err := conn.ExecContext(ctx, indexSQL)
		if err != nil {
			// Log error but continue - don't fail startup for index creation issues
			logger.Warnf("Failed to create extension index: %v", err)
			continue
		}

		// SQLite doesn't give us a way to know if the index was created or already existed,
		// but we can log that we attempted it
		_ = result
		created++
	}

	logger.Infof("Extension indexes verified (%d indexes)", created)
	return nil
}

// DropExtensionIndexes removes all extension-specific indexes.
// This can be used if you need to cleanly remove extension modifications.
func (db *Database) DropExtensionIndexes(ctx context.Context) error {
	logger.Info("Dropping extension indexes...")

	conn := db.writeDB
	if conn == nil {
		return fmt.Errorf("database write connection not available")
	}

	dropStatements := []string{
		// Scene indexes
		`DROP INDEX IF EXISTS idx_ext_scenes_tags_scene_tag`,
		`DROP INDEX IF EXISTS idx_ext_performers_scenes_scene_performer`,
		`DROP INDEX IF EXISTS idx_ext_groups_scenes_scene_group`,
		`DROP INDEX IF EXISTS idx_ext_performers_tags_performer_tag`,
		`DROP INDEX IF EXISTS idx_ext_video_files_facets`,
		`DROP INDEX IF EXISTS idx_ext_scenes_studio_not_null`,
		`DROP INDEX IF EXISTS idx_ext_scenes_rating_not_null`,
		// Gallery indexes
		`DROP INDEX IF EXISTS idx_ext_galleries_tags_gallery_tag`,
		`DROP INDEX IF EXISTS idx_ext_performers_galleries_gallery_performer`,
		`DROP INDEX IF EXISTS idx_ext_galleries_studio_not_null`,
		`DROP INDEX IF EXISTS idx_ext_galleries_rating_not_null`,
		// Group indexes
		`DROP INDEX IF EXISTS idx_ext_groups_tags_group_tag`,
		// Boolean facet indexes
		`DROP INDEX IF EXISTS idx_ext_scene_markers_scene`,
		`DROP INDEX IF EXISTS idx_ext_galleries_chapters_gallery`,
		// Caption and video metadata indexes
		`DROP INDEX IF EXISTS idx_ext_video_captions_file`,
		`DROP INDEX IF EXISTS idx_ext_scenes_files_scene_primary`,
		// Tag hierarchy indexes
		`DROP INDEX IF EXISTS idx_ext_tags_relations_parent`,
		`DROP INDEX IF EXISTS idx_ext_tags_relations_child`,
		// Group performers index
		`DROP INDEX IF EXISTS idx_ext_groups_scenes_scene`,
	}

	for _, sql := range dropStatements {
		if _, err := conn.ExecContext(ctx, sql); err != nil {
			logger.Warnf("Failed to drop extension index: %v", err)
		}
	}

	logger.Info("Extension indexes dropped")
	return nil
}
