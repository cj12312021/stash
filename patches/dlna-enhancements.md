# DLNA Enhancements

This document describes all modifications to upstream DLNA files for:
1. **Alphabetical folder hierarchy** - A-Z folders for performers, studios, tags, groups
2. **Database-level pagination** - Efficient browsing of large collections
3. **Activity tracking** - Watch progress tracking for DLNA playback
4. **Debug logging** - Comprehensive logging for DLNA troubleshooting

---

## New Files (Won't Conflict)

These files don't exist upstream and will merge cleanly:

```
internal/dlna/activity.go         # Activity tracking for DLNA playback
internal/dlna/activity_test.go    # Activity tracking tests
```

---

## Modified Files

### 1. `internal/dlna/dms.go`

**Purpose:** Add Query methods to finder interfaces for paginated browsing.

#### Changes to Interfaces (around line 54-73)

```diff
 type SceneFinder interface {
 	models.SceneGetter
 	models.SceneQueryer
 }

 type StudioFinder interface {
 	All(ctx context.Context) ([]*models.Studio, error)
+	Query(ctx context.Context, studioFilter *models.StudioFilterType, findFilter *models.FindFilterType) ([]*models.Studio, int, error)
 }

 type TagFinder interface {
 	All(ctx context.Context) ([]*models.Tag, error)
+	Query(ctx context.Context, tagFilter *models.TagFilterType, findFilter *models.FindFilterType) ([]*models.Tag, int, error)
 }

 type PerformerFinder interface {
 	All(ctx context.Context) ([]*models.Performer, error)
+	Query(ctx context.Context, performerFilter *models.PerformerFilterType, findFilter *models.FindFilterType) ([]*models.Performer, int, error)
 }

 type GroupFinder interface {
 	All(ctx context.Context) ([]*models.Group, error)
+	Query(ctx context.Context, groupFilter *models.GroupFilterType, findFilter *models.FindFilterType) ([]*models.Group, int, error)
 }
```

#### Changes to Server struct (around line 280)

```diff
 type Server struct {
 	// ... existing fields ...
+	activityTracker    *ActivityTracker
 	VideoSortOrder     string
 	// ...
 }
```

#### Changes to initMux (res handler, around line 597-638)

Add activity tracking before streaming:

```go
// Track activity - uses time-based tracking, updated on each request
if me.activityTracker != nil {
	sceneIdInt, _ := strconv.Atoi(sceneId)
	clientIP, _, _ := net.SplitHostPort(r.RemoteAddr)
	me.activityTracker.RecordRequest(sceneIdInt, clientIP, videoDuration)
}
```

---

### 2. `internal/dlna/service.go`

**Purpose:** Initialize and manage ActivityTracker lifecycle.

#### Add to Service struct (around line 80)

```diff
 type Service struct {
 	// ... existing fields ...
+	activityTracker *ActivityTracker
 }
```

#### Add to NewService function

```diff
+// Initialize activity tracker
+activityTracker := NewActivityTracker(repository.TxnManager, repository.SceneFinder, config)
```

#### Add to Stop function

```diff
+if s.activityTracker != nil {
+	s.activityTracker.Stop()
+}
```

#### Pass to Server in init()

```diff
 s.server = &Server{
 	// ... existing fields ...
+	activityTracker:    s.activityTracker,
 }
```

---

### 3. `internal/dlna/cds.go`

**Purpose:** Major enhancements for alphabetical browsing and pagination.

This file has significant changes. The key additions are:

#### A. Constants (add near top)

```go
// Maximum items to return per DLNA browse request for large collections (scenes, etc.)
const maxDLNABrowseCount = 100

// Maximum items for letter-filtered folders (performers/A, studios/B, etc.)
const maxDLNALetterFolderCount = 10000
```

#### B. browseResult struct (add before handleBrowseDirectChildren)

```go
// browseResult holds the result of browsing a directory with pagination support
type browseResult struct {
	Objects     []interface{}
	TotalCount  int
	IsPaginated bool // true if pagination was applied at the database level
}
```

#### C. handleBrowseDirectChildren - Complete rewrite

The function is rewritten to:
1. Add debug logging for all requests
2. Use switch/case for path routing
3. Support alphabetical folder hierarchy
4. Support database-level pagination

Key path handling:

| Path | Handler |
|------|---------|
| `performers` | `getAlphabetFolders("performers")` |
| `performers/A` | `getPerformersByLetter("A", ...)` |
| `performers/A/123` | `getPerformerScenes(...)` |
| `studios` | `getAlphabetFolders("studios")` |
| `studios/B` | `getStudiosByLetter("B", ...)` |
| `tags` | `getAlphabetFolders("tags")` |
| `tags/C` | `getTagsByLetter("C", ...)` |
| `groups` | `getAlphabetFolders("groups")` |
| `groups/D` | `getGroupsByLetter("D", ...)` |

#### D. New helper functions (add after makeStorageFolder)

```go
// getAlphabetFolders returns A-Z folders plus a # folder for non-alphabetic names
func getAlphabetFolders(parentID string) []interface{} { ... }

// isLetterFolder checks if the path component is a valid letter folder (A-Z or #)
func isLetterFolder(s string) bool { ... }

// getFirstLetter returns the uppercase first letter for alphabetical grouping
func getFirstLetter(name string) string { ... }
```

#### E. Paginated query functions (add after getGroupsPaginated)

```go
// getAllScenesPaginated returns scenes with database-level pagination
func (me *contentDirectoryService) getAllScenesPaginated(host string, startIndex int, count int) browseResult { ... }

// getStudiosPaginated returns studios with database-level pagination
func (me *contentDirectoryService) getStudiosPaginated(startIndex int, count int) browseResult { ... }

// getTagsPaginated returns tags with database-level pagination
func (me *contentDirectoryService) getTagsPaginated(startIndex int, count int) browseResult { ... }

// getPerformersPaginated returns performers with database-level pagination
func (me *contentDirectoryService) getPerformersPaginated(startIndex int, count int) browseResult { ... }

// getGroupsPaginated returns groups with database-level pagination
func (me *contentDirectoryService) getGroupsPaginated(startIndex int, count int) browseResult { ... }
```

#### F. Letter-filtered query functions

```go
// getPerformersByLetter returns performers whose names start with the given letter
func (me *contentDirectoryService) getPerformersByLetter(letter string, startIndex int, count int) browseResult { ... }

// getStudiosByLetter returns studios whose names start with the given letter
func (me *contentDirectoryService) getStudiosByLetter(letter string, startIndex int, count int) browseResult { ... }

// getTagsByLetter returns tags whose names start with the given letter
func (me *contentDirectoryService) getTagsByLetter(letter string, startIndex int, count int) browseResult { ... }

// getGroupsByLetter returns groups whose names start with the given letter
func (me *contentDirectoryService) getGroupsByLetter(letter string, startIndex int, count int) browseResult { ... }
```

#### G. makeBrowseResult functions (add after existing makeBrowseResult)

```go
// makeBrowseResultDirect creates a browse result without applying pagination
func makeBrowseResultDirect(objs []interface{}, totalMatches int, updateID string) (map[string]string, error) { ... }
```

---

### 4. `internal/dlna/cds_test.go`

**Purpose:** Add tests for alphabetical folder functionality.

#### New tests to add

```go
func TestBrowsePerformersReturnsAlphabet(t *testing.T) { ... }
func TestBrowseStudiosReturnsAlphabet(t *testing.T) { ... }
func TestBrowseTagsReturnsAlphabet(t *testing.T) { ... }
func TestBrowseGroupsReturnsAlphabet(t *testing.T) { ... }
func TestIsLetterFolder(t *testing.T) { ... }
func TestGetFirstLetter(t *testing.T) { ... }
```

---

## Merge Procedure

When merging upstream changes:

### Step 1: Check for conflicts in DLNA files

```bash
git status | grep internal/dlna
```

### Step 2: If `dms.go` conflicts

Re-add Query methods to finder interfaces (see diff above).

### Step 3: If `service.go` conflicts

Re-add ActivityTracker initialization and lifecycle management.

### Step 4: If `cds.go` conflicts

This is the most likely conflict point. Options:

1. **If upstream made minor changes:** Manually re-apply our additions
2. **If upstream restructured significantly:** May need to adapt the alphabetical folder logic

### Step 5: Verify new files exist

```bash
ls internal/dlna/activity*.go
```

These should not conflict as they're new files.

### Step 6: Run tests

```bash
go test -v ./internal/dlna/...
```

---

## Feature Summary

| Feature | Benefit |
|---------|---------|
| A-Z folders | Navigate 69,000 performers by letter instead of flat list |
| Database pagination | Query only needed items, not entire collection |
| Activity tracking | Track watch progress for DLNA playback |
| Debug logging | Troubleshoot DLNA client compatibility issues |

---

## Configuration

Activity tracking uses the existing "Enable Scene Play History" setting in Stash UI.
No additional configuration is required.

