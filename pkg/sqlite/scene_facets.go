package sqlite

import (
	"context"
	stdsql "database/sql"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/stashapp/stash/pkg/models"
)

// isEmptyFilter checks if the scene filter has any criteria that would filter results
func isEmptyFilter(filter *models.SceneFilterType) bool {
	if filter == nil {
		return true
	}
	// Check if any filter criteria are set
	// This is a simplified check - add more fields as needed
	return filter.Title == nil &&
		filter.Code == nil &&
		filter.Details == nil &&
		filter.Director == nil &&
		filter.Path == nil &&
		filter.Checksum == nil &&
		filter.Phash == nil &&
		filter.PhashDistance == nil &&
		filter.Oshash == nil &&
		filter.Rating100 == nil &&
		filter.OCounter == nil &&
		filter.PlayCount == nil &&
		filter.PlayDuration == nil &&
		filter.Organized == nil &&
		filter.Duplicated == nil &&
		filter.Resolution == nil &&
		filter.Orientation == nil &&
		filter.HasMarkers == nil &&
		filter.IsMissing == nil &&
		filter.StudiosFilter == nil &&
		filter.Studios == nil &&
		filter.Groups == nil &&
		filter.Tags == nil &&
		filter.PerformerTags == nil &&
		filter.Performers == nil &&
		filter.Galleries == nil &&
		filter.PerformerCount == nil &&
		filter.TagCount == nil &&
		filter.PerformerAge == nil &&
		filter.PerformerFavorite == nil &&
		filter.Interactive == nil &&
		filter.InteractiveSpeed == nil &&
		filter.Captions == nil &&
		filter.ResumeTime == nil &&
		filter.URL == nil &&
		filter.StashID == nil &&
		filter.StashIDEndpoint == nil &&
		filter.Date == nil &&
		filter.CreatedAt == nil &&
		filter.UpdatedAt == nil &&
		filter.And == nil &&
		filter.Or == nil &&
		filter.Not == nil
}

// GetFacets returns aggregated facet counts for scenes matching the given filter.
// All facets run in parallel goroutines for optimal performance.
// When no filter is applied, uses optimized "fast path" queries that skip the CTE.
func (qb *SceneStore) GetFacets(ctx context.Context, sceneFilter *models.SceneFilterType, limit int) (*models.SceneFacets, error) {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	result := &models.SceneFacets{
		Tags:              []models.FacetCount{},
		Performers:        []models.FacetCount{},
		Studios:           []models.FacetCount{},
		Groups:            []models.FacetCount{},
		PerformerTags:     []models.FacetCount{},
		Resolutions:       []models.ResolutionFacetCount{},
		Orientations:      []models.OrientationFacetCount{},
		Organized:         []models.BooleanFacetCount{},
		Interactive:       []models.BooleanFacetCount{},
		HasMarkers:        []models.BooleanFacetCount{},
		PerformerFavorite: []models.BooleanFacetCount{},
		Ratings:           []models.RatingFacetCount{},
		Captions:          []models.CaptionFacetCount{},
	}

	// Fast path: When no filter is applied, use optimized direct queries
	// This avoids the expensive CTE that would scan all 700k+ scenes
	if isEmptyFilter(sceneFilter) {
		return qb.getFacetsUnfiltered(ctx, limit, result)
	}

	query, err := qb.makeQuery(ctx, sceneFilter, nil)
	if err != nil {
		return nil, err
	}

	baseSQL := query.toSQL(false)
	baseArgs := append([]interface{}{}, query.args...)

	var wg sync.WaitGroup
	var mu sync.Mutex
	errChan := make(chan error, 10) // 10 parallel goroutines

	// All facets run in parallel - no lazy loading
	// Wall-clock time = slowest query, not sum of queries

	// Entity facets (separate queries for parallelism)
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getTagsFacet(ctx, baseSQL, baseArgs, limit, result, &mu); err != nil {
			errChan <- fmt.Errorf("tags facet: %w", err)
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getPerformersFacet(ctx, baseSQL, baseArgs, limit, result, &mu); err != nil {
			errChan <- fmt.Errorf("performers facet: %w", err)
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getStudiosFacet(ctx, baseSQL, baseArgs, limit, result, &mu); err != nil {
			errChan <- fmt.Errorf("studios facet: %w", err)
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getGroupsFacet(ctx, baseSQL, baseArgs, limit, result, &mu); err != nil {
			errChan <- fmt.Errorf("groups facet: %w", err)
		}
	}()

	// Video metadata facets (resolution, orientation, interactive)
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getVideoFacets(ctx, baseSQL, baseArgs, result, &mu); err != nil {
			errChan <- fmt.Errorf("video facets: %w", err)
		}
	}()

	// Simple facets (organized, rating) - fast, direct from scenes table
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getSimpleFacets(ctx, baseSQL, baseArgs, result, &mu); err != nil {
			errChan <- fmt.Errorf("simple facets: %w", err)
		}
	}()

	// Performer tags - always included now (no lazy loading)
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getPerformerTagsFacet(ctx, baseSQL, baseArgs, limit, result, &mu); err != nil {
			errChan <- fmt.Errorf("performer_tags facet: %w", err)
		}
	}()

	// Captions - always included now (no lazy loading)
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getCaptionsFacet(ctx, baseSQL, baseArgs, result, &mu); err != nil {
			errChan <- fmt.Errorf("captions facet: %w", err)
		}
	}()

	// Has markers facet
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getHasMarkersFacet(ctx, baseSQL, baseArgs, result, &mu); err != nil {
			errChan <- fmt.Errorf("has_markers facet: %w", err)
		}
	}()

	// Performer favorite facet
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getPerformerFavoriteFacet(ctx, baseSQL, baseArgs, result, &mu); err != nil {
			errChan <- fmt.Errorf("performer_favorite facet: %w", err)
		}
	}()

	wg.Wait()
	close(errChan)

	// Return first error if any
	for err := range errChan {
		if err != nil {
			return nil, err
		}
	}

	return result, nil
}

