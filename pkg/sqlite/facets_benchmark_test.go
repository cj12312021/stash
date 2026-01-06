//go:build benchmark
// +build benchmark

// Facet Performance Benchmarks
//
// These benchmarks test the facet query performance against a production database copy.
// Run with: go test -v -tags=benchmark -bench=. -benchtime=3s ./pkg/sqlite/... -run=^$
//
// Set STASH_BENCHMARK_DB to point to your production database copy:
//   export STASH_BENCHMARK_DB="test-data/stash-go.sqlite"

package sqlite_test

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"sort"
	"strings"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

var benchDB *sql.DB

func init() {
	dbPath := os.Getenv("STASH_BENCHMARK_DB")
	if dbPath == "" {
		dbPath = "../../test-data/stash-go.sqlite"
	}

	var err error
	benchDB, err = sql.Open("sqlite3", dbPath+"?mode=ro")
	if err != nil {
		fmt.Printf("Warning: Could not open benchmark database: %v\n", err)
		return
	}

	// Verify connection
	if err := benchDB.Ping(); err != nil {
		fmt.Printf("Warning: Could not ping benchmark database: %v\n", err)
		benchDB = nil
		return
	}

	fmt.Printf("Benchmark database opened: %s\n", dbPath)
}

// =============================================================================
// BASELINE: Current has_markers query (EXISTS pattern)
// =============================================================================

func BenchmarkHasMarkers_EXISTS_Unfiltered(b *testing.B) {
	if benchDB == nil {
		b.Skip("Benchmark database not available")
	}

	ctx := context.Background()

	// Current implementation: EXISTS subquery per row
	query := `
		SELECT
			CASE WHEN EXISTS (
				SELECT 1 FROM scene_markers sm WHERE sm.scene_id = s.id
			) THEN 'true' ELSE 'false' END as has_markers,
			COUNT(*) as count
		FROM scenes s
		GROUP BY has_markers
	`

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rows, err := benchDB.QueryContext(ctx, query)
		if err != nil {
			b.Fatalf("Query failed: %v", err)
		}
		for rows.Next() {
			var hasMarkers string
			var count int
			rows.Scan(&hasMarkers, &count)
		}
		rows.Close()
	}
}

func BenchmarkHasMarkers_LEFTJOIN_Unfiltered(b *testing.B) {
	if benchDB == nil {
		b.Skip("Benchmark database not available")
	}

	ctx := context.Background()

	// Optimized: LEFT JOIN with subquery
	query := `
		WITH marker_scenes AS (SELECT DISTINCT scene_id FROM scene_markers)
		SELECT
			CASE WHEN ms.scene_id IS NOT NULL THEN 'true' ELSE 'false' END as has_markers,
			COUNT(*) as count
		FROM scenes s
		LEFT JOIN marker_scenes ms ON s.id = ms.scene_id
		GROUP BY has_markers
	`

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rows, err := benchDB.QueryContext(ctx, query)
		if err != nil {
			b.Fatalf("Query failed: %v", err)
		}
		for rows.Next() {
			var hasMarkers string
			var count int
			rows.Scan(&hasMarkers, &count)
		}
		rows.Close()
	}
}

// =============================================================================
// FILTERED: has_markers with a tag filter (simulates real usage)
// =============================================================================

func BenchmarkHasMarkers_EXISTS_Filtered(b *testing.B) {
	if benchDB == nil {
		b.Skip("Benchmark database not available")
	}

	ctx := context.Background()

	// Get a tag ID with many scenes for realistic filtering
	var tagID int
	err := benchDB.QueryRowContext(ctx, `
		SELECT tag_id FROM scenes_tags
		GROUP BY tag_id
		ORDER BY COUNT(*) DESC
		LIMIT 1
	`).Scan(&tagID)
	if err != nil {
		b.Skipf("Could not find tag for filtering: %v", err)
	}

	// Current implementation with CTE filter
	query := fmt.Sprintf(`
		WITH filtered_scenes AS (
			SELECT DISTINCT s.id
			FROM scenes s
			INNER JOIN scenes_tags st ON s.id = st.scene_id
			WHERE st.tag_id = %d
		)
		SELECT
			CASE WHEN EXISTS (
				SELECT 1 FROM scene_markers sm WHERE sm.scene_id = fs.id
			) THEN 'true' ELSE 'false' END as has_markers,
			COUNT(*) as count
		FROM filtered_scenes fs
		GROUP BY has_markers
	`, tagID)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rows, err := benchDB.QueryContext(ctx, query)
		if err != nil {
			b.Fatalf("Query failed: %v", err)
		}
		for rows.Next() {
			var hasMarkers string
			var count int
			rows.Scan(&hasMarkers, &count)
		}
		rows.Close()
	}
}

