/**
 * VideoJS Settings Menu Plugin
 *
 * Custom settings menu for the video player providing:
 * - Quality/source selection with auto-fallback on errors
 * - Playback speed control
 * - Subtitle/CC track selection
 * - Loop video toggle
 * - Auto-play next toggle
 * - Video filters (brightness, contrast, saturation, etc.)
 * - Video transforms (rotate, scale)
 *
 * Based on Archivr design spec.
 * This plugin auto-registers when imported.
 */
import videojs, { VideoJsPlayer } from "video.js";

// Icons as SVG data URIs - with rounded edges for consistency
const ICONS = {
  quality: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
    <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>
    <text x="12" y="15" text-anchor="middle" font-size="8" font-weight="bold" fill="currentColor">HQ</text>
  </svg>`,
  speed: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 6v6l4 2"/>
  </svg>`,
  subtitles: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
    <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>
    <text x="12" y="15" text-anchor="middle" font-size="7" font-weight="bold" fill="currentColor">CC</text>
  </svg>`,
  chevron: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
    <polyline points="9 18 15 12 9 6"/>
  </svg>`,
  back: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
    <polyline points="15 18 9 12 15 6"/>
  </svg>`,
  loop: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
    <polyline points="17 1 21 5 17 9"/>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <polyline points="7 23 3 19 7 15"/>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </svg>`,
  autoplay: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
    <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>
    <line x1="19" y1="5" x2="19" y2="19"/>
  </svg>`,
  filters: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="4"/>
    <line x1="21.17" y1="8" x2="12" y2="8"/>
    <line x1="3.95" y1="6.06" x2="8.54" y2="14"/>
    <line x1="10.88" y1="21.94" x2="15.46" y2="14"/>
  </svg>`,
  transforms: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
    <polyline points="15 3 21 3 21 9"/>
    <polyline points="9 21 3 21 3 15"/>
    <line x1="21" y1="3" x2="14" y2="10"/>
    <line x1="3" y1="21" x2="10" y2="14"/>
  </svg>`,
  markerStrip: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
    <rect x="2" y="14" width="20" height="6" rx="1"/>
    <rect x="4" y="16" width="4" height="2" rx="0.5" fill="currentColor"/>
    <rect x="10" y="16" width="3" height="2" rx="0.5" fill="currentColor"/>
    <rect x="15" y="16" width="5" height="2" rx="0.5" fill="currentColor"/>
  </svg>`,
};

// Video filter/transform state
interface VideoFilters {
  brightness: number; // 0-200, default 100
  contrast: number; // 0-200, default 100
  saturation: number; // 0-200, default 100
  hue: number; // 0-360, default 0
  blur: number; // 0-10, default 0
}

interface VideoTransforms {
  rotate: number; // -180 to 180, default 0
  scale: number; // 50-200, default 100
}

const DEFAULT_FILTERS: VideoFilters = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
};

const DEFAULT_TRANSFORMS: VideoTransforms = {
  rotate: 0,
  scale: 100,
};

export interface ISource extends videojs.Tech.SourceObject {
  label?: string;
  errored?: boolean;
}

type SettingsSection = "main" | "quality" | "speed" | "subtitles" | "filters" | "transforms";

// Callback type for toggle changes
type ToggleChangeCallback = (enabled: boolean) => void;

class SettingsMenuPlugin extends videojs.getPlugin("plugin") {
  private menuButton: HTMLElement;
  private menuContainer: HTMLElement;
  private sources: ISource[] = [];
  private selectedSourceIndex = 0;
  private selectedSpeed = 1;
  private currentSection: SettingsSection = "main";
  private isOpen = false;
  private cleanupTextTracks: HTMLTrackElement[] = [];
  private manualTextTracks: HTMLTrackElement[] = [];
  private manuallySelected = false;

  // Toggle states
  private loopEnabled = false;
  private autoplayEnabled = false;
  private markerStripEnabled = true; // Default to shown
  private onAutoplayChange: ToggleChangeCallback | null = null;
  private onMarkerStripChange: ToggleChangeCallback | null = null;

