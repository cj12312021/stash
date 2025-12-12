package sqlite

import (
	"context"
	stdsql "database/sql"
	"fmt"
	"strconv"
	"sync"

	"github.com/stashapp/stash/pkg/models"
)

// isEmptyPerformerFilter checks if the performer filter has any criteria that would filter results
func isEmptyPerformerFilter(filter *models.PerformerFilterType) bool {
	if filter == nil {
		return true
	}
	// Check if any filter criteria are set
	return filter.Name == nil &&
		filter.Disambiguation == nil &&
		filter.Details == nil &&
		filter.FilterFavorites == nil &&
		filter.BirthYear == nil &&
		filter.Age == nil &&
		filter.Ethnicity == nil &&
		filter.Country == nil &&
		filter.EyeColor == nil &&
		filter.Height == nil &&
		filter.HeightCm == nil &&
		filter.Measurements == nil &&
		filter.FakeTits == nil &&
		filter.PenisLength == nil &&
		filter.Circumcised == nil &&
		filter.CareerLength == nil &&
		filter.Tattoos == nil &&
		filter.Piercings == nil &&
		filter.Aliases == nil &&
		filter.Gender == nil &&
		filter.IsMissing == nil &&
		filter.Tags == nil &&
		filter.TagCount == nil &&
		filter.SceneCount == nil &&
		filter.ImageCount == nil &&
		filter.GalleryCount == nil &&
		filter.OCounter == nil &&
		filter.PlayCount == nil &&
		filter.Studios == nil &&
		filter.Groups == nil &&
		filter.Performers == nil &&
		filter.HairColor == nil &&
		filter.Weight == nil &&
		filter.DeathYear == nil &&
		filter.Rating100 == nil &&
		filter.URL == nil &&
		filter.StashID == nil &&
		filter.StashIDEndpoint == nil &&
		filter.Birthdate == nil &&
		filter.DeathDate == nil &&
		filter.ScenesFilter == nil &&
		filter.ImagesFilter == nil &&
		filter.GalleriesFilter == nil &&
		filter.TagsFilter == nil &&
		filter.CreatedAt == nil &&
		filter.UpdatedAt == nil &&
		filter.IgnoreAutoTag == nil &&
		filter.And == nil &&
		filter.Or == nil &&
		filter.Not == nil
}

