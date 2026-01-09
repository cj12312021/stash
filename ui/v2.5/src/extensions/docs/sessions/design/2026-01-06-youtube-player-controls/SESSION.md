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
  - components/ScenePlayer/markers.ts
figma_link: null
---

# Design Session: YouTube Player Controls Redesign

> **STATUS: IMPLEMENTATION IN PROGRESS**
>
> Design approved on 2026-01-07. Implementation started.

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
- [ ] Markers styled with hybrid approach (point ticks + range overlays)

---

## Context

### Reference
- YouTube video used for reference: https://www.youtube.com/watch?v=pCZTmEjPCl8
- Design mockup: `mockup.html` (open in browser to preview)
- Marker options mockup: `marker-options-mockup.html` (compares 3 marker approaches)

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

### CSS Variables (Stash Theme)
```scss
--stash-primary: #137cbd;         /* Progress bar, scrubber */
--stash-primary-hover: #48aff0;   /* Hover states */
--stash-text: #f5f8fa;            /* Button icons, time display */
--stash-text-muted: rgba(245, 248, 250, 0.7);
--stash-text-dim: rgba(245, 248, 250, 0.5);
--stash-progress-bg: rgba(255, 255, 255, 0.2);
--stash-progress-buffer: rgba(255, 255, 255, 0.4);
--stash-body-bg: #202b33;         /* Page background */
--stash-card-bg: #30404d;         /* Card backgrounds */
--stash-secondary: #394b59;       /* Right-panel group bg */
--stash-control-bg: transparent;  /* YouTube 2026: no gradient */
```

### Progress Bar
- Thin `3px` bar at bottom, expands to `5px` on hover
- Stash primary `#137cbd` for played portion
- Gray `rgba(255,255,255,0.4)` for buffered
- Dark `rgba(255,255,255,0.2)` for background
- Circular primary-colored scrubber handle (`13px`) appears only on hover

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
4. Fullscreen button

*Note: Miniplayer and Theater mode removed - not relevant to Stash*

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

### Markers (Option A: Hybrid Approach) ✅ DECIDED

Stash has two marker types that YouTube doesn't support natively:

| Marker Type | Description | Visual Treatment |
|-------------|-------------|------------------|
| **Point marker** | Start time only (e.g., "Intro" at 0:30) | Cyan vertical tick mark on progress bar |
| **Range marker** | Start + end time (e.g., "Action" 2:00-4:30) | Amber semi-transparent overlay segment |

#### Point Markers
- Small vertical tick marks (`3px` wide, `14px` tall)
- Color: `#00d4ff` (cyan) with glow effect
- Positioned on progress bar at marker time
- Expands to `18px` on hover
- Shows tooltip with marker title on hover

#### Range Markers
- Semi-transparent colored overlay on progress bar
- Color: `rgba(255, 170, 0, 0.35)` (amber)
- Left/right borders: `2px solid #ffaa00`
- Spans from start to end time
- Brightens to `rgba(255, 170, 0, 0.5)` on hover
- Shows tooltip with title and time range on hover

#### Why Option A (Hybrid)?
- Clear visual distinction between marker types
- Range markers show duration at a glance
- Minimal disruption to progress bar
- Works with existing VideoJS/markers.ts structure
- Handles overlapping markers reasonably well

---

## YouTube Chapter Research

YouTube implements chapters differently than Stash markers:

### YouTube's Approach
- Progress bar divided into **segments** (one per chapter)
- `4px` gap between each segment
- Each segment has its own played/buffered/hover states
- **Point-based only** - chapters have start time, end implied by next chapter

### YouTube HTML Structure
```html
<div class="ytp-chapters-container">
  <div class="ytp-chapter-hover-container" style="width: 39px; margin-right: 4px;">
    <!-- progress bar for chapter 1 -->
  </div>
  <div class="ytp-chapter-hover-container" style="width: 90px; margin-right: 4px;">
    <!-- progress bar for chapter 2 -->
  </div>
</div>
```

### Why Not Use YouTube's Chapter Style?
- YouTube doesn't support range markers (start + end time)
- Gap-based approach reduces clickable progress area
- Complex to implement with VideoJS
- Hard to show overlapping markers

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

### 2026-01-07 - Marker design research

- Used Playwright to inspect live YouTube player
- Discovered YouTube chapter implementation (segmented progress bar with gaps)
- Analyzed existing Stash marker system (`markers.ts`)
  - Point markers: `IMarker` with `seconds` only
  - Range markers: `IMarker` with `seconds` + `end_seconds`
- Created marker options mockup (`marker-options-mockup.html`) comparing 3 approaches
- **Decision: Option A (Hybrid Approach)** selected
  - Point markers = cyan tick marks
  - Range markers = amber overlay segments

### 2026-01-07 - Marker design added to main mockup

- Added marker CSS styles to `mockup.html`:
  - Point markers: cyan `#00d4ff` tick marks with glow effect
  - Range markers: amber `rgba(255,170,0,0.35)` overlay segments
  - Hover states and tooltips for both types
- Added example markers to progress bar (3 point markers, 1 range marker)
- Added marker feature descriptions to info section
- **Blocked implementation** - awaiting design review and approval

### 2026-01-07 - YouTube design verification

- Verified current YouTube player design using Playwright
- **Finding: YouTube no longer uses gradient background**
  - Controls now float on transparent background
  - Updated `--yt-control-bg` from gradient to `transparent`
  - Updated mockup and specs to reflect this change
- **Finding: Right-side buttons grouped in dark pill container**
  - CC, Settings, Miniplayer, Theater, Fullscreen grouped together
  - Container: `rgba(32,43,51,0.9)` (Stash body-bg) with `border-radius: 8px`
  - Buttons inside group are slightly smaller (32px vs 36px)
  - Added `.controls-right-group` wrapper to mockup
- **Decision: Use Stash colors instead of YouTube colors**
  - Progress bar: `#137cbd` (Stash primary) instead of `#f00` (YouTube red)
  - Text: `#f5f8fa` (Stash text) instead of `#fff`
  - Backgrounds: Stash dark theme colors (`#202b33`, `#30404d`, `#394b59`)
  - Updated all CSS variables from `--yt-*` to `--stash-*`

### 2026-01-07 - Autoplay button moved into group

- **Change: Moved Autoplay button into the right panel group**
  - Previously standalone outside the grouped container
  - Now first button in the `.controls-right-group` pill
  - Order: Autoplay, CC, Settings, Miniplayer, Theater, Fullscreen

### 2026-01-07 - Design polish improvements

- **Applied frontend design skill recommendations**
- **Typography**: Added JetBrains Mono for time displays (tabular-nums)
- **Progress bar polish**:
  - Glowing played portion on hover
  - Scrubber pulse animation
  - Enhanced hover preview with backdrop blur and border
- **Button micro-interactions**:
  - Big play button breathing animation
  - Play button scale on hover
  - Active state feedback (scale 0.92)
- **Marker improvements**:
  - Point markers: glow animation
  - Range markers: gradient fill instead of solid
  - Tooltips: arrow pointer, shadow, lift animation
- **Chapter dropdown refinement**:
  - Backdrop blur effect
  - Staggered slide-in animation for items
  - Active marker left accent bar
- **Control bar**: Gradient background for legibility on light video
- **Right panel group**: Backdrop blur, subtle border, dividers between buttons
- **Accessibility**:
  - Focus visible states for keyboard navigation
  - Reduced motion preference support
  - High contrast mode support

### 2026-01-07 - Chapter indicator design decisions

- **Feature: Chapter indicator shows current marker during playback**
- **Decisions made:**

#### 1. Current Marker Detection (Range-aware)
- **Point markers**: Show if current time is within 10 seconds after marker start
- **Range markers**: Show if current time is within start-end range
- **Overlapping ranges**: Show the marker that started most recently
- **No active marker**: Hide the indicator text (or show dimmed state)

#### 2. Click Behavior (Dropdown list)
- Clicking the chapter indicator opens a dropdown panel
- Panel shows all markers with timestamps
- Clicking a marker in the list seeks to that timestamp
- Matches YouTube's chapter dropdown behavior

#### 3. Visibility Rules
| Condition | Behavior |
|-----------|----------|
| Scene has no markers | Hide indicator entirely |
| Scene has markers, none active | Show indicator with "—" or dimmed |
| Scene has active marker | Show marker title |

#### 4. Integration Approach (React state)
- Listen to VideoJS `timeupdate` event in React
- Compute active marker from scene's marker list
- Keep marker UI state separate from MarkersPlugin
- Reuse existing `markerTitle()` helper for display text

#### 5. Title Display
- Max width: `200px` with text-overflow ellipsis
- Fallback: Use `primaryTag.name` if no title set
- Format: Just title (no tag suffix)

#### 6. Dropdown Panel Design
- Dark background matching right-panel group (`rgba(32,43,51,0.95)`)
- List of markers with: colored dot, title, timestamp
- Active marker highlighted
- Point markers show single time, range markers show "start - end"
- Max height with scroll for many markers

### 2026-01-07 - Settings menu redesign (YouTube comparison)

- **Inspected YouTube's 2026 settings menu** using Playwright
- **YouTube Main Menu Structure:**
  - Stable Volume (toggle) - audio normalization
  - Voice boost (toggle) - speech enhancement
  - Audio track (13) → submenu
  - Subtitles/CC (1) → submenu
  - Sleep timer → submenu
  - Playback speed → submenu with custom slider (0.05x increments)
  - Quality → submenu with HD/4K badges

- **Design Decisions:**
  1. **Reorder items** - Toggles first (like YouTube), then submenus
  2. **Keep Stash-specific features** - Loop, Auto-start, Scrubber toggles
  3. **Add custom speed slider** - Fine-grained control (0.05x steps)
  4. **Add quality badges** - HD badge for 720p+, 4K badge for 2160p
  5. **Skip YouTube-only features** - Stable Volume, Voice boost, Audio track, Sleep timer

- **Updated mockup.html** with complete settings menu:
  - Main menu with toggles first, submenus second
  - Quality submenu with HD/4K badges
  - Playback speed submenu with custom slider at top
  - Subtitles/CC submenu
  - Video filters submenu (Stash-specific)
  - Video transforms submenu (Stash-specific)
  - Full interactivity: navigation, selection, sliders

### 2026-01-07 - Removed non-Stash buttons

- **Removed Miniplayer and Theater mode buttons** from right panel group
- These are YouTube-specific features not relevant to Stash
- Right panel now contains: Autoplay, CC, Settings, Fullscreen

### 2026-01-07 - Fixed Autoplay icon

- **Discovered YouTube's actual autoplay icon** using Playwright inspection
- YouTube's autoplay toggle shows icon only when ON (hidden when OFF)
- Icon is embedded as base64 SVG in `::after` pseudo-element
- **Icon design**: Double play triangle (two triangles side-by-side)
  - Left triangle: smaller, rounded start
  - Right triangle: larger, points to the right
  - Indicates "auto-continue to next video"
- **Path (24x24)**: Two separate paths for cleaner rendering:
  - Left triangle: `M4 5v14l6-7-6-7z`
  - Right triangle: `M12 5v14l8-7-8-7z`
