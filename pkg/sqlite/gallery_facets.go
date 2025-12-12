package sqlite

import (
	"context"
	stdsql "database/sql"
	"fmt"
	"strconv"
	"sync"

	"github.com/stashapp/stash/pkg/models"
)

// isEmptyGalleryFilter checks if the gallery filter has any criteria that would filter results
func isEmptyGalleryFilter(filter *models.GalleryFilterType) bool {
	if filter == nil {
		return true
	}
	// Check if any filter criteria are set
	return filter.Title == nil &&
		filter.Details == nil &&
		filter.Path == nil &&
		filter.Checksum == nil &&
		filter.FileCount == nil &&
		filter.Rating100 == nil &&
		filter.Organized == nil &&
		filter.AverageResolution == nil &&
		filter.HasChapters == nil &&
		filter.IsMissing == nil &&
		filter.Studios == nil &&
		filter.Tags == nil &&
		filter.PerformerTags == nil &&
		filter.Performers == nil &&
		filter.ImageCount == nil &&
		filter.PerformerCount == nil &&
		filter.TagCount == nil &&
		filter.PerformerFavorite == nil &&
		filter.PerformerAge == nil &&
		filter.URL == nil &&
		filter.Date == nil &&
		filter.CreatedAt == nil &&
		filter.UpdatedAt == nil &&
		filter.Code == nil &&
		filter.Photographer == nil &&
		filter.Scenes == nil &&
		filter.And == nil &&
		filter.Or == nil &&
		filter.Not == nil
}

