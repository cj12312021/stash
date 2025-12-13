/**
 * Player Extensions
 *
 * VideoJS plugins and player enhancements.
 */

// Settings menu plugin - auto-registers on import
import "./settings-menu";

// Player icons plugin - replaces font icons with SVG icons
import "./player-icons";

export { default as SettingsMenuPlugin, type ISource } from "./settings-menu";
export { default as PlayerIconsPlugin } from "./player-icons";
