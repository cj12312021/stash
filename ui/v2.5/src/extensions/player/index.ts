/**
 * Player Extensions
 *
 * VideoJS plugins and player enhancements.
 */

// Settings menu plugin (YouTube 2026 design) - auto-registers on import
import "./settings-menu";

// Player icons plugin - replaces font icons with SVG icons
import "./player-icons";

// Chapter indicator plugin - shows current marker in control bar
import "./chapter-indicator";

export { default as SettingsMenuPlugin, type ISource } from "./settings-menu";
export { default as PlayerIconsPlugin } from "./player-icons";
export { default as ChapterIndicatorPlugin } from "./chapter-indicator";