// GetFacets returns aggregated facet counts for galleries matching the given filter.
// All facets run in parallel goroutines for optimal performance.
// When no filter is applied, uses optimized "fast path" queries that skip the CTE.
func (qb *GalleryStore) GetFacets(ctx context.Context, galleryFilter *models.GalleryFilterType, limit int) (*models.GalleryFacets, error) {
	result := &models.GalleryFacets{
		Tags:              []models.FacetCount{},
		Performers:        []models.FacetCount{},
		Studios:           []models.FacetCount{},
		PerformerTags:     []models.FacetCount{},
		Organized:         []models.BooleanFacetCount{},
		HasChapters:       []models.BooleanFacetCount{},
		PerformerFavorite: []models.BooleanFacetCount{},
		Ratings:           []models.RatingFacetCount{},
	}

	// Fast path: When no filter is applied, use optimized direct queries
	// This avoids the expensive CTE that would scan all 700k+ galleries
	if isEmptyGalleryFilter(galleryFilter) {
		return qb.getFacetsUnfiltered(ctx, limit, result)
	}

	query, err := qb.makeQuery(ctx, galleryFilter, nil)
	if err != nil {
		return nil, fmt.Errorf("error building base query: %w", err)
	}

	baseSQL := query.toSQL(false)
	baseArgs := append([]interface{}{}, query.args...)

	var wg sync.WaitGroup
	var mu sync.Mutex
	errChan := make(chan error, 8) // 8 parallel goroutines

	// All facets run in parallel - no lazy loading
	// Wall-clock time = slowest query, not sum of queries

	// Tags facet
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getTagsFacet(ctx, baseSQL, baseArgs, limit, result, &mu); err != nil {
			errChan <- fmt.Errorf("tags facet: %w", err)
		}
	}()

	// Performers facet
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getPerformersFacet(ctx, baseSQL, baseArgs, limit, result, &mu); err != nil {
			errChan <- fmt.Errorf("performers facet: %w", err)
		}
	}()

	// Studios facet
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getStudiosFacet(ctx, baseSQL, baseArgs, limit, result, &mu); err != nil {
			errChan <- fmt.Errorf("studios facet: %w", err)
		}
	}()

	// Performer tags facet
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getPerformerTagsFacet(ctx, baseSQL, baseArgs, limit, result, &mu); err != nil {
			errChan <- fmt.Errorf("performer_tags facet: %w", err)
		}
	}()

	// Simple facets (organized, rating)
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getSimpleFacets(ctx, baseSQL, baseArgs, result, &mu); err != nil {
			errChan <- fmt.Errorf("simple facets: %w", err)
		}
	}()

	// Has chapters facet
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getHasChaptersFacet(ctx, baseSQL, baseArgs, result, &mu); err != nil {
			errChan <- fmt.Errorf("has_chapters facet: %w", err)
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
// 1. Skip the CTE overhead (no need to materialize 700k gallery IDs)
// 2. Use simple COUNT(*) on junction tables
// 3. Let SQLite's query optimizer work more efficiently
func (qb *GalleryStore) getFacetsUnfiltered(ctx context.Context, limit int, result *models.GalleryFacets) (*models.GalleryFacets, error) {
	var wg sync.WaitGroup
	var mu sync.Mutex
	errChan := make(chan error, 8)

	// Tags - direct count on galleries_tags
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT t.id, t.name as label, COUNT(*) as count
			FROM galleries_tags gt
			INNER JOIN tags t ON gt.tag_id = t.id
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

	// Performers - direct count on performers_galleries
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT p.id, p.name as label, COUNT(*) as count
			FROM performers_galleries pg
			INNER JOIN performers p ON pg.performer_id = p.id
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

	// Studios - direct count on galleries
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT s.id, s.name as label, COUNT(*) as count
			FROM galleries g
			INNER JOIN studios s ON g.studio_id = s.id
			WHERE g.studio_id IS NOT NULL
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

	// Performer Tags - 3-way join (expensive but optimized)
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT t.id, t.name as label, COUNT(DISTINCT pg.gallery_id) as count
			FROM performers_galleries pg
			INNER JOIN performers_tags pt ON pg.performer_id = pt.performer_id
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

	// Simple facets (organized, rating)
	wg.Add(1)
	go func() {
		defer wg.Done()
		// Organized
		orgRows, err := dbWrapper.Queryx(ctx, `
			SELECT organized, COUNT(*) as count
			FROM galleries
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
			FROM galleries
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

	// Has Chapters - count galleries with/without chapters
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT 
				CASE WHEN EXISTS (SELECT 1 FROM galleries_chapters gc WHERE gc.gallery_id = g.id) 
					THEN 'true' ELSE 'false' END as has_chapters,
				COUNT(*) as count
			FROM galleries g
			GROUP BY has_chapters
		`)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered has_chapters facet: %w", err)
			return
		}
		defer rows.Close()

		var hasChapters []models.BooleanFacetCount
		for rows.Next() {
			var value string
			var count int
			if err := rows.Scan(&value, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered has_chapters: %w", err)
				return
			}
			hasChapters = append(hasChapters, models.BooleanFacetCount{Value: value == "true", Count: count})
		}
		mu.Lock()
		result.HasChapters = hasChapters
		mu.Unlock()
	}()

	// Performer Favorite - count galleries with/without favorite performers
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT 
				CASE WHEN EXISTS (
					SELECT 1 FROM performers_galleries pg 
					INNER JOIN performers p ON pg.performer_id = p.id
					WHERE pg.gallery_id = g.id AND p.favorite = 1
				) THEN 'true' ELSE 'false' END as performer_favorite,
				COUNT(*) as count
			FROM galleries g
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

	// Return first error if any
	for err := range errChan {
		if err != nil {
			return nil, err
		}
	}

	return result, nil
}

// Individual facet query functions for filtered queries

func (qb *GalleryStore) getTagsFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, limit int, result *models.GalleryFacets, mu *sync.Mutex) error {
	sql := fmt.Sprintf(`
		WITH filtered_galleries AS (%s)
		SELECT t.id, t.name as label, COUNT(DISTINCT gt.gallery_id) as count
		FROM filtered_galleries fg
		INNER JOIN galleries_tags gt ON fg.id = gt.gallery_id
		INNER JOIN tags t ON gt.tag_id = t.id
		GROUP BY t.id
		ORDER BY count DESC
		LIMIT ?
	`, baseSQL)

	args := append(append([]interface{}{}, baseArgs...), limit)
	rows, err := dbWrapper.Queryx(ctx, sql, args...)
	if err != nil {
		return err
	}
	defer rows.Close()

	var tags []models.FacetCount
	for rows.Next() {
		var id int
		var label string
		var count int
		if err := rows.Scan(&id, &label, &count); err != nil {
			return err
		}
		tags = append(tags, models.FacetCount{ID: strconv.Itoa(id), Label: label, Count: count})
	}

	mu.Lock()
	result.Tags = tags
	mu.Unlock()
	return rows.Err()
}

