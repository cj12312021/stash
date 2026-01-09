/**
 * Chapter Indicator Plugin - Enhanced with CRUD Actions
 *
 * YouTube-style chapter/marker indicator for the video player control bar.
 *
 * Features:
 * - Shows current marker title during playback
 * - Click opens dropdown panel with all markers
 * - Edit/Delete buttons on each marker (appear on hover)
 * - Create button in dropdown header and control bar
 * - Emits custom events for React to handle modal:
 *   - 'marker-create': Open create modal
 *   - 'marker-edit': Open edit modal (includes marker data)
 *   - 'marker-delete': Request marker deletion (includes marker data)
 * - Point markers: Cyan dot, single timestamp
 * - Range markers: Amber dot, start-end time range
 * - Active marker highlighted with blue accent
 * - Staggered slide-in animation for dropdown items
 *
 * Design: Dark Cinema Glass with backdrop blur, premium typography
 */
import videojs, { VideoJsPlayer } from "video.js";
import type { IMarker } from "src/components/ScenePlayer/markers";

// SVG Icons
const ICON_CHEVRON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
  <path d="M9.29 6.71a1 1 0 0 0 0 1.41L13.17 12l-3.88 3.88a1 1 0 1 0 1.41 1.41l4.59-4.59a1 1 0 0 0 0-1.41l-4.59-4.59a1 1 0 0 0-1.41 0z"/>
</svg>`;

const ICON_PLUS = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
</svg>`;

const ICON_EDIT = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
</svg>`;

const ICON_DELETE = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
</svg>`;

// Extended marker interface with ID for CRUD operations
export interface IMarkerWithId extends IMarker {
  id?: string;
  primary_tag?: {
    id: string;
    name: string;
  };
  tags?: Array<{ id: string; name: string }>;
}

interface IChapterIndicatorOptions {
  markers?: IMarkerWithId[];
}

// Custom events for React communication
export interface IMarkerCreateEvent {
  type: "marker-create";
}

export interface IMarkerEditEvent {
  type: "marker-edit";
  marker: IMarkerWithId;
  index: number;
}

export interface IMarkerDeleteEvent {
  type: "marker-delete";
  marker: IMarkerWithId;
  index: number;
}

/**
 * Format seconds to MM:SS or H:MM:SS
 */
function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format duration for display (e.g., "5:57 duration")
 */
function formatDuration(start: number, end: number): string {
  const durationSecs = end - start;
  return `${formatTime(durationSecs)} duration`;
}

/**
 * Determine if a marker is "active" at the given time
 * - Point markers: Active within 10 seconds after start
 * - Range markers: Active within start-end range
 */
function isMarkerActive(marker: IMarkerWithId, currentTime: number): boolean {
  if (marker.end_seconds != null && marker.end_seconds > marker.seconds) {
    // Range marker: active within range
    return currentTime >= marker.seconds && currentTime <= marker.end_seconds;
  }
  // Point marker: active within 10 seconds after start
  return currentTime >= marker.seconds && currentTime < marker.seconds + 10;
}

/**
 * Find the most relevant active marker
 * - If multiple markers are active, prefer the one that started most recently
 */
function findActiveMarker(
  markers: IMarkerWithId[],
  currentTime: number
): IMarkerWithId | null {
  const activeMarkers = markers.filter((m) => isMarkerActive(m, currentTime));
  if (activeMarkers.length === 0) return null;

  // Sort by start time descending (most recent first)
  activeMarkers.sort((a, b) => b.seconds - a.seconds);
  return activeMarkers[0];
}

class ChapterIndicatorPlugin extends videojs.getPlugin("plugin") {
  private containerEl: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private dropdownEl: HTMLElement | null = null;
  private quickAddEl: HTMLElement | null = null;
  private markers: IMarkerWithId[] = [];
  private activeMarker: IMarkerWithId | null = null;
  private isOpen = false;