// GetFacets returns aggregated facet counts for performers matching the given filter.
// All facets run in parallel goroutines for optimal performance.
// When no filter is applied, uses optimized "fast path" queries that skip the CTE.
func (qb *PerformerStore) GetFacets(ctx context.Context, performerFilter *models.PerformerFilterType, limit int) (*models.PerformerFacets, error) {
	result := &models.PerformerFacets{
		Tags:        []models.FacetCount{},
		Studios:     []models.FacetCount{},
		Groups:      []models.FacetCount{},
		Genders:     []models.GenderFacetCount{},
		Countries:   []models.FacetCount{},
		Ethnicities: []models.StringFacetCount{},
		HairColors:  []models.StringFacetCount{},
		EyeColors:   []models.StringFacetCount{},
		Circumcised: []models.CircumcisedFacetCount{},
		Favorite:    []models.BooleanFacetCount{},
		Ratings:     []models.RatingFacetCount{},
	}

	// Fast path: When no filter is applied, use optimized direct queries
	// This avoids the expensive CTE that would scan all 68k+ performers
	if isEmptyPerformerFilter(performerFilter) {
		return qb.getFacetsUnfiltered(ctx, limit, result)
	}

	query, err := qb.makeQuery(ctx, performerFilter, nil)
	if err != nil {
		return nil, fmt.Errorf("error building base query: %w", err)
	}

	baseSQL := query.toSQL(false)
	baseArgs := append([]interface{}{}, query.args...)

	var wg sync.WaitGroup
	var mu sync.Mutex
	errChan := make(chan error, 7) // 7 parallel goroutines

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

	// Studios facet (via performers_scenes -> scenes -> studios)
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getStudiosFacet(ctx, baseSQL, baseArgs, limit, result, &mu); err != nil {
			errChan <- fmt.Errorf("studios facet: %w", err)
		}
	}()

	// Groups facet (via performers_scenes -> groups_scenes -> groups)
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getGroupsFacet(ctx, baseSQL, baseArgs, limit, result, &mu); err != nil {
			errChan <- fmt.Errorf("groups facet: %w", err)
		}
	}()

	// Countries facet
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getCountriesFacet(ctx, baseSQL, baseArgs, limit, result, &mu); err != nil {
			errChan <- fmt.Errorf("countries facet: %w", err)
		}
	}()

	// Simple facets (gender, favorite, circumcised, rating)
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getSimpleFacets(ctx, baseSQL, baseArgs, result, &mu); err != nil {
			errChan <- fmt.Errorf("simple facets: %w", err)
		}
	}()

	// Attribute facets (ethnicity, hair_color, eye_color)
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := qb.getAttributeFacets(ctx, baseSQL, baseArgs, limit, result, &mu); err != nil {
			errChan <- fmt.Errorf("attribute facets: %w", err)
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
func (qb *PerformerStore) getFacetsUnfiltered(ctx context.Context, limit int, result *models.PerformerFacets) (*models.PerformerFacets, error) {
	var wg sync.WaitGroup
	var mu sync.Mutex
	errChan := make(chan error, 7)

	// Tags - direct count on performers_tags
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT t.id, t.name as label, COUNT(*) as count
			FROM performers_tags pt
			INNER JOIN tags t ON pt.tag_id = t.id
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

	// Studios - via performers_scenes -> scenes -> studios
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT s.id, s.name as label, COUNT(DISTINCT ps.performer_id) as count
			FROM performers_scenes ps
			INNER JOIN scenes sc ON ps.scene_id = sc.id
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

	// Groups - via performers_scenes -> groups_scenes -> groups
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT g.id, g.name as label, COUNT(DISTINCT ps.performer_id) as count
			FROM performers_scenes ps
			INNER JOIN groups_scenes gs ON ps.scene_id = gs.scene_id
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

	// Countries - direct count on performers
	wg.Add(1)
	go func() {
		defer wg.Done()
		rows, err := dbWrapper.Queryx(ctx, `
			SELECT country as label, COUNT(*) as count
			FROM performers
			WHERE country IS NOT NULL AND country != ''
			GROUP BY country
			ORDER BY count DESC
			LIMIT ?
		`, limit)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered countries facet: %w", err)
			return
		}
		defer rows.Close()

		var countries []models.FacetCount
		for rows.Next() {
			var label string
			var count int
			if err := rows.Scan(&label, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered country: %w", err)
				return
			}
			countries = append(countries, models.FacetCount{ID: label, Label: label, Count: count})
		}
		mu.Lock()
		result.Countries = countries
		mu.Unlock()
	}()

	// Simple facets (gender, favorite, circumcised, rating)
	wg.Add(1)
	go func() {
		defer wg.Done()
		// Gender
		genderRows, err := dbWrapper.Queryx(ctx, `
			SELECT gender, COUNT(*) as count
			FROM performers
			WHERE gender IS NOT NULL AND gender != ''
			GROUP BY gender
			ORDER BY count DESC
		`)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered gender facet: %w", err)
			return
		}
		defer genderRows.Close()

		var genders []models.GenderFacetCount
		for genderRows.Next() {
			var genderStr string
			var count int
			if err := genderRows.Scan(&genderStr, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered gender: %w", err)
				return
			}
			gender := models.GenderEnum(genderStr)
			if gender.IsValid() {
				genders = append(genders, models.GenderFacetCount{Gender: gender, Count: count})
			}
		}

		// Favorite
		favRows, err := dbWrapper.Queryx(ctx, `
			SELECT favorite, COUNT(*) as count
			FROM performers
			GROUP BY favorite
		`)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered favorite facet: %w", err)
			return
		}
		defer favRows.Close()

		var favorite []models.BooleanFacetCount
		for favRows.Next() {
			var value bool
			var count int
			if err := favRows.Scan(&value, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered favorite: %w", err)
				return
			}
			favorite = append(favorite, models.BooleanFacetCount{Value: value, Count: count})
		}

		// Circumcised
		circRows, err := dbWrapper.Queryx(ctx, `
			SELECT circumcised, COUNT(*) as count
			FROM performers
			WHERE circumcised IS NOT NULL AND circumcised != ''
			GROUP BY circumcised
			ORDER BY count DESC
		`)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered circumcised facet: %w", err)
			return
		}
		defer circRows.Close()

		var circumcised []models.CircumcisedFacetCount
		for circRows.Next() {
			var circStr string
			var count int
			if err := circRows.Scan(&circStr, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered circumcised: %w", err)
				return
			}
			circ := models.CircumisedEnum(circStr)
			if circ.IsValid() {
				circumcised = append(circumcised, models.CircumcisedFacetCount{Value: circ, Count: count})
			}
		}

		// Ratings
		ratingRows, err := dbWrapper.Queryx(ctx, `
			SELECT rating, COUNT(*) as count
			FROM performers
			WHERE rating IS NOT NULL
			GROUP BY rating
			ORDER BY rating DESC
		`)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered rating facet: %w", err)
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
		result.Genders = genders
		result.Favorite = favorite
		result.Circumcised = circumcised
		result.Ratings = ratings
		mu.Unlock()
	}()

	// Attribute facets (ethnicity, hair_color, eye_color)
	wg.Add(1)
	go func() {
		defer wg.Done()
		// Ethnicity
		ethnicityRows, err := dbWrapper.Queryx(ctx, `
			SELECT ethnicity as value, COUNT(*) as count
			FROM performers
			WHERE ethnicity IS NOT NULL AND ethnicity != ''
			GROUP BY ethnicity
			ORDER BY count DESC
			LIMIT ?
		`, limit)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered ethnicity facet: %w", err)
			return
		}
		defer ethnicityRows.Close()

		var ethnicities []models.StringFacetCount
		for ethnicityRows.Next() {
			var value string
			var count int
			if err := ethnicityRows.Scan(&value, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered ethnicity: %w", err)
				return
			}
			ethnicities = append(ethnicities, models.StringFacetCount{Value: value, Count: count})
		}

		// Hair Color
		hairRows, err := dbWrapper.Queryx(ctx, `
			SELECT hair_color as value, COUNT(*) as count
			FROM performers
			WHERE hair_color IS NOT NULL AND hair_color != ''
			GROUP BY hair_color
			ORDER BY count DESC
			LIMIT ?
		`, limit)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered hair_color facet: %w", err)
			return
		}
		defer hairRows.Close()

		var hairColors []models.StringFacetCount
		for hairRows.Next() {
			var value string
			var count int
			if err := hairRows.Scan(&value, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered hair_color: %w", err)
				return
			}
			hairColors = append(hairColors, models.StringFacetCount{Value: value, Count: count})
		}

		// Eye Color
		eyeRows, err := dbWrapper.Queryx(ctx, `
			SELECT eye_color as value, COUNT(*) as count
			FROM performers
			WHERE eye_color IS NOT NULL AND eye_color != ''
			GROUP BY eye_color
			ORDER BY count DESC
			LIMIT ?
		`, limit)
		if err != nil {
			errChan <- fmt.Errorf("unfiltered eye_color facet: %w", err)
			return
		}
		defer eyeRows.Close()

		var eyeColors []models.StringFacetCount
		for eyeRows.Next() {
			var value string
			var count int
			if err := eyeRows.Scan(&value, &count); err != nil {
				errChan <- fmt.Errorf("scanning unfiltered eye_color: %w", err)
				return
			}
			eyeColors = append(eyeColors, models.StringFacetCount{Value: value, Count: count})
		}

		mu.Lock()
		result.Ethnicities = ethnicities
		result.HairColors = hairColors
		result.EyeColors = eyeColors
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

