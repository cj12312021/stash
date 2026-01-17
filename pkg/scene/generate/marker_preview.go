package generate

import (
	"context"

	"github.com/stashapp/stash/pkg/ffmpeg"
	"github.com/stashapp/stash/pkg/ffmpeg/transcoder"
	"github.com/stashapp/stash/pkg/fsutil"
	"github.com/stashapp/stash/pkg/logger"
)

const (
	markerPreviewWidth        = 640
	maxMarkerPreviewDuration  = 20
	markerPreviewAudioBitrate = "64k"

	markerImageDuration = 5
	markerWebpFPS       = 12

	markerScreenshotQuality = 2
)

func (g Generator) MarkerPreviewVideo(ctx context.Context, input string, hash string, seconds float64, endSeconds *float64, includeAudio bool) error {
	lockCtx := g.LockManager.ReadLock(ctx, input)
	defer lockCtx.Cancel()

	output := g.MarkerPaths.GetVideoPreviewPath(hash, int(seconds))
	if !g.Overwrite {
		if exists, _ := fsutil.FileExists(output); exists {
			return nil
		}
	}

	duration := float64(maxMarkerPreviewDuration)

	// don't allow preview to exceed max duration
	if endSeconds != nil && *endSeconds-seconds < maxMarkerPreviewDuration {
		duration = float64(*endSeconds) - seconds
	}

	if err := g.generateFile(lockCtx, g.MarkerPaths, mp4Pattern, output, g.markerPreviewVideo(input, sceneMarkerOptions{
		Seconds:  seconds,
		Duration: duration,
		Audio:    includeAudio,
	})); err != nil {
		return err
	}

	logger.Debug("created marker video: ", output)

	return nil
}

type sceneMarkerOptions struct {
	Seconds  float64
	Duration float64
	Audio    bool
}

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
			// Add HW codec params without the -c:v (transcoder adds that)
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

		trimOptions := transcoder.TranscodeOptions{
			Duration:        options.Duration,
			StartTime:       options.Seconds,
			OutputPath:      tmpFn,
			VideoCodec:      codec,
			VideoArgs:       videoArgs,
			ExtraInputArgs:  inputArgs,
			ExtraOutputArgs: g.FFMpegConfig.GetTranscodeOutputArgs(),
		}

		if options.Audio {
			var audioArgs ffmpeg.Args
			audioArgs = audioArgs.AudioBitrate(markerPreviewAudioBitrate)

			trimOptions.AudioCodec = ffmpeg.AudioCodecAAC
			trimOptions.AudioArgs = audioArgs
		}

		args := transcoder.Transcode(input, trimOptions)

		return g.generate(lockCtx, args)
	}
}

func (g Generator) SceneMarkerWebp(ctx context.Context, input string, hash string, seconds float64) error {
	lockCtx := g.LockManager.ReadLock(ctx, input)
	defer lockCtx.Cancel()

	output := g.MarkerPaths.GetWebpPreviewPath(hash, int(seconds))
	if !g.Overwrite {
		if exists, _ := fsutil.FileExists(output); exists {
			return nil
		}
	}

	if err := g.generateFile(lockCtx, g.MarkerPaths, webpPattern, output, g.sceneMarkerWebp(input, sceneMarkerOptions{
		Seconds: seconds,
	})); err != nil {
		return err
	}

	logger.Debug("created marker image: ", output)

	return nil
}

func (g Generator) sceneMarkerWebp(input string, options sceneMarkerOptions) generateFn {
	return func(lockCtx *fsutil.LockContext, tmpFn string) error {
		var videoFilter ffmpeg.VideoFilter
		videoFilter = videoFilter.ScaleWidth(markerPreviewWidth)
		videoFilter = videoFilter.Fps(markerWebpFPS)

		var videoArgs ffmpeg.Args
		videoArgs = videoArgs.VideoFilter(videoFilter)
		videoArgs = append(videoArgs,
			"-lossless", "1",
			"-q:v", "70",
			"-compression_level", "6",
			"-preset", "default",
			"-loop", "0",
			"-threads", "4",
		)

		trimOptions := transcoder.TranscodeOptions{
			Duration:   markerImageDuration,
			StartTime:  float64(options.Seconds),
			OutputPath: tmpFn,
			VideoCodec: ffmpeg.VideoCodecLibWebP,
			VideoArgs:  videoArgs,
		}

		args := transcoder.Transcode(input, trimOptions)

		return g.generate(lockCtx, args)
	}
}

func (g Generator) SceneMarkerScreenshot(ctx context.Context, input string, hash string, seconds float64, width int) error {
	lockCtx := g.LockManager.ReadLock(ctx, input)
	defer lockCtx.Cancel()

	output := g.MarkerPaths.GetScreenshotPath(hash, int(seconds))
	if !g.Overwrite {
		if exists, _ := fsutil.FileExists(output); exists {
			return nil
		}
	}

	if err := g.generateFile(lockCtx, g.MarkerPaths, jpgPattern, output, g.sceneMarkerScreenshot(input, SceneMarkerScreenshotOptions{
		Seconds: seconds,
		Width:   width,
	})); err != nil {
		return err
	}

	logger.Debug("created marker screenshot: ", output)

	return nil
}

type SceneMarkerScreenshotOptions struct {
	Seconds float64
	Width   int
}

func (g Generator) sceneMarkerScreenshot(input string, options SceneMarkerScreenshotOptions) generateFn {
	return func(lockCtx *fsutil.LockContext, tmpFn string) error {
		ssOptions := transcoder.ScreenshotOptions{
			OutputPath: tmpFn,
			OutputType: transcoder.ScreenshotOutputTypeImage2,
			Quality:    markerScreenshotQuality,
			Width:      options.Width,
		}

		args := transcoder.ScreenshotTime(input, options.Seconds, ssOptions)

		return g.generate(lockCtx, args)
	}
}