func (qb *GalleryStore) getPerformersFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, limit int, result *models.GalleryFacets, mu *sync.Mutex) error {
	sql := fmt.Sprintf(`
		WITH filtered_galleries AS (%s)
		SELECT p.id, p.name as label, COUNT(DISTINCT pg.gallery_id) as count
		FROM filtered_galleries fg
		INNER JOIN performers_galleries pg ON fg.id = pg.gallery_id
		INNER JOIN performers p ON pg.performer_id = p.id
		GROUP BY p.id
		ORDER BY count DESC
		LIMIT ?
	`, baseSQL)

	args := append(append([]interface{}{}, baseArgs...), limit)
	rows, err := dbWrapper.Queryx(ctx, sql, args...)
	if err != nil {
		return err
	}
	defer rows.Close()

	var performers []models.FacetCount
	for rows.Next() {
		var id int
		var label string
		var count int
		if err := rows.Scan(&id, &label, &count); err != nil {
			return err
		}
		performers = append(performers, models.FacetCount{ID: strconv.Itoa(id), Label: label, Count: count})
	}

	mu.Lock()
	result.Performers = performers
	mu.Unlock()
	return rows.Err()
}

func (qb *GalleryStore) getStudiosFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, limit int, result *models.GalleryFacets, mu *sync.Mutex) error {
	sql := fmt.Sprintf(`
		WITH filtered_galleries AS (%s)
		SELECT s.id, s.name as label, COUNT(DISTINCT g.id) as count
		FROM filtered_galleries fg
		INNER JOIN galleries g ON fg.id = g.id
		INNER JOIN studios s ON g.studio_id = s.id
		WHERE g.studio_id IS NOT NULL
		GROUP BY s.id
		ORDER BY count DESC
		LIMIT ?
	`, baseSQL)

	args := append(append([]interface{}{}, baseArgs...), limit)
	rows, err := dbWrapper.Queryx(ctx, sql, args...)
	if err != nil {
		return err
	}
	defer rows.Close()

	var studios []models.FacetCount
	for rows.Next() {
		var id int
		var label string
		var count int
		if err := rows.Scan(&id, &label, &count); err != nil {
			return err
		}
		studios = append(studios, models.FacetCount{ID: strconv.Itoa(id), Label: label, Count: count})
	}

	mu.Lock()
	result.Studios = studios
	mu.Unlock()
	return rows.Err()
}

func (qb *GalleryStore) getPerformerTagsFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, limit int, result *models.GalleryFacets, mu *sync.Mutex) error {
	sql := fmt.Sprintf(`
		WITH filtered_galleries AS (%s)
		SELECT t.id, t.name as label, COUNT(DISTINCT fg.id) as count
		FROM filtered_galleries fg
		INNER JOIN performers_galleries pg ON fg.id = pg.gallery_id
		INNER JOIN performers_tags pt ON pg.performer_id = pt.performer_id
		INNER JOIN tags t ON pt.tag_id = t.id
		GROUP BY t.id
		ORDER BY count DESC
		LIMIT ?
	`, baseSQL)

	args := append(append([]interface{}{}, baseArgs...), limit)
	rows, err := dbWrapper.Queryx(ctx, sql, args...)
	if err != nil {
		return err
	}
	defer rows.Close()

	var performerTags []models.FacetCount
	for rows.Next() {
		var id int
		var label string
		var count int
		if err := rows.Scan(&id, &label, &count); err != nil {
			return err
		}
		performerTags = append(performerTags, models.FacetCount{ID: strconv.Itoa(id), Label: label, Count: count})
	}

	mu.Lock()
	result.PerformerTags = performerTags
	mu.Unlock()
	return rows.Err()
}