func (qb *PerformerStore) getTagsFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, limit int, result *models.PerformerFacets, mu *sync.Mutex) error {
	sql := fmt.Sprintf(`
		WITH filtered_performers AS (%s)
		SELECT t.id, t.name as label, COUNT(DISTINCT pt.performer_id) as count
		FROM filtered_performers fp
		INNER JOIN performers_tags pt ON fp.id = pt.performer_id
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

func (qb *PerformerStore) getStudiosFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, limit int, result *models.PerformerFacets, mu *sync.Mutex) error {
	sql := fmt.Sprintf(`
		WITH filtered_performers AS (%s)
		SELECT s.id, s.name as label, COUNT(DISTINCT ps.performer_id) as count
		FROM filtered_performers fp
		INNER JOIN performers_scenes ps ON fp.id = ps.performer_id
		INNER JOIN scenes sc ON ps.scene_id = sc.id
		INNER JOIN studios s ON sc.studio_id = s.id
		WHERE sc.studio_id IS NOT NULL
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

func (qb *PerformerStore) getGroupsFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, limit int, result *models.PerformerFacets, mu *sync.Mutex) error {
	sql := fmt.Sprintf(`
		WITH filtered_performers AS (%s)
		SELECT g.id, g.name as label, COUNT(DISTINCT ps.performer_id) as count
		FROM filtered_performers fp
		INNER JOIN performers_scenes ps ON fp.id = ps.performer_id
		INNER JOIN groups_scenes gs ON ps.scene_id = gs.scene_id
		INNER JOIN groups g ON gs.group_id = g.id
		GROUP BY g.id
		ORDER BY count DESC
		LIMIT ?
	`, baseSQL)

	args := append(append([]interface{}{}, baseArgs...), limit)
	rows, err := dbWrapper.Queryx(ctx, sql, args...)
	if err != nil {
		return err
	}
	defer rows.Close()

	var groups []models.FacetCount
	for rows.Next() {
		var id int
		var label string
		var count int
		if err := rows.Scan(&id, &label, &count); err != nil {
			return err
		}
		groups = append(groups, models.FacetCount{ID: strconv.Itoa(id), Label: label, Count: count})
	}

	mu.Lock()
	result.Groups = groups
	mu.Unlock()
	return rows.Err()
}

func (qb *PerformerStore) getCountriesFacet(ctx context.Context, baseSQL string, baseArgs []interface{}, limit int, result *models.PerformerFacets, mu *sync.Mutex) error {
	sql := fmt.Sprintf(`
		WITH filtered_performers AS (%s)
		SELECT p.country as label, COUNT(*) as count
		FROM filtered_performers fp
		INNER JOIN performers p ON fp.id = p.id
		WHERE p.country IS NOT NULL AND p.country != ''
		GROUP BY p.country
		ORDER BY count DESC
		LIMIT ?
	`, baseSQL)

	args := append(append([]interface{}{}, baseArgs...), limit)
	rows, err := dbWrapper.Queryx(ctx, sql, args...)
	if err != nil {
		return err
	}
	defer rows.Close()

	var countries []models.FacetCount
	for rows.Next() {
		var label string
		var count int
		if err := rows.Scan(&label, &count); err != nil {
			return err
		}
		countries = append(countries, models.FacetCount{ID: label, Label: label, Count: count})
	}

	mu.Lock()
	result.Countries = countries
	mu.Unlock()
	return rows.Err()
}

func (qb *PerformerStore) getSimpleFacets(ctx context.Context, baseSQL string, baseArgs []interface{}, result *models.PerformerFacets, mu *sync.Mutex) error {
	// Gender facet
	genderSQL := fmt.Sprintf(`
		WITH filtered_performers AS (%s)
		SELECT p.gender, COUNT(*) as count
		FROM filtered_performers fp
		INNER JOIN performers p ON fp.id = p.id
		WHERE p.gender IS NOT NULL AND p.gender != ''
		GROUP BY p.gender
		ORDER BY count DESC
	`, baseSQL)

	genderRows, err := dbWrapper.Queryx(ctx, genderSQL, baseArgs...)
	if err != nil {
		return fmt.Errorf("gender facet: %w", err)
	}
	defer genderRows.Close()

	var genders []models.GenderFacetCount
	for genderRows.Next() {
		var genderStr stdsql.NullString
		var count int
		if err := genderRows.Scan(&genderStr, &count); err != nil {
			return fmt.Errorf("scanning gender: %w", err)
		}
		if genderStr.Valid {
			gender := models.GenderEnum(genderStr.String)
			if gender.IsValid() {
				genders = append(genders, models.GenderFacetCount{Gender: gender, Count: count})
			}
		}
	}

	// Favorite facet
	favSQL := fmt.Sprintf(`
		WITH filtered_performers AS (%s)
		SELECT 
			CASE WHEN p.favorite = 1 THEN 'true' ELSE 'false' END as value,
			COUNT(*) as count
		FROM filtered_performers fp
		INNER JOIN performers p ON fp.id = p.id
		GROUP BY p.favorite
	`, baseSQL)

	favRows, err := dbWrapper.Queryx(ctx, favSQL, baseArgs...)
	if err != nil {
		return fmt.Errorf("favorite facet: %w", err)
	}
	defer favRows.Close()

	var favorite []models.BooleanFacetCount
	for favRows.Next() {
		var value stdsql.NullString
		var count int
		if err := favRows.Scan(&value, &count); err != nil {
			return fmt.Errorf("scanning favorite: %w", err)
		}
		if value.Valid {
			favorite = append(favorite, models.BooleanFacetCount{
				Value: value.String == "true",
				Count: count,
			})
		}
	}

	// Circumcised facet
	circSQL := fmt.Sprintf(`
		WITH filtered_performers AS (%s)
		SELECT p.circumcised, COUNT(*) as count
		FROM filtered_performers fp
		INNER JOIN performers p ON fp.id = p.id
		WHERE p.circumcised IS NOT NULL AND p.circumcised != ''
		GROUP BY p.circumcised
		ORDER BY count DESC
	`, baseSQL)

	circRows, err := dbWrapper.Queryx(ctx, circSQL, baseArgs...)
	if err != nil {
		return fmt.Errorf("circumcised facet: %w", err)
	}
	defer circRows.Close()

	var circumcised []models.CircumcisedFacetCount
	for circRows.Next() {
		var circStr stdsql.NullString
		var count int
		if err := circRows.Scan(&circStr, &count); err != nil {
			return fmt.Errorf("scanning circumcised: %w", err)
		}
		if circStr.Valid {
			circ := models.CircumisedEnum(circStr.String)
			if circ.IsValid() {
				circumcised = append(circumcised, models.CircumcisedFacetCount{Value: circ, Count: count})
			}
		}
	}

	// Rating facet
	ratingSQL := fmt.Sprintf(`
		WITH filtered_performers AS (%s)
		SELECT p.rating, COUNT(*) as count
		FROM filtered_performers fp
		INNER JOIN performers p ON fp.id = p.id
		WHERE p.rating IS NOT NULL
		GROUP BY p.rating
		ORDER BY p.rating DESC
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
	result.Genders = genders
	result.Favorite = favorite
	result.Circumcised = circumcised
	result.Ratings = ratings
	mu.Unlock()
	return nil
}

func (qb *PerformerStore) getAttributeFacets(ctx context.Context, baseSQL string, baseArgs []interface{}, limit int, result *models.PerformerFacets, mu *sync.Mutex) error {
	// Ethnicity facet
	ethnicitySQL := fmt.Sprintf(`
		WITH filtered_performers AS (%s)
		SELECT p.ethnicity as value, COUNT(*) as count
		FROM filtered_performers fp
		INNER JOIN performers p ON fp.id = p.id
		WHERE p.ethnicity IS NOT NULL AND p.ethnicity != ''
		GROUP BY p.ethnicity
		ORDER BY count DESC
		LIMIT ?
	`, baseSQL)

	args := append(append([]interface{}{}, baseArgs...), limit)
	ethnicityRows, err := dbWrapper.Queryx(ctx, ethnicitySQL, args...)
	if err != nil {
		return fmt.Errorf("ethnicity facet: %w", err)
	}
	defer ethnicityRows.Close()

	var ethnicities []models.StringFacetCount
	for ethnicityRows.Next() {
		var value stdsql.NullString
		var count int
		if err := ethnicityRows.Scan(&value, &count); err != nil {
			return fmt.Errorf("scanning ethnicity: %w", err)
		}
		if value.Valid {
			ethnicities = append(ethnicities, models.StringFacetCount{Value: value.String, Count: count})
		}
	}

	// Hair color facet
	hairSQL := fmt.Sprintf(`
		WITH filtered_performers AS (%s)
		SELECT p.hair_color as value, COUNT(*) as count
		FROM filtered_performers fp
		INNER JOIN performers p ON fp.id = p.id
		WHERE p.hair_color IS NOT NULL AND p.hair_color != ''
		GROUP BY p.hair_color
		ORDER BY count DESC
		LIMIT ?
	`, baseSQL)

	hairRows, err := dbWrapper.Queryx(ctx, hairSQL, args...)
	if err != nil {
		return fmt.Errorf("hair_color facet: %w", err)
	}
	defer hairRows.Close()

	var hairColors []models.StringFacetCount
	for hairRows.Next() {
		var value stdsql.NullString
		var count int
		if err := hairRows.Scan(&value, &count); err != nil {
			return fmt.Errorf("scanning hair_color: %w", err)
		}
		if value.Valid {
			hairColors = append(hairColors, models.StringFacetCount{Value: value.String, Count: count})
		}
	}

	// Eye color facet
	eyeSQL := fmt.Sprintf(`
		WITH filtered_performers AS (%s)
		SELECT p.eye_color as value, COUNT(*) as count
		FROM filtered_performers fp
		INNER JOIN performers p ON fp.id = p.id
		WHERE p.eye_color IS NOT NULL AND p.eye_color != ''
		GROUP BY p.eye_color
		ORDER BY count DESC
		LIMIT ?
	`, baseSQL)

	eyeRows, err := dbWrapper.Queryx(ctx, eyeSQL, args...)
	if err != nil {
		return fmt.Errorf("eye_color facet: %w", err)
	}
	defer eyeRows.Close()

	var eyeColors []models.StringFacetCount
	for eyeRows.Next() {
		var value stdsql.NullString
		var count int
		if err := eyeRows.Scan(&value, &count); err != nil {
			return fmt.Errorf("scanning eye_color: %w", err)
		}
		if value.Valid {
			eyeColors = append(eyeColors, models.StringFacetCount{Value: value.String, Count: count})
		}
	}

	mu.Lock()
	result.Ethnicities = ethnicities
	result.HairColors = hairColors
	result.EyeColors = eyeColors
	mu.Unlock()
	return nil
}
