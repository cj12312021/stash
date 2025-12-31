package dlna

// from https://github.com/rclone/rclone
// Copyright (C) 2012 by Nick Craig-Wood http://www.craig-wood.com/nick/

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import (
	"context"
	"encoding/xml"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/anacrolix/dms/dlna"
	"github.com/anacrolix/dms/upnp"
	"github.com/anacrolix/dms/upnpav"
	"github.com/stashapp/stash/pkg/logger"
	"github.com/stashapp/stash/pkg/models"
	"github.com/stashapp/stash/pkg/scene"
)

var pageSize = 100

type browse struct {
	ObjectID       string
	BrowseFlag     string
	Filter         string
	StartingIndex  int
	RequestedCount int
}

type contentDirectoryService struct {
	*Server
	upnp.Eventing
}

func formatDurationSexagesimal(d time.Duration) string {
	ns := d % time.Second
	d /= time.Second
	s := d % 60
	d /= 60
	m := d % 60
	d /= 60
	h := d
	ret := fmt.Sprintf("%d:%02d:%02d.%09d", h, m, s, ns)
	ret = strings.TrimRight(ret, "0")
	ret = strings.TrimRight(ret, ".")
	return ret
}

func (me *contentDirectoryService) updateIDString() string {
	return fmt.Sprintf("%d", uint32(os.Getpid()))
}

func sceneToContainer(scene *models.Scene, parent string, host string) interface{} {
	// make stash server URL
	// TODO - fix this
	iconURI := (&url.URL{
		Scheme: "http",
		Host:   host,
		Path:   iconPath,
		RawQuery: url.Values{
			"scene": {strconv.Itoa(scene.ID)},
		}.Encode(),
	}).String()

	// Object goes first
	obj := upnpav.Object{
		ID:          strconv.Itoa(scene.ID),
		Restricted:  1,
		ParentID:    parent,
		Title:       scene.GetTitle(),
		Class:       "object.item.videoItem",
		Icon:        iconURI,
		AlbumArtURI: iconURI,
	}

	// Wrap up
	item := upnpav.Item{
		Object: obj,
		Res:    make([]upnpav.Resource, 0, 1),
	}

	mimeType := "video/mp4"
	var (
		size     int
		bitrate  uint
		duration int64
	)

	f := scene.Files.Primary()
	if f != nil {
		size = int(f.Size)
		bitrate = uint(f.BitRate)
		duration = int64(f.Duration)
	}

	item.Res = append(item.Res, upnpav.Resource{
		URL: (&url.URL{
			Scheme: "http",
			Host:   host,
			Path:   resPath,
			RawQuery: url.Values{
				"scene": {strconv.Itoa(scene.ID)},
			}.Encode(),
		}).String(),
		ProtocolInfo: fmt.Sprintf("http-get:*:%s:%s", mimeType, dlna.ContentFeatures{
			SupportRange: true,
		}.String()),
		Bitrate:  bitrate,
		Duration: formatDurationSexagesimal(time.Duration(duration) * time.Second),
		Size:     uint64(size),
		// Resolution: resolution,
	})

	item.Res = append(item.Res, upnpav.Resource{
		URL:          iconURI,
		ProtocolInfo: "http-get:*:image/jpeg:DLNA.ORG_PN=JPEG_MED",
	})

	return item
}

// ContentDirectory object from ObjectID.
func (me *contentDirectoryService) objectFromID(id string) (o object, err error) {
	o.Path, err = url.QueryUnescape(id)
	if err != nil {
		return
	}
	if o.Path == "0" {
		o.Path = "/"
	}
	// o.Path = path.Clean(o.Path)
	// if !path.IsAbs(o.Path) {
	// 	err = fmt.Errorf("bad ObjectID %v", o.Path)
	// 	return
	// }
	o.RootObjectPath = me.RootObjectPath

	return
}

func childPath(paths []string) []string {
	if len(paths) > 1 {
		return paths[1:]
	}

	return nil
}

