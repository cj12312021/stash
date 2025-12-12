//go:build integration
// +build integration

package sqlite_test

import (
	"context"
	"strconv"
	"testing"

	"github.com/stashapp/stash/pkg/models"
	"github.com/stretchr/testify/assert"
)

func TestPerformerFacets_ReturnsTags(t *testing.T) {
	withRollbackTxn(func(ctx context.Context) error {
		pqb := db.Performer

		facets, err := pqb.GetFacets(ctx, nil, 100)
		if err != nil {
			t.Errorf("Error getting facets: %s", err.Error())
			return nil
		}

		// Should have some tags (from performerTags in setup_test.go)
		assert.Greater(t, len(facets.Tags), 0, "Should return at least one tag")

		// Verify tags are sorted by count descending
		for i := 1; i < len(facets.Tags); i++ {
			assert.GreaterOrEqual(t, facets.Tags[i-1].Count, facets.Tags[i].Count,
				"Tags should be sorted by count descending")
		}

		return nil
	})
}

func TestPerformerFacets_ReturnsGenders(t *testing.T) {
	withRollbackTxn(func(ctx context.Context) error {
		pqb := db.Performer

		facets, err := pqb.GetFacets(ctx, nil, 100)
		if err != nil {
			t.Errorf("Error getting facets: %s", err.Error())
			return nil
		}

		// Should return genders facet (even if empty, query should work)
		// Genders are enum-based, so they may or may not have entries depending on test data
		for _, g := range facets.Genders {
			assert.Greater(t, g.Count, 0, "Gender count should be positive")
			assert.True(t, g.Gender.IsValid(), "Gender should be valid enum value")
		}

		return nil
	})
}

func TestPerformerFacets_ReturnsFavorite(t *testing.T) {
	withRollbackTxn(func(ctx context.Context) error {
		pqb := db.Performer

		facets, err := pqb.GetFacets(ctx, nil, 100)
		if err != nil {
			t.Errorf("Error getting facets: %s", err.Error())
			return nil
		}

		// Should have favorite facet with true and/or false counts
		assert.Greater(t, len(facets.Favorite), 0, "Should return favorite facet")

		for _, f := range facets.Favorite {
			assert.GreaterOrEqual(t, f.Count, 0, "Favorite count should be non-negative")
		}

		return nil
	})
}

func TestPerformerFacets_ReturnsCircumcised(t *testing.T) {
	withRollbackTxn(func(ctx context.Context) error {
		pqb := db.Performer

		facets, err := pqb.GetFacets(ctx, nil, 100)
		if err != nil {
			t.Errorf("Error getting facets: %s", err.Error())
			return nil
		}

		// Should return circumcised facet
		for _, c := range facets.Circumcised {
			assert.Greater(t, c.Count, 0, "Circumcised count should be positive")
			assert.True(t, c.Value.IsValid(), "Circumcised value should be valid enum")
		}

		return nil
	})
}

func TestPerformerFacets_ReturnsRatings(t *testing.T) {
	withRollbackTxn(func(ctx context.Context) error {
		pqb := db.Performer

		facets, err := pqb.GetFacets(ctx, nil, 100)
		if err != nil {
			t.Errorf("Error getting facets: %s", err.Error())
			return nil
		}

		// Ratings should be sorted by rating descending
		for i := 1; i < len(facets.Ratings); i++ {
			assert.GreaterOrEqual(t, facets.Ratings[i-1].Rating, facets.Ratings[i].Rating,
				"Ratings should be sorted by rating descending")
		}

		return nil
	})
}

func TestPerformerFacets_RespectsLimit(t *testing.T) {
	withRollbackTxn(func(ctx context.Context) error {
		pqb := db.Performer

		limit := 5
		facets, err := pqb.GetFacets(ctx, nil, limit)
		if err != nil {
			t.Errorf("Error getting facets: %s", err.Error())
			return nil
		}

		// Should not exceed limit
		assert.LessOrEqual(t, len(facets.Tags), limit, "Tags should not exceed limit")
		assert.LessOrEqual(t, len(facets.Studios), limit, "Studios should not exceed limit")
		assert.LessOrEqual(t, len(facets.Countries), limit, "Countries should not exceed limit")

		return nil
	})
}