// getFacetsUnfiltered uses optimized queries when no filter is applied.
// These queries are 10-100x faster because they:
// 1. Skip the CTE overhead (no need to materialize 700k scene IDs)
// 2. Use simple COUNT(*) on junction tables
// 3. Let SQLite's query optimizer work more efficiently
func (qb *SceneStore) getFacetsUnfiltered(ctx context.Context, limit int, result *models.SceneFacets) (*models.SceneFacets, error) {
	var wg sync.WaitGroup
	var mu sync.Mutex
	errChan := make(chan error, 10)

	// Tags - direct count on scenes_tags
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT t.id, t.name as label, COUNT(*) as count
			FROM scenes_tags st
			INNER JOIN tags t ON st.tag_id = t.id
			GROUP BY t.id
			ORDER BY count DESC
			LIMIT ?
		`, limit)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered tags facet: %w", err)
			return
		}
		defer rows.Close()

		var tags []models.FacetCount
		for rows.Next() {
			var id int
			var label string
			var count int
			if err := rows.Scan(&id, &label, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered tag: %w", err)
				return
			}
			tags = append(tags, models.FacetCount{ID: strconv.Itoa(id), Label: label, Count: count})
		}
		mu.Lock()
		result.Tags = tags
		mu.Unlock()
	}()

	// Performers - direct count on performers_scenes
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT p.id, p.name as label, COUNT(*) as count
			FROM performers_scenes ps
			INNER JOIN performers p ON ps.performer_id = p.id
			GROUP BY p.id
			ORDER BY count DESC
			LIMIT ?
		`, limit)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered performers facet: %w", err)
			return
		}
		defer rows.Close()

		var performers []models.FacetCount
		for rows.Next() {
			var id int
			var label string
			var count int
			if err := rows.Scan(&id, &label, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered performer: %w", err)
				return
			}
			performers = append(performers, models.FacetCount{ID: strconv.Itoa(id), Label: label, Count: count})
		}
		mu.Lock()
		result.Performers = performers
		mu.Unlock()
	}()

	// Studios - direct count on scenes
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT s.id, s.name as label, COUNT(*) as count
			FROM scenes sc
			INNER JOIN studios s ON sc.studio_id = s.id
			WHERE sc.studio_id IS NOT NULL
			GROUP BY s.id
			ORDER BY count DESC
			LIMIT ?
		`, limit)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered studios facet: %w", err)
			return
		}
		defer rows.Close()

		var studios []models.FacetCount
		for rows.Next() {
			var id int
			var label string
			var count int
			if err := rows.Scan(&id, &label, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered studio: %w", err)
				return
			}
			studios = append(studios, models.FacetCount{ID: strconv.Itoa(id), Label: label, Count: count})
		}
		mu.Lock()
		result.Studios = studios
		mu.Unlock()
	}()

	// Groups - direct count on groups_scenes
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT g.id, g.name as label, COUNT(*) as count
			FROM groups_scenes gs
			INNER JOIN groups g ON gs.group_id = g.id
			GROUP BY g.id
			ORDER BY count DESC
			LIMIT ?
		`, limit)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered groups facet: %w", err)
			return
		}
		defer rows.Close()

		var groups []models.FacetCount
		for rows.Next() {
			var id int
			var label string
			var count int
			if err := rows.Scan(&id, &label, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered group: %w", err)
				return
			}
			groups = append(groups, models.FacetCount{ID: strconv.Itoa(id), Label: label, Count: count})
		}
		mu.Lock()
		result.Groups = groups
		mu.Unlock()
	}()

	// Performer Tags - this is still expensive (3-way join) but optimized
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT t.id, t.name as label, COUNT(DISTINCT ps.scene_id) as count
			FROM performers_scenes ps
			INNER JOIN performers_tags pt ON ps.performer_id = pt.performer_id
			INNER JOIN tags t ON pt.tag_id = t.id
			GROUP BY t.id
			ORDER BY count DESC
			LIMIT ?
		`, limit)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered performer_tags facet: %w", err)
			return
		}
		defer rows.Close()

		var performerTags []models.FacetCount
		for rows.Next() {
			var id int
			var label string
			var count int
			if err := rows.Scan(&id, &label, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered performer_tag: %w", err)
				return
			}
			performerTags = append(performerTags, models.FacetCount{ID: strconv.Itoa(id), Label: label, Count: count})
		}
		mu.Lock()
		result.PerformerTags = performerTags
		mu.Unlock()
	}()

	// Video metadata facets (resolution, orientation, interactive)
	wg.Add(1)
	go func() {
		defer wg.Done()
		// Resolutions
		resRows, err := dbWrapper.Queryx(ctx, `
			SELECT 
				CASE 
					WHEN vf.height >= 2160 THEN 'FOUR_K'
					WHEN vf.height >= 1440 THEN 'QUAD_HD'
					WHEN vf.height >= 1080 THEN 'FULL_HD'
					WHEN vf.height >= 720 THEN 'STANDARD_HD'
					WHEN vf.height >= 540 THEN 'WEB_HD'
					WHEN vf.height >= 480 THEN 'STANDARD'
					WHEN vf.height >= 360 THEN 'LOW'
					WHEN vf.height >= 240 THEN 'VERY_LOW'
					ELSE 'VERY_LOW'
				END as resolution,
				COUNT(*) as count
			FROM scenes_files sf
			INNER JOIN video_files vf ON sf.file_id = vf.file_id
			WHERE sf."primary" = 1
			GROUP BY resolution
			ORDER BY count DESC
		`)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered resolutions facet: %w", err)
			return
		}
		defer resRows.Close()

		var resolutions []models.ResolutionFacetCount
		for resRows.Next() {
			var resolution string
			var count int
			if err := resRows.Scan(&resolution, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered resolution: %w", err)
				return
			}
			resolutions = append(resolutions, models.ResolutionFacetCount{
				Resolution: models.ResolutionEnum(resolution),
				Count:      count,
			})
		}

		// Orientations
		orientRows, err := dbWrapper.Queryx(ctx, `
			SELECT 
				CASE 
					WHEN vf.width > vf.height THEN 'LANDSCAPE'
					WHEN vf.width < vf.height THEN 'PORTRAIT'
					ELSE 'SQUARE'
				END as orientation,
				COUNT(*) as count
			FROM scenes_files sf
			INNER JOIN video_files vf ON sf.file_id = vf.file_id
			WHERE sf."primary" = 1
			GROUP BY orientation
		`)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered orientations facet: %w", err)
			return
		}
		defer orientRows.Close()

		var orientations []models.OrientationFacetCount
		for orientRows.Next() {
			var orientation string
			var count int
			if err := orientRows.Scan(&orientation, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered orientation: %w", err)
				return
			}
			orientations = append(orientations, models.OrientationFacetCount{
				Orientation: models.OrientationEnum(orientation),
				Count:       count,
			})
		}

		// Interactive
		interRows, err := dbWrapper.Queryx(ctx, `
			SELECT vf.interactive, COUNT(*) as count
			FROM scenes_files sf
			INNER JOIN video_files vf ON sf.file_id = vf.file_id
			WHERE sf."primary" = 1
			GROUP BY vf.interactive
		`)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered interactive facet: %w", err)
			return
		}
		defer interRows.Close()

		var interactive []models.BooleanFacetCount
		for interRows.Next() {
			var value bool
			var count int
			if err := interRows.Scan(&value, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered interactive: %w", err)
				return
			}
			interactive = append(interactive, models.BooleanFacetCount{Value: value, Count: count})
		}

		mu.Lock()
		result.Resolutions = resolutions
		result.Orientations = orientations
		result.Interactive = interactive
		mu.Unlock()
	}()

	// Simple facets (organized, rating)
	wg.Add(1)
	go func() {
		defer wg.Done()
		// Organized
		orgRows, err := dbWrapper.Queryx(ctx, `
			SELECT organized, COUNT(*) as count
			FROM scenes
			GROUP BY organized
		`)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered organized facet: %w", err)
			return
		}
		defer orgRows.Close()

		var organized []models.BooleanFacetCount
		for orgRows.Next() {
			var value bool
			var count int
			if err := orgRows.Scan(&value, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered organized: %w", err)
				return
			}
			organized = append(organized, models.BooleanFacetCount{Value: value, Count: count})
		}

		// Ratings
		ratingRows, err := dbWrapper.Queryx(ctx, `
			SELECT rating, COUNT(*) as count
			FROM scenes
			WHERE rating IS NOT NULL
			GROUP BY rating
			ORDER BY rating DESC
		`)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered ratings facet: %w", err)
			return
		}
		defer ratingRows.Close()

		var ratings []models.RatingFacetCount
		for ratingRows.Next() {
			var rating int
			var count int
			if err := ratingRows.Scan(&rating, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered rating: %w", err)
				return
			}
			ratings = append(ratings, models.RatingFacetCount{Rating: rating, Count: count})
		}

		mu.Lock()
		result.Organized = organized
		result.Ratings = ratings
		mu.Unlock()
	}()

	// Captions
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT vc.language_code, COUNT(DISTINCT sf.scene_id) as count
			FROM scenes_files sf
			INNER JOIN video_captions vc ON sf.file_id = vc.file_id
			WHERE sf."primary" = 1 AND vc.language_code IS NOT NULL AND vc.language_code != ''
			GROUP BY vc.language_code
			ORDER BY count DESC
		`)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered captions facet: %w", err)
			return
		}
		defer rows.Close()

		var captions []models.CaptionFacetCount
		for rows.Next() {
			var language string
			var count int
			if err := rows.Scan(&language, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered caption: %w", err)
				return
			}
			captions = append(captions, models.CaptionFacetCount{Language: language, Count: count})
		}
		mu.Lock()
		result.Captions = captions
		mu.Unlock()
	}()

	// Has Markers - count scenes with/without markers
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT 
				CASE WHEN EXISTS (SELECT 1 FROM scene_markers sm WHERE sm.scene_id = s.id) 
					THEN 'true' ELSE 'false' END as has_markers,
				COUNT(*) as count
			FROM scenes s
			GROUP BY has_markers
		`)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered has_markers facet: %w", err)
			return
		}
		defer rows.Close()

		var hasMarkers []models.BooleanFacetCount
		for rows.Next() {
			var value string
			var count int
			if err := rows.Scan(&value, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered has_markers: %w", err)
				return
			}
			hasMarkers = append(hasMarkers, models.BooleanFacetCount{Value: value == "true", Count: count})
		}
		mu.Lock()
		result.HasMarkers = hasMarkers
		mu.Unlock()
	}()

	// Performer Favorite - count scenes with/without favorite performers
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT 
				CASE WHEN EXISTS (
					SELECT 1 FROM performers_scenes ps 
					INNER JOIN performers p ON ps.performer_id = p.id
					WHERE ps.scene_id = s.id AND p.favorite = 1
				) THEN 'true' ELSE 'false' END as performer_favorite,
				COUNT(*) as count
			FROM scenes s
			GROUP BY performer_favorite
		`)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered performer_favorite facet: %w", err)
			return
		}
		defer rows.Close()

		var performerFavorite []models.BooleanFacetCount
		for rows.Next() {
			var value string
			var count int
			if err := rows.Scan(&value, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered performer_favorite: %w", err)
				return
			}
			performerFavorite = append(performerFavorite, models.BooleanFacetCount{Value: value == "true", Count: count})
		}
		mu.Lock()
		result.PerformerFavorite = performerFavorite
		mu.Unlock()
	}()

	wg.Wait()
	close(errChan)

	for err := range errChan {
		if err != nil {
			return nil, err
		}
	}

	return result, nil
}

