package sqlite

import (
	"context"
	"fmt"
	"strconv"
	"sync"

	"github.com/stashapp/stash/pkg/models"
)

// isEmptyGroupFilter checks if the group filter has any criteria that would filter results
func isEmptyGroupFilter(filter *models.GroupFilterType) bool {
	if filter == nil {
		return true
	}
	// Check if any filter criteria are set
	return filter.Name == nil &&
		filter.Director == nil &&
		filter.Synopsis == nil &&
		filter.Duration == nil &&
		filter.Rating100 == nil &&
		filter.Studios == nil &&
		filter.IsMissing == nil &&
		filter.URL == nil &&
		filter.Performers == nil &&
		filter.Tags == nil &&
		filter.TagCount == nil &&
		filter.Date == nil &&
		filter.ContainingGroups == nil &&
		filter.SubGroups == nil &&
		filter.ContainingGroupCount == nil &&
		filter.SubGroupCount == nil &&
		filter.ScenesFilter == nil &&
		filter.StudiosFilter == nil &&
		filter.CreatedAt == nil &&
		filter.UpdatedAt == nil &&
		filter.And == nil &&
		filter.Or == nil &&
		filter.Not == nil
}

// GetFacets returns aggregated facet counts for groups matching the given filter.
// All facets run in parallel goroutines for optimal performance.
// When no filter is applied, uses optimized "fast path" queries that skip the CTE.
func (qb *GroupStore) GetFacets(ctx context.Context, groupFilter *models.GroupFilterType, limit int) (*models.GroupFacets, error) {
	result := &models.GroupFacets{
		Tags:       []models.FacetCount{},
		Performers: []models.FacetCount{},
		Studios:    []models.FacetCount{},
	}

	// Fast path: When no filter is applied, use optimized direct queries
	// This avoids the expensive CTE that would scan all 48k+ groups
	if isEmptyGroupFilter(groupFilter) {
		return qb.getFacetsUnfiltered(ctx, limit, result)
	}

	query, err := qb.makeQuery(ctx, groupFilter, nil)
	if err != nil {
		return nil, fmt.Errorf("error building base query: %w", err)
	}

	baseSQL := query.toSQL(false)
	baseArgs := append([]interface{}{}, query.args...)

	var wg sync.WaitGroup
	var mu sync.Mutex
	errChan := make(chan error, 3) // 3 parallel goroutines

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

	// Performers facet (via groups_scenes -> performers_scenes -> performers)
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
func (qb *GroupStore) getFacetsUnfiltered(ctx context.Context, limit int, result *models.GroupFacets) (*models.GroupFacets, error) {
	var wg sync.WaitGroup
	var mu sync.Mutex
	errChan := make(chan error, 3)

	// Tags - direct count on groups_tags
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT t.id, t.name as label, COUNT(*) as count
			FROM groups_tags gt
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

	// Performers - via groups_scenes -> performers_scenes -> performers
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT p.id, p.name as label, COUNT(DISTINCT gs.group_id) as count
			FROM groups_scenes gs
			INNER JOIN performers_scenes ps ON gs.scene_id = ps.scene_id
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

	// Studios - direct count on groups
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT s.id, s.name as label, COUNT(*) as count
			FROM groups g
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

func (qb *GroupStore) getTagsFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, limit int, result *models.GroupFacets, mu *sync.Mutex) error {
	sql := fmt.Sprintf(`
		WITH filtered_groups AS (%s)
		SELECT t.id, t.name as label, COUNT(DISTINCT gt.group_id) as count
		FROM filtered_groups fg
		INNER JOIN groups_tags gt ON fg.id = gt.group_id
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

func (qb *GroupStore) getPerformersFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, limit int, result *models.GroupFacets, mu *sync.Mutex) error {
	sql := fmt.Sprintf(`
		WITH filtered_groups AS (%s)
		SELECT p.id, p.name as label, COUNT(DISTINCT gs.group_id) as count
		FROM filtered_groups fg
		INNER JOIN groups_scenes gs ON fg.id = gs.group_id
		INNER JOIN performers_scenes ps ON gs.scene_id = ps.scene_id
		INNER JOIN performers p ON ps.performer_id = p.id
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

func (qb *GroupStore) getStudiosFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, limit int, result *models.GroupFacets, mu *sync.Mutex) error {
	sql := fmt.Sprintf(`
		WITH filtered_groups AS (%s)
		SELECT s.id, s.name as label, COUNT(DISTINCT g.id) as count
		FROM filtered_groups fg
		INNER JOIN groups g ON fg.id = g.id
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