func BenchmarkHasMarkers_LEFTJOIN_Filtered(b *testing.B) {
	if benchDB == nil {
		b.Skip("Benchmark database not available")
	}

	ctx := context.Background()

	// Get a tag ID with many scenes for realistic filtering
	var tagID int
	err := benchDB.QueryRowContext(ctx, `
		SELECT tag_id FROM scenes_tags
		GROUP BY tag_id
		ORDER BY COUNT(*) DESC
		LIMIT 1
	`).Scan(&tagID)
	if err != nil {
		b.Skipf("Could not find tag for filtering: %v", err)
	}

	// Optimized with LEFT JOIN
	query := fmt.Sprintf(`
		WITH filtered_scenes AS (
			SELECT DISTINCT s.id
			FROM scenes s
			INNER JOIN scenes_tags st ON s.id = st.scene_id
			WHERE st.tag_id = %d
		),
		marker_scenes AS (SELECT DISTINCT scene_id FROM scene_markers)
		SELECT
			CASE WHEN ms.scene_id IS NOT NULL THEN 'true' ELSE 'false' END as has_markers,
			COUNT(*) as count
		FROM filtered_scenes fs
		LEFT JOIN marker_scenes ms ON fs.id = ms.scene_id
		GROUP BY has_markers
	`, tagID)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rows, err := benchDB.QueryContext(ctx, query)
		if err != nil {
			b.Fatalf("Query failed: %v", err)
		}
		for rows.Next() {
			var hasMarkers string
			var count int
			rows.Scan(&hasMarkers, &count)
		}
		rows.Close()
	}
}

// =============================================================================
// BASELINE: Current performer_favorite query (EXISTS pattern)
// =============================================================================

func BenchmarkPerformerFavorite_EXISTS_Unfiltered(b *testing.B) {
	if benchDB == nil {
		b.Skip("Benchmark database not available")
	}

	ctx := context.Background()

	// Current implementation: EXISTS subquery per row
	query := `
		SELECT
			CASE WHEN EXISTS (
				SELECT 1 FROM performers_scenes ps
				INNER JOIN performers p ON ps.performer_id = p.id
				WHERE ps.scene_id = s.id AND p.favorite = 1
			) THEN 'true' ELSE 'false' END as performer_favorite,
			COUNT(*) as count
		FROM scenes s
		GROUP BY performer_favorite
	`

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rows, err := benchDB.QueryContext(ctx, query)
		if err != nil {
			b.Fatalf("Query failed: %v", err)
		}
		for rows.Next() {
			var perfFav string
			var count int
			rows.Scan(&perfFav, &count)
		}
		rows.Close()
	}
}

func BenchmarkPerformerFavorite_LEFTJOIN_Unfiltered(b *testing.B) {
	if benchDB == nil {
		b.Skip("Benchmark database not available")
	}

	ctx := context.Background()

	// Optimized: LEFT JOIN with subquery
	query := `
		WITH favorite_scenes AS (
			SELECT DISTINCT ps.scene_id
			FROM performers_scenes ps
			INNER JOIN performers p ON ps.performer_id = p.id
			WHERE p.favorite = 1
		)
		SELECT
			CASE WHEN fav.scene_id IS NOT NULL THEN 'true' ELSE 'false' END as performer_favorite,
			COUNT(*) as count
		FROM scenes s
		LEFT JOIN favorite_scenes fav ON s.id = fav.scene_id
		GROUP BY performer_favorite
	`

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rows, err := benchDB.QueryContext(ctx, query)
		if err != nil {
			b.Fatalf("Query failed: %v", err)
		}
		for rows.Next() {
			var perfFav string
			var count int
			rows.Scan(&perfFav, &count)
		}
		rows.Close()
	}
}