// getTagsFacet fetches tag counts
// Uses IN subquery instead of CTE for 5x better performance on large datasets.
// This leverages the idx_ext_scenes_tags_scene_tag index.
func (qb *SceneStore) getTagsFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, limit int, result *models.SceneFacets, mu *sync.Mutex) error {
	args := append([]interface{}{}, baseArgs...)
	args = append(args, limit)

	sql := fmt.Sprintf(`
		SELECT t.id, t.name as label, COUNT(DISTINCT st.scene_id) as count
		FROM scenes_tags st
		INNER JOIN tags t ON st.tag_id = t.id
		WHERE st.scene_id IN (%s)
		GROUP BY t.id
		ORDER BY count DESC
		LIMIT ?
	`, baseSQL)

	rows, err := dbWrapper.Queryx(ctx, sql, args...)
	if err != nil {
		return fmt.Errorf("error executing tags facet query: %w", err)
	}
	defer rows.Close()

	var tags []models.FacetCount
	for rows.Next() {
		var id int
		var label string
		var count int

		if err := rows.Scan(&id, &label, &count); err != nil {
			return fmt.Errorf("error scanning tag row: %w", err)
		}

		tags = append(tags, models.FacetCount{
			ID:    strconv.Itoa(id),
			Label: label,
			Count: count,
		})
	}

	mu.Lock()
	result.Tags = tags
	mu.Unlock()

	return rows.Err()
}