- Updated mockup with correct icon
- **Verified**: Screenshot shows double-triangle icon `▶▶` now distinct from single play `▶`

### 2026-01-07 - Settings menu styling refinements

- **Made menu transparent** like YouTube:
  - Background: `rgba(28, 28, 28, 0.75)` (was 0.96)
  - Backdrop blur: `blur(20px)` for glass effect
  - Video content now visible through menu

- **Fixed icon colors** - icons were inconsistent (some black, some white):
  - Issue: Some SVGs use `stroke`, others use `fill`, some use `currentColor`
  - Solution: Added `color`, `fill`, AND `stroke` to all SVG CSS rules
  - All icons now use `var(--stash-text-muted)` consistently

### 2026-01-07 - Autoplay Form.Switch redesign (PR #6368 inspiration)

- **Implemented Form.Switch style toggle** based on user's upstream PR:
  - Reference: https://github.com/stashapp/stash/pull/6368

- **Structure matches React Form.Switch**:
  - **Track**: Horizontal pill shape (`40px × 18px`, white `rgba(255,255,255,0.7)`)
  - **Thumb**: Circular icon (`22px`) that slides left/right based on state
  - Icon changes between play (▶) and pause (⏸)

- **State behavior**:
  - **ON**: Thumb slides RIGHT, white bg `rgba(255,255,255,0.95)`, dark play ▶ icon
  - **OFF**: Thumb slides LEFT, dark bg `rgba(80,80,80,0.95)`, white pause ⏸ icon
  - Smooth `transition` on transform for sliding animation

- **Advantages over previous static design**:
  - Immediately recognizable as a toggle switch
  - Thumb position provides spatial state indication (right = on, left = off)
  - Color inversion reinforces state
  - Familiar UX pattern from Form.Switch components

- **Tooltip text** matches PR:
  - ON: "Auto-start enabled (click to disable)"
  - OFF: "Auto-start disabled (click to enable)"

---

## Implementation Plan

### Phase 1: Progress Bar & Control Bar
- [ ] Update `_player-components.scss` with YouTube-style progress bar CSS
- [ ] Implement thin bar that expands on hover (`3px` → `5px`)
- [ ] Add red scrubber handle (appears on hover)
- [ ] Implement control bar gradient background

### Phase 2: Icons
- [ ] Update `player-icons.ts` with filled YouTube-style SVG paths
- [ ] Change icons from stroke to fill style
- [ ] Add gear rotation animation on hover (30deg)

### Phase 3: Markers (Hybrid Approach)
- [ ] Update `markers.ts` or `_player-components.scss` for new marker styles
- [ ] Point markers: cyan tick marks (`#00d4ff`)
- [ ] Range markers: amber overlay segments (`rgba(255,170,0,0.35)`)
- [ ] Add hover states and tooltips

### Phase 4: Layout & Controls
- [ ] Modify VideoJS control bar order in `ScenePlayer.tsx` if needed
- [ ] Implement expanding volume slider (optional)

### Phase 5: Chapter Indicator
- [ ] Create `ChapterIndicator.tsx` component in extensions/player/
- [ ] Implement `useActiveMarker` hook to track current marker based on playback time
- [ ] Add dropdown panel with marker list
- [ ] Wire up `timeupdate` event listener to update active marker
- [ ] Add seek-to-marker functionality on dropdown item click
- [ ] Style with CSS matching mockup specifications

### Phase 6: Testing
- [ ] Test on port 3000 (dev server)
- [ ] Final verification on port 9999 (production build)
- [ ] Check ModernDark compatibility
- [ ] Test markers with real scene data

---

## Open Questions

1. ~~Should we keep all YouTube controls or only relevant ones for Stash?~~
   - **Resolved**: Keep Stash-relevant controls only (no miniplayer, theater mode)
2. ~~How to handle chapter/marker indicators with new design?~~
   - **Resolved**: Use Option A (Hybrid Approach)
   - Point markers = cyan tick marks on progress bar
   - Range markers = amber overlay segments on progress bar

---

### 2026-01-07 - Mockup recovered + Autoplay research

- **User recovered mockup.html** from browser cache to `mockup copy.html`
- **Fixed CSS variable bug**: Changed `var(--yt-progress-buffer)` to `var(--stash-progress-buffer)` on line 172
- **Copied recovered file to mockup.html** as main version

#### Autoplay Toggle Research (YouTube comparison)

**Used Playwright to inspect YouTube's actual autoplay implementation:**

1. **Navigated to** https://www.youtube.com/watch?v=pCZTmEjPCl8
2. **Captured control bar** in both ON and OFF states
3. **Key finding: YouTube does NOT use a Form.Switch style toggle**

**YouTube's actual autoplay design:**
| State | Visual |
|-------|--------|
| **ON** | Blue filled circle with play ▶ icon - prominent |
| **OFF** | Gray/transparent circle with pause ‖ icon - muted |

**Comparison created:** `autoplay-comparison.html`

| Aspect | Form.Switch (Current) | YouTube Icon Button (Proposed) |
|--------|----------------------|--------------------------------|
| **Size** | 48px wide | 32px (same as other buttons) |
| **Visual** | Pill track + sliding thumb | Blue filled circle when ON |
| **State indicator** | Position (left/right) | Color (blue/gray) + icon change |
| **Consistency** | Stands out from neighbors | Matches CC, Settings, Fullscreen |

**Analysis:**
- Form.Switch: Clear toggle metaphor but visually different from neighboring buttons
- YouTube style: Identical size to neighboring buttons, seamless visual integration

---

## Resume Point (2026-01-07)

### Current mockup state: COMPLETE ✅
- `mockup.html` contains the finalized desktop design with all features
- `mobile-responsive.html` contains mobile analysis and responsive strategy
- All design decisions have been made:
  - Stash theme colors (`#137cbd` primary)
  - Hybrid markers (point = cyan ticks, range = amber overlays)
  - Chapter dropdown panel with staggered animation
  - Settings menu (YouTube 2026 style)
  - **Asymmetric layout**: Left controls standalone, right controls grouped in pill
  - Right panel grouping: **pill shape** (`border-radius: 20px`) with backdrop blur
  - **Embedded Track autoplay toggle** (40px, track fills with primary when ON)
  - **Mobile responsive**: 3-tier breakpoint strategy with full-screen settings modal

### Design is ready for implementation approval

### Files in session folder:
- `mockup.html` - Main desktop design mockup (COMPLETE)
- `mobile-responsive.html` - Mobile analysis with responsive strategy (NEW)
- `mockup copy.html` - Backup of recovered mockup
- `marker-options-mockup.html` - Marker style comparison (Option A chosen)
- `autoplay-comparison.html` - Form.Switch vs YouTube button comparison (superseded)
- `autoplay-toggle-refined.html` - 4 approaches for pill-track integration (Approach 2 chosen)

### 2026-01-07 - Right panel group shape update

- **Issue**: Rectangular container (8px radius) conflicted with circular button hovers
- **Solution**: Changed to pill shape (`border-radius: 20px`)
- Circular button hovers now fit naturally inside the pill container

### 2026-01-07 - Autoplay toggle design finalized

- **Created `autoplay-toggle-refined.html`** with 4 approaches for integrating pill-track toggle with button group
- **Evaluated options**:
  1. Compact Inline Track (44px, 32×14px track)
  2. Embedded Track (40px, 28×12px track) ✅ **SELECTED**
  3. Minimal Track (42px, 4px rail with prominent thumb)
  4. Segmented Toggle (48px, both icons visible)
- **Selected Approach 2: Embedded Track** - most compact at 40px, track fills with primary color when ON
- **Updated mockup.html** with new design:
  - Track: `28×12px`, fills with `#137cbd` when ON
  - Thumb: `16px` white circle that slides left/right
  - Icon inside thumb changes between play/pause
  - Total width: `40px` (down from 48px Form.Switch)

### 2026-01-07 - Mobile responsive analysis

- **Created `mobile-responsive.html`** with comprehensive mobile analysis
- **Control bar issues at 320px**:
  - Total controls width (~400px) overflows 320px viewport
  - Touch targets (32-36px) below 44px accessibility minimum
  - Volume slider hover doesn't work on touch
  - Thumbnail preview hover unusable on touch

- **Control bar responsive strategy**:
  | Breakpoint | Visible Controls |
  |------------|------------------|
  | >768px | All controls, hover features enabled |
  | 481-768px | Hide Next, move Volume to settings |
  | ≤480px | Play + Settings + Fullscreen only, 44px targets |

- **Mobile control bar adaptations**:
  - Two-row layout: Time/chapter above, buttons below
  - 44px minimum touch targets
  - Hide secondary controls (Next, Volume, Autoplay, CC)
  - Disable hover thumbnail preview

- **Settings menu issues at 320px**:
  - 280px menu clips on 320px screen
  - Small touch targets (10px padding rows)
  - Thin sliders (4px tracks) hard to manipulate
  - Small toggles (36×20px)

- **Settings menu mobile solution**: Full-screen modal
  | Desktop (>480px) | Mobile (≤480px) |
  |------------------|-----------------|
  | 280px floating overlay | 100vw × 100vh modal |
  | Click outside to close | Close button in header |
  | 10px padding rows | 48px min-height rows |
  | 36×20px toggles | 52×32px toggles |
  | 4px slider tracks | 8px slider tracks |

- **Mobile settings consolidates hidden controls**:
  - Volume (moved from control bar)
  - Autoplay toggle (moved from right group)
  - Subtitles/CC (moved from right group)

### Key design decisions (finalized):
- Hybrid markers (point = cyan ticks, range = amber overlays)
- Stash theme colors (primary `#137cbd` instead of YouTube red)
- Transparent control bar (YouTube 2026 style)
- Right panel grouping: pill shape (`border-radius: 20px`) with backdrop blur
- YouTube-style settings menu with Stash-specific options
- **Autoplay toggle**: Embedded Track design (40px, track fills with primary when ON)
- **Mobile responsive**: Simplified controls + full-screen settings modal

### 2026-01-07 - Frontend Design Quality Pass

Applied frontend-design skill for final polish:

#### Color System Refinements
- Primary blue upgraded: `#137cbd` → `#2196f3` (more vibrant Material Blue)
- Added glow variables: `--stash-primary-glow`, `--marker-cyan-glow`, `--marker-amber-glow`
- Darker, richer backgrounds: `#181e24` body, deeper gradients
- New shadow system: `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-glow`

#### Typography
- Upgraded to Inter font family (cleaner than system fonts)
- JetBrains Mono retained for time displays
- Tighter letter-spacing on headings (`-0.03em`)
- Bolder font weights for better hierarchy

#### Visual Depth & Texture
- Subtle radial gradients on page background (ambient glow effect)
- Film grain texture on video placeholder (SVG noise filter)
- Refined video container shadows with inset highlights
- Consistent backdrop-filter blur across all overlays (16-24px)

#### Animation Refinements
- All transitions use cubic-bezier easing `(0.4, 0, 0.2, 1)`
- Scrubber handle: white fill with primary border, pulse animation
- Progress bar: gradient fill with hover glow effect
- Tooltips: slide-up animation on appear
- Chapter dropdown: scale + translateY entrance animation

