# GPU Encoding for Generate Tasks

This document describes modifications to upstream generate files to enable GPU-accelerated video encoding (NVENC) for generate tasks.

---

## Overview

Stash's streaming transcoder already supported GPU encoding, but generate tasks (transcode, preview, marker preview) were hardcoded to use `libx264`. This patch enables hardware encoding for these tasks when the "Hardware Encoding" setting is enabled.

---

## New Files (Won't Conflict)

None - this patch only modifies existing files.

---

## Modified Files

### 1. `pkg/ffmpeg/codec_hardware.go`

**Purpose:** Export hardware codec detection for generate tasks.

#### Add public export (around line 490-495)

```go
// HWCodecMP4Compatible returns the best available hardware codec for MP4 output.
// This is a convenience wrapper for generate tasks that need MP4-compatible output.
func (e *FFMpeg) HWCodecMP4Compatible() *ffmpeg.VideoCodec {
	return e.hwCodecMP4Compatible()
}
```

---

### 2. `pkg/scene/generate/generator.go`

**Purpose:** Add hardware acceleration config to the interface.

#### Add to FFMpegConfig interface (around line 51)

```diff
 type FFMpegConfig interface {
 	GetTranscodeInputArgs() []string
 	GetTranscodeOutputArgs() []string
+	GetTranscodeHardwareAcceleration() bool
 }
```

---

### 3. `pkg/scene/generate/transcode.go`

**Purpose:** Enable GPU encoding for transcode and transcodeVideo operations.

#### Changes to `transcode()` function (around line 67-127)

Replace hardcoded `libx264` with codec selection:

```go
func (g Generator) transcode(input string, options TranscodeOptions) generateFn {
	return func(lockCtx *fsutil.LockContext, tmpFn string) error {
		// Select codec based on hardware acceleration setting
		codec := ffmpeg.VideoCodecLibX264
		hwAccelEnabled := g.FFMpegConfig.GetTranscodeHardwareAcceleration()
		logger.Debugf("[transcode] Hardware acceleration enabled: %v", hwAccelEnabled)
		if hwAccelEnabled {
			if hwCodec := g.Encoder.HWCodecMP4Compatible(); hwCodec != nil {
				codec = *hwCodec
				logger.Debugf("[transcode] Using hardware codec: %s (%s)", codec.Name, codec.CodeName)
			} else {
				logger.Debug("[transcode] No compatible hardware codec found, using libx264")
			}
		}

		var videoArgs ffmpeg.Args
		if options.Width != 0 && options.Height != 0 {
			var videoFilter ffmpeg.VideoFilter
			videoFilter = videoFilter.ScaleDimensions(options.Width, options.Height)
			// For hardware encoding, add format conversion and GPU upload after scaling
			if codec != ffmpeg.VideoCodecLibX264 {
				videoFilter = g.Encoder.HWFilterInit(codec, videoFilter)
			}
			videoArgs = videoArgs.VideoFilter(videoFilter)
		}

		// Add codec-specific parameters
		if codec == ffmpeg.VideoCodecLibX264 {
			videoArgs = append(videoArgs,
				"-pix_fmt", "yuv420p",
				"-profile:v", "high",
				"-level", "4.2",
				"-preset", "superfast",
				"-crf", "23",
			)
		} else {
			videoArgs = append(videoArgs, ffmpeg.HWCodecParams(codec)...)
		}

		// Build input args: hardware device init (if applicable) + user-configured args
		var inputArgs ffmpeg.Args
		if codec != ffmpeg.VideoCodecLibX264 {
			inputArgs = g.Encoder.HWDeviceInit(codec, false)
			logger.Debugf("[transcode] Hardware device init args: %v", inputArgs)
		}
		inputArgs = append(inputArgs, g.FFMpegConfig.GetTranscodeInputArgs()...)

		// ... rest of function
	}
}
```

#### Changes to `transcodeVideo()` function (around line 130-193)

Same pattern as `transcode()` - add codec selection, HW filter init, HW device init, and logging.

---

### 4. `pkg/scene/generate/preview.go`

**Purpose:** Enable GPU encoding for preview chunk generation.

#### Changes to `previewVideoChunk()` function (around line 175-255)

Replace hardcoded `libx264` with codec selection:

```go
func (g Generator) previewVideoChunk(lockCtx *fsutil.LockContext, fn string, options previewChunkOptions, fallback bool, useVsync2 bool) error {
	// Select codec based on hardware acceleration setting
	codec := ffmpeg.VideoCodecLibX264
	hwAccelEnabled := g.FFMpegConfig.GetTranscodeHardwareAcceleration()
	logger.Debugf("[preview] Hardware acceleration enabled: %v", hwAccelEnabled)
	if hwAccelEnabled {
		if hwCodec := g.Encoder.HWCodecMP4Compatible(); hwCodec != nil {
			codec = *hwCodec
			logger.Debugf("[preview] Using hardware codec: %s (%s)", codec.Name, codec.CodeName)
		} else {
			logger.Debug("[preview] No compatible hardware codec found, using libx264")
		}
	}

	var videoFilter ffmpeg.VideoFilter
	videoFilter = videoFilter.ScaleWidth(scenePreviewWidth)

	// For hardware encoding, add format conversion and GPU upload after scaling
	if codec != ffmpeg.VideoCodecLibX264 {
		videoFilter = g.Encoder.HWFilterInit(codec, videoFilter)
	}

	var videoArgs ffmpeg.Args
	videoArgs = videoArgs.VideoFilter(videoFilter)

	// Add codec-specific parameters
	if codec == ffmpeg.VideoCodecLibX264 {
		videoArgs = append(videoArgs,
			"-pix_fmt", "yuv420p",
			"-profile:v", "high",
			"-level", "4.2",
			"-preset", options.Preset,
			"-crf", "21",
			"-threads", "4",
			"-strict", "-2",
		)
	} else {
		videoArgs = append(videoArgs, ffmpeg.HWCodecParams(codec)...)
		videoArgs = append(videoArgs, "-movflags", "+faststart")
	}

	// Build input args: hardware device init (if applicable) + user-configured args
	var inputArgs ffmpeg.Args
	if codec != ffmpeg.VideoCodecLibX264 {
		inputArgs = g.Encoder.HWDeviceInit(codec, false)
		logger.Debugf("[preview] Hardware device init args: %v", inputArgs)
	}
	inputArgs = append(inputArgs, g.FFMpegConfig.GetTranscodeInputArgs()...)

	// ... rest of function
}
```