func (me *contentDirectoryService) Handle(action string, argsXML []byte, r *http.Request) (map[string]string, error) {
	host := r.Host
	userAgent := r.UserAgent()

	logger.Debugf("[DLNA CDS] Action: %s, User-Agent: %s, RemoteAddr: %s", action, userAgent, r.RemoteAddr)

	switch action {
	case "GetSystemUpdateID":
		return map[string]string{
			"Id": me.updateIDString(),
		}, nil
	case "GetSortCapabilities":
		return map[string]string{
			"SortCaps": "dc:title",
		}, nil
	case "Browse":
		var browse browse
		if err := xml.Unmarshal([]byte(argsXML), &browse); err != nil {
			logger.Warnf("[DLNA CDS] Failed to unmarshal Browse request: %v", err)
			return nil, upnp.Errorf(upnp.ArgumentValueInvalidErrorCode, "cannot unmarshal browse argument: %s", err.Error())
		}

		logger.Debugf("[DLNA CDS] Browse request: ObjectID=%q, BrowseFlag=%s, Filter=%q, StartingIndex=%d, RequestedCount=%d",
			browse.ObjectID, browse.BrowseFlag, browse.Filter, browse.StartingIndex, browse.RequestedCount)

		obj, err := me.objectFromID(browse.ObjectID)
		if err != nil {
			logger.Warnf("[DLNA CDS] Failed to find object: ObjectID=%q, error=%v", browse.ObjectID, err)
			return nil, upnp.Errorf(upnpav.NoSuchObjectErrorCode, "cannot find object with id %q: %v", browse.ObjectID, err.Error())
		}

		logger.Debugf("[DLNA CDS] Resolved object: Path=%q, IsRoot=%v", obj.Path, obj.IsRoot())

		switch browse.BrowseFlag {
		case "BrowseDirectChildren":
			return me.handleBrowseDirectChildren(obj, host, browse)
		case "BrowseMetadata":
			return me.handleBrowseMetadata(obj, host)
		default:
			return nil, upnp.Errorf(upnp.ArgumentValueInvalidErrorCode, "unhandled browse flag: %v", browse.BrowseFlag)
		}
	case "GetSearchCapabilities":
		return map[string]string{
			"SearchCaps": "",
		}, nil
	// from https://github.com/rclone/rclone/blob/master/cmd/serve/dlna/cds.go
	// Samsung Extensions
	case "X_GetFeatureList":
		return map[string]string{
			"FeatureList": `<Features xmlns="urn:schemas-upnp-org:av:avs" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:schemas-upnp-org:av:avs http://www.upnp.org/schemas/av/avs.xsd">
	<Feature name="samsung.com_BASICVIEW" version="1">
		<container id="0" type="object.item.imageItem"/>
		<container id="0" type="object.item.audioItem"/>
		<container id="0" type="object.item.videoItem"/>
	</Feature>
	</Features>`}, nil
	case "X_SetBookmark":
		// just ignore
		return map[string]string{}, nil
	default:
		return nil, upnp.InvalidActionError
	}
}

// browseResult holds the result of browsing a directory with pagination support
type browseResult struct {
	Objects     []interface{}
	TotalCount  int
	IsPaginated bool // true if pagination was applied at the database level
}

// Maximum items to return per DLNA browse request for large collections (scenes, etc.)
// Large values cause massive XML responses that overwhelm clients
const maxDLNABrowseCount = 100

// Maximum items for letter-filtered folders (performers/A, studios/B, etc.)
// Higher limit since these are already filtered to a single letter
const maxDLNALetterFolderCount = 10000

