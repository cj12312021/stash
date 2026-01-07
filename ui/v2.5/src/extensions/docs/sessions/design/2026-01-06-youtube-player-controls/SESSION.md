---
type: design
status: in-progress
started: 2026-01-06
completed: null
feature: "YouTube-style video player controls redesign"
tags: [player, videojs, ui, youtube]
related_files:
  - extensions/styles/_player-components.scss
  - extensions/player/player-icons.ts
  - extensions/player/settings-menu.ts
  - components/ScenePlayer/ScenePlayer.tsx
figma_link: null
---

# Design Session: YouTube Player Controls Redesign

## Goal

**What are we designing?**
Update the VideoJS video player controls in Stash to mimic YouTube's 2024 design.

**Why?**
Modern, familiar UI that users already know how to use.

**Success criteria:**
- [ ] Progress bar matches YouTube style (thin, expands on hover, red scrubber)
- [ ] Control layout matches YouTube (left: play/next/volume/time, right: settings/fullscreen)
- [ ] Icons match YouTube's current SVG style
- [ ] Smooth animations and hover effects

---

## Context

### Reference
- YouTube video used for reference: https://www.youtube.com/watch?v=pCZTmEjPCl8
- Design mockup: `mockup.html` (open in browser to preview)

### Existing Patterns

| Pattern | Location | Relevance |
|---------|----------|-----------|
| Player styles | `extensions/styles/_player-components.scss` | Main file to modify |
| Icon definitions | `extensions/player/player-icons.ts` | SVG icons |
| Settings menu | `extensions/player/settings-menu.ts` | Settings plugin |

### Constraints

- Must work with VideoJS (Stash's video player library)
- Keep changes in `extensions/` to avoid upstream merge conflicts
- Must work with existing marker/chapter functionality

---

## Design Specifications

### CSS Variables
```scss
--yt-red: #f00;
--yt-red-hover: #ff1a1a;
--yt-white: #fff;
--yt-white-muted: rgba(255, 255, 255, 0.7);
--yt-white-dim: rgba(255, 255, 255, 0.5);
--yt-progress-bg: rgba(255, 255, 255, 0.2);
--yt-progress-buffer: rgba(255, 255, 255, 0.4);
--yt-control-bg: linear-gradient(0deg, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.6) 40%, transparent 100%);
```

### Progress Bar
- Thin `3px` bar at bottom, expands to `5px` on hover
- Red `#f00` for played portion
- Gray `rgba(255,255,255,0.4)` for buffered
- Dark `rgba(255,255,255,0.2)` for background
- Circular red scrubber handle (`13px`) appears only on hover

### Control Layout

**Left side (in order):**
1. Play/Pause button
2. Next button (skip forward)
3. Volume button + inline horizontal slider (expands on hover)
4. Time display: `0:00 / 20:48` format
5. Chapter indicator (optional)

**Right side (in order):**
1. Autoplay toggle
2. Subtitles/CC button
3. Settings button (gear rotates 30deg on hover)
4. Miniplayer button
5. Theater mode button
6. Fullscreen button

### Button Styling
- White filled SVG icons, `22px` (play is `26px`)
- Circular buttons `36px` diameter
- Hover: `background: rgba(255,255,255,0.1)`
- Tooltips appear on hover with dark background

### Volume Slider
- Inline horizontal slider that expands from volume button on hover
- Width: `52px` when expanded, `0` when collapsed
- Height: `3px` track
- White fill with `12px` circular thumb
- Transition: `width 0.2s cubic-bezier(0.4, 0, 0.2, 1)`

### Time Display
- Format: `current / duration` (e.g., `0:00 / 20:48`)
- Font: Roboto, `12px`, white
- Slash separator with `3px` margin on each side

---

## SVG Icons (YouTube-style)

### Play
```svg
<path d="M6 4l15 8-15 8V4z"/>
```

### Pause
```svg
<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
```

### Next
```svg
<path d="M6 4l10 8-10 8V4zm10 0h2v16h-2V4z"/>
```

### Volume High
```svg
<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
```

### Volume Muted
```svg
<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
```

### Settings (Gear)
```svg
<path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>
```

### Fullscreen
```svg
<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
```

### Miniplayer
```svg
<path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/>
```

### Theater Mode
```svg
<path d="M19 7H5c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm0 8H5V9h14v6z"/>
```

### CC/Subtitles
```svg
<path d="M19 4H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H5V6h14v12zm-8-6H9.5v-.5h-2v3h2v-.5H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2v-.5H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/>
```

### Autoplay
```svg
<path d="M5 6l10 6-10 6V6zm12-2v16h2V4h-2z"/>
```

---

## Progress Log

### 2026-01-06 - Session started

- Created design mockup (`mockup.html`)
- Documented YouTube 2024 specifications
- Identified files to modify

---

## Implementation Plan

### Phase 1: Styling
- [ ] Update `_player-components.scss` with YouTube-style CSS
- [ ] Implement progress bar redesign
- [ ] Implement control bar gradient background

### Phase 2: Icons
- [ ] Update `player-icons.ts` with new SVG paths
- [ ] Add gear rotation animation on hover

### Phase 3: Layout
- [ ] Modify VideoJS control bar order in `ScenePlayer.tsx` if needed
- [ ] Implement expanding volume slider

### Phase 4: Testing
- [ ] Test on port 3000 (dev server)
- [ ] Final verification on port 9999 (production build)
- [ ] Check ModernDark compatibility

---

## Open Questions

1. Should we keep all YouTube controls or only relevant ones for Stash?
2. How to handle chapter/marker indicators with new design?

---

## Notes

- Stash uses VideoJS for the video player
- Extensions are in `ui/v2.5/src/extensions/` to avoid merge conflicts
- The mockup HTML is a standalone reference - open in browser to see target design
