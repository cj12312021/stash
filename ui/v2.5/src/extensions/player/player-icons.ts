/**
 * VideoJS Player Icons Plugin
 *
 * Replaces Video.js default font icons with custom SVG icons
 * to match the settings menu button visual style.
 *
 * This plugin auto-registers when imported.
 */
import videojs, { VideoJsPlayer } from "video.js";

// SVG icon definitions - stroke style with rounded edges
const PLAYER_ICONS = {
  play: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="25" height="25">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>`,
  pause: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="25" height="25">
    <rect x="6" y="4" width="4" height="16" rx="1"/>
    <rect x="14" y="4" width="4" height="16" rx="1"/>
  </svg>`,
  volumeHigh: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="25" height="25">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
  </svg>`,
  volumeLow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="25" height="25">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
  </svg>`,
  volumeMute: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="25" height="25">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <line x1="23" y1="9" x2="17" y2="15"/>
    <line x1="17" y1="9" x2="23" y2="15"/>
  </svg>`,
  fullscreen: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="25" height="25">
    <polyline points="15 3 21 3 21 9"/>
    <polyline points="9 21 3 21 3 15"/>
    <polyline points="21 15 21 21 15 21"/>
    <polyline points="3 9 3 3 9 3"/>
  </svg>`,
  fullscreenExit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="25" height="25">
    <polyline points="4 14 10 14 10 20"/>
    <polyline points="20 10 14 10 14 4"/>
    <polyline points="14 20 14 14 20 14"/>
    <polyline points="10 4 10 10 4 10"/>
  </svg>`,
  pictureInPicture: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="25" height="25">
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <rect x="11" y="9" width="9" height="6" rx="1"/>
  </svg>`,
  skipBack: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="25" height="25">
    <polygon points="19 20 9 12 19 4 19 20"/>
    <line x1="5" y1="19" x2="5" y2="5"/>
  </svg>`,
  skipForward: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="25" height="25">
    <polygon points="5 4 15 12 5 20 5 4"/>
    <line x1="19" y1="5" x2="19" y2="19"/>
  </svg>`,
  rewind: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="25" height="25">
    <polygon points="11 19 2 12 11 5 11 19"/>
    <polygon points="22 19 13 12 22 5 22 19"/>
  </svg>`,
  fastForward: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="25" height="25">
    <polygon points="13 19 22 12 13 5 13 19"/>
    <polygon points="2 19 11 12 2 5 2 19"/>
  </svg>`,
  autoplay: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="25" height="25">
    <polygon points="5 3 19 12 5 21 5 3"/>
    <circle cx="12" cy="12" r="10"/>
  </svg>`,
  autoplayOff: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="25" height="25">
    <circle cx="12" cy="12" r="10"/>
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
  </svg>`,
};

class PlayerIconsPlugin extends videojs.getPlugin("plugin") {
  constructor(player: VideoJsPlayer) {
    super(player);

    player.ready(() => {
      // Delay icon replacement to ensure all plugins have added their buttons
      // Other plugins (skipButtons, seekButtons) add buttons in their own ready() callbacks
      window.setTimeout(() => {
        this.replaceIcons();
      }, 0);

      // Update icons when player state changes
      player.on("play", () => this.updatePlayPauseIcon());
      player.on("pause", () => this.updatePlayPauseIcon());
      player.on("volumechange", () => this.updateVolumeIcon());
      player.on("fullscreenchange", () => this.updateFullscreenIcon());
    });
  }