// getPerformersFacet fetches performer counts
// Uses IN subquery instead of CTE for better performance on large datasets.
// This leverages the idx_ext_performers_scenes_scene_performer index.
func (qb *SceneStore) getPerformersFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, limit int, result *models.SceneFacets, mu *sync.Mutex) error {
	args := append([]interface{}{}, baseArgs...)
	args = append(args, limit)

	sql := fmt.Sprintf(`
		SELECT p.id, p.name as label, COUNT(DISTINCT ps.scene_id) as count
		FROM performers_scenes ps
		INNER JOIN performers p ON ps.performer_id = p.id
		WHERE ps.scene_id IN (%s)
		GROUP BY p.id
		ORDER BY count DESC
		LIMIT ?
	`, baseSQL)

	rows, err := dbWrapper.Queryx(ctx, sql, args...)
	if err != nil {
		return fmt.Errorf("error executing performers facet query: %w", err)
	}
	defer rows.Close()

	var performers []models.FacetCount
	for rows.Next() {
		var id int
		var label string
		var count int

		if err := rows.Scan(&id, &label, &count); err != nil {
			return fmt.Errorf("error scanning performer row: %w", err)
		}

		performers = append(performers, models.FacetCount{
			ID:    strconv.Itoa(id),
			Label: label,
			Count: count,
		})
	}

	mu.Lock()
	result.Performers = performers
	mu.Unlock()

	return rows.Err()
}

