/**
 * VideoJS Settings Menu Plugin
 *
 * YouTube 2026-style settings menu with glass morphism design.
 *
 * Features:
 * - Glass morphism overlay (backdrop blur, semi-transparent)
 * - YouTube 2026 menu structure: toggles first, then submenus
 * - Custom playback speed slider with 0.05x increments
 * - HD/4K quality badges
 * - Video filters (brightness, contrast, saturation, hue, blur)
 * - Video transforms (rotate, scale)
 * - Smooth animations with cubic-bezier easing
 *
 * This plugin auto-registers when imported.
 */
import videojs, { VideoJsPlayer } from "video.js";

// =============================================================================
// SVG ICONS - YouTube 2026 style (stroke-based, consistent 18x18)
// =============================================================================

const ICONS = {
  // Loop - circular arrows
  loop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </svg>`,

  // Scrubber/marker strip
  scrubber: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="2" y="14" width="20" height="6" rx="1"/>
    <rect x="4" y="16" width="4" height="2" rx="0.5" fill="currentColor"/>
    <rect x="10" y="16" width="3" height="2" rx="0.5" fill="currentColor"/>
    <rect x="15" y="16" width="5" height="2" rx="0.5" fill="currentColor"/>
  </svg>`,

  // Quality - HQ badge
  quality: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="3" y="6" width="18" height="12" rx="2"/>
    <text x="12" y="15" text-anchor="middle" font-size="8" font-weight="bold" fill="currentColor" stroke="none">HQ</text>
  </svg>`,

  // Speed - clock
  speed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>
  </svg>`,

  // Filters - aperture
  filters: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
  </svg>`,

  // Transforms - resize
  transforms: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
    <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
  </svg>`,

  // Back chevron
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>`,

  // Forward chevron
  chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>`,

  // Checkmark
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`,

  // Settings gear (for button)
  gear: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="25" height="25">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>`,
};

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export interface ISource extends videojs.Tech.SourceObject {
  label?: string;
  errored?: boolean;
}

type MenuSection = "main" | "quality" | "speed" | "filters" | "transforms";
type ToggleChangeCallback = (enabled: boolean) => void;

interface IVideoFilters {
  brightness: number; // 0-200, default 100
  contrast: number; // 0-200, default 100
  saturation: number; // 0-200, default 100
  hue: number; // 0-360, default 0
  blur: number; // 0-10, default 0
}

interface IVideoTransforms {
  rotate: number; // -180 to 180, default 0
  scale: number; // 50-200, default 100
}

const DEFAULT_FILTERS: IVideoFilters = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
};

const DEFAULT_TRANSFORMS: IVideoTransforms = {
  rotate: 0,
  scale: 100,
};

// =============================================================================
// SETTINGS MENU PLUGIN
// =============================================================================

class SettingsMenuPlugin extends videojs.getPlugin("plugin") {
  // DOM elements
  private menuButton: HTMLElement;
  private menuContainer: HTMLElement;

  // State
  private isOpen = false;
  private currentSection: MenuSection = "main";

  // Sources
  private sources: ISource[] = [];
  private selectedSourceIndex = 0;
  private manuallySelected = false;

  // Playback
  private selectedSpeed = 1;
  private customSpeed = 1;
  private readonly presetSpeeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  // Toggles
  private loopEnabled = false;
  private markerStripEnabled = true;

  // Callbacks (markerStrip/scrubber and autoplay)
  private onMarkerStripChange: ToggleChangeCallback | null = null;
  private onAutoplayChange: ToggleChangeCallback | null = null;
  private autoplayEnabled = false;

  // Filters & Transforms
  private filters: IVideoFilters = { ...DEFAULT_FILTERS };
  private transforms: IVideoTransforms = { ...DEFAULT_TRANSFORMS };

  // Text tracks
  private cleanupTextTracks: HTMLTrackElement[] = [];
  private manualTextTracks: HTMLTrackElement[] = [];

  // Animation frame for slider updates
  private sliderUpdateRAF: number | null = null;

