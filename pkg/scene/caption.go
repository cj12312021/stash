package scene

import (
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/text/language"

	"github.com/asticode/go-astisub"
)

var CaptionExts = []string{"vtt", "srt"} // in a case where vtt and srt files are both provided prioritize vtt file due to native support

const CaptionSep = "|"

// to be used for captions without a language code in the filename
// ISO 639-1 uses 2 or 3 a-z chars for codes so 00 is a safe non valid choise
// https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes
const LangUknown = "00"

// GetCaptionPath generates the path of a caption
// from a given file path, wanted language and caption sufffix
func GetCaptionPath(path, lang, suffix string) string {
	ext := filepath.Ext(path)
	fn := strings.TrimSuffix(path, ext)
	captionExt := ""
	if len(lang) == 0 || lang == LangUknown {
		captionExt = suffix
	} else {
		captionExt = lang + "." + suffix
	}
	return fn + "." + captionExt
}

// ReadSubs reads a captions file
func ReadSubs(path string) (*astisub.Subtitles, error) {
	return astisub.OpenFile(path)
}

// IsValidLanguage checks whether the given string is a valid
// ISO 639 language code
func IsValidLanguage(lang string) bool {
	_, err := language.ParseBase(lang)
	return err == nil
}

// IsLangInCaptions returns true if lang is present
// in the captions
func IsLangInCaptions(lang, captions string) bool {
	splits := strings.Split(captions, CaptionSep)
	for _, l := range splits {
		if l == lang {
			return true
		}
	}
	return false
}

// AddLangToCaptions returns a new string with lang added to the captions
// No duplicate checks are done, use IsLangInCaptions first if needed
func AddLangToCaptions(lang string, captions string) string {
	c := captions
	if lang == "" {
		return c
	}
	if len(c) > 0 {
		c += CaptionSep + lang
	} else {
		c = lang
	}
	return c
}

// GenerateCaptionCandidates generates a list of filenames with exts as extensions
// that can associated with the caption
func GenerateCaptionCandidates(captionPath string, exts []string) []string {
	var candidates []string

	basename := strings.TrimSuffix(captionPath, filepath.Ext(captionPath)) // caption filename without the extension

	// a caption file can be something like scene_filename.srt or scene_filename.en.srt
	// if a language code is present and valid remove it from the basename
	languageExt := filepath.Ext(basename)
	if len(languageExt) > 2 && IsValidLanguage(languageExt[1:]) {
		basename = strings.TrimSuffix(basename, languageExt)
	}

	for _, ext := range exts {
		candidates = append(candidates, basename+"."+ext)
	}

	return candidates
}

// GetCaptionsLangFromPath returns the language code from a given captions path
// If no valid language is present LangUknown is returned
func GetCaptionsLangFromPath(captionPath string) string {
	langCode := LangUknown
	basename := strings.TrimSuffix(captionPath, filepath.Ext(captionPath)) // caption filename without the extension
	languageExt := filepath.Ext(basename)
	if len(languageExt) > 2 && IsValidLanguage(languageExt[1:]) {
		langCode = languageExt[1:]
	}
	return langCode
}

// CleanCaptions removes non existent/accessible language codes from captions
func CleanCaptions(fn, captions string) (cleanedCaptions string, changed bool) {
	changed = false
	langs := strings.Split(captions, CaptionSep)
	for _, l := range langs {
		found := false
		for _, e := range CaptionExts {
			f := GetCaptionPath(fn, l, e)
			if _, er := os.Stat(f); er == nil {
				cleanedCaptions = AddLangToCaptions(l, cleanedCaptions)
				found = true
				break
			}
			if !found {
				changed = true
			}
		}
	}
	return
}