  private replaceIcons() {
    const { controlBar } = this.player;

    // Play/Pause button
    const playControl = controlBar.getChild("playToggle");
    if (playControl) {
      this.replaceButtonIcon(playControl.el() as HTMLElement, "play");
      playControl.el().classList.add("vjs-svg-icon");
    }

    // Mute button in volume panel
    const volumePanel = controlBar.getChild("volumePanel");
    if (volumePanel) {
      const muteControl = volumePanel.getChild("muteToggle");
      if (muteControl) {
        this.replaceButtonIcon(muteControl.el() as HTMLElement, "volumeHigh");
        muteControl.el().classList.add("vjs-svg-icon");
      }
    }

    // Fullscreen button
    const fullscreenToggle = controlBar.getChild("fullscreenToggle");
    if (fullscreenToggle) {
      this.replaceButtonIcon(
        fullscreenToggle.el() as HTMLElement,
        "fullscreen"
      );
      fullscreenToggle.el().classList.add("vjs-svg-icon");
    }

    // Picture-in-Picture button
    const pipToggle = controlBar.getChild("pictureInPictureToggle");
    if (pipToggle) {
      this.replaceButtonIcon(
        pipToggle.el() as HTMLElement,
        "pictureInPicture"
      );
      pipToggle.el().classList.add("vjs-svg-icon");
    }

    // Skip buttons (prev/next)
    const skipButtons = controlBar.el().querySelectorAll(".vjs-skip-button");
    skipButtons.forEach((btn) => {
      const buttonEl = btn as HTMLElement;
      if (buttonEl.classList.contains("vjs-icon-next-item")) {
        this.replaceButtonIcon(buttonEl, "skipForward");
        buttonEl.classList.add("vjs-svg-icon");
      } else if (buttonEl.classList.contains("vjs-icon-previous-item")) {
        this.replaceButtonIcon(buttonEl, "skipBack");
        buttonEl.classList.add("vjs-svg-icon");
      }
    });

    // Seek buttons (forward/back 10s) - from videojs-seek-buttons plugin
    const seekButtons = controlBar.el().querySelectorAll(".vjs-seek-button");
    seekButtons.forEach((btn) => {
      const buttonEl = btn as HTMLElement;
      if (buttonEl.classList.contains("skip-forward")) {
        this.replaceButtonIcon(buttonEl, "fastForward");
        buttonEl.classList.add("vjs-svg-icon");
      } else if (buttonEl.classList.contains("skip-back")) {
        this.replaceButtonIcon(buttonEl, "rewind");
        buttonEl.classList.add("vjs-svg-icon");
      }
    });

    // Autostart button
    const autostartBtn = controlBar.el().querySelector(".vjs-autostart-button");
    if (autostartBtn) {
      this.updateAutostartIcon(autostartBtn as HTMLElement);
      autostartBtn.classList.add("vjs-svg-icon");
    }

    // Update initial states
    this.updatePlayPauseIcon();
    this.updateVolumeIcon();
    this.updateFullscreenIcon();
  }

  private replaceButtonIcon(
    element: HTMLElement,
    iconKey: keyof typeof PLAYER_ICONS
  ) {
    const icon = PLAYER_ICONS[iconKey];
    if (!icon) return;

    // Find or create the icon placeholder
    let placeholder = element.querySelector(
      ".vjs-icon-placeholder"
    ) as HTMLElement;
    if (!placeholder) {
      placeholder = document.createElement("span");
      placeholder.className = "vjs-icon-placeholder";
      element.insertBefore(placeholder, element.firstChild);
    }

    // Set the SVG content
    placeholder.innerHTML = icon;
    placeholder.setAttribute("aria-hidden", "true");
  }

  private updatePlayPauseIcon() {
    const { controlBar } = this.player;
    const playControl = controlBar.getChild("playToggle");
    if (!playControl) return;

    const isPaused = this.player.paused();
    this.replaceButtonIcon(
      playControl.el() as HTMLElement,
      isPaused ? "play" : "pause"
    );
  }

  private updateVolumeIcon() {
    const { controlBar } = this.player;
    const volumePanel = controlBar.getChild("volumePanel");
    if (!volumePanel) return;

    const muteControl = volumePanel.getChild("muteToggle");
    if (!muteControl) return;

    const volume = this.player.volume();
    const muted = this.player.muted();

    let iconKey: keyof typeof PLAYER_ICONS = "volumeHigh";
    if (muted || volume === 0) {
      iconKey = "volumeMute";
    } else if (volume < 0.5) {
      iconKey = "volumeLow";
    }

    this.replaceButtonIcon(muteControl.el() as HTMLElement, iconKey);
  }

  private updateFullscreenIcon() {
    const { controlBar } = this.player;
    const fullscreenToggle = controlBar.getChild("fullscreenToggle");
    if (!fullscreenToggle) return;

    const isFullscreen = this.player.isFullscreen();
    this.replaceButtonIcon(
      fullscreenToggle.el() as HTMLElement,
      isFullscreen ? "fullscreenExit" : "fullscreen"
    );
  }

  private updateAutostartIcon(element: HTMLElement) {
    const isEnabled = element.classList.contains("vjs-icon-play-circle");
    this.replaceButtonIcon(element, isEnabled ? "autoplay" : "autoplayOff");
  }
}

// Register the plugin with video.js
videojs.registerPlugin("playerIcons", PlayerIconsPlugin);

/* eslint-disable @typescript-eslint/naming-convention */
declare module "video.js" {
  interface VideoJsPlayer {
    playerIcons: () => PlayerIconsPlugin;
  }
  interface VideoJsPlayerPluginOptions {
    playerIcons?: Record<string, never>;
  }
}

export default PlayerIconsPlugin;
