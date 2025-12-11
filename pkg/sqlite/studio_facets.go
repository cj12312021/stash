package sqlite

import (
	"context"
	stdsql "database/sql"
	"fmt"
	"strconv"

	"github.com/stashapp/stash/pkg/models"
)

// GetFacets returns aggregated facet counts for studios matching the given filter.
// This uses a single query with CTE to avoid re-executing the filter multiple times.
func (qb *StudioStore) GetFacets(ctx context.Context, studioFilter *models.StudioFilterType, limit int) (*models.StudioFacets, error) {
	result := &models.StudioFacets{
		Tags:     []models.FacetCount{},
		Parents:  []models.FacetCount{},
		Favorite: []models.BooleanFacetCount{},
		Ratings:  []models.RatingFacetCount{},
	}

	query, err := qb.makeQuery(ctx, studioFilter, nil)
	if err != nil {
		return nil, fmt.Errorf("error building base query: %w", err)
	}

	baseSQL := query.toSQL(false)
	args := append([]interface{}{}, query.args...)

	// Single query using CTE - filter executes only ONCE
	sql := fmt.Sprintf(`
		WITH filtered_studios AS (%s)
		
		SELECT * FROM (
			SELECT 'tag' as facet_type, t.id, t.name as label, NULL as enum_value, NULL as rating_value, COUNT(DISTINCT st.studio_id) as count
			FROM filtered_studios fs
			INNER JOIN studios_tags st ON fs.id = st.studio_id
			INNER JOIN tags t ON st.tag_id = t.id
			GROUP BY t.id
			ORDER BY count DESC
			LIMIT ?
		)
		
		UNION ALL
		
		SELECT * FROM (
			SELECT 'parent' as facet_type, parent.id, parent.name as label, NULL as enum_value, NULL as rating_value, COUNT(DISTINCT child.id) as count
			FROM filtered_studios fs
			INNER JOIN studios child ON fs.id = child.id
			INNER JOIN studios parent ON child.parent_id = parent.id
			WHERE child.parent_id IS NOT NULL
			GROUP BY parent.id
			ORDER BY count DESC
			LIMIT ?
		)
		
		UNION ALL
		
		SELECT * FROM (
			SELECT 'favorite' as facet_type, 0 as id, '' as label,
				CASE WHEN s.favorite = 1 THEN 'true' ELSE 'false' END as enum_value,
				NULL as rating_value,
				COUNT(*) as count
			FROM filtered_studios fs
			INNER JOIN studios s ON fs.id = s.id
			GROUP BY s.favorite
		)
		
		UNION ALL
		
		SELECT * FROM (
			SELECT 'rating' as facet_type, 0 as id, '' as label, NULL as enum_value,
				s.rating as rating_value,
				COUNT(*) as count
			FROM filtered_studios fs
			INNER JOIN studios s ON fs.id = s.id
			WHERE s.rating IS NOT NULL
			GROUP BY s.rating
			ORDER BY s.rating DESC
		)
	`, baseSQL)

	// Add limit args for tag, parent
	args = append(args, limit, limit)

	rows, err := dbWrapper.Queryx(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("error executing facets query: %w", err)
	}
	defer rows.Close()

	// Parse results
	for rows.Next() {
		var facetType string
		var id int
		var label stdsql.NullString
		var enumValue stdsql.NullString
		var ratingValue stdsql.NullInt64
		var count int

		if err := rows.Scan(&facetType, &id, &label, &enumValue, &ratingValue, &count); err != nil {
			return nil, fmt.Errorf("error scanning facet row: %w", err)
		}

		switch facetType {
		case "tag":
			result.Tags = append(result.Tags, models.FacetCount{
				ID:    strconv.Itoa(id),
				Label: label.String,
				Count: count,
			})
		case "parent":
			result.Parents = append(result.Parents, models.FacetCount{
				ID:    strconv.Itoa(id),
				Label: label.String,
				Count: count,
			})
		case "favorite":
			if enumValue.Valid {
				result.Favorite = append(result.Favorite, models.BooleanFacetCount{
					Value: enumValue.String == "true",
					Count: count,
				})
			}
		case "rating":
			if ratingValue.Valid {
				result.Ratings = append(result.Ratings, models.RatingFacetCount{
					Rating: int(ratingValue.Int64),
					Count:  count,
				})
			}
		}
	}

	return result, rows.Err()
}
