package dlna

// From: https://github.com/anacrolix/dms
// Copyright (c) 2012, Matt Joiner <anacrolix@gmail.com>.
// All rights reserved.

// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//     * Redistributions of source code must retain the above copyright
//       notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//     * Neither the name of the <organization> nor the
//       names of its contributors may be used to endorse or promote products
//       derived from this software without specific prior written permission.

// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
// DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
// ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

import (
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestEscapeObjectID(t *testing.T) {
	o := object{
		Path: "/some/file",
	}
	id := o.ID()
	if strings.ContainsAny(id, "/") {
		t.Skip("may not work with some players: object IDs contain '/'")
	}
}

func TestRootObjectID(t *testing.T) {
	if (object{Path: "/"}).ID() != "0" {
		t.FailNow()
	}
}

func TestRootParentObjectID(t *testing.T) {
	if (object{Path: "/"}).ParentID() != "-1" {
		t.FailNow()
	}
}

func testHandleBrowse(argsXML string) (map[string]string, error) {
	cds := contentDirectoryService{
		Server: &Server{},
	}

	r := &http.Request{}
	return cds.Handle("Browse", []byte(argsXML), r)
}

func TestBrowseMetadataRoot(t *testing.T) {
	argsXML := `<u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"><ObjectID>0</ObjectID><BrowseFlag>BrowseMetadata</BrowseFlag><Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>0</RequestedCount><SortCriteria></SortCriteria></u:Browse>`
	_, err := testHandleBrowse(argsXML)

	assert.Nil(t, err)
}

func TestBrowseMetadataTags(t *testing.T) {
	argsXML := `<u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"><ObjectID>tags</ObjectID><BrowseFlag>BrowseMetadata</BrowseFlag><Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>0</RequestedCount><SortCriteria></SortCriteria></u:Browse>`
	_, err := testHandleBrowse(argsXML)

	assert.Nil(t, err)
}

func TestBrowseDirectChildrenRoot(t *testing.T) {
	argsXML := `<u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"><ObjectID>0</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>0</RequestedCount><SortCriteria></SortCriteria></u:Browse>`
	result, err := testHandleBrowse(argsXML)

	assert.Nil(t, err)
	assert.NotEmpty(t, result["Result"])
	assert.Equal(t, "6", result["TotalMatches"]) // all, performers, tags, studios, groups, rating
	assert.Equal(t, "6", result["NumberReturned"])
}

func TestBrowseDirectChildrenWithPagination(t *testing.T) {
	// Request only 2 items starting from index 1
	argsXML := `<u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"><ObjectID>0</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter><StartingIndex>1</StartingIndex><RequestedCount>2</RequestedCount><SortCriteria></SortCriteria></u:Browse>`
	result, err := testHandleBrowse(argsXML)

	assert.Nil(t, err)
	assert.Equal(t, "6", result["TotalMatches"])   // Total is still 6
	assert.Equal(t, "2", result["NumberReturned"]) // But only 2 returned
}

func TestBrowsePerformersReturnsAlphabet(t *testing.T) {
	argsXML := `<u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"><ObjectID>performers</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>100</RequestedCount><SortCriteria></SortCriteria></u:Browse>`
	result, err := testHandleBrowse(argsXML)

	assert.Nil(t, err)
	assert.Equal(t, "27", result["TotalMatches"]) // # + A-Z = 27 folders
	assert.Equal(t, "27", result["NumberReturned"])
	assert.Contains(t, result["Result"], "performers/#")
	assert.Contains(t, result["Result"], "performers/A")
	assert.Contains(t, result["Result"], "performers/Z")
}

func TestBrowseStudiosReturnsAlphabet(t *testing.T) {
	argsXML := `<u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"><ObjectID>studios</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>100</RequestedCount><SortCriteria></SortCriteria></u:Browse>`
	result, err := testHandleBrowse(argsXML)

	assert.Nil(t, err)
	assert.Equal(t, "27", result["TotalMatches"]) // # + A-Z = 27 folders
	assert.Equal(t, "27", result["NumberReturned"])
	assert.Contains(t, result["Result"], "studios/#")
	assert.Contains(t, result["Result"], "studios/A")
	assert.Contains(t, result["Result"], "studios/Z")
}

func TestBrowseTagsReturnsAlphabet(t *testing.T) {
	argsXML := `<u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"><ObjectID>tags</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>100</RequestedCount><SortCriteria></SortCriteria></u:Browse>`
	result, err := testHandleBrowse(argsXML)

	assert.Nil(t, err)
	assert.Equal(t, "27", result["TotalMatches"]) // # + A-Z = 27 folders
	assert.Equal(t, "27", result["NumberReturned"])
	assert.Contains(t, result["Result"], "tags/#")
	assert.Contains(t, result["Result"], "tags/A")
	assert.Contains(t, result["Result"], "tags/Z")
}

func TestBrowseGroupsReturnsAlphabet(t *testing.T) {
	argsXML := `<u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"><ObjectID>groups</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>100</RequestedCount><SortCriteria></SortCriteria></u:Browse>`
	result, err := testHandleBrowse(argsXML)

	assert.Nil(t, err)
	assert.Equal(t, "27", result["TotalMatches"]) // # + A-Z = 27 folders
	assert.Equal(t, "27", result["NumberReturned"])
	assert.Contains(t, result["Result"], "groups/#")
	assert.Contains(t, result["Result"], "groups/A")
	assert.Contains(t, result["Result"], "groups/Z")
}

func TestIsLetterFolder(t *testing.T) {
	assert.True(t, isLetterFolder("#"))
	assert.True(t, isLetterFolder("A"))
	assert.True(t, isLetterFolder("Z"))
	assert.True(t, isLetterFolder("a"))
	assert.True(t, isLetterFolder("z"))
	assert.False(t, isLetterFolder("123"))
	assert.False(t, isLetterFolder("AB"))
	assert.False(t, isLetterFolder(""))
}

func TestGetFirstLetter(t *testing.T) {
	assert.Equal(t, "A", getFirstLetter("Alice"))
	assert.Equal(t, "A", getFirstLetter("alice"))
	assert.Equal(t, "Z", getFirstLetter("Zoe"))
	assert.Equal(t, "#", getFirstLetter("123 Studio"))
	assert.Equal(t, "#", getFirstLetter(""))
	assert.Equal(t, "#", getFirstLetter("!Special"))
}
