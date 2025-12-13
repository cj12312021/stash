# Scene Player Patches

## Settings Menu Enhancement (Archivr Design)

**File**: `ui/v2.5/src/extensions/player/settings-menu.ts`

The video player settings menu has been enhanced based on the Archivr design spec to consolidate player controls.

### Changes

The settings menu now includes:

1. **Quality Selection** - Existing functionality
2. **Playback Speed** - Existing functionality  
3. **Subtitle/CC** - Existing functionality
4. **Loop Video Toggle** - Controls `player.loop()` directly
5. **Auto-play Next Toggle** - Syncs with `autostartVideo` config setting
6. **Show Scrubber Toggle** - Syncs with `showScrubber` config setting
6. **Video Filters** (expandable section):
   - Brightness (0-200%)
   - Contrast (0-200%)
   - Saturation (0-200%)
   - Hue (0-360°)
   - Blur (0-10px)
   - Reset Filters button
7. **Video Transforms** (expandable section):
   - Rotate (-180° to +180°)
   - Scale (50-200%)
   - Quick rotate buttons (-90°/+90°)
   - Reset Transforms button

### Integration with ScenePlayer.tsx

The following hooks were added in `ScenePlayer.tsx`:

```typescript
// Sync settings menu autoplay toggle with config
const settingsMenu = player.settingsMenu();
if (settingsMenu) {
  settingsMenu.setAutoplayEnabled(interfaceConfig?.autostartVideo ?? false);
  settingsMenu.setOnAutoplayChange(updateAutoStart);
}

// Reset video filters/transforms on new scene
settingsMenu.resetAll();
```

### CSS Styles

New styles added to `ui/v2.5/src/extensions/styles/_player-components.scss`:

- `.vjs-settings-menu-divider` - Separator between menu sections
- `.vjs-settings-menu-toggle` - Toggle switch container
- `.vjs-settings-toggle-switch` - iOS-style toggle switch
- `.vjs-settings-slider-group` - Container for filter/transform sliders
- `.vjs-settings-slider-item` - Individual slider with label and value
- `.vjs-settings-quick-actions` - Quick action buttons row
- `.vjs-settings-quick-btn` - Quick action button
- `.vjs-settings-action-buttons` - Reset button container
- `.vjs-settings-reset-btn` - Reset button styling

### Design Reference

Based on Archivr design spec from `private/ARCHIVR-FRONTEND-DESIGN-SPEC.md` and visual mockup from `private/design/component-player.svg`.

Menu structure matches the Archivr design:
```
┌─────────────────────────────────────┐
│ [4K (2160p)                    ▼]  │ ← Quality dropdown
├─────────────────────────────────────┤
│ [0.5] [1.0] [1.5] [2.0] [3.0] [...] │ ← Speed (submenu)
├─────────────────────────────────────┤
│ Loop video                 [  OFF  ]│
│ Auto-play next             [  ON   ]│
│ Show scrubber strip          [  ON   ]│
├─────────────────────────────────────┤
│ ▶ Video Filters                     │ ← Expandable
│ ▶ Video Transforms                  │ ← Expandable
└─────────────────────────────────────┘
```

## Filter Tab Removal (Extension Component)

**File**: `ui/v2.5/src/extensions/components/Scene/Scene.tsx`

Since video filters are now accessible from the player settings menu, the standalone "Effect Filters" tab has been removed from the scene details page in the extension component.

### Changes

1. Removed `SceneVideoFilterPanel` lazy import
2. Removed `Nav.Item` for `scene-video-filter-panel`
3. Removed `Tab.Pane` for `SceneVideoFilterPanel`

**Note**: The upstream `ui/v2.5/src/components/Scenes/SceneDetails/Scene.tsx` is unchanged. The filter tab removal is only in the extension component, following the fork extension strategy.