  // Filter/transform states
  private filters: VideoFilters = { ...DEFAULT_FILTERS };
  private transforms: VideoTransforms = { ...DEFAULT_TRANSFORMS };

  private readonly playbackRates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  constructor(player: VideoJsPlayer) {
    super(player);

    // Create settings button
    this.menuButton = this.createSettingsButton();
    this.menuContainer = this.createMenuContainer();

    player.on("ready", () => {
      const { controlBar } = player;
      const fullscreenToggle = controlBar.getChild("fullscreenToggle")?.el();

      // Insert settings button before fullscreen
      if (fullscreenToggle) {
        controlBar.el().insertBefore(this.menuButton, fullscreenToggle);
        controlBar.el().insertBefore(this.menuContainer, fullscreenToggle);
      } else {
        controlBar.el().appendChild(this.menuButton);
        controlBar.el().appendChild(this.menuContainer);
      }

      // Hide default playback rate and subs-caps buttons
      const playbackRateBtn = controlBar.getChild("playbackRateMenuButton");
      if (playbackRateBtn) {
        playbackRateBtn.hide();
      }
      const subsCapsBtn = controlBar.getChild("subsCapsButton");
      if (subsCapsBtn) {
        subsCapsBtn.hide();
      }
    });

    // Stop propagation for all clicks inside the menu container
    // This prevents the document click handler from closing the menu
    this.menuContainer.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    // Close menu when clicking outside
    document.addEventListener("click", (e) => {
      if (
        !this.menuButton.contains(e.target as Node) &&
        !this.menuContainer.contains(e.target as Node)
      ) {
        this.closeMenu();
      }
    });

    // Close menu when video plays
    player.on("play", () => this.closeMenu());

    // Handle keyboard navigation
    this.menuContainer.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (this.currentSection !== "main") {
          this.showSection("main");
        } else {
          this.closeMenu();
        }
        e.preventDefault();
      }
    });

    player.on("loadedmetadata", () => {
      if (!player.videoWidth() && !player.videoHeight()) {
        if (player.error() !== null) return;
        const currentSrc = player.currentSrc();
        if (currentSrc === null) return;
        if (currentSrc.includes(".m3u8") || currentSrc.includes(".mpd")) {
          player.play();
        } else {
          player.error(MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED);
          return;
        }
      }
    });

    player.on("error", () => {
      const error = player.error();
      if (!error) return;

      if (
        error.code !== MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED &&
        error.code !== MediaError.MEDIA_ERR_DECODE
      )
        return;

      const currentSource = player.currentSource() as ISource;
      console.log(`Source '${currentSource.label}' is unsupported`);

      currentSource.errored = true;

      if (this.manuallySelected) {
        return;
      }

      if (
        this.selectedSourceIndex !== -1 &&
        this.selectedSourceIndex + 1 < this.sources.length
      ) {
        this.selectedSourceIndex += 1;
        const newSource = this.sources[this.selectedSourceIndex];
        console.log(`Trying next source in playlist: '${newSource.label}'`);

        const currentTime = player.currentTime();
        player.src(newSource);
        player.load();
        player.one("canplay", () => {
          player.currentTime(currentTime);
        });
        player.play();
        this.renderMenu();
      } else {
        console.log("No more sources in playlist");
      }
    });

    // Sync playback rate with player
    player.on("ratechange", () => {
      this.selectedSpeed = player.playbackRate();
      this.renderMenu();
    });

    // Sync loop state with player
    player.on("loadedmetadata", () => {
      this.loopEnabled = player.loop();
      this.renderMenu();
    });
  }

  private createSettingsButton(): HTMLElement {
    const button = videojs.dom.createEl("button", {
      className: "vjs-settings-button vjs-control vjs-button",
      title: "Settings",
    }) as HTMLElement;

    button.innerHTML = `
      <span class="vjs-icon-placeholder" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="25" height="25">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </span>
      <span class="vjs-control-text">Settings</span>
    `;

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleMenu();
    });

    return button;
  }

  private createMenuContainer(): HTMLElement {
    const container = videojs.dom.createEl("div", {
      className: "vjs-settings-menu-container",
    }) as HTMLElement;

    return container;
  }

  private toggleMenu() {
    if (this.isOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  private openMenu() {
    this.isOpen = true;
    this.currentSection = "main";
    this.menuContainer.classList.add("vjs-settings-menu-open");
    this.renderMenu();
  }

  private closeMenu() {
    this.isOpen = false;
    this.menuContainer.classList.remove("vjs-settings-menu-open");
  }

  private showSection(section: SettingsSection) {
    this.currentSection = section;
    this.renderMenu();
  }

  private renderMenu() {
    switch (this.currentSection) {
      case "main":
        this.renderMainMenu();
        break;
      case "quality":
        this.renderQualityMenu();
        break;
      case "speed":
        this.renderSpeedMenu();
        break;
      case "subtitles":
        this.renderSubtitlesMenu();
        break;
      case "filters":
        this.renderFiltersMenu();
        break;
      case "transforms":
        this.renderTransformsMenu();
        break;
    }
  }

  private renderMainMenu() {
    const selectedSource = this.selectedSourceIndex >= 0 && this.selectedSourceIndex < this.sources.length
      ? this.sources[this.selectedSourceIndex]
      : null;
    const qualityLabel = selectedSource?.label || selectedSource?.type || "Auto";
    const speedLabel = this.selectedSpeed === 1 ? "1x" : `${this.selectedSpeed}x`;
    const subtitleLabel = this.getSelectedSubtitleLabel();

    this.menuContainer.innerHTML = `
      <div class="vjs-settings-menu">
        <div class="vjs-settings-menu-item" data-section="quality">
          <span class="vjs-settings-menu-icon">${ICONS.quality}</span>
          <span class="vjs-settings-menu-label">Quality</span>
          <span class="vjs-settings-menu-value">${qualityLabel}</span>
          <span class="vjs-settings-menu-chevron">${ICONS.chevron}</span>
        </div>
        <div class="vjs-settings-menu-item" data-section="speed">
          <span class="vjs-settings-menu-icon">${ICONS.speed}</span>
          <span class="vjs-settings-menu-label">Playback Speed</span>
          <span class="vjs-settings-menu-value">${speedLabel}</span>
          <span class="vjs-settings-menu-chevron">${ICONS.chevron}</span>
        </div>
        <div class="vjs-settings-menu-item" data-section="subtitles">
          <span class="vjs-settings-menu-icon">${ICONS.subtitles}</span>
          <span class="vjs-settings-menu-label">Subtitle/CC</span>
          <span class="vjs-settings-menu-value">${subtitleLabel}</span>
          <span class="vjs-settings-menu-chevron">${ICONS.chevron}</span>
        </div>
        
        <div class="vjs-settings-menu-divider"></div>
        
        <div class="vjs-settings-menu-toggle" data-toggle="loop">
          <span class="vjs-settings-menu-icon">${ICONS.loop}</span>
          <span class="vjs-settings-menu-label">Loop video</span>
          <span class="vjs-settings-toggle-switch ${this.loopEnabled ? "vjs-toggle-on" : ""}">
            <span class="vjs-toggle-slider"></span>
          </span>
        </div>
        <div class="vjs-settings-menu-toggle" data-toggle="autoplay">
          <span class="vjs-settings-menu-icon">${ICONS.autoplay}</span>
          <span class="vjs-settings-menu-label">Auto-start video</span>
          <span class="vjs-settings-toggle-switch ${this.autoplayEnabled ? "vjs-toggle-on" : ""}">
            <span class="vjs-toggle-slider"></span>
          </span>
        </div>
        <div class="vjs-settings-menu-toggle" data-toggle="markerStrip">
          <span class="vjs-settings-menu-icon">${ICONS.markerStrip}</span>
          <span class="vjs-settings-menu-label">Show scrubber</span>
          <span class="vjs-settings-toggle-switch ${this.markerStripEnabled ? "vjs-toggle-on" : ""}">
            <span class="vjs-toggle-slider"></span>
          </span>
        </div>
        
        <div class="vjs-settings-menu-divider"></div>
        
        <div class="vjs-settings-menu-item" data-section="filters">
          <span class="vjs-settings-menu-icon">${ICONS.filters}</span>
          <span class="vjs-settings-menu-label">Video Filters</span>
          <span class="vjs-settings-menu-chevron">${ICONS.chevron}</span>
        </div>
        <div class="vjs-settings-menu-item" data-section="transforms">
          <span class="vjs-settings-menu-icon">${ICONS.transforms}</span>
          <span class="vjs-settings-menu-label">Video Transforms</span>
          <span class="vjs-settings-menu-chevron">${ICONS.chevron}</span>
        </div>
      </div>
    `;

    // Handle section navigation
    this.menuContainer.querySelectorAll(".vjs-settings-menu-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const section = item.getAttribute("data-section") as SettingsSection;
        this.showSection(section);
      });
    });

    // Handle toggle switches
    this.menuContainer.querySelectorAll(".vjs-settings-menu-toggle").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const toggle = item.getAttribute("data-toggle");
        if (toggle === "loop") {
          this.toggleLoop();
        } else if (toggle === "autoplay") {
          this.toggleAutoplay();
        } else if (toggle === "markerStrip") {
          this.toggleMarkerStrip();
        }
      });
    });
  }

  private toggleLoop() {
    this.loopEnabled = !this.loopEnabled;
    this.player.loop(this.loopEnabled);
    this.renderMenu();
  }

  private toggleAutoplay() {
    this.autoplayEnabled = !this.autoplayEnabled;
    if (this.onAutoplayChange) {
      this.onAutoplayChange(this.autoplayEnabled);
    }
    this.renderMenu();
  }

  private toggleMarkerStrip() {
    this.markerStripEnabled = !this.markerStripEnabled;
    if (this.onMarkerStripChange) {
      this.onMarkerStripChange(this.markerStripEnabled);
    }
    this.renderMenu();
  }

  private renderQualityMenu() {
    let items = "";
    
    if (this.sources.length === 0) {
      items = `
        <div class="vjs-settings-submenu-item vjs-disabled">
          <span class="vjs-settings-check"></span>
          <span class="vjs-settings-submenu-label">No sources available</span>
        </div>
      `;
    } else {
      items = this.sources
        .map((source, index) => {
          const isSelected = index === this.selectedSourceIndex;
          const isErrored = source.errored;
          const label = source.label || source.type || `Source ${index + 1}`;
          return `
            <div class="vjs-settings-submenu-item ${isSelected ? "vjs-selected" : ""} ${isErrored ? "vjs-errored" : ""}" data-index="${index}">
              <span class="vjs-settings-check">${isSelected ? "✓" : ""}</span>
              <span class="vjs-settings-submenu-label">${label}</span>
            </div>
          `;
        })
        .join("");
    }

    this.menuContainer.innerHTML = `
      <div class="vjs-settings-menu vjs-settings-submenu">
        <div class="vjs-settings-submenu-header" data-action="back">
          <span class="vjs-settings-back-icon">${ICONS.back}</span>
          <span class="vjs-settings-submenu-title">Quality</span>
        </div>
        <div class="vjs-settings-submenu-items">
          ${items}
        </div>
      </div>
    `;

    this.menuContainer.querySelector("[data-action='back']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showSection("main");
    });

    this.menuContainer.querySelectorAll(".vjs-settings-submenu-item:not(.vjs-disabled)").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const index = parseInt(item.getAttribute("data-index") || "0", 10);
        this.selectSource(index);
      });
    });
  }

  private renderSpeedMenu() {
    const items = this.playbackRates
      .map((rate) => {
        const isSelected = rate === this.selectedSpeed;
        const label = rate === 1 ? "Normal" : `${rate}x`;
        return `
          <div class="vjs-settings-submenu-item ${isSelected ? "vjs-selected" : ""}" data-rate="${rate}">
            <span class="vjs-settings-check">${isSelected ? "✓" : ""}</span>
            <span class="vjs-settings-submenu-label">${label}</span>
          </div>
        `;
      })
      .join("");

    this.menuContainer.innerHTML = `
      <div class="vjs-settings-menu vjs-settings-submenu">
        <div class="vjs-settings-submenu-header" data-action="back">
          <span class="vjs-settings-back-icon">${ICONS.back}</span>
          <span class="vjs-settings-submenu-title">Playback Speed</span>
        </div>
        <div class="vjs-settings-submenu-items">
          ${items}
        </div>
      </div>
    `;

    this.menuContainer.querySelector("[data-action='back']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showSection("main");
    });

    this.menuContainer.querySelectorAll(".vjs-settings-submenu-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const rate = parseFloat(item.getAttribute("data-rate") || "1");
        this.selectSpeed(rate);
      });
    });
  }

  private renderSubtitlesMenu() {
    const textTracks = this.player.textTracks();
    const items: string[] = [];

    // Add "Off" option
    let hasSelected = false;
    for (let i = 0; i < textTracks.length; i++) {
      const track = textTracks[i];
      if (track.kind === "captions" || track.kind === "subtitles") {
        if (track.mode === "showing") {
          hasSelected = true;
        }
      }
    }

    items.push(`
      <div class="vjs-settings-submenu-item ${!hasSelected ? "vjs-selected" : ""}" data-track-index="-1">
        <span class="vjs-settings-check">${!hasSelected ? "✓" : ""}</span>
        <span class="vjs-settings-submenu-label">subtitles off</span>
      </div>
    `);

    for (let i = 0; i < textTracks.length; i++) {
      const track = textTracks[i];
      if (track.kind === "captions" || track.kind === "subtitles") {
        const isSelected = track.mode === "showing";
        items.push(`
          <div class="vjs-settings-submenu-item ${isSelected ? "vjs-selected" : ""}" data-track-index="${i}">
            <span class="vjs-settings-check">${isSelected ? "✓" : ""}</span>
            <span class="vjs-settings-submenu-label">${track.label || track.language}</span>
          </div>
        `);
      }
    }

    this.menuContainer.innerHTML = `
      <div class="vjs-settings-menu vjs-settings-submenu">
        <div class="vjs-settings-submenu-header" data-action="back">
          <span class="vjs-settings-back-icon">${ICONS.back}</span>
          <span class="vjs-settings-submenu-title">Subtitle/CC</span>
        </div>
        <div class="vjs-settings-submenu-items">
          ${items.join("")}
        </div>
      </div>
    `;

    this.menuContainer.querySelector("[data-action='back']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showSection("main");
    });

    this.menuContainer.querySelectorAll(".vjs-settings-submenu-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const index = parseInt(item.getAttribute("data-track-index") || "-1", 10);
        this.selectSubtitle(index);
      });
    });
  }

  private getSelectedSubtitleLabel(): string {
    const textTracks = this.player.textTracks();
    for (let i = 0; i < textTracks.length; i++) {
      const track = textTracks[i];
      if (
        (track.kind === "captions" || track.kind === "subtitles") &&
        track.mode === "showing"
      ) {
        return track.label || track.language || "On";
      }
    }
    return "subtitles off";
  }

  private selectSource(index: number) {
    if (index === this.selectedSourceIndex) {
      this.showSection("main");
      return;
    }

    this.manuallySelected = true;
    this.selectedSourceIndex = index;
    const source = this.sources[index];

    const currentTime = this.player.currentTime();
    const paused = this.player.paused();

    this.player.src(source);
    this.player.one("canplay", () => {
      if (paused) {
        this.player.pause();
      }
      this.player.currentTime(currentTime);
    });
    this.player.play();

    this.showSection("main");
  }

  private selectSpeed(rate: number) {
    this.selectedSpeed = rate;
    this.player.playbackRate(rate);
    this.showSection("main");
  }

  private selectSubtitle(trackIndex: number) {
    const textTracks = this.player.textTracks();

    // Disable all tracks first
    for (let i = 0; i < textTracks.length; i++) {
      const track = textTracks[i];
      if (track.kind === "captions" || track.kind === "subtitles") {
        track.mode = "disabled";
      }
    }

    // Enable selected track
    if (trackIndex >= 0 && trackIndex < textTracks.length) {
      textTracks[trackIndex].mode = "showing";
    }

    this.showSection("main");
  }

  private renderFiltersMenu() {
    const isModified = 
      this.filters.brightness !== 100 ||
      this.filters.contrast !== 100 ||
      this.filters.saturation !== 100 ||
      this.filters.hue !== 0 ||
      this.filters.blur !== 0;

    this.menuContainer.innerHTML = `
      <div class="vjs-settings-menu vjs-settings-submenu vjs-settings-filters">
        <div class="vjs-settings-submenu-header" data-action="back">
          <span class="vjs-settings-back-icon">${ICONS.back}</span>
          <span class="vjs-settings-submenu-title">Video Filters</span>
        </div>
        <div class="vjs-settings-slider-group">
          <div class="vjs-settings-slider-item">
            <label>Brightness</label>
            <input type="range" min="0" max="200" value="${this.filters.brightness}" data-filter="brightness" />
            <span class="vjs-settings-slider-value">${this.filters.brightness}%</span>
          </div>
          <div class="vjs-settings-slider-item">
            <label>Contrast</label>
            <input type="range" min="0" max="200" value="${this.filters.contrast}" data-filter="contrast" />
            <span class="vjs-settings-slider-value">${this.filters.contrast}%</span>
          </div>
          <div class="vjs-settings-slider-item">
            <label>Saturation</label>
            <input type="range" min="0" max="200" value="${this.filters.saturation}" data-filter="saturation" />
            <span class="vjs-settings-slider-value">${this.filters.saturation}%</span>
          </div>
          <div class="vjs-settings-slider-item vjs-slider-hue">
            <label>Hue</label>
            <input type="range" min="0" max="360" value="${this.filters.hue}" data-filter="hue" />
            <span class="vjs-settings-slider-value">${this.filters.hue}°</span>
          </div>
          <div class="vjs-settings-slider-item">
            <label>Blur</label>
            <input type="range" min="0" max="10" step="0.5" value="${this.filters.blur}" data-filter="blur" />
            <span class="vjs-settings-slider-value">${this.filters.blur}px</span>
          </div>
        </div>
        <div class="vjs-settings-action-buttons">
          <button class="vjs-settings-reset-btn" data-action="reset-filters" ${!isModified ? "disabled" : ""}>
            Reset Filters
          </button>
        </div>
      </div>
    `;

    this.menuContainer.querySelector("[data-action='back']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showSection("main");
    });

    this.menuContainer.querySelector("[data-action='reset-filters']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.resetFilters();
    });

    this.menuContainer.querySelectorAll("input[type='range']").forEach((input) => {
      input.addEventListener("input", (e) => {
        e.stopPropagation();
        const target = e.target as HTMLInputElement;
        const filterName = target.getAttribute("data-filter") as keyof VideoFilters;
        const value = parseFloat(target.value);
        this.updateFilter(filterName, value);
        
        // Update the displayed value
        const valueSpan = target.nextElementSibling as HTMLSpanElement;
        if (valueSpan) {
          if (filterName === "hue") {
            valueSpan.textContent = `${value}°`;
          } else if (filterName === "blur") {
            valueSpan.textContent = `${value}px`;
          } else {
            valueSpan.textContent = `${value}%`;
          }
        }
      });
    });
  }

  private renderTransformsMenu() {
    const isModified = 
      this.transforms.rotate !== 0 ||
      this.transforms.scale !== 100;

    this.menuContainer.innerHTML = `
      <div class="vjs-settings-menu vjs-settings-submenu vjs-settings-transforms">
        <div class="vjs-settings-submenu-header" data-action="back">
          <span class="vjs-settings-back-icon">${ICONS.back}</span>
          <span class="vjs-settings-submenu-title">Video Transforms</span>
        </div>
        <div class="vjs-settings-slider-group">
          <div class="vjs-settings-slider-item">
            <label>Rotate</label>
            <input type="range" min="-180" max="180" value="${this.transforms.rotate}" data-transform="rotate" />
            <span class="vjs-settings-slider-value">${this.transforms.rotate}°</span>
          </div>
          <div class="vjs-settings-slider-item">
            <label>Scale</label>
            <input type="range" min="50" max="200" value="${this.transforms.scale}" data-transform="scale" />
            <span class="vjs-settings-slider-value">${this.transforms.scale}%</span>
          </div>
        </div>
        <div class="vjs-settings-quick-actions">
          <button class="vjs-settings-quick-btn" data-action="rotate-left" title="Rotate Left 90°">↶ -90°</button>
          <button class="vjs-settings-quick-btn" data-action="rotate-right" title="Rotate Right 90°">↷ +90°</button>
        </div>
        <div class="vjs-settings-action-buttons">
          <button class="vjs-settings-reset-btn" data-action="reset-transforms" ${!isModified ? "disabled" : ""}>
            Reset Transforms
          </button>
        </div>
      </div>
    `;

    this.menuContainer.querySelector("[data-action='back']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showSection("main");
    });

    this.menuContainer.querySelector("[data-action='reset-transforms']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.resetTransforms();
    });

    this.menuContainer.querySelector("[data-action='rotate-left']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.rotateQuick(-90);
    });

    this.menuContainer.querySelector("[data-action='rotate-right']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.rotateQuick(90);
    });

    this.menuContainer.querySelectorAll("input[type='range']").forEach((input) => {
      input.addEventListener("input", (e) => {
        e.stopPropagation();
        const target = e.target as HTMLInputElement;
        const transformName = target.getAttribute("data-transform") as keyof VideoTransforms;
        const value = parseFloat(target.value);
        this.updateTransform(transformName, value);
        
        // Update the displayed value
        const valueSpan = target.nextElementSibling as HTMLSpanElement;
        if (valueSpan) {
          if (transformName === "rotate") {
            valueSpan.textContent = `${value}°`;
          } else {
            valueSpan.textContent = `${value}%`;
          }
        }
      });
    });
  }

  private updateFilter(name: keyof VideoFilters, value: number) {
    this.filters[name] = value;
    this.applyFiltersAndTransforms();
  }

  private updateTransform(name: keyof VideoTransforms, value: number) {
    this.transforms[name] = value;
    this.applyFiltersAndTransforms();
  }

  private rotateQuick(degrees: number) {
    this.transforms.rotate = ((this.transforms.rotate + degrees + 180) % 360) - 180;
    this.applyFiltersAndTransforms();
    this.renderMenu();
  }

  private resetFilters() {
    this.filters = { ...DEFAULT_FILTERS };
    this.applyFiltersAndTransforms();
    this.renderMenu();
  }

  private resetTransforms() {
    this.transforms = { ...DEFAULT_TRANSFORMS };
    this.applyFiltersAndTransforms();
    this.renderMenu();
  }

  private applyFiltersAndTransforms() {
    const videoEl = this.player.el().querySelector("video") as HTMLVideoElement | null;
    if (!videoEl) return;

    // Build CSS filter string
    const filterParts: string[] = [];
    if (this.filters.brightness !== 100) {
      filterParts.push(`brightness(${this.filters.brightness / 100})`);
    }
    if (this.filters.contrast !== 100) {
      filterParts.push(`contrast(${this.filters.contrast / 100})`);
    }
    if (this.filters.saturation !== 100) {
      filterParts.push(`saturate(${this.filters.saturation / 100})`);
    }
    if (this.filters.hue !== 0) {
      filterParts.push(`hue-rotate(${this.filters.hue}deg)`);
    }
    if (this.filters.blur !== 0) {
      filterParts.push(`blur(${this.filters.blur}px)`);
    }

    // Build CSS transform string
    const transformParts: string[] = [];
    if (this.transforms.rotate !== 0) {
      transformParts.push(`rotate(${this.transforms.rotate}deg)`);
    }
    if (this.transforms.scale !== 100) {
      transformParts.push(`scale(${this.transforms.scale / 100})`);
    }

    videoEl.style.filter = filterParts.join(" ");
    videoEl.style.transform = transformParts.join(" ");
  }

  // Public API
  setSources(sources: ISource[]) {
    const cleanupTracks = this.cleanupTextTracks.splice(0);
    for (const track of cleanupTracks) {
      this.player.removeRemoteTextTrack(track);
    }

    // Store the sources array
    this.sources = sources.slice(); // Make a copy to ensure we have our own reference
    
    if (this.sources.length !== 0) {
      this.selectedSourceIndex = 0;
      this.player.src(this.sources[0]);
    } else {
      this.selectedSourceIndex = -1;
    }

    this.manuallySelected = false;
  }

  get textTracks(): HTMLTrackElement[] {
    return [...this.cleanupTextTracks, ...this.manualTextTracks];
  }

  addTextTrack(options: videojs.TextTrackOptions, manualCleanup: boolean) {
    const track = this.player.addRemoteTextTrack(options, true);
    if (manualCleanup) {
      this.manualTextTracks.push(track);
    } else {
      this.cleanupTextTracks.push(track);
    }
    return track;
  }

  removeTextTrack(track: HTMLTrackElement) {
    this.player.removeRemoteTextTrack(track);
    let index = this.manualTextTracks.indexOf(track);
    if (index != -1) {
      this.manualTextTracks.splice(index, 1);
    }
    index = this.cleanupTextTracks.indexOf(track);
    if (index != -1) {
      this.cleanupTextTracks.splice(index, 1);
    }
  }

  // Autoplay control methods
  setAutoplayEnabled(enabled: boolean) {
    this.autoplayEnabled = enabled;
    if (this.isOpen && this.currentSection === "main") {
      this.renderMenu();
    }
  }

  getAutoplayEnabled(): boolean {
    return this.autoplayEnabled;
  }

  setOnAutoplayChange(callback: ToggleChangeCallback) {
    this.onAutoplayChange = callback;
  }

  // Marker strip control methods
  setMarkerStripEnabled(enabled: boolean) {
    this.markerStripEnabled = enabled;
    if (this.isOpen && this.currentSection === "main") {
      this.renderMenu();
    }
  }

  getMarkerStripEnabled(): boolean {
    return this.markerStripEnabled;
  }

  setOnMarkerStripChange(callback: ToggleChangeCallback) {
    this.onMarkerStripChange = callback;
  }

  // Reset all filters and transforms (called on new video)
  resetAll() {
    this.filters = { ...DEFAULT_FILTERS };
    this.transforms = { ...DEFAULT_TRANSFORMS };
    this.applyFiltersAndTransforms();
  }
}

// Register the plugin with video.js.
videojs.registerPlugin("settingsMenu", SettingsMenuPlugin);

/* eslint-disable @typescript-eslint/naming-convention */
declare module "video.js" {
  interface VideoJsPlayer {
    settingsMenu: () => SettingsMenuPlugin;
  }
  interface VideoJsPlayerPluginOptions {
    settingsMenu?: {};
  }
}

export default SettingsMenuPlugin;