  constructor(player: VideoJsPlayer, options?: IChapterIndicatorOptions) {
    super(player, options);

    if (options?.markers) {
      this.markers = options.markers;
    }

    player.ready(() => {
      this.createElements();
      this.setupEventListeners();
    });
  }

  private createElements() {
    const { controlBar } = this.player;
    if (!controlBar) return;

    // Create main container
    this.containerEl = videojs.dom.createEl("div", {
      className: "vjs-chapter-indicator",
    }) as HTMLElement;

    // Create title element
    this.titleEl = videojs.dom.createEl("span", {
      className: "vjs-chapter-title",
    }) as HTMLElement;
    this.titleEl.textContent = "—";

    // Create chevron icon
    const chevronEl = videojs.dom.createEl("span", {
      className: "vjs-chapter-chevron",
    }) as HTMLElement;
    chevronEl.innerHTML = ICON_CHEVRON;

    // Create dropdown panel
    this.dropdownEl = videojs.dom.createEl("div", {
      className: "vjs-chapter-dropdown",
    }) as HTMLElement;

    // Assemble chapter indicator
    this.containerEl.appendChild(this.titleEl);
    this.containerEl.appendChild(chevronEl);
    this.containerEl.appendChild(this.dropdownEl);

    // Create quick add button (separate from dropdown)
    this.quickAddEl = videojs.dom.createEl("button", {
      className: "vjs-chapter-quick-add",
      title: "Create Marker (N)",
    }) as HTMLElement;
    this.quickAddEl.innerHTML = ICON_PLUS;

    // Insert after duration display but before right-side buttons
    const durationDisplay = controlBar.el().querySelector(".vjs-duration");
    if (durationDisplay && durationDisplay.nextSibling) {
      controlBar
        .el()
        .insertBefore(this.containerEl, durationDisplay.nextSibling);
      controlBar.el().insertBefore(this.quickAddEl, this.containerEl.nextSibling);
    } else {
      // Fallback: append to control bar
      controlBar.el().appendChild(this.containerEl);
      controlBar.el().appendChild(this.quickAddEl);
    }

    // Initially hidden if no markers
    this.updateVisibility();
  }

