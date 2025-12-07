# Test Data Directory

This directory is for placing copies of production databases for testing optimizations.

**⚠️ This directory is gitignored - nothing here will be committed.**

## Usage

1. **Copy your production database here:**
   ```powershell
   # Make sure stash is STOPPED first!
   Copy-Item "C:\Users\Admin\.stash\stash-go.sqlite" ".\test-data\stash-go.sqlite"
   ```

2. **The following files are gitignored:**
   - `*.sqlite` - SQLite database files
   - `*.sqlite-wal` - Write-ahead log files
   - `*.sqlite-shm` - Shared memory files

## Testing Extension Indexes

After placing your database here, you can test the extension indexes:

```powershell
# From project root, start stash pointing to test database
# (Update your config.yml database path, or use command line flag)
```

### Verify Indexes

Connect to the SQLite database and run:

```sql
-- List all extension indexes
SELECT name, sql FROM sqlite_master 
WHERE type = 'index' AND name LIKE 'idx_ext_%';

-- Check query plans use new indexes
EXPLAIN QUERY PLAN
SELECT t.id, COUNT(DISTINCT st.scene_id)
FROM scenes_tags st
INNER JOIN tags t ON st.tag_id = t.id
WHERE st.scene_id IN (SELECT id FROM scenes LIMIT 1000)
GROUP BY t.id;
```

### Benchmark Facets

Use the GraphQL playground to time facet queries:

```graphql
query {
  sceneFacets(limit: 100) {
    tags { id count }
    performers { id count }
    studios { id count }
  }
}
```

## Cleanup

When done testing, simply delete the files in this directory. They won't affect your production database.

