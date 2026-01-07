/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Autostart Button Plugin
 *
 * YouTube 2026-style embedded track toggle for auto-start video setting.
 * Design: 30×14px track with 18px sliding thumb + icon inside.
 * - OFF: Track is gray, thumb on left, shows pause icon
 * - ON: Track fills with primary blue, thumb slides right, shows play icon
 */
import videojs, { VideoJsPlayer } from "video.js";

interface IAutostartButtonOptions {
  enabled?: boolean;
}

interface AutostartButtonOptions extends videojs.ComponentOptions {
  autostartEnabled: boolean;
}

// SVG icons for the thumb
const ICON_PLAY = `<svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
  <path d="M8 5v14l11-7z"/>
</svg>`;

const ICON_PAUSE = `<svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
  <path d="M6 4h4v16H6zm8 0h4v16h-4z"/>
</svg>`;

class AutostartButton extends videojs.getComponent("Button") {
  private autostartEnabled: boolean;
  private trackEl: HTMLElement | null = null;
  private thumbEl: HTMLElement | null = null;

  constructor(player: VideoJsPlayer, options: AutostartButtonOptions) {
    super(player, options);
    this.autostartEnabled = options.autostartEnabled;
    // Defer initial state update to ensure element is fully created
    window.setTimeout(() => this.updateState(), 0);
  }

  createEl(): HTMLButtonElement {
    const el = videojs.dom.createEl("button", {
      className: "vjs-autostart-button vjs-control vjs-button vjs-autostart-toggle",
    }) as HTMLButtonElement;

    // Create the track (pill background)
    this.trackEl = videojs.dom.createEl("div", {
      className: "vjs-autostart-track",
    }) as HTMLElement;

    // Create the thumb (sliding circle with icon)
    this.thumbEl = videojs.dom.createEl("div", {
      className: "vjs-autostart-thumb",
    }) as HTMLElement;

    this.trackEl.appendChild(this.thumbEl);
    el.appendChild(this.trackEl);

    // Add hidden control text for accessibility
    const controlText = videojs.dom.createEl("span", {
      className: "vjs-control-text",
    }) as HTMLElement;
    el.appendChild(controlText);

    return el;
  }

  buildCSSClass() {
    return `vjs-autostart-button vjs-autostart-toggle ${super.buildCSSClass()}`;
  }

  private updateState() {
    // Find thumb element via DOM query (more reliable than instance property)
    const thumb = this.el()?.querySelector(".vjs-autostart-thumb") as HTMLElement;
    if (!thumb) return;

    if (this.autostartEnabled) {
      this.addClass("vjs-autostart-on");
      this.removeClass("vjs-autostart-off");
      thumb.innerHTML = ICON_PLAY;
      this.controlText(this.localize("Auto-start enabled (click to disable)"));
      this.el().setAttribute("title", "Auto-start enabled (click to disable)");
    } else {
      this.addClass("vjs-autostart-off");
      this.removeClass("vjs-autostart-on");
      thumb.innerHTML = ICON_PAUSE;
      this.controlText(this.localize("Auto-start disabled (click to enable)"));
      this.el().setAttribute("title", "Auto-start disabled (click to enable)");
    }
  }

  handleClick(event: Event) {
    // Prevent the click from bubbling up and affecting the video player
    event.stopPropagation();

    this.autostartEnabled = !this.autostartEnabled;
    this.updateState();
    this.trigger("autostartchanged", { enabled: this.autostartEnabled });
  }

  public setEnabled(enabled: boolean) {
    this.autostartEnabled = enabled;
    this.updateState();
  }
}

class AutostartButtonPlugin extends videojs.getPlugin("plugin") {
  private button: AutostartButton;
  private autostartEnabled: boolean;
  updateAutoStart: (enabled: boolean) => Promise<void> = () => {
    return Promise.resolve();
  };

  constructor(player: VideoJsPlayer, options?: IAutostartButtonOptions) {
    super(player, options);

    this.autostartEnabled = options?.enabled ?? false;

    this.button = new AutostartButton(player, {
      autostartEnabled: this.autostartEnabled,
    });

    player.ready(() => {
      this.ready();
    });
  }

  private ready() {
    // Add button to control bar, before the fullscreen button
    const { controlBar } = this.player;
    const fullscreenToggle = controlBar.getChild("fullscreenToggle");
    if (fullscreenToggle) {
      controlBar.addChild(this.button);
      controlBar.el().insertBefore(this.button.el(), fullscreenToggle.el());
    } else {
      controlBar.addChild(this.button);
    }

    // Listen for changes
    this.button.on("autostartchanged", (_, data: { enabled: boolean }) => {
      this.autostartEnabled = data.enabled;
      this.updateAutoStart(this.autostartEnabled);
    });
  }

  public isEnabled(): boolean {
    return this.autostartEnabled;
  }

  public getEnabled(): boolean {
    return this.autostartEnabled;
  }

  public setEnabled(enabled: boolean) {
    this.autostartEnabled = enabled;
    this.button.setEnabled(enabled);
  }

  public syncWithConfig(configEnabled: boolean) {
    // Sync button state with external config changes
    if (this.autostartEnabled !== configEnabled) {
      this.setEnabled(configEnabled);
    }
  }
}

// Register the plugin with video.js.
videojs.registerComponent("AutostartButton", AutostartButton);
videojs.registerPlugin("autostartButton", AutostartButtonPlugin);

declare module "video.js" {
  interface VideoJsPlayer {
    autostartButton: () => AutostartButtonPlugin;
  }
  interface VideoJsPlayerPluginOptions {
    autostartButton?: IAutostartButtonOptions;
  }
}

export default AutostartButtonPlugin;