  private setupEventListeners() {
    // Toggle dropdown on click
    this.containerEl?.addEventListener("click", (e) => {
      // Don't toggle if clicking action buttons inside dropdown
      const target = e.target as HTMLElement;
      if (
        target.closest(".vjs-chapter-action-btn") ||
        target.closest(".vjs-chapter-header-add")
      ) {
        return;
      }
      // Don't toggle if clicking the marker item to seek
      if (target.closest(".vjs-chapter-dropdown-item")) {
        return;
      }
      e.stopPropagation();
      this.toggleDropdown();
    });

    // Quick add button
    this.quickAddEl?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.emitCreate();
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (this.isOpen && !this.containerEl?.contains(e.target as Node)) {
        this.closeDropdown();
      }
    });

    // Close dropdown on play
    this.player.on("play", () => this.closeDropdown());

    // Update active marker on timeupdate
    this.player.on("timeupdate", () => {
      if (this.markers.length === 0) return;
      const currentTime = this.player.currentTime();
      const newActive = findActiveMarker(this.markers, currentTime);

      if (newActive !== this.activeMarker) {
        this.activeMarker = newActive;
        this.updateTitle();
        this.updateDropdownActiveState();
      }
    });

    // Handle keyboard
    this.containerEl?.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeDropdown();
        e.preventDefault();
      }
    });
  }

  private toggleDropdown() {
    if (this.isOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  private openDropdown() {
    this.isOpen = true;
    this.containerEl?.classList.add("is-open");
    this.renderDropdown();
  }

  private closeDropdown() {
    this.isOpen = false;
    this.containerEl?.classList.remove("is-open");
  }

  private updateTitle() {
    if (!this.titleEl) return;
    if (this.activeMarker) {
      this.titleEl.textContent =
        this.activeMarker.title ||
        this.activeMarker.primaryTag?.name ||
        "Marker";
    } else {
      this.titleEl.textContent = "—";
    }
  }

  private updateVisibility() {
    if (!this.containerEl || !this.quickAddEl) return;
    // Always show quick add button
    this.quickAddEl.style.display = "";

    if (this.markers.length === 0) {
      this.containerEl.style.display = "none";
    } else {
      this.containerEl.style.display = "";
    }
  }

  private renderDropdown() {
    if (!this.dropdownEl) return;

    const headerHtml = `
      <div class="vjs-chapter-dropdown-header">
        <h4>Markers (${this.markers.length})</h4>
        <button class="vjs-chapter-header-add" title="Create Marker">
          ${ICON_PLUS}
        </button>
      </div>
    `;

    const itemsHtml = this.markers
      .map((marker, index) => {
        const isRange =
          marker.end_seconds != null && marker.end_seconds > marker.seconds;
        const isActive = marker === this.activeMarker;
        const dotClass = isRange ? "range" : "point";

        let timeDisplay: string;
        let durationDisplay = "";
        if (isRange && marker.end_seconds) {
          timeDisplay = `${formatTime(marker.seconds)} – ${formatTime(marker.end_seconds)}`;
          durationDisplay = `<span class="vjs-chapter-item-duration">${formatDuration(marker.seconds, marker.end_seconds)}</span>`;
        } else {
          timeDisplay = formatTime(marker.seconds);
        }

        const title =
          marker.title || marker.primaryTag?.name || "Marker";

        return `
          <div class="vjs-chapter-dropdown-item ${isActive ? "is-active" : ""}"
               data-index="${index}"
               data-time="${marker.seconds}"
               tabindex="0"
               role="button"
               style="animation-delay: ${0.03 * (index + 1)}s">
            <div class="vjs-chapter-item-dot ${dotClass}"></div>
            <div class="vjs-chapter-item-info">
              <div class="vjs-chapter-item-title">${this.escapeHtml(title)}</div>
              <div class="vjs-chapter-item-meta">
                <span class="vjs-chapter-item-time">${timeDisplay}</span>
                ${durationDisplay}
              </div>
            </div>
            <div class="vjs-chapter-item-actions">
              <button class="vjs-chapter-action-btn vjs-chapter-edit-btn" data-index="${index}" title="Edit">
                ${ICON_EDIT}
              </button>
              <button class="vjs-chapter-action-btn vjs-chapter-delete-btn" data-index="${index}" title="Delete">
                ${ICON_DELETE}
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    // Empty state
    const emptyState =
      this.markers.length === 0
        ? `
      <div class="vjs-chapter-empty">
        <p>No markers yet</p>
        <button class="vjs-chapter-empty-add">
          ${ICON_PLUS} Create First Marker
        </button>
      </div>
    `
        : "";

    this.dropdownEl.innerHTML = headerHtml + (itemsHtml || emptyState);

    // Attach event handlers
    this.attachDropdownHandlers();
  }

  private attachDropdownHandlers() {
    if (!this.dropdownEl) return;

    // Header add button
    const headerAddBtn = this.dropdownEl.querySelector(".vjs-chapter-header-add");
    headerAddBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.emitCreate();
      this.closeDropdown();
    });

    // Empty state add button
    const emptyAddBtn = this.dropdownEl.querySelector(".vjs-chapter-empty-add");
    emptyAddBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.emitCreate();
      this.closeDropdown();
    });

    // Marker item clicks (seek)
    this.dropdownEl
      .querySelectorAll(".vjs-chapter-dropdown-item")
      .forEach((item) => {
        // Main item click = seek
        item.addEventListener("click", (e) => {
          // Don't seek if clicking action buttons
          if ((e.target as HTMLElement).closest(".vjs-chapter-action-btn")) {
            return;
          }
          e.stopPropagation();
          const time = parseFloat(item.getAttribute("data-time") || "0");
          this.seekToTime(time);
          this.closeDropdown();
        });

        // Keyboard support for seeking
        item.addEventListener("keydown", (e) => {
          if (
            (e as KeyboardEvent).key === "Enter" ||
            (e as KeyboardEvent).key === " "
          ) {
            // Don't seek if focus is on action button
            if ((e.target as HTMLElement).closest(".vjs-chapter-action-btn")) {
              return;
            }
            e.preventDefault();
            const time = parseFloat(item.getAttribute("data-time") || "0");
            this.seekToTime(time);
            this.closeDropdown();
          }
        });
      });

    // Edit buttons
    this.dropdownEl.querySelectorAll(".vjs-chapter-edit-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const index = parseInt(btn.getAttribute("data-index") || "0", 10);
        this.emitEdit(index);
        this.closeDropdown();
      });
    });

    // Delete buttons
    this.dropdownEl
      .querySelectorAll(".vjs-chapter-delete-btn")
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const index = parseInt(btn.getAttribute("data-index") || "0", 10);
          this.emitDelete(index);
          // Don't close dropdown - let React handle confirmation
        });
      });
  }

  private updateDropdownActiveState() {
    if (!this.dropdownEl || !this.isOpen) return;

    this.dropdownEl
      .querySelectorAll(".vjs-chapter-dropdown-item")
      .forEach((item, index) => {
        const marker = this.markers[index];
        if (marker === this.activeMarker) {
          item.classList.add("is-active");
        } else {
          item.classList.remove("is-active");
        }
      });
  }

  private seekToTime(seconds: number) {
    this.player.currentTime(seconds);
    // Start playing if paused
    if (this.player.paused()) {
      this.player.play();
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Event emitters for React communication
  private emitCreate() {
    const event = new CustomEvent("marker-create", {
      bubbles: true,
      detail: { type: "marker-create" },
    });
    this.player.el().dispatchEvent(event);
  }

  private emitEdit(index: number) {
    const marker = this.markers[index];
    if (!marker) return;

    const event = new CustomEvent("marker-edit", {
      bubbles: true,
      detail: {
        type: "marker-edit",
        marker,
        index,
      },
    });
    this.player.el().dispatchEvent(event);
  }

  private emitDelete(index: number) {
    const marker = this.markers[index];
    if (!marker) return;

    const event = new CustomEvent("marker-delete", {
      bubbles: true,
      detail: {
        type: "marker-delete",
        marker,
        index,
      },
    });
    this.player.el().dispatchEvent(event);
  }

  // Public API

  /**
   * Set the markers to display
   */
  setMarkers(markers: IMarkerWithId[]) {
    this.markers = markers;
    this.activeMarker = null;
    this.updateVisibility();
    this.updateTitle();

    // If open, re-render dropdown
    if (this.isOpen) {
      this.renderDropdown();
    }
  }

  /**
   * Get current markers
   */
  getMarkers(): IMarkerWithId[] {
    return this.markers;
  }

  /**
   * Clear all markers
   */
  clearMarkers() {
    this.markers = [];
    this.activeMarker = null;
    this.updateVisibility();
    this.updateTitle();
    this.closeDropdown();
  }

  /**
   * Programmatically trigger create modal
   */
  triggerCreate() {
    this.emitCreate();
  }
}

// Register the plugin
videojs.registerPlugin("chapterIndicator", ChapterIndicatorPlugin);

/* eslint-disable @typescript-eslint/naming-convention */
declare module "video.js" {
  interface VideoJsPlayer {
    chapterIndicator: () => ChapterIndicatorPlugin;
  }
  interface VideoJsPlayerPluginOptions {
    chapterIndicator?: IChapterIndicatorOptions;
  }
}

export default ChapterIndicatorPlugin;