func (me *contentDirectoryService) handleBrowseDirectChildren(obj object, host string, browse browse) (map[string]string, error) {
	logger.Debugf("[DLNA CDS] BrowseDirectChildren: Path=%q", obj.Path)

	startIndex := browse.StartingIndex

	// Default count with standard limit for large collections
	count := browse.RequestedCount
	if count == 0 || count > maxDLNABrowseCount {
		count = maxDLNABrowseCount
	}

	// Higher limit for letter-filtered folders
	letterFolderCount := browse.RequestedCount
	if letterFolderCount == 0 || letterFolderCount > maxDLNALetterFolderCount {
		letterFolderCount = maxDLNALetterFolderCount
	}

	var result browseResult

	paths := strings.Split(obj.Path, "/")

	switch {
	case obj.IsRoot():
		objs := getRootObjects()
		result = browseResult{Objects: objs, TotalCount: len(objs), IsPaginated: false}

	case obj.Path == "all":
		result = me.getAllScenesPaginated(host, startIndex, count)

	case strings.HasPrefix(obj.Path, "all/"):
		page := getPageFromID(paths)
		if page != nil {
			objs := me.getPageVideos(&models.SceneFilterType{}, "all", *page, host)
			result = browseResult{Objects: objs, TotalCount: len(objs), IsPaginated: false}
		}

	case obj.Path == "studios":
		// Show A-Z letter folders for studios
		objs := getAlphabetFolders("studios")
		result = browseResult{Objects: objs, TotalCount: len(objs), IsPaginated: false}

	case strings.HasPrefix(obj.Path, "studios/"):
		// Check if this is a letter folder (e.g., "studios/A") or a studio ID (e.g., "studios/A/123")
		subPaths := childPath(paths)
		if len(subPaths) == 1 && isLetterFolder(subPaths[0]) {
			// Letter folder - show studios starting with this letter (higher limit)
			result = me.getStudiosByLetter(subPaths[0], startIndex, letterFolderCount)
		} else if len(subPaths) >= 2 && isLetterFolder(subPaths[0]) {
			// Studio ID under letter folder - show scenes
			objs := me.getStudioScenes(subPaths[1:], host)
			result = browseResult{Objects: objs, TotalCount: len(objs), IsPaginated: false}
		} else {
			// Legacy path without letter - show scenes directly
			objs := me.getStudioScenes(subPaths, host)
			result = browseResult{Objects: objs, TotalCount: len(objs), IsPaginated: false}
		}

	case obj.Path == "tags":
		// Show A-Z letter folders for tags
		objs := getAlphabetFolders("tags")
		result = browseResult{Objects: objs, TotalCount: len(objs), IsPaginated: false}

	case strings.HasPrefix(obj.Path, "tags/"):
		// Check if this is a letter folder (e.g., "tags/A") or a tag ID (e.g., "tags/A/123")
		subPaths := childPath(paths)
		if len(subPaths) == 1 && isLetterFolder(subPaths[0]) {
			// Letter folder - show tags starting with this letter (higher limit)
			result = me.getTagsByLetter(subPaths[0], startIndex, letterFolderCount)
		} else if len(subPaths) >= 2 && isLetterFolder(subPaths[0]) {
			// Tag ID under letter folder - show scenes
			objs := me.getTagScenes(subPaths[1:], host)
			result = browseResult{Objects: objs, TotalCount: len(objs), IsPaginated: false}
		} else {
			// Legacy path without letter - show scenes directly
			objs := me.getTagScenes(subPaths, host)
			result = browseResult{Objects: objs, TotalCount: len(objs), IsPaginated: false}
		}

	case obj.Path == "performers":
		// Show A-Z letter folders for performers
		objs := getAlphabetFolders("performers")
		result = browseResult{Objects: objs, TotalCount: len(objs), IsPaginated: false}

	case strings.HasPrefix(obj.Path, "performers/"):
		// Check if this is a letter folder (e.g., "performers/A") or a performer ID (e.g., "performers/A/123")
		subPaths := childPath(paths)
		if len(subPaths) == 1 && isLetterFolder(subPaths[0]) {
			// Letter folder - show performers starting with this letter (higher limit)
			result = me.getPerformersByLetter(subPaths[0], startIndex, letterFolderCount)
		} else if len(subPaths) >= 2 && isLetterFolder(subPaths[0]) {
			// Performer ID under letter folder - show scenes
			objs := me.getPerformerScenes(subPaths[1:], host)
			result = browseResult{Objects: objs, TotalCount: len(objs), IsPaginated: false}
		} else {
			// Legacy path without letter - show scenes directly
			objs := me.getPerformerScenes(subPaths, host)
			result = browseResult{Objects: objs, TotalCount: len(objs), IsPaginated: false}
		}

	case obj.Path == "groups":
		// Show A-Z letter folders for groups
		objs := getAlphabetFolders("groups")
		result = browseResult{Objects: objs, TotalCount: len(objs), IsPaginated: false}

	case strings.HasPrefix(obj.Path, "groups/"):
		// Check if this is a letter folder (e.g., "groups/A") or a group ID (e.g., "groups/A/123")
		subPaths := childPath(paths)
		if len(subPaths) == 1 && isLetterFolder(subPaths[0]) {
			// Letter folder - show groups starting with this letter (higher limit)
			result = me.getGroupsByLetter(subPaths[0], startIndex, letterFolderCount)
		} else if len(subPaths) >= 2 && isLetterFolder(subPaths[0]) {
			// Group ID under letter folder - show scenes
			objs := me.getGroupScenes(subPaths[1:], host)
			result = browseResult{Objects: objs, TotalCount: len(objs), IsPaginated: false}
		} else {
			// Legacy path without letter - show scenes directly
			objs := me.getGroupScenes(subPaths, host)
			result = browseResult{Objects: objs, TotalCount: len(objs), IsPaginated: false}
		}

	case obj.Path == "rating":
		objs := me.getRating()
		result = browseResult{Objects: objs, TotalCount: len(objs), IsPaginated: false}

	case strings.HasPrefix(obj.Path, "rating/"):
		objs := me.getRatingScenes(childPath(paths), host)
		result = browseResult{Objects: objs, TotalCount: len(objs), IsPaginated: false}
	}

	logger.Debugf("[DLNA CDS] BrowseDirectChildren: Path=%q returned %d objects (total: %d, paginated: %v)",
		obj.Path, len(result.Objects), result.TotalCount, result.IsPaginated)

	// If pagination was already applied at DB level, don't apply it again
	if result.IsPaginated {
		return makeBrowseResultDirect(result.Objects, result.TotalCount, me.updateIDString())
	}

	return makeBrowseResult(result.Objects, me.updateIDString(), browse.StartingIndex, browse.RequestedCount)
}

func (me *contentDirectoryService) handleBrowseMetadata(obj object, host string) (map[string]string, error) {
	logger.Debugf("[DLNA CDS] BrowseMetadata: Path=%q", obj.Path)

	var objs []interface{}
	var updateID string

	// if numeric, then must be scene, otherwise handle as if path
	sceneID, err := strconv.Atoi(obj.Path)
	if err != nil {
		// #1465 - handle root object
		if obj.IsRoot() {
			objs = getRootObject()
		} else {
			// HACK: just create a fake storage folder to return. The name won't
			// be correct, but hopefully the names returned from handleBrowseDirectChildren
			// will be used instead.
			objs = []interface{}{makeStorageFolder(obj.ID(), obj.ID(), obj.ParentID())}
		}

		updateID = me.updateIDString()
	} else {
		var scene *models.Scene

		r := me.repository
		if err := r.WithReadTxn(context.TODO(), func(ctx context.Context) error {
			scene, err = r.SceneFinder.Find(ctx, sceneID)
			if scene != nil {
				err = scene.LoadPrimaryFile(ctx, r.FileGetter)
			}

			if err != nil {
				return err
			}

			return nil
		}); err != nil {
			logger.Error(err.Error())
		}

		if scene != nil {
			upnpObject := sceneToContainer(scene, "-1", host)
			objs = []interface{}{upnpObject}

			// http://upnp.org/specs/av/UPnP-av-ContentDirectory-v1-Service.pdf
			// maximum update ID is 2**32, then rolls back to 0
			const maxUpdateID int64 = 1 << 32
			updateID = fmt.Sprint(scene.UpdatedAt.Unix() % maxUpdateID)
		} else {
			logger.Warnf("[DLNA CDS] BrowseMetadata: scene not found for ID=%d", sceneID)
			return nil, upnp.Errorf(upnpav.NoSuchObjectErrorCode, "scene not found")
		}
	}

	logger.Debugf("[DLNA CDS] BrowseMetadata: Path=%q returned %d objects", obj.Path, len(objs))

	// BrowseMetadata always returns a single object, no pagination needed
	return makeBrowseResult(objs, updateID, 0, 0)
}