// getStudiosFacet fetches studio counts
func (qb *SceneStore) getStudiosFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, limit int, result *models.SceneFacets, mu *sync.Mutex) error {
	args := append([]interface{}{}, baseArgs...)
	args = append(args, limit)

	sql := fmt.Sprintf(`
		WITH filtered_scenes AS (%s)
		SELECT s.id, s.name as label, COUNT(DISTINCT sc.id) as count
		FROM filtered_scenes fs
		INNER JOIN scenes sc ON fs.id = sc.id
		INNER JOIN studios s ON sc.studio_id = s.id
		WHERE sc.studio_id IS NOT NULL
		GROUP BY s.id
		ORDER BY count DESC
		LIMIT ?
	`, baseSQL)

	rows, err := dbWrapper.Queryx(ctx, sql, args...)
	if err != nil {
		return fmt.Errorf("error executing studios facet query: %w", err)
	}
	defer rows.Close()

	var studios []models.FacetCount
	for rows.Next() {
		var id int
		var label string
		var count int

		if err := rows.Scan(&id, &label, &count); err != nil {
			return fmt.Errorf("error scanning studio row: %w", err)
		}

		studios = append(studios, models.FacetCount{
			ID:    strconv.Itoa(id),
			Label: label,
			Count: count,
		})
	}

	mu.Lock()
	result.Studios = studios
	mu.Unlock()

	return rows.Err()
}

// getGroupsFacet fetches group counts
// Uses IN subquery instead of CTE for better performance on large datasets.
// This leverages the idx_ext_groups_scenes_scene_group index.
func (qb *SceneStore) getGroupsFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, limit int, result *models.SceneFacets, mu *sync.Mutex) error {
	args := append([]interface{}{}, baseArgs...)
	args = append(args, limit)

	sql := fmt.Sprintf(`
		SELECT g.id, g.name as label, COUNT(DISTINCT gs.scene_id) as count
		FROM groups_scenes gs
		INNER JOIN groups g ON gs.group_id = g.id
		WHERE gs.scene_id IN (%s)
		GROUP BY g.id
		ORDER BY count DESC
		LIMIT ?
	`, baseSQL)

	rows, err := dbWrapper.Queryx(ctx, sql, args...)
	if err != nil {
		return fmt.Errorf("error executing groups facet query: %w", err)
	}
	defer rows.Close()

	var groups []models.FacetCount
	for rows.Next() {
		var id int
		var label string
		var count int

		if err := rows.Scan(&id, &label, &count); err != nil {
			return fmt.Errorf("error scanning group row: %w", err)
		}

		groups = append(groups, models.FacetCount{
			ID:    strconv.Itoa(id),
			Label: label,
			Count: count,
		})
	}

	mu.Lock()
	result.Groups = groups
	mu.Unlock()

	return rows.Err()
}