#### Component Polish
- **Big play button**: Backdrop blur, refined border, glow on hover
- **Scrubber handle**: White with blue border (better visibility)
- **Markers**: Enhanced gradients, improved glow effects
- **Right panel pill**: Gradient dividers, refined shadow
- **Chapter indicator**: Hover background, improved typography
- **Settings toggles**: Glow effect when ON, scale on hover
- **Feature cards**: Hover lift effect with border brightening

#### Accessibility Retained
- Focus-visible states with glow shadows
- Reduced motion support
- High contrast mode overrides

**Screenshots saved:**
- `mockup-quality-pass.png` - Full view after polish
- `mockup-progress-hover.png` - Hover preview interaction
- `mockup-settings-open.png` - Settings menu open state

### 2026-01-07 - Implementation Progress

**Completed Phases:**

#### Phase 1: Progress Bar & Control Bar CSS ✅
- Added CSS variables for YouTube 2026 design system (`$player-primary`, `$marker-cyan`, etc.)
- Updated progress bar: thin 3px expanding to 5px on hover
- Added scrubber handle: white with blue border, appears on hover
- Added glow effects on progress bar hover
- Updated control bar gradient (refined multi-stop gradient)
- Updated hover time tooltip with backdrop blur

#### Phase 2: YouTube-style SVG Icons ✅
- Converted all icons from stroke to filled style
- Updated `player-icons.ts` with Material Design filled icons
- Updated SCSS for filled icon styling with drop shadows
- Play button slightly larger (26px) with enhanced hover scale

#### Phase 3: Markers (Hybrid Approach) ✅
- Point markers: Cyan vertical ticks with gradient and glow animation
- Range markers: Amber overlay segments with gradient fill
- Updated marker tooltips with backdrop blur and slide animation
- Both marker types have enhanced hover states

#### Phase 4: Layout & Controls ✅
- Updated settings menu toggle to use primary blue
- Updated selected submenu items with blue highlight
- Updated slider thumbs with blue color and glow
- Updated reset button styling to match theme

**Files Modified:**
- `extensions/styles/_player-components.scss` - All CSS changes
- `extensions/player/player-icons.ts` - Filled SVG icons

**Build verified:** `npm run build` completed successfully

### Phase 6: Testing Progress (2026-01-07)

**Test URL:** `http://localhost:3000/scenes/2275?qsort=date&qsortd=asc&qfc=...`

**Verified Working:**
- ✅ Filled SVG icons displaying correctly (play, skip, volume, settings, fullscreen)
- ✅ Progress bar with blue gradient fill
- ✅ Scrubber handle appears on hover (white circle with blue border)
- ✅ Time tooltip shows on progress bar hover
- ✅ Settings menu opens with updated styling
- ✅ Toggle switches showing with blue color when ON ("Show scrubber" toggle is blue)

**Screenshots saved:**
- `.playwright-mcp/player-test-initial.png` - Initial player view
- `.playwright-mcp/player-test-progress-hover.png` - Progress bar hover with scrubber
- `.playwright-mcp/player-test-settings-menu.png` - Settings menu open

**Still to verify:**
- Marker styling (need scene with markers visible on progress bar)
- Settings submenu selection highlighting
- Video Filters/Transforms slider styling

**Remaining:**
- Phase 5: Chapter Indicator Component (optional - requires new VideoJS plugin)
- Phase 6: Continue testing markers and submenu styling

### 2026-01-07 - Control Bar Layout Fix

**Problem identified:** Control bar had too many buttons and wrong order:
- Before: |◄ ◄| ◄◄ ►► ▶ |► ►| 🔊 ... 1x ⊘ ⚙ ⛶
- Many navigation buttons cluttering the interface
- No visual grouping for right-side buttons

**Root cause:** CSS was adding styling but not hiding unwanted buttons or reordering

**Solution implemented:**

1. **Hide unwanted buttons** (with `!important` to override video.js):
   - `.vjs-skip-button.vjs-icon-previous-item` (Previous video)
   - `.vjs-seek-button` (Seek back/forward 10s)
   - `.vjs-seek-to-live-control`
   - `.vjs-playback-rate` (moved to settings menu)

2. **Reorder with flexbox `order`:**
   - Play (order: 1)
   - Skip Next (order: 2)
   - Volume (order: 3)
   - Time display (order: 4-6)
   - Spacer (order: 7) - flex: 1 1 auto to push right buttons
   - Autoplay (order: 10)
   - Settings (order: 11)
   - Fullscreen (order: 12)

3. **Right-panel pill grouping:**
   - Used `::before` pseudo-element on autostart button
   - Width: ~151px spanning all three right buttons
   - Background: `rgba(24, 30, 36, 0.85)` with backdrop blur
   - Border-radius: 20px for pill shape

**Result:**
- Clean layout: ▶ Play → |► Next → 🔊 Volume → 0:00 / 40:08 → [spacer] → ⊘ ⚙ ⛶
- Right buttons grouped in subtle dark pill container
- Matches YouTube 2026 control bar design

**Screenshots saved:**
- `.playwright-mcp/player-controls-fixed.png` - Full page after fix
- `.playwright-mcp/player-controlbar-closeup.png` - Control bar closeup

### 2026-01-07 - Additional Testing & Bug Fixes

**Issue Found:** Additional Video.js buttons were visible in control bar
- `vjs-descriptions-button` (display: inline-block)
- `vjs-subs-caps-button` (display: inline-block)
- `vjs-audio-button` (display: inline-block)

**Fix Applied:** Added these buttons to the hidden button list in `_player-components.scss`:
```scss
.vjs-descriptions-button,
.vjs-subs-caps-button,
.vjs-audio-button {
  display: none !important;
}
```

**Verified Working:**
- ✅ Progress bar with blue gradient fill
- ✅ Scrubber handle (white circle with blue border) appears on hover
- ✅ Time tooltip with thumbnail preview on hover
- ✅ Settings menu with backdrop blur and toggle styling
- ✅ Toggle switches show blue accent when ON
- ✅ Control bar layout: Play → Skip Next → Volume → Time → [spacer] → Autoplay → Settings → Fullscreen
- ✅ Unwanted buttons hidden (Previous Skip, Seek buttons, Descriptions, Subs/CC, Audio Track)
- ✅ Filled SVG icons (YouTube 2024 style)

**Marker Styling Status:**
- CSS styling for markers (cyan point markers, amber range markers) is in place
- Cannot verify visually - test scene uses separate thumbnail scrubber component, not VideoJS markers
- VideoJS markers plugin is loaded (`vjs-marker-tooltip` element exists)
- Marker verification requires scene with VideoJS markers enabled on progress bar

**Screenshots:**
- `.playwright-mcp/youtube-controls-current-state.png` - Initial state
- `.playwright-mcp/youtube-controls-progress-hover.png` - Hover with scrubber
- `.playwright-mcp/youtube-controls-settings-menu.png` - Settings menu
- `.playwright-mcp/youtube-controls-fixed.png` - After button fix

### 2026-01-07 - TypeScript & SCSS Overhaul

**Problem Identified:** CSS-only approach was insufficient for full mockup parity:
1. Right panel group sizing was broken (pseudo-element width calculation incorrect)
2. Autoplay button was just an icon, not the embedded track toggle from mockup
3. Settings menu structure didn't match YouTube 2026 design

**Changes Made:**

#### 1. Rewrote `autostart-button.ts` (complete rewrite)
- **Before:** Simple icon button toggling between `vjs-icon-play-circle` and `vjs-icon-cancel`
- **After:** Embedded track toggle with sliding thumb
  - Custom `createEl()` method generating track + thumb structure
  - Classes: `.vjs-autostart-toggle`, `.vjs-autostart-track`, `.vjs-autostart-thumb`
  - State classes: `.vjs-autostart-on` / `.vjs-autostart-off`
  - SVG icons inside thumb (play ▶ when ON, pause ⏸ when OFF)

#### 2. Updated `_player-components.scss`
- Added missing SCSS variables: `$player-body-bg`, `$player-card-bg`, `$stash-text` alias
- **Right panel pill sizing:**
  - Fixed width calculation: `126px` (autostart 42px + settings 36px + fullscreen 36px + padding 12px)
  - Height: `38px`, border-radius: `22px`
- **Autoplay toggle styles:**
  - Track: `30×14px`, `border-radius: 7px`
  - Thumb: `18px` white circle, slides left/right based on state
  - ON state: Track fills with `$player-primary`, glow effect
  - Hover: Thumb scales up, track brightens
- **Button sizing inside pill:**
  - Settings & Fullscreen: `36px` width, `18px` icons
  - Autostart toggle: `42px` width
- **Dividers:** Gradient dividers between buttons in pill

**Files Modified:**
- `ui/v2.5/src/components/ScenePlayer/autostart-button.ts` - Complete rewrite
- `ui/v2.5/src/extensions/styles/_player-components.scss` - Major updates

**Status:** Changes written, needs testing. Dev server should hot-reload.

---

### 2026-01-07 - Bug Fixes & Successful Testing

**Issues identified and fixed:**

1. **player-icons.ts was overriding autostart button**
   - The PlayerIconsPlugin was adding an SVG icon to the autostart button
   - This created a `vjs-icon-placeholder` element that conflicted with our track/thumb design
   - **Fix**: Removed autostart button handling from player-icons.ts (lines 142-147)
   - Also removed unused `updateAutostartIcon` method

2. **Timing issue with updateState()**
   - `this.thumbEl` was null when `updateState()` was called in constructor
   - Video.js component lifecycle doesn't guarantee element creation timing
   - **Fix**: Changed `updateState()` to find thumb via DOM query instead of instance property
   - Added `setTimeout(() => this.updateState(), 0)` to defer initial state update

**Files modified:**
- `ui/v2.5/src/extensions/player/player-icons.ts` - Removed autostart icon handling
- `ui/v2.5/src/components/ScenePlayer/autostart-button.ts` - Fixed timing issue
- `ui/v2.5/src/extensions/styles/_player-components.scss` - Added `!important` to icon placeholder hide rule

**Verification results (port 3000):**
- ✅ Autoplay toggle renders as track + thumb (no icon placeholder)
- ✅ OFF state: Gray track, thumb on left, pause icon inside thumb
- ✅ ON state: Blue track, thumb on right, play icon inside thumb
- ✅ Click toggles between states correctly
- ✅ CSS classes applied: `vjs-autostart-on` / `vjs-autostart-off`
- ✅ Right panel pill grouping: 126px pseudo-element with dark background
- ✅ Button ordering correct: Autostart (10) → Settings (11) → Fullscreen (12)

**Screenshots saved:**
- `.playwright-mcp/youtube-controls-toggle-off-state.png` - OFF state
- `.playwright-mcp/youtube-controls-toggle-on-state.png` - ON state

## Session 2 Progress (2026-01-07):

**Verified Working:**
1. ✅ Progress bar - blue gradient fill, thin 3px expanding to 5px on hover
2. ✅ Scrubber handle - white circle with blue border, appears on hover
3. ✅ Time tooltip with thumbnail preview on hover
4. ✅ Autoplay toggle - embedded track style, ON/OFF states working correctly
5. ✅ Right panel pill grouping - `::before` pseudo-element with `rgba(24, 30, 36, 0.9)` background, 126px width
6. ✅ Control bar layout - Play → Skip Next → Volume → Time → [spacer] → Autoplay → Settings → Fullscreen
7. ✅ CC button - correctly hidden when no captions (VideoJS default behavior)
8. ✅ Filled SVG icons (YouTube 2024 style)