  constructor(player: VideoJsPlayer) {
    super(player);

    // Create UI elements
    this.menuButton = this.createMenuButton();
    this.menuContainer = this.createMenuContainer();

    // Insert into control bar when ready
    player.on("ready", () => this.insertIntoControlBar());

    // Event handlers
    this.setupEventHandlers();

    // Sync with player state
    this.setupPlayerSync();
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  private createMenuButton(): HTMLElement {
    const button = videojs.dom.createEl("button", {
      className: "vjs-settings-button vjs-control vjs-button",
      title: "Settings",
    }) as HTMLElement;

    button.innerHTML = `
      <span class="vjs-icon-placeholder" aria-hidden="true">${ICONS.gear}</span>
      <span class="vjs-control-text">Settings</span>
    `;

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggle();
    });

    return button;
  }

  private createMenuContainer(): HTMLElement {
    const container = videojs.dom.createEl("div", {
      className: "vjs-settings-menu",
    }) as HTMLElement;

    // Prevent clicks from closing menu
    container.addEventListener("click", (e) => e.stopPropagation());

    return container;
  }

  private insertIntoControlBar(): void {
    const { controlBar } = this.player;
    const fullscreenToggle = controlBar.getChild("fullscreenToggle")?.el();

    if (fullscreenToggle) {
      controlBar.el().insertBefore(this.menuButton, fullscreenToggle);
      controlBar.el().insertBefore(this.menuContainer, fullscreenToggle);
    } else {
      controlBar.el().appendChild(this.menuButton);
      controlBar.el().appendChild(this.menuContainer);
    }

    // Hide default VideoJS controls we're replacing
    ["playbackRateMenuButton", "subsCapsButton"].forEach((name) => {
      const child = controlBar.getChild(name);
      if (child) child.hide();
    });
  }

  private setupEventHandlers(): void {
    // Close on outside click
    document.addEventListener("click", (e) => {
      if (
        this.isOpen &&
        !this.menuButton.contains(e.target as Node) &&
        !this.menuContainer.contains(e.target as Node)
      ) {
        this.close();
      }
    });

    // Close on video play
    this.player.on("play", () => this.close());

    // Keyboard navigation
    this.menuContainer.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (this.currentSection !== "main") {
          this.navigateTo("main");
        } else {
          this.close();
        }
        e.preventDefault();
      }
    });
  }

  private setupPlayerSync(): void {
    // Sync playback rate
    this.player.on("ratechange", () => {
      this.selectedSpeed = this.player.playbackRate();
      this.customSpeed = this.selectedSpeed;
      if (this.isOpen) this.render();
    });

    // Sync loop state
    this.player.on("loadedmetadata", () => {
      this.loopEnabled = this.player.loop();
      if (this.isOpen) this.render();
    });

    // Handle source errors (auto-fallback)
    this.player.on("error", () => this.handleSourceError());
  }

  // ===========================================================================
  // MENU STATE
  // ===========================================================================

  private toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  private open(): void {
    this.isOpen = true;
    this.currentSection = "main";
    this.menuContainer.classList.add("is-open");
    this.menuButton.classList.add("is-active");
    this.render();
  }

  private close(): void {
    this.isOpen = false;
    this.menuContainer.classList.remove("is-open");
    this.menuButton.classList.remove("is-active");
  }

  private navigateTo(section: MenuSection): void {
    this.currentSection = section;
    this.render();
  }

  // ===========================================================================
  // RENDERING
  // ===========================================================================

  private render(): void {
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
      case "filters":
        this.renderFiltersMenu();
        break;
      case "transforms":
        this.renderTransformsMenu();
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Main Menu
  // ---------------------------------------------------------------------------

  private renderMainMenu(): void {
    const qualityLabel = this.getQualityLabel();
    const speedLabel = this.selectedSpeed === 1 ? "Normal" : `${this.selectedSpeed}x`;

    this.menuContainer.innerHTML = `
      <div class="settings-menu-panel">
        <div class="settings-menu-items">
          <!-- Toggle: Loop -->
          ${this.renderToggle("loop", "Loop video", ICONS.loop, this.loopEnabled)}

          <!-- Toggle: Scrubber/MarkerStrip -->
          ${this.renderToggle("markerStrip", "Show scrubber", ICONS.scrubber, this.markerStripEnabled)}

          <div class="settings-menu-divider"></div>

          <!-- Submenu: Quality -->
          ${this.renderMenuItem("quality", "Quality", ICONS.quality, qualityLabel)}

          <!-- Submenu: Speed -->
          ${this.renderMenuItem("speed", "Playback speed", ICONS.speed, speedLabel)}

          <div class="settings-menu-divider"></div>

          <!-- Submenu: Filters -->
          ${this.renderMenuItem("filters", "Video filters", ICONS.filters)}

          <!-- Submenu: Transforms -->
          ${this.renderMenuItem("transforms", "Video transforms", ICONS.transforms)}
        </div>
      </div>
    `;

    this.bindMainMenuEvents();
  }

  private renderToggle(id: string, label: string, icon: string, isOn: boolean): string {
    return `
      <div class="settings-menu-toggle ${isOn ? "is-on" : ""}" data-toggle="${id}">
        <span class="menu-icon">${icon}</span>
        <span class="menu-label">${label}</span>
        <span class="toggle-switch">
          <span class="toggle-thumb"></span>
        </span>
      </div>
    `;
  }

  private renderMenuItem(id: string, label: string, icon: string, value?: string): string {
    return `
      <div class="settings-menu-item" data-section="${id}">
        <span class="menu-icon">${icon}</span>
        <span class="menu-label">${label}</span>
        ${value ? `<span class="menu-value">${value}</span>` : ""}
        <span class="menu-chevron">${ICONS.chevron}</span>
      </div>
    `;
  }

  private bindMainMenuEvents(): void {
    // Toggle handlers
    this.menuContainer.querySelectorAll(".settings-menu-toggle").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const toggle = el.getAttribute("data-toggle");
        if (toggle === "loop") this.toggleLoop();
        else if (toggle === "markerStrip") this.toggleMarkerStrip();
      });
    });

    // Submenu navigation
    this.menuContainer.querySelectorAll(".settings-menu-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const section = el.getAttribute("data-section") as MenuSection;
        this.navigateTo(section);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Quality Menu
  // ---------------------------------------------------------------------------

  private renderQualityMenu(): void {
    let options = "";

    if (this.sources.length === 0) {
      options = this.renderQualityOption(-1, "No sources available", false, true);
    } else {
      options = this.sources
        .map((source, index) => {
          const label = source.label || source.type || `Source ${index + 1}`;
          const badge = this.getQualityBadge(label);
          const isSelected = index === this.selectedSourceIndex;
          const isErrored = source.errored ?? false;
          return this.renderQualityOption(index, label, isSelected, isErrored, badge);
        })
        .join("");
    }

    this.menuContainer.innerHTML = `
      <div class="settings-menu-panel">
        ${this.renderSubmenuHeader("Quality")}
        <div class="settings-menu-items">
          ${options}
        </div>
      </div>
    `;

    this.bindSubmenuEvents("quality");
  }

  private renderQualityOption(
    index: number,
    label: string,
    isSelected: boolean,
    isDisabled: boolean,
    badge?: string
  ): string {
    const classes = [
      "settings-option",
      isSelected && "is-selected",
      isDisabled && "is-disabled",
    ]
      .filter(Boolean)
      .join(" ");

    return `
      <div class="${classes}" data-index="${index}">
        <span class="option-check">${isSelected ? ICONS.check : ""}</span>
        <span class="option-label">${label}</span>
        ${badge ? `<span class="option-badge">${badge}</span>` : ""}
      </div>
    `;
  }

  private getQualityBadge(label: string): string | undefined {
    const lower = label.toLowerCase();
    if (lower.includes("2160") || lower.includes("4k")) return "4K";
    if (lower.includes("1080") || lower.includes("720")) return "HD";
    return undefined;
  }

  private getQualityLabel(): string {
    if (this.sources.length === 0) return "Auto";
    const source = this.sources[this.selectedSourceIndex];
    return source?.label || source?.type || "Auto";
  }

  // ---------------------------------------------------------------------------
  // Speed Menu (with custom slider)
  // ---------------------------------------------------------------------------

  private renderSpeedMenu(): void {
    const isCustom = !this.presetSpeeds.includes(this.selectedSpeed);
    const sliderPercent = ((this.customSpeed - 0.25) / (2 - 0.25)) * 100;

    const options = this.presetSpeeds
      .map((rate) => {
        const isSelected = rate === this.selectedSpeed && !isCustom;
        const label = rate === 1 ? "Normal" : `${rate}x`;
        return `
          <div class="settings-option ${isSelected ? "is-selected" : ""}" data-speed="${rate}">
            <span class="option-check">${isSelected ? ICONS.check : ""}</span>
            <span class="option-label">${label}</span>
          </div>
        `;
      })
      .join("");

    this.menuContainer.innerHTML = `
      <div class="settings-menu-panel">
        ${this.renderSubmenuHeader("Playback speed")}

        <!-- Custom Speed Slider -->
        <div class="custom-speed-control">
          <div class="custom-speed-header">
            <span class="option-check">${isCustom ? ICONS.check : ""}</span>
            <span>Custom</span>
            <span class="custom-speed-value">${this.customSpeed.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            class="custom-speed-slider"
            min="0.25"
            max="2"
            step="0.05"
            value="${this.customSpeed}"
            style="--slider-percent: ${sliderPercent}%"
          />
        </div>

        <div class="settings-menu-items">
          ${options}
        </div>
      </div>
    `;

    this.bindSpeedMenuEvents();
  }

  private bindSpeedMenuEvents(): void {
    // Back button
    this.menuContainer.querySelector(".settings-menu-header")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.navigateTo("main");
    });

    // Preset speed options
    this.menuContainer.querySelectorAll(".settings-option[data-speed]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const rate = parseFloat(el.getAttribute("data-speed") || "1");
        this.selectSpeed(rate);
      });
    });

    // Custom slider
    const slider = this.menuContainer.querySelector(".custom-speed-slider") as HTMLInputElement;
    const valueDisplay = this.menuContainer.querySelector(".custom-speed-value");
    const checkDisplay = this.menuContainer.querySelector(".custom-speed-header .option-check");

    if (slider) {
      slider.addEventListener("input", (e) => {
        e.stopPropagation();
        const value = parseFloat(slider.value);
        this.customSpeed = value;

        // Update display immediately
        if (valueDisplay) valueDisplay.textContent = `${value.toFixed(2)}x`;

        // Update slider fill
        const percent = ((value - 0.25) / (2 - 0.25)) * 100;
        slider.style.setProperty("--slider-percent", `${percent}%`);

        // Show check if not a preset
        const isCustom = !this.presetSpeeds.includes(value);
        if (checkDisplay) {
          checkDisplay.innerHTML = isCustom ? ICONS.check : "";
        }

        // Debounced player update
        if (this.sliderUpdateRAF) cancelAnimationFrame(this.sliderUpdateRAF);
        this.sliderUpdateRAF = requestAnimationFrame(() => {
          this.player.playbackRate(value);
          this.selectedSpeed = value;
        });
      });
    }
  }

  private selectSpeed(rate: number): void {
    this.selectedSpeed = rate;
    this.customSpeed = rate;
    this.player.playbackRate(rate);
    this.navigateTo("main");
  }

  // ---------------------------------------------------------------------------
  // Filters Menu
  // ---------------------------------------------------------------------------

  private renderFiltersMenu(): void {
    const isModified = this.isFiltersModified();

    this.menuContainer.innerHTML = `
      <div class="settings-menu-panel">
        ${this.renderSubmenuHeader("Video filters")}
        <div class="settings-menu-items settings-sliders">
          ${this.renderSlider("brightness", "Brightness", this.filters.brightness, 0, 200, "%")}
          ${this.renderSlider("contrast", "Contrast", this.filters.contrast, 0, 200, "%")}
          ${this.renderSlider("saturation", "Saturation", this.filters.saturation, 0, 200, "%")}
          ${this.renderSlider("hue", "Hue", this.filters.hue, 0, 360, "°")}
          ${this.renderSlider("blur", "Blur", this.filters.blur, 0, 10, "px", 0.5)}
        </div>
        <button class="settings-reset-btn" data-action="reset-filters" ${!isModified ? "disabled" : ""}>
          Reset filters
        </button>
      </div>
    `;

    this.bindFiltersMenuEvents();
  }

  private bindFiltersMenuEvents(): void {
    // Back button
    this.menuContainer.querySelector(".settings-menu-header")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.navigateTo("main");
    });

    // Reset button
    this.menuContainer.querySelector("[data-action='reset-filters']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.resetFilters();
    });

    // Sliders
    this.menuContainer.querySelectorAll("input[data-filter]").forEach((input) => {
      input.addEventListener("input", (e) => {
        e.stopPropagation();
        const target = e.target as HTMLInputElement;
        const name = target.getAttribute("data-filter") as keyof IVideoFilters;
        const value = parseFloat(target.value);
        this.updateFilter(name, value, target);
      });
    });
  }

  private updateFilter(name: keyof IVideoFilters, value: number, input: HTMLInputElement): void {
    this.filters[name] = value;
    this.applyFiltersAndTransforms();

    // Update value display
    const row = input.closest(".settings-slider-item");
    const valueSpan = row?.querySelector(".slider-value");
    if (valueSpan) {
      const suffix = name === "hue" ? "°" : name === "blur" ? "px" : "%";
      valueSpan.textContent = `${value}${suffix}`;
    }

    // Update slider fill
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    const percent = ((value - min) / (max - min)) * 100;
    input.style.setProperty("--slider-percent", `${percent}%`);

    // Update reset button state
    const resetBtn = this.menuContainer.querySelector("[data-action='reset-filters']") as HTMLButtonElement;
    if (resetBtn) resetBtn.disabled = !this.isFiltersModified();
  }

  private isFiltersModified(): boolean {
    return (
      this.filters.brightness !== 100 ||
      this.filters.contrast !== 100 ||
      this.filters.saturation !== 100 ||
      this.filters.hue !== 0 ||
      this.filters.blur !== 0
    );
  }

  private resetFilters(): void {
    this.filters = { ...DEFAULT_FILTERS };
    this.applyFiltersAndTransforms();
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Transforms Menu
  // ---------------------------------------------------------------------------

  private renderTransformsMenu(): void {
    const isModified = this.isTransformsModified();

    this.menuContainer.innerHTML = `
      <div class="settings-menu-panel">
        ${this.renderSubmenuHeader("Video transforms")}
        <div class="settings-menu-items settings-sliders">
          ${this.renderSlider("rotate", "Rotate", this.transforms.rotate, -180, 180, "°")}
          ${this.renderSlider("scale", "Scale", this.transforms.scale, 50, 200, "%")}
        </div>
        <div class="settings-quick-actions">
          <button class="settings-quick-btn" data-action="rotate-ccw" title="Rotate -90°">
            ↶ -90°
          </button>
          <button class="settings-quick-btn" data-action="rotate-cw" title="Rotate +90°">
            ↷ +90°
          </button>
        </div>
        <button class="settings-reset-btn" data-action="reset-transforms" ${!isModified ? "disabled" : ""}>
          Reset transforms
        </button>
      </div>
    `;

    this.bindTransformsMenuEvents();
  }

  private bindTransformsMenuEvents(): void {
    // Back button
    this.menuContainer.querySelector(".settings-menu-header")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.navigateTo("main");
    });

    // Reset button
    this.menuContainer.querySelector("[data-action='reset-transforms']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.resetTransforms();
    });

    // Quick rotate buttons
    this.menuContainer.querySelector("[data-action='rotate-ccw']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.quickRotate(-90);
    });
    this.menuContainer.querySelector("[data-action='rotate-cw']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.quickRotate(90);
    });

    // Sliders
    this.menuContainer.querySelectorAll("input[data-transform]").forEach((input) => {
      input.addEventListener("input", (e) => {
        e.stopPropagation();
        const target = e.target as HTMLInputElement;
        const name = target.getAttribute("data-transform") as keyof IVideoTransforms;
        const value = parseFloat(target.value);
        this.updateTransform(name, value, target);
      });
    });
  }

  private updateTransform(name: keyof IVideoTransforms, value: number, input: HTMLInputElement): void {
    this.transforms[name] = value;
    this.applyFiltersAndTransforms();

    // Update value display
    const row = input.closest(".settings-slider-item");
    const valueSpan = row?.querySelector(".slider-value");
    if (valueSpan) {
      const suffix = name === "rotate" ? "°" : "%";
      valueSpan.textContent = `${value}${suffix}`;
    }

    // Update slider fill
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    const percent = ((value - min) / (max - min)) * 100;
    input.style.setProperty("--slider-percent", `${percent}%`);

    // Update reset button state
    const resetBtn = this.menuContainer.querySelector("[data-action='reset-transforms']") as HTMLButtonElement;
    if (resetBtn) resetBtn.disabled = !this.isTransformsModified();
  }

  private quickRotate(degrees: number): void {
    this.transforms.rotate = ((this.transforms.rotate + degrees + 540) % 360) - 180;
    this.applyFiltersAndTransforms();
    this.render();
  }

  private isTransformsModified(): boolean {
    return this.transforms.rotate !== 0 || this.transforms.scale !== 100;
  }

  private resetTransforms(): void {
    this.transforms = { ...DEFAULT_TRANSFORMS };
    this.applyFiltersAndTransforms();
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Shared Rendering Helpers
  // ---------------------------------------------------------------------------

  private renderSubmenuHeader(title: string): string {
    return `
      <div class="settings-menu-header" data-action="back">
        <span class="header-back">${ICONS.back}</span>
        <h3>${title}</h3>
      </div>
    `;
  }

  private renderSlider(
    id: string,
    label: string,
    value: number,
    min: number,
    max: number,
    suffix: string,
    step = 1
  ): string {
    const percent = ((value - min) / (max - min)) * 100;
    const dataAttr = ["brightness", "contrast", "saturation", "hue", "blur"].includes(id)
      ? "data-filter"
      : "data-transform";

    return `
      <div class="settings-slider-item">
        <div class="slider-header">
          <span class="slider-label">${label}</span>
          <span class="slider-value">${value}${suffix}</span>
        </div>
        <input
          type="range"
          ${dataAttr}="${id}"
          min="${min}"
          max="${max}"
          step="${step}"
          value="${value}"
          style="--slider-percent: ${percent}%"
        />
      </div>
    `;
  }

  private bindSubmenuEvents(section: string): void {
    // Back button
    this.menuContainer.querySelector(".settings-menu-header")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.navigateTo("main");
    });

    // Quality options
    if (section === "quality") {
      this.menuContainer.querySelectorAll(".settings-option:not(.is-disabled)").forEach((el) => {
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const index = parseInt(el.getAttribute("data-index") || "0", 10);
          this.selectSource(index);
        });
      });
    }
  }

  // ===========================================================================
  // VIDEO EFFECTS
  // ===========================================================================

  private applyFiltersAndTransforms(): void {
    const videoEl = this.player.el().querySelector("video") as HTMLVideoElement | null;
    if (!videoEl) return;

    // CSS filter string
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

    // CSS transform string
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

  // ===========================================================================
  // SOURCE MANAGEMENT
  // ===========================================================================

  private handleSourceError(): void {
    const error = this.player.error();
    if (!error) return;

    if (
      error.code !== MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED &&
      error.code !== MediaError.MEDIA_ERR_DECODE
    ) {
      return;
    }

    const currentSource = this.player.currentSource() as ISource;
    currentSource.errored = true;

    // Don't auto-fallback if user manually selected
    if (this.manuallySelected) return;

    // Try next source
    if (this.selectedSourceIndex + 1 < this.sources.length) {
      this.selectedSourceIndex += 1;
      const newSource = this.sources[this.selectedSourceIndex];

      const currentTime = this.player.currentTime();
      this.player.src(newSource);
      this.player.load();
      this.player.one("canplay", () => this.player.currentTime(currentTime));
      this.player.play();

      if (this.isOpen) this.render();
    }
  }

  private selectSource(index: number): void {
    if (index === this.selectedSourceIndex) {
      this.navigateTo("main");
      return;
    }

    this.manuallySelected = true;
    this.selectedSourceIndex = index;

    const source = this.sources[index];
    const currentTime = this.player.currentTime();
    const wasPaused = this.player.paused();

    this.player.src(source);
    this.player.one("canplay", () => {
      this.player.currentTime(currentTime);
      if (wasPaused) this.player.pause();
    });
    this.player.play();

    this.navigateTo("main");
  }

  // ===========================================================================
  // TOGGLE HANDLERS
  // ===========================================================================

  private toggleLoop(): void {
    this.loopEnabled = !this.loopEnabled;
    this.player.loop(this.loopEnabled);
    this.render();
  }

  private toggleMarkerStrip(): void {
    this.markerStripEnabled = !this.markerStripEnabled;
    if (this.onMarkerStripChange) {
      this.onMarkerStripChange(this.markerStripEnabled);
    }
    this.render();
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  setSources(sources: ISource[]): void {
    // Cleanup old tracks
    this.cleanupTextTracks.forEach((track) => this.player.removeRemoteTextTrack(track));
    this.cleanupTextTracks = [];

    this.sources = sources.slice();
    if (this.sources.length > 0) {
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

  addTextTrack(options: videojs.TextTrackOptions, manualCleanup: boolean): HTMLTrackElement {
    const track = this.player.addRemoteTextTrack(options, true);
    if (manualCleanup) {
      this.manualTextTracks.push(track);
    } else {
      this.cleanupTextTracks.push(track);
    }
    return track;
  }

  removeTextTrack(track: HTMLTrackElement): void {
    this.player.removeRemoteTextTrack(track);
    this.manualTextTracks = this.manualTextTracks.filter((t) => t !== track);
    this.cleanupTextTracks = this.cleanupTextTracks.filter((t) => t !== track);
  }

  // Marker strip / scrubber control (same thing, different names for compatibility)
  setMarkerStripEnabled(enabled: boolean): void {
    this.markerStripEnabled = enabled;
    if (this.isOpen && this.currentSection === "main") this.render();
  }

  getMarkerStripEnabled(): boolean {
    return this.markerStripEnabled;
  }

  setOnMarkerStripChange(callback: ToggleChangeCallback): void {
    this.onMarkerStripChange = callback;
  }

  // Aliases for scrubber (v2 API compatibility)
  setScrubberEnabled(enabled: boolean): void {
    this.setMarkerStripEnabled(enabled);
  }

  getScrubberEnabled(): boolean {
    return this.getMarkerStripEnabled();
  }

  setOnScrubberChange(callback: ToggleChangeCallback): void {
    this.setOnMarkerStripChange(callback);
  }

  // Autoplay control (state managed externally by control bar toggle)
  setAutoplayEnabled(enabled: boolean): void {
    this.autoplayEnabled = enabled;
  }

  getAutoplayEnabled(): boolean {
    return this.autoplayEnabled;
  }

  setOnAutoplayChange(callback: ToggleChangeCallback): void {
    this.onAutoplayChange = callback;
  }

  // Reset all effects
  resetAll(): void {
    this.filters = { ...DEFAULT_FILTERS };
    this.transforms = { ...DEFAULT_TRANSFORMS };
    this.applyFiltersAndTransforms();
  }
}

// =============================================================================
// PLUGIN REGISTRATION
// =============================================================================

videojs.registerPlugin("settingsMenu", SettingsMenuPlugin);

declare module "video.js" {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface VideoJsPlayer {
    settingsMenu: () => SettingsMenuPlugin;
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface VideoJsPlayerPluginOptions {
    settingsMenu?: Record<string, never>;
  }
}

export default SettingsMenuPlugin;