// getVideoFacets fetches resolution, orientation, and interactive facets
func (qb *SceneStore) getVideoFacets(ctx context.Context, baseSQL string, baseArgs []interface{}, result *models.SceneFacets, mu *sync.Mutex) error {
	args := append([]interface{}{}, baseArgs...)

	sql := fmt.Sprintf(`
		WITH filtered_scenes AS (%s)
		
		SELECT * FROM (
			SELECT 'resolution' as facet_type,
				CASE 
					WHEN vf.height >= 144 AND vf.height < 240 THEN 'VERY_LOW'
					WHEN vf.height >= 240 AND vf.height < 360 THEN 'LOW'
					WHEN vf.height >= 360 AND vf.height < 480 THEN 'R360P'
					WHEN vf.height >= 480 AND vf.height < 540 THEN 'STANDARD'
					WHEN vf.height >= 540 AND vf.height < 720 THEN 'WEB_HD'
					WHEN vf.height >= 720 AND vf.height < 1080 THEN 'STANDARD_HD'
					WHEN vf.height >= 1080 AND vf.height < 1440 THEN 'FULL_HD'
					WHEN vf.height >= 1440 AND vf.height < 1920 THEN 'QUAD_HD'
					WHEN vf.height >= 1920 AND vf.height < 2160 THEN 'VR_HD'
					WHEN vf.height >= 2160 AND vf.height < 2560 THEN 'FOUR_K'
					WHEN vf.height >= 2560 AND vf.height < 3000 THEN 'FIVE_K'
					WHEN vf.height >= 3000 AND vf.height < 3584 THEN 'SIX_K'
					WHEN vf.height >= 3584 AND vf.height < 3840 THEN 'SEVEN_K'
					WHEN vf.height >= 3840 AND vf.height < 6144 THEN 'EIGHT_K'
					WHEN vf.height >= 6144 THEN 'HUGE'
					ELSE 'UNKNOWN'
				END as enum_value,
				COUNT(DISTINCT sf.scene_id) as count
			FROM filtered_scenes fs
			INNER JOIN scenes_files sf ON fs.id = sf.scene_id AND sf."primary" = 1
			INNER JOIN video_files vf ON sf.file_id = vf.file_id
			WHERE vf.height IS NOT NULL
			GROUP BY enum_value
			HAVING enum_value != 'UNKNOWN'
		)
		
		UNION ALL
		
		SELECT * FROM (
			SELECT 'orientation' as facet_type,
				CASE 
					WHEN vf.width > vf.height THEN 'LANDSCAPE'
					WHEN vf.width < vf.height THEN 'PORTRAIT'
					ELSE 'SQUARE'
				END as enum_value,
				COUNT(DISTINCT sf.scene_id) as count
			FROM filtered_scenes fs
			INNER JOIN scenes_files sf ON fs.id = sf.scene_id AND sf."primary" = 1
			INNER JOIN video_files vf ON sf.file_id = vf.file_id
			GROUP BY enum_value
		)
		
		UNION ALL
		
		SELECT * FROM (
			SELECT 'interactive' as facet_type,
				CASE WHEN vf.interactive = 1 THEN 'true' ELSE 'false' END as enum_value,
				COUNT(DISTINCT sf.scene_id) as count
			FROM filtered_scenes fs
			INNER JOIN scenes_files sf ON fs.id = sf.scene_id AND sf."primary" = 1
			INNER JOIN video_files vf ON sf.file_id = vf.file_id
			GROUP BY vf.interactive
		)
	`, baseSQL)

	rows, err := dbWrapper.Queryx(ctx, sql, args...)
	if err != nil {
		return fmt.Errorf("error executing video facets query: %w", err)
	}
	defer rows.Close()

	var resolutions []models.ResolutionFacetCount
	var orientations []models.OrientationFacetCount
	var interactive []models.BooleanFacetCount

	for rows.Next() {
		var facetType string
		var enumValue stdsql.NullString
		var count int

		if err := rows.Scan(&facetType, &enumValue, &count); err != nil {
			return fmt.Errorf("error scanning video facet row: %w", err)
		}

		if !enumValue.Valid {
			continue
		}

		switch facetType {
		case "resolution":
			res := models.ResolutionEnum(enumValue.String)
			if res.IsValid() {
				resolutions = append(resolutions, models.ResolutionFacetCount{
					Resolution: res,
					Count:      count,
				})
			}
		case "orientation":
			orientations = append(orientations, models.OrientationFacetCount{
				Orientation: models.OrientationEnum(enumValue.String),
				Count:       count,
			})
		case "interactive":
			interactive = append(interactive, models.BooleanFacetCount{
				Value: enumValue.String == "true",
				Count: count,
			})
		}
	}

	mu.Lock()
	result.Resolutions = resolutions
	result.Orientations = orientations
	result.Interactive = interactive
	mu.Unlock()

	return rows.Err()
}