// =============================================================================
// INDEX IMPACT: Test queries with and without indexes
// =============================================================================

func BenchmarkSceneMarkersIndex_Without(b *testing.B) {
	if benchDB == nil {
		b.Skip("Benchmark database not available")
	}

	ctx := context.Background()

	// Drop the index if it exists
	benchDB.ExecContext(ctx, "DROP INDEX IF EXISTS idx_ext_scene_markers_scene")

	query := `SELECT scene_id, COUNT(*) FROM scene_markers GROUP BY scene_id LIMIT 100`

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rows, err := benchDB.QueryContext(ctx, query)
		if err != nil {
			b.Fatalf("Query failed: %v", err)
		}
		for rows.Next() {
			var sceneID, count int
			rows.Scan(&sceneID, &count)
		}
		rows.Close()
	}
}

func BenchmarkSceneMarkersIndex_With(b *testing.B) {
	if benchDB == nil {
		b.Skip("Benchmark database not available")
	}

	ctx := context.Background()

	// Create the index
	benchDB.ExecContext(ctx, "CREATE INDEX IF NOT EXISTS idx_ext_scene_markers_scene ON scene_markers (scene_id)")

	query := `SELECT scene_id, COUNT(*) FROM scene_markers GROUP BY scene_id LIMIT 100`

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rows, err := benchDB.QueryContext(ctx, query)
		if err != nil {
			b.Fatalf("Query failed: %v", err)
		}
		for rows.Next() {
			var sceneID, count int
			rows.Scan(&sceneID, &count)
		}
		rows.Close()
	}
}

// =============================================================================
// HELPER: Print database stats
// =============================================================================

func TestPrintDatabaseStats(t *testing.T) {
	if benchDB == nil {
		t.Skip("Benchmark database not available")
	}

	ctx := context.Background()

	stats := []struct {
		name  string
		query string
	}{
		{"Scenes", "SELECT COUNT(*) FROM scenes"},
		{"Galleries", "SELECT COUNT(*) FROM galleries"},
		{"Performers", "SELECT COUNT(*) FROM performers"},
		{"Tags", "SELECT COUNT(*) FROM tags"},
		{"Scene Markers", "SELECT COUNT(*) FROM scene_markers"},
		{"Scenes with Markers", "SELECT COUNT(DISTINCT scene_id) FROM scene_markers"},
		{"Favorite Performers", "SELECT COUNT(*) FROM performers WHERE favorite = 1"},
		{"Scenes with Fav Performers", `
			SELECT COUNT(DISTINCT ps.scene_id)
			FROM performers_scenes ps
			INNER JOIN performers p ON ps.performer_id = p.id
			WHERE p.favorite = 1
		`},
	}

	fmt.Println("\n=== Database Statistics ===")
	for _, s := range stats {
		var count int
		err := benchDB.QueryRowContext(ctx, s.query).Scan(&count)
		if err != nil {
			fmt.Printf("%-25s ERROR: %v\n", s.name+":", err)
		} else {
			fmt.Printf("%-25s %d\n", s.name+":", count)
		}
	}
	fmt.Println("===========================")
}

// =============================================================================
// ALL SCENE FACETS: Comprehensive performance comparison
// =============================================================================