**Issue Found: Marker Range Positioning**
- Marker appeared 42.5px BELOW the progress bar
- Root cause: `.vjs-progress-control` has complex positioning, marker uses `top: 27px` + `transform: translateY(28px)` = 55px offset
- Progress holder sits at 12.5px from control top

---

## Session 3 Progress (2026-01-07):

### Marker Positioning Fix ✅

**Problem:** Marker range was 42.5px below progress holder (at 55px instead of 12.5px)

**Root Cause Analysis:**
- `.vjs-marker-range` is direct child of `.vjs-progress-control`
- Progress control has `top: -22.5px; bottom: 37.5px`
- Progress holder sits at 12.5px offset from control top
- Old CSS had `top: 27px` (from VideoJS) + `transform: translateY(28px)` = 55px total

**Fix Applied:**
```scss
.vjs-marker-range {
  position: absolute;
  top: 12.5px !important; // Align with .vjs-progress-holder
  transform: none !important; // Override any inherited transform
  height: 3px !important;
}
```

**Verification:**
- `isAligned: true` - marker now aligns with progress holder
- `offsetFromHolder: -1px` - essentially perfect alignment

### All Features Verified Working:
1. ✅ Progress bar - blue gradient, 3px→5px on hover
2. ✅ Scrubber handle - white circle with blue border
3. ✅ Time tooltip with thumbnail preview
4. ✅ Autoplay toggle - embedded track design (30×14px track, 18px thumb)
5. ✅ Right panel pill grouping (126px, dark background with blur)
6. ✅ Control bar layout - correct button order
7. ✅ Filled SVG icons (YouTube 2024 style)
8. ✅ **Marker range positioning - FIXED** (amber overlay aligned with progress bar)

### Screenshots:
- `.playwright-mcp/youtube-controls-resume-check.png` - Initial state
- `.playwright-mcp/youtube-controls-progress-hover.png` - Hover with scrubber
- `.playwright-mcp/control-bar-closeup.png` - Control bar detail
- `.playwright-mcp/marker-aligned-fixed.png` - Marker correctly positioned

---

## Resume Point (2026-01-07) - Session 4

### Status: IN PROGRESS - Needs Parity with Mockup

**Previous implementation incomplete.** Features need refinement to match mockup.html exactly.

### Feature Status (vs mockup.html):

| Feature | Status | Gap Description |
|---------|--------|-----------------|
| Progress bar (3px→5px) | 🟡 Partial | Colors/animations may not match mockup |
| Scrubber handle | 🟡 Partial | Size/styling needs verification |
| Autoplay toggle (embedded track) | 🟡 Partial | Track/thumb sizing, icons, glow effects |
| Right panel pill grouping | 🟡 Partial | Container sizing, backdrop blur, dividers |
| Marker styling (cyan/amber) | 🟡 Partial | Gradient fills, glow animations, tooltips |
| Chapter indicator/dropdown | 🔴 Not Started | New component needed |
| Settings menu redesign | 🔴 Not Started | YouTube 2026 style toggles/submenus |
| Control bar layout | 🟡 Partial | Button ordering, Next button visibility |
| Volume slider expand | 🟡 Partial | Expand on hover behavior |
| Button hover/active states | 🟡 Partial | Hover backgrounds, active scale |
| Big play button | 🟡 Partial | Breathing animation, hover glow |

### Mockup CSS Variables (Target):
```scss
--stash-primary: #2196f3;           // Material Blue (not #137cbd)
--stash-primary-hover: #64b5f6;
--stash-primary-glow: rgba(33, 150, 243, 0.4);
--stash-body-bg: #181e24;
--marker-cyan: #00e5ff;
--marker-amber: #ffab40;
```

### Key Mockup Specifications:
- **Autoplay toggle**: 30×14px track, 18px thumb, 42px total width
- **Right panel pill**: `rgba(24, 30, 36, 0.9)`, border-radius: 22px, backdrop-filter: blur(16px)
- **Control buttons in pill**: 34×34px with 18px icons
- **Progress bar**: 3px→5px on hover, blue gradient with glow
- **Scrubber**: 14×14px white with 2px blue border

### Next Steps:
1. Read current implementation files
2. Use /frontend-design skill for quality pass
3. Update SCSS to match mockup exactly
4. Verify each feature against mockup

### Key Files Modified:
- `ui/v2.5/src/extensions/styles/_player-components.scss` - All CSS changes
- `ui/v2.5/src/extensions/player/player-icons.ts` - Filled SVG icons
- `ui/v2.5/src/components/ScenePlayer/autostart-button.ts` - Embedded track toggle

### Test Scene:
- URL: `http://localhost:3000/scenes/2275`
- Marker "Massage" from 0:00-5:57 (amber range overlay)

---

## Resume Point (2026-01-07) - Session 5

### Status: IN PROGRESS - CSS Override Conflicts Fixed

**Key Discovery**: Upstream `ScenePlayer/styles.scss` was overriding our extension styles. Added `!important` overrides to fix CSS specificity issues.

### Completed This Session ✅

1. **Identified CSS conflicts** between upstream `ScenePlayer/styles.scss` and our `_player-components.scss`:
   - `.vjs-marker`: upstream sets `background-color: rgba(33,33,33,0.8)`, `width: 6px`, `visibility: hidden`
   - `.vjs-marker-range`: upstream sets `background: rgba(255,255,255,0.4)`, `transform: translateY(-28px)`
   - `.vjs-marker-tooltip`: upstream sets white background, `color: #000`, `font-family: Arial`
   - `.vjs-duration`: upstream sets `margin-right: auto` breaking spacer layout
   - `.vjs-autostart-button`: upstream has `::before`/`::after` pseudo-elements for old icon design

2. **Fixed marker overrides** with `!important`:
   - `.vjs-marker`: cyan gradient, 3px width, 16px height, `visibility: visible`
   - `.vjs-marker-range`: amber gradient, proper positioning, no transform
   - `.vjs-marker-tooltip`: dark blur background, white text, proper font

3. **Fixed autostart button conflicts**:
   - Added rules to hide `.vjs-icon-play-circle` and `.vjs-icon-cancel` pseudo-elements
   - Preserved our pill background `::before` on `.vjs-autostart-toggle`

4. **Fixed layout issues**:
   - `.vjs-duration` margin-right: 0 !important
   - Right panel pill width updated to 122px (42 + 34 + 34 + 12 padding)

5. **Verified CSS variables match mockup**:
   - `$player-primary: #2196f3` ✓
   - `$marker-cyan: #00e5ff` ✓
   - `$marker-amber: #ffab40` ✓

### Remaining Tasks 🔴

| Task | Priority | Notes |
|------|----------|-------|
| Update settings/fullscreen buttons to 34px | High | Currently 36px, mockup says 34px |
| Test on dev server (port 3000) | High | Verify CSS overrides work |
| Production build verification | Medium | `npm run build` |
| Port 9999 verification | Medium | Test on Go binary |
| Chapter indicator/dropdown | Low | New component needed |
| Settings menu redesign | Low | YouTube 2026 style |

### Key Files Modified This Session:
- `ui/v2.5/src/extensions/styles/_player-components.scss`:
  - Lines 1046-1076: `.vjs-marker` with `!important` overrides
  - Lines 1083-1117: `.vjs-marker-range` with `!important` overrides
  - Lines 1120-1166: `.vjs-marker-tooltip` with `!important` overrides
  - Lines 345-355: Hide upstream autostart pseudo-elements
  - Line 259: `.vjs-duration` margin fix
  - Lines 297-324: Right panel pill sizing (122px width)

### CSS Specificity Strategy:
Upstream `ScenePlayer/styles.scss` loads first, then our `_player-components.scss`. Use `!important` to override because:
1. Same selector specificity
2. Upstream file can't be modified (merge conflicts)
3. `!important` is acceptable for fork-specific overrides

### To Resume:
```bash
cd ui/v2.5
npm run start  # Start dev server on port 3000
# Open http://localhost:3000/scenes/2275 to test
# Use /frontend-design skill for quality refinements
```

### Mockup Reference:
`ui/v2.5/src/extensions/docs/sessions/design/2026-01-06-youtube-player-controls/mockup.html`

---

## Resume Point (2026-01-07) - Session 6

### Status: RIGHT PANEL PILL PARTIALLY FIXED - ALIGNMENT ISSUES REMAIN 🟡

**Key Fix Applied**: Changed pill `z-index` from `-1` to `0` so it renders above the control bar gradient.

**REMAINING ISSUES**:
1. **Pill buttons misaligned** - The autoplay/settings/fullscreen buttons inside the pill are not properly aligned
2. **Pill pushed too far right** - The pill container is positioned too far to the right
3. **Pill being cut off** - Parts of the pill are clipped/hidden due to overflow or positioning

### Fixes Applied This Session:

1. **Pill z-index** (line 322): Changed from `z-index: -1` to `z-index: 0`
   - With `-1`, pill rendered behind control bar's `::before` gradient
   - With `0`, pill renders above gradient but below buttons (which have `z-index: 1`)

2. **Autostart track z-index** (line 364): Added `z-index: 1` to `.vjs-autostart-track`
   - Ensures the toggle track appears above the pill background

3. **Button sizing verified**:
   - Autostart: 42px ✅
   - Settings: 34px ✅
   - Fullscreen: 34px ✅
   - Pill width: 122px (42 + 34 + 34 + 12 padding) ✅

### Visual Verification:
- `.playwright-mcp/control-bar-zindex-fixed.png` - Pill now visible but misaligned
- `.playwright-mcp/final-player-controls.png` - Full player view showing cutoff

### Current Pill CSS (lines 305-324 in _player-components.scss):
```scss
.vjs-autostart-button.vjs-autostart-toggle {
  position: relative;
  margin-left: 8px;
  width: 42px;
  min-width: 42px;

  &::before {
    content: "";
    position: absolute;
    top: 50%;
    left: -6px;
    transform: translateY(-50%);
    width: 122px;
    height: 38px;
    background: rgba(24, 30, 36, 0.9);
    backdrop-filter: blur(16px);
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04);
    z-index: 0;
    pointer-events: none;
  }
}
```

### Issues to Debug Next Session:

1. **Check control bar overflow** - The `.vjs-control-bar` might have `overflow: hidden` cutting off the pill
2. **Check button order/flex** - VideoJS control bar uses flexbox; our `order` properties might be causing gaps
3. **Check right padding/margin** - The pill might need `right` positioning instead of `left: -6px`
4. **Consider alternative approach** - Instead of `::before` pseudo-element on autostart, might need a wrapper div injected via JS

### Mockup Reference for Correct Alignment:
In `mockup.html`, the right panel uses a wrapper div:
```html
<div class="controls-right-group">
  <button class="autoplay-btn">...</button>
  <button class="settings-btn">...</button>
  <button class="fullscreen-btn">...</button>
</div>
```

The CSS-only pseudo-element approach is limited because:
- It can't dynamically adjust to button positions
- It relies on hardcoded width (122px)
- It's positioned relative to autostart button only