// getSimpleFacets fetches organized and rating facets (fast - direct from scenes table)
func (qb *SceneStore) getSimpleFacets(ctx context.Context, baseSQL string, baseArgs []interface{}, result *models.SceneFacets, mu *sync.Mutex) error {
	args := append([]interface{}{}, baseArgs...)

	sql := fmt.Sprintf(`
		WITH filtered_scenes AS (%s)
		
		SELECT * FROM (
			SELECT 'organized' as facet_type,
				CASE WHEN sc.organized = 1 THEN 'true' ELSE 'false' END as enum_value,
				COUNT(*) as count
			FROM filtered_scenes fs
			INNER JOIN scenes sc ON fs.id = sc.id
			GROUP BY sc.organized
		)
		
		UNION ALL
		
		SELECT * FROM (
			SELECT 'rating' as facet_type,
				CAST(sc.rating AS TEXT) as enum_value,
				COUNT(*) as count
			FROM filtered_scenes fs
			INNER JOIN scenes sc ON fs.id = sc.id
			WHERE sc.rating IS NOT NULL
			GROUP BY sc.rating
			ORDER BY sc.rating DESC
		)
	`, baseSQL)

	rows, err := dbWrapper.Queryx(ctx, sql, args...)
	if err != nil {
		return fmt.Errorf("error executing simple facets query: %w", err)
	}
	defer rows.Close()

	var organized []models.BooleanFacetCount
	var ratings []models.RatingFacetCount

	for rows.Next() {
		var facetType string
		var enumValue stdsql.NullString
		var count int

		if err := rows.Scan(&facetType, &enumValue, &count); err != nil {
			return fmt.Errorf("error scanning simple facet row: %w", err)
		}

		if !enumValue.Valid {
			continue
		}

		switch facetType {
		case "organized":
			organized = append(organized, models.BooleanFacetCount{
				Value: enumValue.String == "true",
				Count: count,
			})
		case "rating":
			rating, err := strconv.Atoi(enumValue.String)
			if err == nil {
				ratings = append(ratings, models.RatingFacetCount{
					Rating: rating,
					Count:  count,
				})
			}
		}
	}

	mu.Lock()
	result.Organized = organized
	result.Ratings = ratings
	mu.Unlock()

	return rows.Err()
}

// getPerformerTagsFacet fetches performer tags facet (3 joins)
// Uses IN subquery instead of CTE for better performance on large datasets.
// This leverages idx_ext_performers_scenes_scene_performer and idx_ext_performers_tags_performer_tag indexes.
func (qb *SceneStore) getPerformerTagsFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, limit int, result *models.SceneFacets, mu *sync.Mutex) error {
	args := append([]interface{}{}, baseArgs...)
	args = append(args, limit)

	sql := fmt.Sprintf(`
		SELECT t.id, t.name as label, COUNT(DISTINCT ps.scene_id) as count
		FROM performers_scenes ps
		INNER JOIN performers_tags pt ON ps.performer_id = pt.performer_id
		INNER JOIN tags t ON pt.tag_id = t.id
		WHERE ps.scene_id IN (%s)
		GROUP BY t.id
		ORDER BY count DESC
		LIMIT ?
	`, baseSQL)

	rows, err := dbWrapper.Queryx(ctx, sql, args...)
	if err != nil {
		return fmt.Errorf("error executing performer_tags facet query: %w", err)
	}
	defer rows.Close()

	var performerTags []models.FacetCount
	for rows.Next() {
		var id int
		var label string
		var count int

		if err := rows.Scan(&id, &label, &count); err != nil {
			return fmt.Errorf("error scanning performer_tag row: %w", err)
		}

		performerTags = append(performerTags, models.FacetCount{
			ID:    strconv.Itoa(id),
			Label: label,
			Count: count,
		})
	}

	mu.Lock()
	result.PerformerTags = performerTags
	mu.Unlock()

	return rows.Err()
}

