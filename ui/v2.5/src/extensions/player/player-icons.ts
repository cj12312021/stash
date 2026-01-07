/**
 * VideoJS Player Icons Plugin
 *
 * Replaces Video.js default font icons with custom SVG icons
 * to match the settings menu button visual style.
 *
 * This plugin auto-registers when imported.
 */
import videojs, { VideoJsPlayer } from "video.js";

// SVG icon definitions - YouTube 2026 style (filled icons)
const PLAYER_ICONS = {
  play: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M8 5v14l11-7z"/>
  </svg>`,
  pause: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
  </svg>`,
  volumeHigh: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
  </svg>`,
  volumeLow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
  </svg>`,
  volumeMute: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
  </svg>`,
  fullscreen: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
  </svg>`,
  fullscreenExit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
  </svg>`,
  pictureInPicture: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/>
  </svg>`,
  skipBack: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
  </svg>`,
  skipForward: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
  </svg>`,
  rewind: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
  </svg>`,
  fastForward: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
  </svg>`,
  autoplay: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
  </svg>`,
  autoplayOff: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.41 3.59-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.41-3.59 8-8 8z"/>
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

    // Autostart button - SKIP icon replacement
    // The autostart button uses a custom track/thumb toggle design (see autostart-button.ts)
    // so we don't replace its icon here

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