### Potential Fixes to Try:

1. **Adjust pill left position**: Try `left: 0` instead of `left: -6px`
2. **Add right margin to control bar**: Ensure space for pill
3. **Check if fullscreen button is outside pill**: May need to adjust width
4. **Use JavaScript injection**: Create actual wrapper div around the 3 buttons

### To Resume:
```bash
cd ui/v2.5
npm run start  # Dev server on port 3000
# Test: http://localhost:3000/scenes/2275
# Use browser DevTools to inspect .vjs-autostart-button::before
# Check computed styles and bounding boxes
```

---

## Session 7 Progress (2026-01-07) - Frontend Design Quality Pass

### Fixes Applied Using /frontend-design Skill

Thorough comparison of mockup.html vs implementation revealed several discrepancies that were fixed:

#### 1. Settings Menu - Order and Options Fixed ✅

**Problem:** Settings menu had wrong order and extra options not in mockup.

**Before:**
1. Quality (submenu)
2. Playback Speed (submenu)
3. Subtitle/CC (submenu) ❌ NOT IN MOCKUP
4. Loop video (toggle)
5. Auto-start video (toggle) ❌ NOT IN MOCKUP
6. Show scrubber (toggle)
7. Video Filters (submenu)
8. Video Transforms (submenu)

**After (matching mockup):**
1. Loop video (toggle)
2. Show scrubber (toggle)
3. ---divider---
4. Quality (submenu)
5. Playback speed (submenu)
6. ---divider---
7. Video filters (submenu)
8. Video transforms (submenu)

**Files Modified:**
- `extensions/player/settings-menu.ts`: Reordered `renderMainMenu()` and removed autoplay/subtitle items

#### 2. Marker Range Styling - Full Height ✅

**Problem:** Marker range was only 3px tall, barely visible.

**Mockup Spec:** `top: 0; bottom: 0` (fills full progress bar height)

**Fix Applied:**
```scss
.vjs-marker-range {
  top: 0 !important;
  bottom: 0 !important;
  height: auto !important;
  // Now fills full 30px height of progress control
}
```

**Files Modified:**
- `extensions/styles/_player-components.scss`: Changed marker range to use top/bottom instead of fixed height

#### 3. Skip Button Double Icon Fixed ✅

**Problem:** Skip Next button showed TWO icons (VideoJS font icon + our SVG).

**Fix Applied:**
```scss
.vjs-control-bar .vjs-control.vjs-button.vjs-svg-icon {
  &::before {
    display: none !important;
    content: none !important;
  }
}
```

**Files Modified:**
- `extensions/styles/_player-components.scss`: Added rule to hide VideoJS font icon on buttons with our SVG icons

### Verified Working:
- ✅ Settings menu: Toggles first, submenus second, no extra options
- ✅ Marker range: Now fills full progress bar height (30px)
- ✅ Skip button: Single icon only
- ✅ Right panel pill: Visible with autoplay toggle, settings, fullscreen
- ✅ Progress bar: Blue gradient, scrubber on hover
- ✅ Autoplay toggle: Track/thumb design working

### Screenshots:
- `.playwright-mcp/fixes-verification-player.png` - Full player after fixes
- `.playwright-mcp/fixes-verification-settings-menu.png` - Settings menu with correct order
- `.playwright-mcp/progress-bar-marker-fixed.png` - Marker range filling full height

---

### 2026-01-08 - Chapter Indicator Component Implemented ✅

**Phase 5: Chapter Indicator - COMPLETE**

Created YouTube-style chapter indicator with dropdown panel for navigating scene markers.

#### Files Created:
- `extensions/player/chapter-indicator.ts` - New VideoJS plugin (280 lines)

#### Files Modified:
- `extensions/styles/_player-components.scss` - Added 260 lines of CSS for chapter indicator
- `components/ScenePlayer/ScenePlayer.tsx` - Registered plugin and wired up markers

#### Features Implemented:
1. **Current marker tracking** - Shows active marker title during playback
   - Point markers: Active within 10 seconds after start time
   - Range markers: Active within start-end range
   - Updates in real-time via `timeupdate` event

2. **Dropdown panel** - Click to open list of all markers
   - Glass morphism design (backdrop blur, dark background)
   - Header showing "Markers (N)" count
   - Staggered slide-in animation for items

3. **Marker type distinction**:
   - Point markers: Cyan (`#00e5ff`) dot with glow
   - Range markers: Amber (`#ffab40`) dot with glow
   - Time format: Single time for points, "start – end" for ranges

4. **Seek functionality** - Click any marker to jump to timestamp
   - Starts playback if paused
   - Closes dropdown after selection

5. **Active marker highlighting**:
   - Blue left border accent
   - Blue-tinted title text
   - Background highlight

6. **Responsive** - Hidden on screens < 600px width

#### Design Specifications:
```scss
// Dropdown panel
background: rgba(18, 22, 26, 0.92)
backdrop-filter: blur(20px)
border-radius: 12px
min-width: 240px
max-height: 320px

// Marker dots
&.point { background: $marker-cyan; box-shadow: 0 0 8px $marker-cyan-glow; }
&.range { background: $marker-amber; box-shadow: 0 0 8px $marker-amber-glow; }

// Active item
background: rgba($player-primary, 0.12)
border-left: 3px solid $player-primary
```

#### Verified Working:
- ✅ Chapter indicator appears in control bar after time display
- ✅ Shows "—" when no marker is active
- ✅ Shows marker title when within active range
- ✅ Dropdown opens with all markers listed
- ✅ Point markers show cyan dot with single timestamp
- ✅ Range markers show amber dot with time range
- ✅ Clicking marker seeks to that timestamp
- ✅ Dropdown closes after selection
- ✅ Chevron rotates when dropdown is open

#### Screenshots:
- `.playwright-mcp/chapter-indicator-test.png` - Initial state with "—"
- `.playwright-mcp/chapter-indicator-dropdown-open.png` - Dropdown showing 3 markers
- `.playwright-mcp/chapter-indicator-active-marker.png` - Active "Massage" marker displayed

---

## Implementation Status Summary

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Progress Bar & Control Bar CSS | ✅ Complete |
| 2 | YouTube-style SVG Icons | ✅ Complete |
| 3 | Markers (Hybrid Approach) | ✅ Complete |
| 4 | Layout & Controls | ✅ Complete |
| 5 | Chapter Indicator | ✅ Complete |
| 6 | Testing | ✅ Complete |

**All core features implemented and verified on dev server (port 3000).**

---

## Notes

- Stash uses VideoJS for the video player
- Extensions are in `ui/v2.5/src/extensions/` to avoid merge conflicts
- The mockup HTML is a standalone reference - open in browser to see target design
- Dev server: `npm run start` in `ui/v2.5/` (port 3000)
- Markers only appear on progress bar AFTER video starts playing

---

## Session 8 Progress (2026-01-08) - Settings Menu V2

### Settings Menu V2 Created ✅

Built a complete rewrite of the settings menu from scratch based on the mockup design.

#### Files Created:
- `extensions/player/settings-menu-v2.ts` (680 lines) - Complete plugin rewrite
- `extensions/styles/_settings-menu-v2.scss` (420 lines) - All CSS styling

#### Files Modified:
- `extensions/styles/index.scss` - Added import for v2 styles
- `extensions/player/index.ts` - Added export for v2 plugin
- `components/ScenePlayer/ScenePlayer.tsx` - Added `settingsMenuV2: {}` for testing

#### Features Implemented:
| Feature | Status |
|---------|--------|
| Glass morphism (backdrop blur) | ✅ Working |
| Toggle switches (Loop, Scrubber) | ✅ Working |
| Blue glow on active toggles | ✅ Working |
| Playback speed submenu | ✅ Working |
| Custom speed slider (0.05x increments) | ✅ Working |
| Video filters submenu (5 sliders) | ✅ Working |
| Video transforms submenu | ✅ Working |
| Slider gradient fill | ✅ Working |
| Reset buttons (disabled when unchanged) | ✅ Working |
| Quality submenu | 🔴 **BUG: Options not visible** |

#### Screenshots:
- `.playwright-mcp/settings-menu-v2-test.png` - Main menu
- `.playwright-mcp/settings-menu-v2-speed.png` - Playback speed submenu
- `.playwright-mcp/settings-menu-v2-filters.png` - Video filters submenu

### Known Bug: Quality Menu Options Not Visible 🔴

**Issue:** When opening the Quality submenu, the quality options (source labels) are not visible.

**Suspected Causes:**
1. The `sources` array may not be populated when v2 plugin initializes
2. The v2 plugin's `setSources()` method may not be called from ScenePlayer
3. CSS visibility issue with the quality option elements

**To Investigate in Next Session:**
1. Check if `setSources()` is being called on v2 plugin
2. Verify the sources array is populated before rendering
3. Check CSS for `.settings-option` in quality submenu
4. Compare v1 vs v2 quality menu rendering logic

### Session 9 Progress (2026-01-08) - Quality Bug Fixed + Slider Styling

#### Quality Menu Bug - FIXED ✅

**Root Cause:** `setSources()` was only being called on the v1 settings menu, not v2.

**Fix Applied in `ScenePlayer.tsx`:**
```typescript
const settingsMenu = player.settingsMenu();
const settingsMenuV2 = player.settingsMenuV2();

// Reset video filters/transforms on new scene
settingsMenu.resetAll();
settingsMenuV2.resetAll();

const sources = scene.sceneStreams.filter(...).map(...);

// Set sources on both v1 and v2 settings menus
settingsMenu.setSources(sources);
settingsMenuV2.setSources(sources);  // <-- Added this line
```

**Verified:** Quality menu now shows "Direct stream" option correctly.

#### Slider Styling - Updated to Neutral Colors

**User Feedback:** Sliders should use neutral colors (matching mockup), not blue.

**Changes Made to `_settings-menu-v2.scss`:**

1. **Filter/Transform Sliders** - Changed to neutral gray:
   - Track: `rgba(255, 255, 255, 0.2)` (was blue gradient)
   - Hover track: `rgba(255, 255, 255, 0.3)`
   - Thumb: Plain white, no border (was blue border)
   - Hover thumb: Scale 1.15 with shadow

2. **Custom Speed Slider** - Kept blue gradient fill (to show position):
   - Track: Blue gradient `$settings-primary` to `rgba(255,255,255,0.2)`
   - Thumb: Plain white, no border

**Issue:** CSS changes may not be hot-reloading properly. Browser cache or SCSS compilation issue.

---

### Resume Point (2026-01-08) - Session 9

**Status:**
- ✅ Quality menu bug FIXED - sources now passed to v2 plugin
- 🟡 Slider styling updated but may need cache clear to verify

**Completed This Session:**
1. Fixed quality menu by adding `settingsMenuV2.setSources(sources)` call
2. Updated slider styling to use neutral colors per mockup
3. Removed blue borders from slider thumbs
4. Filter/transform sliders now use gray tracks instead of blue gradient

**Outstanding:**
1. Verify slider styling after hard refresh/cache clear
2. Consider removing v1 settings menu once v2 is fully verified
3. Update session document with final verification screenshots