func makeBrowseResult(objs []interface{}, updateID string, startingIndex int, requestedCount int) (map[string]string, error) {
	totalMatches := len(objs)

	// Apply pagination if requested
	// Note: Many DLNA clients send RequestedCount=0 to mean "return all"
	if startingIndex > 0 || (requestedCount > 0 && requestedCount < totalMatches) {
		logger.Debugf("[DLNA CDS] Applying pagination: StartingIndex=%d, RequestedCount=%d, TotalMatches=%d",
			startingIndex, requestedCount, totalMatches)

		// Clamp starting index
		if startingIndex >= totalMatches {
			objs = []interface{}{}
		} else {
			endIndex := totalMatches
			if requestedCount > 0 && startingIndex+requestedCount < totalMatches {
				endIndex = startingIndex + requestedCount
			}
			objs = objs[startingIndex:endIndex]
		}
	}

	return makeBrowseResultDirect(objs, totalMatches, updateID)
}

// makeBrowseResultDirect creates a browse result without applying pagination
// (used when pagination was already applied at the database level)
func makeBrowseResultDirect(objs []interface{}, totalMatches int, updateID string) (map[string]string, error) {
	result, err := xml.Marshal(objs)
	if err != nil {
		logger.Errorf("[DLNA CDS] Failed to marshal browse result: %v", err)
		return nil, upnp.Errorf(upnp.ActionFailedErrorCode, "could not marshal objects: %s", err.Error())
	}

	didlResult := didl_lite(string(result))

	logger.Debugf("[DLNA CDS] Browse response: TotalMatches=%d, NumberReturned=%d, UpdateID=%s, ResultLength=%d bytes",
		totalMatches, len(objs), updateID, len(didlResult))

	// Log a snippet of the DIDL-Lite result for debugging (first 500 chars)
	if len(didlResult) > 500 {
		logger.Tracef("[DLNA CDS] DIDL-Lite (truncated): %s...", didlResult[:500])
	} else {
		logger.Tracef("[DLNA CDS] DIDL-Lite: %s", didlResult)
	}

	return map[string]string{
		"TotalMatches":   fmt.Sprint(totalMatches),
		"NumberReturned": fmt.Sprint(len(objs)),
		"Result":         didlResult,
		"UpdateID":       updateID,
	}, nil
}

func makeStorageFolder(id, title, parentID string) upnpav.Container {
	defaultChildCount := 1
	return upnpav.Container{
		Object: upnpav.Object{
			ID:         id,
			Restricted: 1,
			ParentID:   parentID,
			Class:      "object.container.storageFolder",
			Title:      title,
		},
		ChildCount: defaultChildCount,
	}
}

// getAlphabetFolders returns A-Z folders plus a # folder for non-alphabetic names
func getAlphabetFolders(parentID string) []interface{} {
	var objs []interface{}

	// Add # for numbers and symbols
	objs = append(objs, makeStorageFolder(parentID+"/#", "#", parentID))

	// Add A-Z
	for c := 'A'; c <= 'Z'; c++ {
		letter := string(c)
		objs = append(objs, makeStorageFolder(parentID+"/"+letter, letter, parentID))
	}

	return objs
}

// isLetterFolder checks if the path component is a valid letter folder (A-Z or #)
func isLetterFolder(s string) bool {
	if s == "#" {
		return true
	}
	if len(s) == 1 {
		c := s[0]
		return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')
	}
	return false
}

// getFirstLetter returns the uppercase first letter for alphabetical grouping
// Returns "#" for names starting with non-letters
func getFirstLetter(name string) string {
	if len(name) == 0 {
		return "#"
	}
	c := name[0]
	if c >= 'A' && c <= 'Z' {
		return string(c)
	}
	if c >= 'a' && c <= 'z' {
		return string(c - 32) // Convert to uppercase
	}
	return "#"
}

func getRootObject() []interface{} {
	const rootID = "0"

	return []interface{}{makeStorageFolder(rootID, "stash", "-1")}
}

func getRootObjects() []interface{} {
	const rootID = "0"

	var objs []interface{}

	objs = append(objs, makeStorageFolder("all", "all", rootID))
	objs = append(objs, makeStorageFolder("performers", "performers", rootID))
	objs = append(objs, makeStorageFolder("tags", "tags", rootID))
	objs = append(objs, makeStorageFolder("studios", "studios", rootID))
	objs = append(objs, makeStorageFolder("groups", "groups", rootID))
	objs = append(objs, makeStorageFolder("rating", "rating", rootID))

	return objs
}

func getSortDirection(sceneFilter *models.SceneFilterType, sort string) models.SortDirectionEnum {
	direction := models.SortDirectionEnumDesc
	if sort == "title" {
		direction = models.SortDirectionEnumAsc
	}

	return direction
}