func TestPerformerFacets_WithTagFilter(t *testing.T) {
	withRollbackTxn(func(ctx context.Context) error {
		pqb := db.Performer

		// Filter to performers with specific tag
		tagFilter := &models.PerformerFilterType{
			Tags: &models.HierarchicalMultiCriterionInput{
				Value:    []string{strconv.Itoa(tagIDs[tagIdxWithPerformer])},
				Modifier: models.CriterionModifierIncludes,
			},
		}

		facets, err := pqb.GetFacets(ctx, tagFilter, 100)
		if err != nil {
			t.Errorf("Error getting facets: %s", err.Error())
			return nil
		}

		// All returned facets should be from performers with this tag
		// Their count > 0 means they match the filtered set
		for _, tag := range facets.Tags {
			assert.Greater(t, tag.Count, 0, "Tag count should be positive in filtered results")
		}

		return nil
	})
}

func TestPerformerFacets_ReturnsStudios(t *testing.T) {
	withRollbackTxn(func(ctx context.Context) error {
		pqb := db.Performer

		facets, err := pqb.GetFacets(ctx, nil, 100)
		if err != nil {
			t.Errorf("Error getting facets: %s", err.Error())
			return nil
		}

		// Studios are derived from performer appearances in scenes,
		// so may or may not have entries depending on test data
		for _, s := range facets.Studios {
			assert.Greater(t, s.Count, 0, "Studio count should be positive")
			assert.NotEmpty(t, s.ID, "Studio ID should not be empty")
		}

		return nil
	})
}

func TestPerformerFacets_ReturnsCountries(t *testing.T) {
	withRollbackTxn(func(ctx context.Context) error {
		pqb := db.Performer

		facets, err := pqb.GetFacets(ctx, nil, 100)
		if err != nil {
			t.Errorf("Error getting facets: %s", err.Error())
			return nil
		}

		// Countries may or may not have entries depending on test data
		for _, c := range facets.Countries {
			assert.Greater(t, c.Count, 0, "Country count should be positive")
			assert.NotEmpty(t, c.ID, "Country ID should not be empty")
		}

		return nil
	})
}

func TestPerformerFacets_ReturnsGroups(t *testing.T) {
	withRollbackTxn(func(ctx context.Context) error {
		pqb := db.Performer

		facets, err := pqb.GetFacets(ctx, nil, 100)
		if err != nil {
			t.Errorf("Error getting facets: %s", err.Error())
			return nil
		}

		// Groups are derived from performer appearances in scenes that belong to groups,
		// so may or may not have entries depending on test data
		for _, g := range facets.Groups {
			assert.Greater(t, g.Count, 0, "Group count should be positive")
			assert.NotEmpty(t, g.ID, "Group ID should not be empty")
			assert.NotEmpty(t, g.Label, "Group label should not be empty")
		}

		return nil
	})
}

func TestPerformerFacets_GroupsWithFilter(t *testing.T) {
	withRollbackTxn(func(ctx context.Context) error {
		pqb := db.Performer

		// Filter to performers with a specific tag
		tagFilter := &models.PerformerFilterType{
			Tags: &models.HierarchicalMultiCriterionInput{
				Value:    []string{strconv.Itoa(tagIDs[tagIdxWithPerformer])},
				Modifier: models.CriterionModifierIncludes,
			},
		}

		facets, err := pqb.GetFacets(ctx, tagFilter, 100)
		if err != nil {
			t.Errorf("Error getting facets: %s", err.Error())
			return nil
		}

		// Groups should still be populated (even if empty)
		assert.NotNil(t, facets.Groups, "Groups should not be nil with filter")

		// All returned groups should have positive counts
		for _, g := range facets.Groups {
			assert.Greater(t, g.Count, 0, "Group count should be positive in filtered results")
		}

		return nil
	})
}

// Phase 7.5: Test ethnicity facets
func TestPerformerFacets_ReturnsEthnicities(t *testing.T) {
	withRollbackTxn(func(ctx context.Context) error {
		pqb := db.Performer

		facets, err := pqb.GetFacets(ctx, nil, 100)
		if err != nil {
			t.Errorf("Error getting facets: %s", err.Error())
			return nil
		}

		// Ethnicities may or may not have entries depending on test data
		for _, e := range facets.Ethnicities {
			assert.Greater(t, e.Count, 0, "Ethnicity count should be positive")
			assert.NotEmpty(t, e.Value, "Ethnicity value should not be empty")
		}

		return nil
	})
}