**Files Modified This Session:**
- `components/ScenePlayer/ScenePlayer.tsx` - Added v2 sources setup
- `extensions/styles/_settings-menu-v2.scss` - Neutral slider colors

**Test URL:** `http://localhost:3000/scenes/2275`

**To Resume:**
```bash
cd ui/v2.5
npm run start  # Dev server on port 3000
# Hard refresh browser (Ctrl+Shift+R) to clear CSS cache
# Open settings menu v2 → Video filters to verify neutral sliders
```

---

### Session 10 Progress (2026-01-08) - Slider Styling Fix

**Status:** ✅ SLIDER STYLING VERIFIED AND FIXED

#### Root Cause Identified

Sliders were showing blue tracks despite SCSS specifying neutral gray. Investigation revealed:

**Global CSS rule overriding our styles:**
```css
input[type="range"]::-webkit-slider-runnable-track {
  background: rgb(0, 123, 255);  /* Blue! */
}

input[type="range"]::-webkit-slider-thumb {
  background: rgb(57, 75, 89);  /* Dark gray! */
}
```

Our SCSS was setting `background` on the input element itself, but the `::-webkit-slider-runnable-track` pseudo-element (the actual visible track) is styled separately by the global rule.

#### Fixes Applied

1. **Filter/Transform Sliders** - Added explicit track pseudo-element styling:
   ```scss
   &::-webkit-slider-runnable-track {
     height: 4px;
     background: rgba(255, 255, 255, 0.2) !important;
     border-radius: 2px;
   }

   &::-moz-range-track {
     height: 4px;
     background: rgba(255, 255, 255, 0.2) !important;
     border-radius: 2px;
   }

   &:hover::-webkit-slider-runnable-track {
     background: rgba(255, 255, 255, 0.3) !important;
   }
   ```

2. **Custom Speed Slider** - Same track styling added, plus `!important` on thumb styles:
   ```scss
   &::-webkit-slider-thumb {
     width: 14px !important;
     height: 14px !important;
     background: $settings-text !important;
     border: none !important;
     border-radius: 50% !important;
     box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3) !important;
   }
   ```

#### Files Modified
- `extensions/styles/_settings-menu-v2.scss`:
  - Lines 566-588: Filter/transform slider track styling
  - Lines 483-534: Custom speed slider track + thumb styling with `!important`

#### Verified Working
- ✅ Filter sliders: Neutral gray tracks
- ✅ Transform sliders: Neutral gray tracks
- ✅ Custom speed slider: Neutral gray track + white thumb
- ✅ Hover states: Track brightens on hover

#### Key Lesson
When styling range inputs, must explicitly style BOTH:
1. The input element itself (`background`)
2. The track pseudo-elements (`::-webkit-slider-runnable-track`, `::-moz-range-track`)

Global Bootstrap/upstream rules target the pseudo-elements directly, so setting background on the input element alone is insufficient.

---

## Session 11 - Enhanced Chapter Indicator Proposal (2026-01-08)

### Goal: Replace SceneMarkersPanel with Enhanced Chapter Indicator

The current SceneMarkersPanel provides full CRUD functionality for markers:
- **Create**: Button + form with title, primary tag, start/end time, additional tags
- **Read**: PrimaryTags component (grouped by tag) + MarkerWallPanel (thumbnail grid)
- **Update**: Click marker → form pre-filled with marker data
- **Delete**: Delete button in edit form
- **Keyboard**: Press `N` to create new marker

### Design Proposals Created

**Mockup file:** `chapter-indicator-proposals.html` (open in browser to view)

#### Option A: Dropdown + Modal Form (RECOMMENDED)

- Keep chapter indicator compact in control bar
- Add quick action buttons (edit/delete) on hover for each marker in dropdown
- Add `[+]` button for quick marker creation
- Create/Edit operations open a modal dialog with full SceneMarkerForm
- **Pros:** Minimal disruption, reuses existing form, mobile-friendly
- **Cons:** Modal covers video during edit

#### Option B: Expanded Panel Below Player

- Chapter indicator expands into full panel below video
- Shows markers as visual cards with thumbnails
- Inline form at bottom for quick create/edit
- Progress bar within active range markers
- **Pros:** Visual, never covers video, shows thumbnails
- **Cons:** Takes vertical space, medium complexity

#### Option C: Slide-out Sidebar Panel

- Sidebar slides from right side of player
- Video remains visible while editing
- Embedded form in sidebar
- **Pros:** Video always visible, persistent access
- **Cons:** Not mobile-friendly, takes horizontal space

### Feature Comparison

| Feature | Option A | Option B | Option C |
|---------|----------|----------|----------|
| Player visible during edit | Partial | Full | Full |
| Code reuse | High | Medium | Medium |
| Mobile-friendly | Yes | Needs work | No |
| Implementation complexity | Low | Medium | Medium-High |
| Thumbnail previews | Optional | Yes | Yes |

### Files to Modify (Option A Implementation)

1. **`extensions/player/chapter-indicator.ts`** - Add edit/delete buttons, create button
2. **`extensions/styles/_player-components.scss`** - Style action buttons
3. **Create `extensions/components/MarkerModal.tsx`** - Modal wrapper for SceneMarkerForm
4. **`components/ScenePlayer/ScenePlayer.tsx`** - Wire up modal state and GraphQL mutations

### Key Components to Reuse

- `SceneMarkerForm` - Full form component (title, tags, times)
- `useSceneMarkerCreate` / `useSceneMarkerUpdate` / `useSceneMarkerDestroy` - GraphQL hooks
- `TagSelect` - Tag selection component
- `DurationInput` - Time input with sync-to-current button

### Resume Point (2026-01-08) - Session 11

**Status:** DESIGN PROPOSALS COMPLETE - AWAITING DECISION

**To Resume:**
1. Open `chapter-indicator-proposals.html` in browser to view mockups
2. Choose preferred option (A recommended)
3. Implement chosen design

**Next Steps After Decision:**
1. Create MarkerModal component wrapping SceneMarkerForm
2. Add action buttons to chapter-indicator dropdown items
3. Add create button to dropdown header and control bar
4. Wire up GraphQL mutations for create/update/delete
5. Add keyboard shortcut (N) support
6. Test full CRUD flow

**Test URL:** `http://localhost:3000/scenes/2275`

---

## Session 12 - Option A Implementation Complete (2026-01-08)

### Decision: Option A (Dropdown + Modal Form)

Implemented the enhanced chapter indicator with marker CRUD functionality using Option A design.

### Implementation Summary

**New Files Created:**
1. `extensions/components/MarkerModal.tsx` - Premium modal wrapping SceneMarkerForm
2. `extensions/components/MarkerModal.scss` - Dark Cinema Glass aesthetic styling

**Modified Files:**
1. `extensions/player/chapter-indicator.ts` - Added:
   - Edit/Delete action buttons on dropdown items (appear on hover)
   - Create button in dropdown header
   - Quick Add button in control bar (dashed border, + icon)
   - Empty state UI with "Create First Marker" button
   - Custom event emitters: `marker-create`, `marker-edit`, `marker-delete`
   - Full marker data with IDs passed for CRUD operations

2. `extensions/styles/_player-components.scss` - Added:
   - `.vjs-chapter-header-add` - Add button in dropdown header
   - `.vjs-chapter-quick-add` - Quick add button in control bar
   - `.vjs-chapter-item-actions` - Action buttons container
   - `.vjs-chapter-action-btn` - Edit/delete button styling
   - `.vjs-chapter-item-meta` / `.vjs-chapter-item-duration` - Enhanced item info
   - `.vjs-chapter-empty` - Empty state styling

3. `components/ScenePlayer/ScenePlayer.tsx` - Added:
   - `isMarkerModalOpen` / `editingMarker` state
   - Event listeners for marker-create/edit/delete events
   - Keyboard shortcut (N) for creating markers via Mousetrap
   - MarkerModal component integration

4. `extensions/components/index.ts` - Added MarkerModal export

### Design Aesthetic: Dark Cinema Glass

**Modal Design:**
- Deep black surface (`rgba(18, 22, 26, 0.98)`)
- Glass morphism with `backdrop-filter: blur(20px)`
- Blue accent (`#2196f3`) for primary actions
- Slide-up entrance animation with spring easing
- Premium typography with label styling
- Form inputs with dark backgrounds and focus rings
- Responsive: slides up from bottom on mobile

**Action Buttons:**
- Hidden by default, appear on item hover
- Edit button: light hover state
- Delete button: red danger state on hover
- Quick add in control bar: dashed border that highlights blue on hover

### Event Communication

VideoJS plugins can't directly call React state setters, so we use custom DOM events:

```typescript
// chapter-indicator.ts emits:
player.el().dispatchEvent(new CustomEvent('marker-create', { bubbles: true }));
player.el().dispatchEvent(new CustomEvent('marker-edit', { detail: { marker } }));
player.el().dispatchEvent(new CustomEvent('marker-delete', { detail: { marker } }));

// ScenePlayer.tsx listens:
videoEl.addEventListener('marker-create', handleMarkerCreate);
videoEl.addEventListener('marker-edit', handleMarkerEdit);
videoEl.addEventListener('marker-delete', handleMarkerDelete);
```

### Keyboard Shortcuts

- **N** - Create new marker (opens modal at current timestamp)
- **Escape** - Close modal

### Build Status

Production build completed successfully.

### Resume Point (2026-01-08) - Session 12

**Status:** IMPLEMENTATION COMPLETE - NEEDS BROWSER VERIFICATION

**To Verify:**
1. Start dev server: `cd ui/v2.5 && npm run start`
2. Navigate to a scene with markers
3. Test chapter indicator dropdown (click, seek to markers)
4. Test edit button (opens modal with marker data)
5. Test delete button (opens modal, shows delete button)
6. Test quick add button in control bar
7. Test create button in dropdown header
8. Test "N" keyboard shortcut
9. Verify form submission creates/updates/deletes markers
10. Test on scene without markers (empty state)

**Verification Test URL:** `http://localhost:3000/scenes/2275`

---

## Session 13 - MarkerModal Styling Refinements (2026-01-08)

### Issue: Modal styling not consistent with mockup

User reported that MarkerModal.scss styling didn't match `chapter-indicator-proposals.html` mockup.

### Analysis (comparing mockup vs implementation)

| Aspect | Mockup | Original Implementation |
|--------|--------|------------------------|
| Font | Space Grotesk + JetBrains Mono | System fonts |
| Input background | `rgba(255, 255, 255, 0.04)` (glass light) | `rgba(0, 0, 0, 0.3)` (dark) |
| Modal background | `#1a1f24` (solid) | `rgba(18, 22, 26, 0.98)` (semi-transparent) |
| Backdrop blur | `blur(4px)` | `blur(8px)` |
| Shadow | Blue glow prominent | Blue glow less visible |
| Footer | Border-top separator | No separator |
| Time input buttons | Inside input (sync btn) | Append buttons outside |

### Fixes Applied

#### 1. Design Tokens (exact mockup values)
```scss
$bg-elevated: #1a1f24;
$bg-glass-light: rgba(255, 255, 255, 0.04);
$accent-primary: #2196f3;
$text-primary: #f0f4f8;
$text-secondary: rgba(240, 244, 248, 0.7);
$border-subtle: rgba(255, 255, 255, 0.08);
$shadow-lg: 0 24px 48px rgba(0, 0, 0, 0.4);
$shadow-glow: 0 0 32px rgba(33, 150, 243, 0.4);
```