func (me *contentDirectoryService) getVideos(sceneFilter *models.SceneFilterType, parentID string, host string) []interface{} {
	var objs []interface{}

	r := me.repository
	if err := r.WithReadTxn(context.TODO(), func(ctx context.Context) error {
		sort := me.VideoSortOrder
		direction := getSortDirection(sceneFilter, sort)
		findFilter := &models.FindFilterType{
			PerPage:   &pageSize,
			Sort:      &sort,
			Direction: &direction,
		}

		scenes, total, err := scene.QueryWithCount(ctx, r.SceneFinder, sceneFilter, findFilter)
		if err != nil {
			return err
		}

		if total > pageSize {
			pager := scenePager{
				sceneFilter: sceneFilter,
				parentID:    parentID,
			}

			objs, err = pager.getPages(ctx, r.SceneFinder, total)
			if err != nil {
				return err
			}
		} else {
			for _, s := range scenes {
				if err := s.LoadPrimaryFile(ctx, r.FileGetter); err != nil {
					return err
				}

				objs = append(objs, sceneToContainer(s, parentID, host))
			}
		}

		return nil
	}); err != nil {
		logger.Error(err.Error())
	}

	return objs
}

func (me *contentDirectoryService) getPageVideos(sceneFilter *models.SceneFilterType, parentID string, page int, host string) []interface{} {
	var objs []interface{}

	r := me.repository
	if err := r.WithReadTxn(context.TODO(), func(ctx context.Context) error {
		pager := scenePager{
			sceneFilter: sceneFilter,
			parentID:    parentID,
		}

		sort := me.VideoSortOrder
		direction := getSortDirection(sceneFilter, sort)
		var err error
		objs, err = pager.getPageVideos(ctx, r.SceneFinder, r.FileGetter, page, host, sort, direction)
		if err != nil {
			return err
		}

		return nil
	}); err != nil {
		logger.Error(err.Error())
	}

	return objs
}

func getPageFromID(paths []string) *int {
	i := slices.Index(paths, "page")
	if i == -1 || i+1 >= len(paths) {
		return nil
	}

	ret, err := strconv.Atoi(paths[i+1])
	if err != nil {
		return nil
	}

	return &ret
}

func (me *contentDirectoryService) getAllScenes(host string) []interface{} {
	return me.getVideos(&models.SceneFilterType{}, "all", host)
}

// getAllScenesPaginated returns scenes with database-level pagination
func (me *contentDirectoryService) getAllScenesPaginated(host string, startIndex int, count int) browseResult {
	var objs []interface{}
	var totalCount int

	r := me.repository
	if err := r.WithReadTxn(context.TODO(), func(ctx context.Context) error {
		sort := me.VideoSortOrder
		direction := getSortDirection(&models.SceneFilterType{}, sort)

		// Convert startIndex to page number (1-based for the query)
		page := (startIndex / count) + 1
		perPage := count

		findFilter := &models.FindFilterType{
			PerPage:   &perPage,
			Page:      &page,
			Sort:      &sort,
			Direction: &direction,
		}

		scenes, total, err := scene.QueryWithCount(ctx, r.SceneFinder, &models.SceneFilterType{}, findFilter)
		if err != nil {
			return err
		}

		totalCount = total

		for _, s := range scenes {
			if err := s.LoadPrimaryFile(ctx, r.FileGetter); err != nil {
				return err
			}
			objs = append(objs, sceneToContainer(s, "all", host))
		}

		return nil
	}); err != nil {
		logger.Error(err.Error())
	}

	return browseResult{Objects: objs, TotalCount: totalCount, IsPaginated: true}
}

// getStudiosPaginated returns studios with database-level pagination
func (me *contentDirectoryService) getStudiosPaginated(startIndex int, count int) browseResult {
	var objs []interface{}
	var totalCount int

	r := me.repository
	if err := r.WithReadTxn(context.TODO(), func(ctx context.Context) error {
		// Convert startIndex to page number (1-based for the query)
		page := (startIndex / count) + 1
		perPage := count
		sort := "name"
		direction := models.SortDirectionEnumAsc

		findFilter := &models.FindFilterType{
			PerPage:   &perPage,
			Page:      &page,
			Sort:      &sort,
			Direction: &direction,
		}

		studios, total, err := r.StudioFinder.Query(ctx, nil, findFilter)
		if err != nil {
			return err
		}

		totalCount = total

		for _, s := range studios {
			objs = append(objs, makeStorageFolder("studios/"+strconv.Itoa(s.ID), s.Name, "studios"))
		}

		return nil
	}); err != nil {
		logger.Errorf(err.Error())
	}

	return browseResult{Objects: objs, TotalCount: totalCount, IsPaginated: true}
}

// getTagsPaginated returns tags with database-level pagination
func (me *contentDirectoryService) getTagsPaginated(startIndex int, count int) browseResult {
	var objs []interface{}
	var totalCount int

	r := me.repository
	if err := r.WithReadTxn(context.TODO(), func(ctx context.Context) error {
		page := (startIndex / count) + 1
		perPage := count
		sort := "name"
		direction := models.SortDirectionEnumAsc

		findFilter := &models.FindFilterType{
			PerPage:   &perPage,
			Page:      &page,
			Sort:      &sort,
			Direction: &direction,
		}

		tags, total, err := r.TagFinder.Query(ctx, nil, findFilter)
		if err != nil {
			return err
		}

		totalCount = total

		for _, s := range tags {
			objs = append(objs, makeStorageFolder("tags/"+strconv.Itoa(s.ID), s.Name, "tags"))
		}

		return nil
	}); err != nil {
		logger.Errorf(err.Error())
	}

	return browseResult{Objects: objs, TotalCount: totalCount, IsPaginated: true}
}