// Phase 7.5: Test hair color facets
func TestPerformerFacets_ReturnsHairColors(t *testing.T) {
	withRollbackTxn(func(ctx context.Context) error {
		pqb := db.Performer

		facets, err := pqb.GetFacets(ctx, nil, 100)
		if err != nil {
			t.Errorf("Error getting facets: %s", err.Error())
			return nil
		}

		// Hair colors may or may not have entries depending on test data
		for _, h := range facets.HairColors {
			assert.Greater(t, h.Count, 0, "Hair color count should be positive")
			assert.NotEmpty(t, h.Value, "Hair color value should not be empty")
		}

		return nil
	})
}

// Phase 7.5: Test eye color facets
func TestPerformerFacets_ReturnsEyeColors(t *testing.T) {
	withRollbackTxn(func(ctx context.Context) error {
		pqb := db.Performer

		facets, err := pqb.GetFacets(ctx, nil, 100)
		if err != nil {
			t.Errorf("Error getting facets: %s", err.Error())
			return nil
		}

		// Eye colors may or may not have entries depending on test data
		for _, e := range facets.EyeColors {
			assert.Greater(t, e.Count, 0, "Eye color count should be positive")
			assert.NotEmpty(t, e.Value, "Eye color value should not be empty")
		}

		return nil
	})
}

// Phase 7.5: Test attribute facets with filter
func TestPerformerFacets_AttributesWithFilter(t *testing.T) {
	withRollbackTxn(func(ctx context.Context) error {
		pqb := db.Performer

		// Filter to performers with specific tag
		tagFilter := &models.PerformerFilterType{
			Tags: &models.HierarchicalMultiCriterionInput{
				Value:    []string{strconv.Itoa(tagIDs[tagIdxWithPerformer])},
				Modifier: models.CriterionModifierIncludes,
			},
		}

		facets, err := pqb.GetFacets(ctx, tagFilter, 100)
		if err != nil {
			t.Errorf("Error getting facets: %s", err.Error())
			return nil
		}

		// All attribute facets should be populated (even if empty)
		assert.NotNil(t, facets.Ethnicities, "Ethnicities should not be nil with filter")
		assert.NotNil(t, facets.HairColors, "HairColors should not be nil with filter")
		assert.NotNil(t, facets.EyeColors, "EyeColors should not be nil with filter")

		return nil
	})
}

// Phase 6: Test parallel execution (indirectly - verify all facets return together)
func TestPerformerFacets_ReturnsAllFacetsInParallel(t *testing.T) {
	withRollbackTxn(func(ctx context.Context) error {
		pqb := db.Performer

		facets, err := pqb.GetFacets(ctx, nil, 100)
		if err != nil {
			t.Errorf("Error getting facets: %s", err.Error())
			return nil
		}

		// All facet types should be populated (not nil)
		assert.NotNil(t, facets.Tags, "Tags should not be nil")
		assert.NotNil(t, facets.Studios, "Studios should not be nil")
		assert.NotNil(t, facets.Groups, "Groups should not be nil")
		assert.NotNil(t, facets.Genders, "Genders should not be nil")
		assert.NotNil(t, facets.Countries, "Countries should not be nil")
		assert.NotNil(t, facets.Ethnicities, "Ethnicities should not be nil")
		assert.NotNil(t, facets.HairColors, "HairColors should not be nil")
		assert.NotNil(t, facets.EyeColors, "EyeColors should not be nil")
		assert.NotNil(t, facets.Circumcised, "Circumcised should not be nil")
		assert.NotNil(t, facets.Favorite, "Favorite should not be nil")
		assert.NotNil(t, facets.Ratings, "Ratings should not be nil")

		return nil
	})
}

// Phase 6: Test unfiltered fast path (nil filter should work efficiently)
func TestPerformerFacets_UnfilteredFastPath(t *testing.T) {
	withRollbackTxn(func(ctx context.Context) error {
		pqb := db.Performer

		// Calling with nil filter should trigger the unfiltered fast path
		facets, err := pqb.GetFacets(ctx, nil, 100)
		if err != nil {
			t.Errorf("Error getting facets with nil filter: %s", err.Error())
			return nil
		}

		assert.NotNil(t, facets, "Facets should not be nil with nil filter")

		// Also test with empty filter struct (should also use fast path)
		emptyFilter := &models.PerformerFilterType{}
		facets2, err := pqb.GetFacets(ctx, emptyFilter, 100)
		if err != nil {
			t.Errorf("Error getting facets with empty filter: %s", err.Error())
			return nil
		}

		assert.NotNil(t, facets2, "Facets should not be nil with empty filter")

		return nil
	})
}