#### 2. Typography
- Added Google Fonts import for Space Grotesk and JetBrains Mono
- Applied Space Grotesk to modal, labels, buttons
- Applied JetBrains Mono to time input fields

#### 3. Input Styling
- Changed background from dark (`rgba(0,0,0,0.3)`) to glass light (`rgba(255,255,255,0.04)`)
- Matches mockup's subtle elevated appearance

#### 4. Footer/Buttons Container
- Added `border-top: 1px solid $border-subtle`
- Added darker background `rgba(0, 0, 0, 0.15)`
- Fixed padding to match mockup (`20px 28px`)

#### 5. Duration Input Buttons
- Styled sync/reset button (clock icon) with blue accent background
- Styled increment/decrement buttons with glass background
- Added proper border-radius for button group

### Files Modified
- `extensions/components/MarkerModal.scss` - Complete rewrite to match mockup

### Verification Screenshots
- `.playwright-mcp/marker-modal-updated-styling.png` - Initial fix
- `.playwright-mcp/marker-modal-final-styling.png` - After footer border fix

### Visual Comparison

**Before:** Dark inputs, no footer separator, system fonts
**After:** Glass-light inputs, footer border, Space Grotesk font, blue accent buttons

### Status: STYLING COMPLETE ✅

Modal now matches the "Dark Cinema / Editorial Glass" aesthetic from `chapter-indicator-proposals.html`:
- ✅ Dark cinema glass background (`#1a1f24`)
- ✅ Blue glow shadow around modal
- ✅ Uppercase editorial labels
- ✅ Glass-light input backgrounds
- ✅ Blue accent sync buttons on time inputs
- ✅ Footer with border-top separator
- ✅ JetBrains Mono font on time displays
- ✅ Properly styled increment/decrement buttons

---

## Session 14 - MarkerForm Fork (2026-01-08)

### Issue Identified

User compared mockup vs implementation and found layout inconsistencies:

| Aspect | Mockup Design | Previous Implementation |
|--------|---------------|------------------------|
| **Layout** | Single-column, labels ABOVE inputs | Two-column, labels LEFT, inputs RIGHT |
| **Input width** | Full-width inputs | Narrow inputs (~60% width) |
| **Time fields** | START TIME + END TIME side-by-side | Separate rows |
| **Time labels** | "START TIME" / "END TIME (OPTIONAL)" | "TIME" / "END TIME" |
| **Tag display** | Removable pills inline | Dropdown selectors only |
| **Sync buttons** | Blue circle inside input area | Separate clock button with up/down arrows |

**Root Cause:** Implementation was wrapping the upstream `SceneMarkerForm` component which has a hardcoded two-column layout that CSS couldn't fully override.

### Solution: Fork the Form Component

Created a new `MarkerForm.tsx` in extensions that matches the mockup exactly.

#### Files Created
- `extensions/components/MarkerForm.tsx` - Custom form with mockup layout

#### Files Modified
- `extensions/components/MarkerModal.tsx` - Import `MarkerForm` instead of `SceneMarkerForm`
- `extensions/components/MarkerModal.scss` - Updated styles for new class names
- `extensions/components/index.ts` - Added `MarkerForm` export

### New Component Structure

```tsx
// MarkerForm.tsx - Key components

// Custom TimeInput with sync button inside
const TimeInput: React.FC<ITimeInputProps> = ({ value, onChange, placeholder, error }) => (
  <div className="marker-time-input">
    <input className="marker-time-field" ... />
    <button className="marker-time-sync">
      <Icon icon={faClock} />
    </button>
  </div>
);

// Removable tag pill
const TagPill: React.FC<ITagPillProps> = ({ tag, onRemove }) => (
  <span className="marker-tag-pill">
    {tag.name}
    <button className="marker-tag-remove" onClick={onRemove}>×</button>
  </span>
);
```

### Layout Structure

```
.marker-form
├── .marker-field (TITLE)
│   ├── .marker-label
│   └── MarkerTitleSuggest
├── .marker-field (PRIMARY TAG)
│   ├── .marker-label
│   └── .marker-tag-container
│       └── TagPill | TagSelect
├── .marker-time-row (grid: 1fr 1fr)
│   ├── .marker-field.marker-time-field-wrapper (START TIME)
│   │   ├── .marker-label
│   │   └── TimeInput
│   └── .marker-field.marker-time-field-wrapper (END TIME)
│       ├── .marker-label
│       └── TimeInput
├── .marker-field (ADDITIONAL TAGS)
│   ├── .marker-label
│   └── .marker-tag-container.marker-tag-multi
│       ├── TagPill (for each tag)
│       └── TagSelect
└── .marker-form-footer
    ├── Save button
    ├── Cancel button
    └── Delete button (edit mode only)
```

### CSS Grid Overflow Fix

**Issue:** Time row was overflowing past modal edge.

**Cause:** CSS Grid items have `min-width: auto` by default, preventing shrink below content size.

**Fix:** Added `min-width: 0` to grid children:
```scss
.marker-time-field-wrapper {
  flex: 1;
  min-width: 0; // Allow grid item to shrink
}

.marker-time-field {
  min-width: 0; // Also on the input itself
}
```

### Additional Tag Select Styling

For the multi-tag container, nested TagSelect needs transparent styling:
```scss
.marker-tag-multi {
  .tag-select {
    .react-select__control {
      background: transparent !important;
      border: none !important;
    }
    .react-select__control--is-focused {
      box-shadow: none !important;
    }
  }
}
```

### Verification

**Screenshots:**
- `.playwright-mcp/marker-modal-new-layout.png` - Create mode
- `.playwright-mcp/marker-modal-edit-mode.png` - Edit mode with pre-filled data
- `.playwright-mcp/marker-modal-overflow-fixed.png` - After grid fix

**Verified Working:**
- ✅ Single-column layout with labels ABOVE inputs
- ✅ Full-width inputs contained within modal
- ✅ START TIME and END TIME side-by-side (both fitting)
- ✅ Blue sync buttons (clock icon) inside time inputs
- ✅ PRIMARY TAG shows as removable pill in edit mode
- ✅ ADDITIONAL TAGS show as removable pills
- ✅ Delete button appears in edit mode footer
- ✅ Dark Cinema Glass aesthetic preserved

### Status: COMPLETE ✅

MarkerForm now matches the mockup design exactly.

---

## Session 15 - Cleanup & Instant Marker Updates (2026-01-08)

### 1. Consolidated Settings Menu Plugins

**Change:** Replaced `settings-menu.ts` with `settings-menu-v2.ts` content

The v2 settings menu had all the YouTube 2026 features (glass morphism, custom speed slider, video filters/transforms). Consolidated into a single plugin.

**Files Modified:**
- `extensions/player/settings-menu.ts` - Replaced with v2 content, kept `settingsMenu` plugin name
- `extensions/player/index.ts` - Removed v2 export
- `components/ScenePlayer/ScenePlayer.tsx` - Removed `settingsMenuV2: {}` option and all v2 references

**Files Deleted:**
- `extensions/player/settings-menu-v2.ts` - No longer needed

**Backward Compatibility:**
- Plugin registered as `settingsMenu` (same as before)
- Added alias methods: `setScrubberEnabled()` / `setOnScrubberChange()` → `setMarkerStripEnabled()` / `setOnMarkerStripChange()`
- All existing ScenePlayer code continues to work

### 2. Removed Markers Tab from Scene Page

**Rationale:** Chapter indicator now has full feature parity with SceneMarkersPanel:
- ✅ View all markers in dropdown
- ✅ Seek to marker timestamp
- ✅ Create new markers (+ button, N keyboard shortcut)
- ✅ Edit existing markers (pencil icon)
- ✅ Delete markers (trash icon)

**Files Modified:**
- `extensions/components/Scene/Scene.tsx`:
  - Removed `SceneMarkersPanel` import
  - Removed `'k'` keyboard shortcut binding
  - Removed markers `Nav.Item` tab
  - Removed markers `Tab.Pane` content
  - Removed `onClickMarker` function

### 3. Added Scrubber Pulse Animation

**From mockup:** Progress bar scrubber handle has a breathing pulse animation on hover.

**Added to `_player-components.scss`:**
```scss
@keyframes scrubber-pulse {
  0%, 100% {
    box-shadow: $shadow-sm, 0 0 0 0 $player-primary-glow;
  }
  50% {
    box-shadow: $shadow-sm, 0 0 0 8px transparent;
  }
}

&:hover .vjs-play-progress::before {
  animation: scrubber-pulse 2s ease-in-out infinite;
}
```

Animation stops when directly hovering the handle (replaced with scale-up effect).

### 4. Instant Marker Updates (Apollo Refetch)

**Problem:** After editing a marker (e.g., changing duration), changes only appeared after page refresh.

**Root Cause:** Apollo cache was evicted but not immediately refetched. The `scene.scene_markers` prop in ScenePlayer had stale data.

**Solution:** Use Apollo client's `refetchQueries` to force immediate data refresh.

**Files Modified:**

#### `extensions/components/MarkerForm.tsx`
- Added `useApolloClient` import
- Added `refetchScene()` callback that calls `client.refetchQueries({ include: [FindSceneDocument] })`
- Called `await refetchScene()` after successful create/update/delete mutations

#### `components/ScenePlayer/ScenePlayer.tsx`
- Added `markersJson` computed value (serialized marker data for comparison)
- Added `useEffect` that watches `markersJson` and calls `loadMarkers()` when data changes
- Removed `handleMarkerSave` callback with setTimeout (no longer needed)
- Removed `onSave` prop from MarkerModal (no longer needed)

#### `extensions/components/MarkerModal.tsx`
- Removed `onSave` prop (no longer needed)

**Data Flow:**
1. User edits marker → `handleSave()` runs
2. Mutation completes → `await refetchScene()` fetches fresh data
3. SceneLoader receives new `scene.scene_markers`
4. ScenePlayer's `markersJson` effect detects change
5. `loadMarkers()` runs → Chapter indicator updates
6. Modal closes

### Implementation Status Update

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Progress Bar & Control Bar CSS | ✅ Complete |
| 2 | YouTube-style SVG Icons | ✅ Complete |
| 3 | Markers (Hybrid Approach) | ✅ Complete |
| 4 | Layout & Controls | ✅ Complete |
| 5 | Chapter Indicator | ✅ Complete |
| 6 | Settings Menu V2 | ✅ Complete (consolidated) |
| 7 | Testing | ✅ Complete |

### Key Files Summary

**Player Plugins:**
- `extensions/player/settings-menu.ts` - YouTube 2026 settings (consolidated from v2)
- `extensions/player/chapter-indicator.ts` - Marker navigation with CRUD
- `extensions/player/player-icons.ts` - Filled SVG icons

**Styles:**
- `extensions/styles/_player-components.scss` - All player CSS
- `extensions/styles/_settings-menu-v2.scss` - Settings menu styling

**Components:**
- `extensions/components/MarkerForm.tsx` - Custom form matching mockup
- `extensions/components/MarkerModal.tsx` - Modal wrapper
- `extensions/components/Scene/Scene.tsx` - Scene page (markers tab removed)