func (qb *GalleryStore) getSimpleFacets(ctx context.Context, baseSQL string, baseArgs []interface{}, result *models.GalleryFacets, mu *sync.Mutex) error {
	// Organized facet
	orgSQL := fmt.Sprintf(`
		WITH filtered_galleries AS (%s)
		SELECT 
			CASE WHEN g.organized = 1 THEN 'true' ELSE 'false' END as value,
			COUNT(*) as count
		FROM filtered_galleries fg
		INNER JOIN galleries g ON fg.id = g.id
		GROUP BY g.organized
	`, baseSQL)

	orgRows, err := dbWrapper.Queryx(ctx, orgSQL, baseArgs...)
	if err != nil {
		return fmt.Errorf("organized facet: %w", err)
	}
	defer orgRows.Close()

	var organized []models.BooleanFacetCount
	for orgRows.Next() {
		var value stdsql.NullString
		var count int
		if err := orgRows.Scan(&value, &count); err != nil {
			return fmt.Errorf("scanning organized: %w", err)
		}
		if value.Valid {
			organized = append(organized, models.BooleanFacetCount{
				Value: value.String == "true",
				Count: count,
			})
		}
	}

	// Rating facet
	ratingSQL := fmt.Sprintf(`
		WITH filtered_galleries AS (%s)
		SELECT g.rating, COUNT(*) as count
		FROM filtered_galleries fg
		INNER JOIN galleries g ON fg.id = g.id
		WHERE g.rating IS NOT NULL
		GROUP BY g.rating
		ORDER BY g.rating DESC
	`, baseSQL)

	ratingRows, err := dbWrapper.Queryx(ctx, ratingSQL, baseArgs...)
	if err != nil {
		return fmt.Errorf("rating facet: %w", err)
	}
	defer ratingRows.Close()

	var ratings []models.RatingFacetCount
	for ratingRows.Next() {
		var rating int
		var count int
		if err := ratingRows.Scan(&rating, &count); err != nil {
			return fmt.Errorf("scanning rating: %w", err)
		}
		ratings = append(ratings, models.RatingFacetCount{Rating: rating, Count: count})
	}

	mu.Lock()
	result.Organized = organized
	result.Ratings = ratings
	mu.Unlock()
	return nil
}

// getHasChaptersFacet fetches has_chapters boolean facet
func (qb *GalleryStore) getHasChaptersFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, result *models.GalleryFacets, mu *sync.Mutex) error {
	args := append([]interface{}{}, baseArgs...)

	sql := fmt.Sprintf(`
		WITH filtered_galleries AS (%s)
		SELECT 
			CASE WHEN EXISTS (
				SELECT 1 FROM galleries_chapters gc WHERE gc.gallery_id = fg.id
			) THEN 'true' ELSE 'false' END as has_chapters,
			COUNT(*) as count
		FROM filtered_galleries fg
		GROUP BY has_chapters
	`, baseSQL)

	rows, err := dbWrapper.Queryx(ctx, sql, args...)
	if err != nil {
		return fmt.Errorf("error executing has_chapters facet query: %w", err)
	}
	defer rows.Close()

	var hasChapters []models.BooleanFacetCount
	for rows.Next() {
		var value string
		var count int

		if err := rows.Scan(&value, &count); err != nil {
			return fmt.Errorf("error scanning has_chapters row: %w", err)
		}

		hasChapters = append(hasChapters, models.BooleanFacetCount{
			Value: value == "true",
			Count: count,
		})
	}

	mu.Lock()
	result.HasChapters = hasChapters
	mu.Unlock()

	return rows.Err()
}

// getPerformerFavoriteFacet fetches performer_favorite boolean facet
func (qb *GalleryStore) getPerformerFavoriteFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, result *models.GalleryFacets, mu *sync.Mutex) error {
	args := append([]interface{}{}, baseArgs...)

	sql := fmt.Sprintf(`
		WITH filtered_galleries AS (%s)
		SELECT 
			CASE WHEN EXISTS (
				SELECT 1 FROM performers_galleries pg 
				INNER JOIN performers p ON pg.performer_id = p.id
				WHERE pg.gallery_id = fg.id AND p.favorite = 1
			) THEN 'true' ELSE 'false' END as performer_favorite,
			COUNT(*) as count
		FROM filtered_galleries fg
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