// getPerformersPaginated returns performers with database-level pagination
func (me *contentDirectoryService) getPerformersPaginated(startIndex int, count int) browseResult {
	var objs []interface{}
	var totalCount int

	r := me.repository
	if err := r.WithReadTxn(context.TODO(), func(ctx context.Context) error {
		page := (startIndex / count) + 1
		perPage := count
		sort := "name"
		direction := models.SortDirectionEnumAsc

		findFilter := &models.FindFilterType{
			PerPage:   &perPage,
			Page:      &page,
			Sort:      &sort,
			Direction: &direction,
		}

		performers, total, err := r.PerformerFinder.Query(ctx, nil, findFilter)
		if err != nil {
			return err
		}

		totalCount = total

		for _, s := range performers {
			objs = append(objs, makeStorageFolder("performers/"+strconv.Itoa(s.ID), s.Name, "performers"))
		}

		return nil
	}); err != nil {
		logger.Errorf(err.Error())
	}

	return browseResult{Objects: objs, TotalCount: totalCount, IsPaginated: true}
}

// getGroupsPaginated returns groups with database-level pagination
func (me *contentDirectoryService) getGroupsPaginated(startIndex int, count int) browseResult {
	var objs []interface{}
	var totalCount int

	r := me.repository
	if err := r.WithReadTxn(context.TODO(), func(ctx context.Context) error {
		page := (startIndex / count) + 1
		perPage := count
		sort := "name"
		direction := models.SortDirectionEnumAsc

		findFilter := &models.FindFilterType{
			PerPage:   &perPage,
			Page:      &page,
			Sort:      &sort,
			Direction: &direction,
		}

		groups, total, err := r.GroupFinder.Query(ctx, nil, findFilter)
		if err != nil {
			return err
		}

		totalCount = total

		for _, s := range groups {
			objs = append(objs, makeStorageFolder("groups/"+strconv.Itoa(s.ID), s.Name, "groups"))
		}

		return nil
	}); err != nil {
		logger.Errorf(err.Error())
	}

	return browseResult{Objects: objs, TotalCount: totalCount, IsPaginated: true}
}

// getPerformersByLetter returns performers whose names start with the given letter
func (me *contentDirectoryService) getPerformersByLetter(letter string, startIndex int, count int) browseResult {
	var objs []interface{}
	var totalCount int

	r := me.repository
	if err := r.WithReadTxn(context.TODO(), func(ctx context.Context) error {
		page := (startIndex / count) + 1
		perPage := count
		sort := "name"
		direction := models.SortDirectionEnumAsc

		findFilter := &models.FindFilterType{
			PerPage:   &perPage,
			Page:      &page,
			Sort:      &sort,
			Direction: &direction,
		}

		// Build filter for names starting with the letter
		var performerFilter *models.PerformerFilterType
		if letter == "#" {
			// Match names starting with non-letters (numbers, symbols)
			performerFilter = &models.PerformerFilterType{
				Name: &models.StringCriterionInput{
					Value:    "^[^A-Za-z]",
					Modifier: models.CriterionModifierMatchesRegex,
				},
			}
		} else {
			// Match names starting with the letter (case-insensitive)
			performerFilter = &models.PerformerFilterType{
				Name: &models.StringCriterionInput{
					Value:    "^[" + strings.ToUpper(letter) + strings.ToLower(letter) + "]",
					Modifier: models.CriterionModifierMatchesRegex,
				},
			}
		}

		performers, total, err := r.PerformerFinder.Query(ctx, performerFilter, findFilter)
		if err != nil {
			return err
		}

		totalCount = total
		parentID := "performers/" + strings.ToUpper(letter)

		for _, s := range performers {
			objs = append(objs, makeStorageFolder(parentID+"/"+strconv.Itoa(s.ID), s.Name, parentID))
		}

		return nil
	}); err != nil {
		logger.Errorf(err.Error())
	}

	return browseResult{Objects: objs, TotalCount: totalCount, IsPaginated: true}
}

// getStudiosByLetter returns studios whose names start with the given letter
func (me *contentDirectoryService) getStudiosByLetter(letter string, startIndex int, count int) browseResult {
	var objs []interface{}
	var totalCount int

	r := me.repository
	if err := r.WithReadTxn(context.TODO(), func(ctx context.Context) error {
		page := (startIndex / count) + 1
		perPage := count
		sort := "name"
		direction := models.SortDirectionEnumAsc

		findFilter := &models.FindFilterType{
			PerPage:   &perPage,
			Page:      &page,
			Sort:      &sort,
			Direction: &direction,
		}

		// Build filter for names starting with the letter
		var studioFilter *models.StudioFilterType
		if letter == "#" {
			// Match names starting with non-letters (numbers, symbols)
			studioFilter = &models.StudioFilterType{
				Name: &models.StringCriterionInput{
					Value:    "^[^A-Za-z]",
					Modifier: models.CriterionModifierMatchesRegex,
				},
			}
		} else {
			// Match names starting with the letter (case-insensitive)
			studioFilter = &models.StudioFilterType{
				Name: &models.StringCriterionInput{
					Value:    "^[" + strings.ToUpper(letter) + strings.ToLower(letter) + "]",
					Modifier: models.CriterionModifierMatchesRegex,
				},
			}
		}

		studios, total, err := r.StudioFinder.Query(ctx, studioFilter, findFilter)
		if err != nil {
			return err
		}

		totalCount = total
		parentID := "studios/" + strings.ToUpper(letter)

		for _, s := range studios {
			objs = append(objs, makeStorageFolder(parentID+"/"+strconv.Itoa(s.ID), s.Name, parentID))
		}

		return nil
	}); err != nil {
		logger.Errorf(err.Error())
	}

	return browseResult{Objects: objs, TotalCount: totalCount, IsPaginated: true}
}