// getCaptionsFacet fetches captions facet
func (qb *SceneStore) getCaptionsFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, result *models.SceneFacets, mu *sync.Mutex) error {
	args := append([]interface{}{}, baseArgs...)

	sql := fmt.Sprintf(`
		WITH filtered_scenes AS (%s)
		SELECT vc.language_code, COUNT(DISTINCT sf.scene_id) as count
		FROM filtered_scenes fs
		INNER JOIN scenes_files sf ON fs.id = sf.scene_id AND sf."primary" = 1
		INNER JOIN video_captions vc ON sf.file_id = vc.file_id
		WHERE vc.language_code IS NOT NULL AND vc.language_code != ''
		GROUP BY vc.language_code
		ORDER BY count DESC
	`, baseSQL)

	rows, err := dbWrapper.Queryx(ctx, sql, args...)
	if err != nil {
		return fmt.Errorf("error executing captions facet query: %w", err)
	}
	defer rows.Close()

	var captions []models.CaptionFacetCount
	for rows.Next() {
		var languageCode string
		var count int

		if err := rows.Scan(&languageCode, &count); err != nil {
			return fmt.Errorf("error scanning caption row: %w", err)
		}

		captions = append(captions, models.CaptionFacetCount{
			Language: languageCode,
			Count:    count,
		})
	}

	mu.Lock()
	result.Captions = captions
	mu.Unlock()

	return rows.Err()
}

// getHasMarkersFacet fetches has_markers boolean facet
// Uses LEFT JOIN instead of EXISTS for better performance (avoids N+1 pattern)
func (qb *SceneStore) getHasMarkersFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, result *models.SceneFacets, mu *sync.Mutex) error {
	args := append([]interface{}{}, baseArgs...)

	sql := fmt.Sprintf(`
		WITH filtered_scenes AS (%s),
		marker_scenes AS (SELECT DISTINCT scene_id FROM scene_markers)
		SELECT
			CASE WHEN ms.scene_id IS NOT NULL THEN 'true' ELSE 'false' END as has_markers,
			COUNT(*) as count
		FROM filtered_scenes fs
		LEFT JOIN marker_scenes ms ON fs.id = ms.scene_id
		GROUP BY has_markers
	`, baseSQL)

	rows, err := dbWrapper.Queryx(ctx, sql, args...)
	if err != nil {
		return fmt.Errorf("error executing has_markers facet query: %w", err)
	}
	defer rows.Close()

	var hasMarkers []models.BooleanFacetCount
	for rows.Next() {
		var value string
		var count int

		if err := rows.Scan(&value, &count); err != nil {
			return fmt.Errorf("error scanning has_markers row: %w", err)
		}

		hasMarkers = append(hasMarkers, models.BooleanFacetCount{
			Value: value == "true",
			Count: count,
		})
	}

	mu.Lock()
	result.HasMarkers = hasMarkers
	mu.Unlock()

	return rows.Err()
}

// getPerformerFavoriteFacet fetches performer_favorite boolean facet
// Uses LEFT JOIN instead of EXISTS for better performance (avoids N+1 pattern)
// Benchmarks show 3.6x improvement (2,067ms → 570ms on 788k scenes)
func (qb *SceneStore) getPerformerFavoriteFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, result *models.SceneFacets, mu *sync.Mutex) error {
	args := append([]interface{}{}, baseArgs...)

	sql := fmt.Sprintf(`
		WITH filtered_scenes AS (%s),
		favorite_scenes AS (
			SELECT DISTINCT ps.scene_id
			FROM performers_scenes ps
			INNER JOIN performers p ON ps.performer_id = p.id
			WHERE p.favorite = 1
		)
		SELECT
			CASE WHEN fav.scene_id IS NOT NULL THEN 'true' ELSE 'false' END as performer_favorite,
			COUNT(*) as count
		FROM filtered_scenes fs
		LEFT JOIN favorite_scenes fav ON fs.id = fav.scene_id
		GROUP BY performer_favorite
	`, baseSQL)

	rows, err := dbWrapper.Queryx(ctx, sql, args...)
	if err != nil {
		return fmt.Errorf("error executing performer_favorite facet query: %w", err)
	}
	defer rows.Close()

	var performerFavorite []models.BooleanFacetCount
	for rows.Next() {
		var value string
		var count int

		if err := rows.Scan(&value, &count); err != nil {
			return fmt.Errorf("error scanning performer_favorite row: %w", err)
		}

		performerFavorite = append(performerFavorite, models.BooleanFacetCount{
			Value: value == "true",
			Count: count,
		})
	}

	mu.Lock()
	result.PerformerFavorite = performerFavorite
	mu.Unlock()

	return rows.Err()
}