---

### 5. `pkg/scene/generate/marker_preview.go`

**Purpose:** Enable GPU encoding for marker preview generation.

#### Changes to `markerPreviewVideo()` function (around line 60-137)

Replace hardcoded `libx264` with codec selection:

```go
func (g Generator) markerPreviewVideo(input string, options sceneMarkerOptions) generateFn {
	return func(lockCtx *fsutil.LockContext, tmpFn string) error {
		// Select codec based on hardware acceleration setting
		codec := ffmpeg.VideoCodecLibX264
		hwAccelEnabled := g.FFMpegConfig.GetTranscodeHardwareAcceleration()
		logger.Debugf("[marker] Hardware acceleration enabled: %v", hwAccelEnabled)
		if hwAccelEnabled {
			if hwCodec := g.Encoder.HWCodecMP4Compatible(); hwCodec != nil {
				codec = *hwCodec
				logger.Debugf("[marker] Using hardware codec: %s (%s)", codec.Name, codec.CodeName)
			} else {
				logger.Debug("[marker] No compatible hardware codec found, using libx264")
			}
		}

		var videoFilter ffmpeg.VideoFilter
		videoFilter = videoFilter.ScaleWidth(markerPreviewWidth)

		// For hardware encoding, add format conversion and GPU upload after scaling
		if codec != ffmpeg.VideoCodecLibX264 {
			videoFilter = g.Encoder.HWFilterInit(codec, videoFilter)
		}

		var videoArgs ffmpeg.Args
		videoArgs = videoArgs.VideoFilter(videoFilter)

		// Add codec-specific parameters
		if codec == ffmpeg.VideoCodecLibX264 {
			videoArgs = append(videoArgs,
				"-pix_fmt", "yuv420p",
				"-profile:v", "high",
				"-level", "4.2",
				"-preset", "veryslow",
				"-crf", "24",
				"-movflags", "+faststart",
				"-threads", "4",
				"-sws_flags", "lanczos",
				"-strict", "-2",
			)
		} else {
			videoArgs = append(videoArgs, ffmpeg.HWCodecParams(codec)...)
			videoArgs = append(videoArgs,
				"-movflags", "+faststart",
				"-sws_flags", "lanczos",
			)
		}

		// Build input args: hardware device init (if applicable) + user-configured args
		var inputArgs ffmpeg.Args
		if codec != ffmpeg.VideoCodecLibX264 {
			inputArgs = g.Encoder.HWDeviceInit(codec, false)
			logger.Debugf("[marker] Hardware device init args: %v", inputArgs)
		}
		inputArgs = append(inputArgs, g.FFMpegConfig.GetTranscodeInputArgs()...)

		// ... rest of function
	}
}
```

---

## Merge Procedure

When merging upstream changes:

### Step 1: Check for conflicts in generate files

```bash
git status | grep pkg/scene/generate
git status | grep pkg/ffmpeg/codec_hardware
```

### Step 2: If `codec_hardware.go` conflicts

Re-add the `HWCodecMP4Compatible()` public export wrapper.

### Step 3: If `generator.go` conflicts

Re-add `GetTranscodeHardwareAcceleration() bool` to the `FFMpegConfig` interface.

### Step 4: If transcode/preview/marker_preview.go conflict

Re-apply the codec selection pattern:
1. Check `GetTranscodeHardwareAcceleration()`
2. Call `HWCodecMP4Compatible()` to get hardware codec
3. Add `HWFilterInit()` for video filter pipeline (if scaling)
4. Add `HWDeviceInit()` to input args
5. Use `HWCodecParams()` for codec-specific args
6. Add debug logging

### Step 5: Run tests

```bash
go build ./pkg/scene/generate/...
go build ./pkg/ffmpeg/...
```

---

## Operations Affected

| Operation | Uses GPU? | Notes |
|-----------|-----------|-------|
| Transcode | Yes | Full video re-encoding |
| Video Previews | Yes | Preview chunk encoding |
| Marker Previews | Yes | Marker video clips |
| Sprites/Phash | No | Frame extraction only (CPU) |
| Screenshots | No | Single frame extraction |

---

## Performance

Expected speedup with NVENC vs libx264:

| Task | Speedup |
|------|---------|
| Transcode | 4-6x faster |
| Previews | 3-5x faster |
| Markers | 3-5x faster |

Trade-off: NVENC produces ~12-18% larger files than libx264 at equivalent quality.

---

## Configuration

Uses the existing "Hardware Encoding" setting in Stash UI (Settings > System > Transcoding).
No additional configuration required.

---

## Upstream Consideration

This feature could be submitted upstream to stashapp/stash. The changes are:
- Non-breaking (falls back to libx264 if no GPU)
- Uses existing hardware codec infrastructure
- Significant performance improvement for users with GPUs

If upstreamed, this patch document would no longer be needed.
