# Feature: GPU Encoding for Generate Tasks

**Status:** IMPLEMENTED & DEPLOYED
**Date:** 2026-01-13
**Branch:** feature/youtube-player-controls

## Summary

Enabled GPU-accelerated video encoding (NVENC) for Stash's generate tasks (transcode, preview). The infrastructure existed for streaming but generate tasks hardcoded `libx264`.

## What Was Done

### 1. Backend Code Changes (COMPLETE)

| File | Change |
|------|--------|
| `pkg/ffmpeg/codec_hardware.go:490-495` | Added `HWCodecMP4Compatible()` public export |
| `pkg/scene/generate/generator.go:51` | Added `GetTranscodeHardwareAcceleration()` to `FFMpegConfig` interface |
| `pkg/scene/generate/transcode.go:67-109, 111-156` | GPU codec selection in `transcode()`, `transcodeVideo()` |
| `pkg/scene/generate/preview.go:175-235` | GPU codec selection in `previewVideoChunk()` |
| `pkg/scene/generate/marker_preview.go:60-137` | GPU codec selection in `markerPreviewVideo()` |

### 2. Docker Image (COMPLETE)

- Updated `/deploy-docker` command to use CUDA build
- Deployed GPU-enabled image to `cj1213/plex:latest`
- Image includes: NVIDIA CUDA 12.8.0, FFmpeg with NVENC, Intel QSV, NVENC session patch

### 3. Git Status

**Staged (ready to commit):**
```
M  pkg/ffmpeg/codec_hardware.go
M  pkg/scene/generate/generator.go
M  pkg/scene/generate/marker_preview.go
M  pkg/scene/generate/preview.go
M  pkg/scene/generate/transcode.go
A  ui/v2.5/src/extensions/docs/sessions/feature/2026-01-13-gpu-encoding/PLAN.md
```

**Not staged:**
- `.claude/commands/deploy-docker.md` - Updated to use CUDA build

## Pending Tasks

1. **Commit the changes** - Files are staged, need to create commit
2. **Test on Unraid** - Configure GPU passthrough and verify encoding works

## How to Resume

```
Read ui/v2.5/src/extensions/docs/sessions/feature/2026-01-13-gpu-encoding/PLAN.md and continue
```

## Unraid Setup Instructions

### Configure Container for GPU

1. Edit Stash container in Unraid Docker tab
2. Toggle **Advanced View**
3. Add **Extra Parameters:** `--runtime=nvidia`
4. Add **Variable:** `NVIDIA_VISIBLE_DEVICES=all`
5. Apply and restart

### Verify GPU Access

```bash
# Inside container console
nvidia-smi
ffmpeg -encoders | grep nvenc
```

### Enable in Stash

1. Settings > System > Transcoding
2. Enable **Hardware Encoding**
3. Save

## Technical Details

### Operations Affected

| Operation | Uses GPU? | Notes |
|-----------|-----------|-------|
| Transcode | ✅ Yes | Full video re-encoding |
| Video Previews | ✅ Yes | Preview chunk encoding |
| Marker Previews | ✅ Yes | Marker video clips |
| Sprites/Phash | ❌ No | Frame extraction only (CPU) |
| Screenshots | ❌ No | Single frame extraction |

### Expected Performance (EPYC 7302P → Quadro P2200)

| Task | Speedup |
|------|---------|
| Transcode | 4-6x faster |
| Previews | 3-5x faster |
| Overall | 2-4x faster |

### File Size Trade-off

- NVENC produces ~12-18% larger files than libx264 at equivalent quality
- Trade-off accepted for 5x speed improvement

## Key Files Reference

- `pkg/ffmpeg/codec_hardware.go` - Hardware codec detection and exports
- `pkg/ffmpeg/stream_transcode.go:169-170` - Reference pattern for GPU codec selection
- `pkg/scene/generate/transcode.go` - Transcode GPU implementation
- `pkg/scene/generate/preview.go` - Preview GPU implementation
- `pkg/scene/generate/marker_preview.go` - Marker preview GPU implementation
- `docker/build/x86_64/Dockerfile-CUDA` - GPU-enabled Docker build
- `.claude/commands/deploy-docker.md` - Updated deploy command