func TestTimeAllSceneFacets(t *testing.T) {
	if benchDB == nil {
		t.Skip("Benchmark database not available")
	}

	ctx := context.Background()

	// Get a studio ID with many scenes for realistic filtering (exclude one studio)
	var studioID int
	err := benchDB.QueryRowContext(ctx, `
		SELECT studio_id FROM scenes
		WHERE studio_id IS NOT NULL
		GROUP BY studio_id
		ORDER BY COUNT(*) DESC
		LIMIT 1 OFFSET 1
	`).Scan(&studioID)
	if err != nil {
		t.Skipf("Could not find studio for filtering: %v", err)
	}

	// Base filter subquery (excluding one studio)
	baseFilter := fmt.Sprintf(`SELECT s.id FROM scenes s WHERE s.studio_id IS NULL OR s.studio_id != %d`, studioID)

	// Facets using OLD CTE approach
	facetsCTE := map[string]string{
		"01_Tags_CTE": fmt.Sprintf(`
			WITH filtered_scenes AS (%s)
			SELECT t.id, t.name as label, COUNT(DISTINCT st.scene_id) as count
			FROM filtered_scenes fs
			INNER JOIN scenes_tags st ON fs.id = st.scene_id
			INNER JOIN tags t ON st.tag_id = t.id
			GROUP BY t.id
			ORDER BY count DESC
			LIMIT 100
		`, baseFilter),

		"02_Performers_CTE": fmt.Sprintf(`
			WITH filtered_scenes AS (%s)
			SELECT p.id, p.name as label, COUNT(DISTINCT ps.scene_id) as count
			FROM filtered_scenes fs
			INNER JOIN performers_scenes ps ON fs.id = ps.scene_id
			INNER JOIN performers p ON ps.performer_id = p.id
			GROUP BY p.id
			ORDER BY count DESC
			LIMIT 100
		`, baseFilter),

		"03_Groups_CTE": fmt.Sprintf(`
			WITH filtered_scenes AS (%s)
			SELECT g.id, g.name as label, COUNT(DISTINCT gs.scene_id) as count
			FROM filtered_scenes fs
			INNER JOIN groups_scenes gs ON fs.id = gs.scene_id
			INNER JOIN groups g ON gs.group_id = g.id
			GROUP BY g.id
			ORDER BY count DESC
			LIMIT 100
		`, baseFilter),

		"04_PerformerTags_CTE": fmt.Sprintf(`
			WITH filtered_scenes AS (%s)
			SELECT t.id, t.name as label, COUNT(DISTINCT fs.id) as count
			FROM filtered_scenes fs
			INNER JOIN performers_scenes ps ON fs.id = ps.scene_id
			INNER JOIN performers_tags pt ON ps.performer_id = pt.performer_id
			INNER JOIN tags t ON pt.tag_id = t.id
			GROUP BY t.id
			ORDER BY count DESC
			LIMIT 100
		`, baseFilter),
	}

	// Facets using NEW IN subquery approach (optimized)
	facetsIN := map[string]string{
		"05_Tags_IN": fmt.Sprintf(`
			SELECT t.id, t.name as label, COUNT(DISTINCT st.scene_id) as count
			FROM scenes_tags st
			INNER JOIN tags t ON st.tag_id = t.id
			WHERE st.scene_id IN (%s)
			GROUP BY t.id
			ORDER BY count DESC
			LIMIT 100
		`, baseFilter),

		"06_Performers_IN": fmt.Sprintf(`
			SELECT p.id, p.name as label, COUNT(DISTINCT ps.scene_id) as count
			FROM performers_scenes ps
			INNER JOIN performers p ON ps.performer_id = p.id
			WHERE ps.scene_id IN (%s)
			GROUP BY p.id
			ORDER BY count DESC
			LIMIT 100
		`, baseFilter),

		"07_Groups_IN": fmt.Sprintf(`
			SELECT g.id, g.name as label, COUNT(DISTINCT gs.scene_id) as count
			FROM groups_scenes gs
			INNER JOIN groups g ON gs.group_id = g.id
			WHERE gs.scene_id IN (%s)
			GROUP BY g.id
			ORDER BY count DESC
			LIMIT 100
		`, baseFilter),

		"08_PerformerTags_IN": fmt.Sprintf(`
			SELECT t.id, t.name as label, COUNT(DISTINCT ps.scene_id) as count
			FROM performers_scenes ps
			INNER JOIN performers_tags pt ON ps.performer_id = pt.performer_id
			INNER JOIN tags t ON pt.tag_id = t.id
			WHERE ps.scene_id IN (%s)
			GROUP BY t.id
			ORDER BY count DESC
			LIMIT 100
		`, baseFilter),
	}

	// Merge all facets
	allFacets := make(map[string]string)
	for k, v := range facetsCTE {
		allFacets[k] = v
	}
	for k, v := range facetsIN {
		allFacets[k] = v
	}

	fmt.Println("\n=== CTE vs IN Subquery Performance Comparison ===")
	fmt.Printf("Filter: Excluding studio ID %d\n\n", studioID)
	fmt.Printf("%-30s %15s %15s %15s\n", "Facet", "Run 1", "Run 2", "Run 3")
	fmt.Println(strings.Repeat("-", 80))

	// Sort keys for consistent output
	keys := make([]string, 0, len(allFacets))
	for k := range allFacets {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, name := range keys {
		query := allFacets[name]
		times := make([]time.Duration, 3)

		for i := 0; i < 3; i++ {
			start := time.Now()
			rows, err := benchDB.QueryContext(ctx, query)
			if err != nil {
				fmt.Printf("%-30s ERROR: %v\n", name+":", err)
				break
			}
			rowCount := 0
			for rows.Next() {
				rowCount++
			}
			rows.Close()
			times[i] = time.Since(start)
		}

		fmt.Printf("%-30s %15v %15v %15v\n", name+":", times[0], times[1], times[2])
	}
	fmt.Println("================================================================================")
}

// =============================================================================
// TIMING HELPER: Run a single query and report timing
// =============================================================================

func TestTimeSingleQuery(t *testing.T) {
	if benchDB == nil {
		t.Skip("Benchmark database not available")
	}

	ctx := context.Background()

	queries := map[string]string{
		"HasMarkers_EXISTS": `
			SELECT
				CASE WHEN EXISTS (SELECT 1 FROM scene_markers sm WHERE sm.scene_id = s.id)
				THEN 'true' ELSE 'false' END as has_markers,
				COUNT(*) as count
			FROM scenes s
			GROUP BY has_markers
		`,
		"HasMarkers_LEFTJOIN": `
			WITH marker_scenes AS (SELECT DISTINCT scene_id FROM scene_markers)
			SELECT
				CASE WHEN ms.scene_id IS NOT NULL THEN 'true' ELSE 'false' END as has_markers,
				COUNT(*) as count
			FROM scenes s
			LEFT JOIN marker_scenes ms ON s.id = ms.scene_id
			GROUP BY has_markers
		`,
		"PerformerFav_EXISTS": `
			SELECT
				CASE WHEN EXISTS (
					SELECT 1 FROM performers_scenes ps
					INNER JOIN performers p ON ps.performer_id = p.id
					WHERE ps.scene_id = s.id AND p.favorite = 1
				) THEN 'true' ELSE 'false' END as performer_favorite,
				COUNT(*) as count
			FROM scenes s
			GROUP BY performer_favorite
		`,
		"PerformerFav_LEFTJOIN": `
			WITH favorite_scenes AS (
				SELECT DISTINCT ps.scene_id
				FROM performers_scenes ps
				INNER JOIN performers p ON ps.performer_id = p.id
				WHERE p.favorite = 1
			)
			SELECT
				CASE WHEN fav.scene_id IS NOT NULL THEN 'true' ELSE 'false' END as performer_favorite,
				COUNT(*) as count
			FROM scenes s
			LEFT JOIN favorite_scenes fav ON s.id = fav.scene_id
			GROUP BY performer_favorite
		`,
	}

	fmt.Println("\n=== Single Query Timing (average of 3 runs) ===")
	for name, query := range queries {
		var totalDuration time.Duration
		runs := 3

		for i := 0; i < runs; i++ {
			start := time.Now()
			rows, err := benchDB.QueryContext(ctx, query)
			if err != nil {
				fmt.Printf("%-25s ERROR: %v\n", name+":", err)
				continue
			}
			for rows.Next() {
				var val string
				var count int
				rows.Scan(&val, &count)
			}
			rows.Close()
			totalDuration += time.Since(start)
		}

		avgDuration := totalDuration / time.Duration(runs)
		fmt.Printf("%-25s %v\n", name+":", avgDuration)
	}
	fmt.Println("===============================================")
}