// getTagsByLetter returns tags whose names start with the given letter
func (me *contentDirectoryService) getTagsByLetter(letter string, startIndex int, count int) browseResult {
	var objs []interface{}
	var totalCount int

	r := me.repository
	if err := r.WithReadTxn(context.TODO(), func(ctx context.Context) error {
		page := (startIndex / count) + 1
		perPage := count
		sort := "name"
		direction := models.SortDirectionEnumAsc

		findFilter := &models.FindFilterType{
			PerPage:   &perPage,
			Page:      &page,
			Sort:      &sort,
			Direction: &direction,
		}

		// Build filter for names starting with the letter
		var tagFilter *models.TagFilterType
		if letter == "#" {
			// Match names starting with non-letters (numbers, symbols)
			tagFilter = &models.TagFilterType{
				Name: &models.StringCriterionInput{
					Value:    "^[^A-Za-z]",
					Modifier: models.CriterionModifierMatchesRegex,
				},
			}
		} else {
			// Match names starting with the letter (case-insensitive)
			tagFilter = &models.TagFilterType{
				Name: &models.StringCriterionInput{
					Value:    "^[" + strings.ToUpper(letter) + strings.ToLower(letter) + "]",
					Modifier: models.CriterionModifierMatchesRegex,
				},
			}
		}

		tags, total, err := r.TagFinder.Query(ctx, tagFilter, findFilter)
		if err != nil {
			return err
		}

		totalCount = total
		parentID := "tags/" + strings.ToUpper(letter)

		for _, s := range tags {
			objs = append(objs, makeStorageFolder(parentID+"/"+strconv.Itoa(s.ID), s.Name, parentID))
		}

		return nil
	}); err != nil {
		logger.Errorf(err.Error())
	}

	return browseResult{Objects: objs, TotalCount: totalCount, IsPaginated: true}
}

// getGroupsByLetter returns groups whose names start with the given letter
func (me *contentDirectoryService) getGroupsByLetter(letter string, startIndex int, count int) browseResult {
	var objs []interface{}
	var totalCount int

	r := me.repository
	if err := r.WithReadTxn(context.TODO(), func(ctx context.Context) error {
		page := (startIndex / count) + 1
		perPage := count
		sort := "name"
		direction := models.SortDirectionEnumAsc

		findFilter := &models.FindFilterType{
			PerPage:   &perPage,
			Page:      &page,
			Sort:      &sort,
			Direction: &direction,
		}

		// Build filter for names starting with the letter
		var groupFilter *models.GroupFilterType
		if letter == "#" {
			// Match names starting with non-letters (numbers, symbols)
			groupFilter = &models.GroupFilterType{
				Name: &models.StringCriterionInput{
					Value:    "^[^A-Za-z]",
					Modifier: models.CriterionModifierMatchesRegex,
				},
			}
		} else {
			// Match names starting with the letter (case-insensitive)
			groupFilter = &models.GroupFilterType{
				Name: &models.StringCriterionInput{
					Value:    "^[" + strings.ToUpper(letter) + strings.ToLower(letter) + "]",
					Modifier: models.CriterionModifierMatchesRegex,
				},
			}
		}

		groups, total, err := r.GroupFinder.Query(ctx, groupFilter, findFilter)
		if err != nil {
			return err
		}

		totalCount = total
		parentID := "groups/" + strings.ToUpper(letter)

		for _, s := range groups {
			objs = append(objs, makeStorageFolder(parentID+"/"+strconv.Itoa(s.ID), s.Name, parentID))
		}

		return nil
	}); err != nil {
		logger.Errorf(err.Error())
	}

	return browseResult{Objects: objs, TotalCount: totalCount, IsPaginated: true}
}

func (me *contentDirectoryService) getStudios() []interface{} {
	var objs []interface{}

	r := me.repository
	if err := r.WithReadTxn(context.TODO(), func(ctx context.Context) error {
		studios, err := r.StudioFinder.All(ctx)
		if err != nil {
			return err
		}

		for _, s := range studios {
			objs = append(objs, makeStorageFolder("studios/"+strconv.Itoa(s.ID), s.Name, "studios"))
		}

		return nil
	}); err != nil {
		logger.Errorf(err.Error())
	}

	return objs
}

func (me *contentDirectoryService) getStudioScenes(paths []string, host string) []interface{} {
	depth := -1
	sceneFilter := &models.SceneFilterType{
		Studios: &models.HierarchicalMultiCriterionInput{
			Modifier: models.CriterionModifierIncludes,
			Depth:    &depth,
			Value:    []string{paths[0]},
		},
	}

	parentID := "studios/" + strings.Join(paths, "/")

	page := getPageFromID(paths)
	if page != nil {
		return me.getPageVideos(sceneFilter, parentID, *page, host)
	}

	return me.getVideos(sceneFilter, parentID, host)
}