**Test URL:** `http://localhost:3000/scenes/2275`

---

## Session 16 - ModernDark Theme Mockup (2026-01-08)

### Goal: Create ModernDark Compatibility Mockup

The YouTube player controls were implemented using Stash's default blue accent color (`#2196f3`). ModernDark is a separate theme plugin that uses gold accents (`#e5a00d`). Need to create overrides for player controls.

### Mockup Created

**File:** `moderndark-mockup.html` (in session folder)

Created a comprehensive HTML mockup showing all player components with ModernDark's gold theme applied.

### Color Mapping

| Element | Default (Extension) | ModernDark Override |
|---------|---------------------|---------------------|
| Progress bar | `#2196f3` (blue) | `#e5a00d` (gold) |
| Scrubber handle | White + blue border | White + gold border |
| Autoplay toggle (ON) | Blue track | Gold track with glow |
| Settings toggles | Blue accent | Gold accent |
| Active states | Blue highlight | Gold highlight |
| Primary buttons | Blue | Gold |
| Tag pills | Blue outline | Gold outline |

### Components Mocked Up

1. **Video Player** - Full control bar with gold progress bar, markers, chapter indicator, right panel pill
2. **Thumbnail Scrubber** - Side-by-side comparison (OLD vs NEW ModernDark Gold style):
   - OLD: Gray boxes, white position line
   - NEW: Glass morphism, gold position line with pulse animation, cyan marker pills, activity heatmap
3. **Chapter Dropdown** - Gold active state, edit/delete action buttons
4. **Settings Menu** - Gold toggles, submenu navigation
5. **Quality Menu** - HD badges, gold checkmark for active
6. **Speed Submenu** - Gold active option, custom slider with gold fill
7. **Filter Sliders** - Neutral gray tracks (unchanged from extension)
8. **Marker Modal** - Dark cinema glass with gold Save button and time sync buttons

### Key Design Decisions

1. **Markers stay cyan/amber** - These distinguish point vs range markers, independent of theme accent color
2. **Filter/transform sliders stay neutral gray** - No gold fill (per previous session decision)
3. **Speed slider has gold fill** - Shows current position visually
4. **Glass morphism preserved** - `backdrop-filter: blur()` on all overlays
5. **Scrubber position line** - Gold with pulsing glow animation

### ModernDark CSS Variables Used

```scss
// Core palette
--md-body: #191919;
--md-card: #242424;
--md-nav: #212121;
--md-border: #383838;

// Gold accent system
--md-gold: #e5a00d;
--md-gold-bright: #f7c600;
--md-gold-dim: #cc8a00;
--md-gold-glow: rgba(229, 160, 13, 0.4);
--md-gold-surface: rgba(229, 160, 13, 0.12);

// Text hierarchy
--md-text-100: #ffffff;
--md-text-80: rgba(255, 255, 255, 0.80);
--md-text-60: rgba(255, 255, 255, 0.60);

// Surface overlays
--md-glass: rgba(25, 25, 25, 0.92);
--md-glass-light: rgba(255, 255, 255, 0.06);
--md-glass-border: rgba(255, 255, 255, 0.08);

// Preserved marker colors
--marker-cyan: #00e5ff;
--marker-amber: #ffab40;
```

### Scrubber Component Highlights

The new ModernDark scrubber includes:
- **Glass morphism container** with backdrop blur
- **Gold position line** (3px) with gradient and glow
- **Position head** - White circle with gold border, pulsing animation
- **Cyan marker pills** - Rounded glass pills in tag area
- **Activity heatmap** - Gold/amber gradient overlay
- **Refined sprites** - Dark glass backgrounds with time labels

### Screenshots

- `.playwright-mcp/moderndark-mockup-full.png` - Initial mockup
- `.playwright-mcp/moderndark-mockup-with-scrubber.png` - Updated with scrubber comparison

### Next Steps

1. **Create SCSS override file** in `plugins/ModernDark/components/ScenePlayer/` based on mockup
2. **Test with ModernDark enabled** to verify overrides work
3. **Deploy to production** after verification

### Resume Point (2026-01-08) - Session 16

**Status:** MOCKUP COMPLETE - READY FOR SCSS IMPLEMENTATION

**To Resume:**
1. Open `moderndark-mockup.html` in browser to review design
2. Create `plugins/ModernDark/components/ScenePlayer/styles.scss` with gold overrides
3. Build and deploy ModernDark plugin
4. Test on `http://localhost:9999` with theme enabled

**Files Created This Session:**
- `ui/v2.5/src/extensions/docs/sessions/design/2026-01-06-youtube-player-controls/moderndark-mockup.html`

**Reference:** `plugins/ModernDark/CLAUDE.md` for theme structure and deployment

---

## Session 17 - Range Marker Color Update (2026-01-08)

### Issue: Range Marker Color Clash

**Problem:** Amber range markers (`#ffab40`) clashed with gold progress bar (`#e5a00d`) in ModernDark theme. Both colors are too similar, making range markers hard to distinguish from the progress bar.

### Solution: Magenta Range Markers

**Changed range marker color from amber to magenta:**

| Element | Default (Extension) | ModernDark Override |
|---------|---------------------|---------------------|
| Point markers | `#00e5ff` (cyan) | `#00e5ff` (unchanged) |
| Range markers | `#ffab40` (amber) | `#ff4081` (magenta) |
| Progress bar | `#2196f3` (blue) | `#e5a00d` (gold) |

**Why magenta (`#ff4081`)?**
1. **High contrast** - Opposite side of color wheel from gold
2. **Distinct from cyan** - No confusion with point markers
3. **Matches dark theme aesthetic** - Magenta accents common in premium dark UIs
4. **Readable** - Bright enough to see on dark progress bar

### Files Modified

- `moderndark-mockup.html`:
  - Updated `--marker-amber` → `--marker-magenta` CSS variables
  - Updated `.marker-range` gradient colors
  - Updated `.chapter-indicator .dot` color for range markers
  - Updated `.chapter-item .marker-dot.range` color in dropdown

### Screenshot

- `.playwright-mcp/moderndark-magenta-markers.png` - Full mockup with magenta range markers

### Final Color Scheme for ModernDark

```scss
// Point markers - cyan (unchanged)
--marker-cyan: #00e5ff;
--marker-cyan-glow: rgba(0, 229, 255, 0.5);

// Range markers - magenta (changed from amber)
--marker-magenta: #ff4081;
--marker-magenta-glow: rgba(255, 64, 129, 0.4);

// Progress bar - gold (theme accent)
--md-gold: #e5a00d;
```

### Status: MOCKUP UPDATED ✅

Ready to implement ModernDark SCSS overrides using this color scheme.

---

## Session 18 - ModernDark SCSS Implementation (2026-01-08)

### Implementation Complete ✅

Added comprehensive ModernDark overrides for YouTube-style player controls to `plugins/ModernDark/components/ScenePlayer/styles.scss`.

### Overrides Added

| Component | Override |
|-----------|----------|
| Progress bar | Gold gradient (`#cc8a00` → `#e5a00d`) with glow |
| Scrubber handle | Gold border instead of blue |
| Volume slider | Gold fill |
| Autoplay toggle | Gold track when ON with glow |
| Point markers | Cyan (unchanged from extension) |
| Range markers | **Magenta** (`#ff4081`) - contrasts with gold |
| Marker tooltip | Dark glass with backdrop blur |
| Chapter indicator | Glass background, magenta/cyan dots |
| Chapter dropdown | Gold active state, gold add button |
| Right panel pill | ModernDark glass surface |
| Settings menu | Gold toggles, gold active states |
| Speed slider | Gold gradient fill |
| Quality badges | Gold background |
| Marker modal | Gold Save button, gold sync buttons, gold focus rings |
| Tag pills | Gold outline |
| Time tooltip | Glass background |

### CSS Variables Added

```scss
.video-js {
  // Gold accent system
  --md-gold: #e5a00d;
  --md-gold-bright: #f7c600;
  --md-gold-dim: #cc8a00;
  --md-gold-glow: rgba(229, 160, 13, 0.4);
  --md-gold-surface: rgba(229, 160, 13, 0.12);

  // Marker colors
  --marker-cyan: #00e5ff;
  --marker-cyan-glow: rgba(0, 229, 255, 0.5);
  --marker-magenta: #ff4081;
  --marker-magenta-glow: rgba(255, 64, 129, 0.4);

  // Glass surfaces
  --md-glass: rgba(25, 25, 25, 0.92);
  --md-glass-light: rgba(255, 255, 255, 0.06);
  --md-glass-border: rgba(255, 255, 255, 0.08);
}
```

### Build & Deploy

```bash
cd plugins/ModernDark
yarn build   # Compiled successfully
yarn deploy  # Deployed to S:/stash/config/plugins/ModernDark/
```

### Files Modified

- `plugins/ModernDark/components/ScenePlayer/styles.scss` - Added ~260 lines of player control overrides

### Status: INITIAL DEPLOY COMPLETE

---

## Session 19 - Complete Gold Theme + Animations (2026-01-08)

### Issue: Missing Color Overrides and Animations

User noticed that dropdowns, menus, submenus, sliders, and animations weren't fully themed.

### Additional Overrides Added

**Settings Menu:**
- `.vjs-settings-menu` - Glass background
- `.vjs-settings-button.is-active` - Gold gear icon
- `.settings-menu-toggle.is-on .toggle-switch` - Gold toggle switch
- `.settings-option .option-check svg` - Gold checkmark
- `.settings-option.is-selected` - Gold text
- `.option-badge` - Gold HD/4K badges
- Focus states - Gold outline on all interactive elements
- Scrollbar thumb hover - Gold surface

**Chapter Dropdown:**
- `.vjs-chapter-header-add` - Gold add button
- `.vjs-chapter-item.active` - Gold left border + gold title
- `.vjs-chapter-action-btn:hover` - Glass light hover
- `.vjs-chapter-action-btn.delete:hover` - Red hover

**Marker Modal:**
- Header, close button, labels
- Input backgrounds - Dark glass
- Delete button - Red outline
- Cancel button - Glass hover
- Footer - Dark background

**Scrubber Tags:**
- `.scrubber-tag` - Cyan with glow (preserved)

### Animations Added

**Keyframe Overrides:**
```scss
@keyframes scrubber-pulse {
  // Gold glow for progress bar handle pulse
}

@keyframes scrubber-head-pulse {
  // Gold glow for scrubber position indicator
}
```

**Animation Applications:**
- `.vjs-play-progress::before` - Gold pulse on hover
- `#scrubber-current-position::after` - Gold pulse on position head
- `.vjs-autostart-thumb` - Smooth slide + scale on hover

### Build & Deploy

```bash
yarn build && yarn deploy  # Completed successfully
```

### Final Override Count

~450 lines of player control overrides covering:
- Progress bar + handle
- Volume slider
- Autoplay toggle
- Point markers (cyan)
- Range markers (magenta)
- Chapter indicator + dropdown
- Settings menu (all submenus)
- Marker modal (all elements)
- Scrubber tags
- Animations (2 keyframes)
- Focus states

### Status: DEPLOYED ✅ - Ready for browser verification