func (me *contentDirectoryService) getTags() []interface{} {
	var objs []interface{}

	r := me.repository
	if err := r.WithReadTxn(context.TODO(), func(ctx context.Context) error {
		tags, err := r.TagFinder.All(ctx)
		if err != nil {
			return err
		}

		for _, s := range tags {
			objs = append(objs, makeStorageFolder("tags/"+strconv.Itoa(s.ID), s.Name, "tags"))
		}

		return nil
	}); err != nil {
		logger.Errorf(err.Error())
	}

	return objs
}

func (me *contentDirectoryService) getTagScenes(paths []string, host string) []interface{} {
	sceneFilter := &models.SceneFilterType{
		Tags: &models.HierarchicalMultiCriterionInput{
			Modifier: models.CriterionModifierIncludes,
			Value:    []string{paths[0]},
		},
	}

	parentID := "tags/" + strings.Join(paths, "/")

	page := getPageFromID(paths)
	if page != nil {
		return me.getPageVideos(sceneFilter, parentID, *page, host)
	}

	return me.getVideos(sceneFilter, parentID, host)
}

func (me *contentDirectoryService) getPerformers() []interface{} {
	var objs []interface{}

	r := me.repository
	if err := r.WithReadTxn(context.TODO(), func(ctx context.Context) error {
		performers, err := r.PerformerFinder.All(ctx)
		if err != nil {
			return err
		}

		for _, s := range performers {
			objs = append(objs, makeStorageFolder("performers/"+strconv.Itoa(s.ID), s.Name, "performers"))
		}

		return nil
	}); err != nil {
		logger.Errorf(err.Error())
	}

	return objs
}

func (me *contentDirectoryService) getPerformerScenes(paths []string, host string) []interface{} {
	sceneFilter := &models.SceneFilterType{
		Performers: &models.MultiCriterionInput{
			Modifier: models.CriterionModifierIncludes,
			Value:    []string{paths[0]},
		},
	}

	parentID := "performers/" + strings.Join(paths, "/")

	page := getPageFromID(paths)
	if page != nil {
		return me.getPageVideos(sceneFilter, parentID, *page, host)
	}

	return me.getVideos(sceneFilter, parentID, host)
}

func (me *contentDirectoryService) getGroups() []interface{} {
	var objs []interface{}

	r := me.repository
	if err := r.WithReadTxn(context.TODO(), func(ctx context.Context) error {
		groups, err := r.GroupFinder.All(ctx)
		if err != nil {
			return err
		}

		for _, s := range groups {
			objs = append(objs, makeStorageFolder("groups/"+strconv.Itoa(s.ID), s.Name, "groups"))
		}

		return nil
	}); err != nil {
		logger.Errorf(err.Error())
	}

	return objs
}

func (me *contentDirectoryService) getGroupScenes(paths []string, host string) []interface{} {
	sceneFilter := &models.SceneFilterType{
		Groups: &models.HierarchicalMultiCriterionInput{
			Modifier: models.CriterionModifierIncludes,
			Value:    []string{paths[0]},
		},
	}

	parentID := "groups/" + strings.Join(paths, "/")

	page := getPageFromID(paths)
	if page != nil {
		return me.getPageVideos(sceneFilter, parentID, *page, host)
	}

	return me.getVideos(sceneFilter, parentID, host)
}

func (me *contentDirectoryService) getRating() []interface{} {
	var objs []interface{}

	for r := 1; r <= 5; r++ {
		rStr := strconv.Itoa(r)
		objs = append(objs, makeStorageFolder("rating/"+rStr, rStr, "rating"))
	}

	return objs
}

func (me *contentDirectoryService) getRatingScenes(paths []string, host string) []interface{} {
	r, err := strconv.Atoi(paths[0])
	if err != nil {
		return nil
	}

	sceneFilter := &models.SceneFilterType{
		Rating100: &models.IntCriterionInput{
			Modifier: models.CriterionModifierEquals,
			Value:    models.Rating5To100(r),
		},
	}

	parentID := "rating/" + strings.Join(paths, "/")

	page := getPageFromID(paths)
	if page != nil {
		return me.getPageVideos(sceneFilter, parentID, *page, host)
	}

	return me.getVideos(sceneFilter, parentID, host)
}

// Represents a ContentDirectory object.
type object struct {
	Path           string // The cleaned, absolute path for the object relative to the server.
	RootObjectPath string
}

// Returns the actual local filesystem path for the object.
func (o *object) FilePath() string {
	return filepath.Join(o.RootObjectPath, filepath.FromSlash(o.Path))
}

// Returns the ObjectID for the object. This is used in various ContentDirectory actions.
func (o object) ID() string {
	if len(o.Path) == 1 {
		return "0"
	}
	return url.QueryEscape(o.Path)
}

func (o *object) IsRoot() bool {
	return o.Path == "/"
}

// Returns the object's parent ObjectID. Fortunately it can be deduced from the
// ObjectID (for now).
func (o object) ParentID() string {
	if o.IsRoot() {
		return "-1"
	}
	o.Path = path.Dir(o.Path)
	return o.ID()
}
