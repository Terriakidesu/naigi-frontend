import { iconElement } from "./icons";

/** A focused view shares the existing decoded stream; it never captures or publishes media. */
export function enableVideoViewer(element: HTMLVideoElement, label: string | (() => string), audio?: { getVolume: () => number; setVolume: (value: number) => void }, source: "camera" | "screen" = "camera"): () => void {
  let dialog: HTMLDialogElement | undefined;
  let removeFullscreenListener: (() => void) | undefined;
  const displayName = () => typeof label === "function" ? label() : label;
  element.tabIndex = 0;
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", `Expand ${displayName()}`);
  element.title = `Expand ${displayName()}`;
  const close = () => {
    if (!dialog) return;
    removeFullscreenListener?.();
    removeFullscreenListener = undefined;
    const video = dialog.querySelector("video");
    if (video) { video.pause(); video.srcObject = null; }
    if (document.fullscreenElement === dialog) void document.exitFullscreen().catch(() => {});
    dialog.remove();
    dialog = undefined;
    if (element.isConnected) element.focus();
  };
  const open = () => {
    if (dialog) return;
    dialog = document.createElement("dialog");
    dialog.className = "voice-video-viewer";
    dialog.setAttribute("aria-label", displayName());
    const header = document.createElement("header");
    header.className = "voice-video-viewer-header";
    const identity = document.createElement("div");
    identity.className = "voice-video-viewer-identity";
    const sourceIcon = document.createElement("span");
    sourceIcon.className = "voice-video-viewer-source-icon";
    sourceIcon.append(iconElement(source === "screen" ? "monitor" : "video"));
    const copy = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = displayName();
    const subtitle = document.createElement("span");
    subtitle.textContent = source === "screen" ? "Screen share" : "Camera";
    copy.append(heading, subtitle);
    identity.append(sourceIcon, copy);
    const live = document.createElement("span");
    live.className = "voice-video-viewer-live";
    live.textContent = "LIVE";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "voice-video-viewer-close";
    closeButton.title = "Close viewer";
    closeButton.setAttribute("aria-label", "Close viewer");
    closeButton.append(iconElement("x"));
    closeButton.addEventListener("click", close);
    header.append(identity, live, closeButton);
    const stage = document.createElement("div");
    stage.className = "voice-video-viewer-stage";
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true; // Audio remains on the room's deafen/output path, never duplicated.
    video.srcObject = element.srcObject;
    video.dataset.mirrored = source === "camera" ? element.dataset.mirrored ?? "false" : "false";
    const updateAspect = () => {
      let width = element.videoWidth;
      let height = element.videoHeight;
      const stream = element.srcObject;
      if (!width && stream && "getVideoTracks" in stream) {
        const settings = stream.getVideoTracks()[0]?.getSettings();
        width = settings?.width ?? 0;
        height = settings?.height ?? 0;
      }
      if (dialog) dialog.dataset.portrait = String(source === "camera" && height > width && width > 0);
    };
    video.addEventListener("loadedmetadata", updateAspect);
    updateAspect();
    stage.append(video);
    const controls = document.createElement("div");
    controls.className = "voice-video-viewer-controls";
    const button = (text: string, icon: string, action: () => void) => {
      const control = document.createElement("button");
      control.type = "button";
      const caption = document.createElement("span");
      caption.textContent = text;
      control.append(iconElement(icon), caption);
      control.addEventListener("click", action);
      controls.append(control);
      return control;
    };
    const fit = button("Fill view", "expand", () => {
      const fill = video.style.objectFit !== "cover";
      video.style.objectFit = fill ? "cover" : "contain";
      fit.querySelector("span")!.textContent = fill ? "Fit view" : "Fill view";
      fit.setAttribute("aria-pressed", String(fill));
    });
    fit.setAttribute("aria-pressed", "false");
    if (document.fullscreenEnabled && typeof dialog.requestFullscreen === "function") {
      const fullscreen = button("Fullscreen", "expand", () => {
        const action = document.fullscreenElement === dialog ? document.exitFullscreen() : dialog!.requestFullscreen();
        void action.catch(() => { fullscreen.querySelector("span")!.textContent = "Fullscreen unavailable"; });
      });
      const updateFullscreen = () => { fullscreen.querySelector("span")!.textContent = document.fullscreenElement === dialog ? "Exit fullscreen" : "Fullscreen"; };
      document.addEventListener("fullscreenchange", updateFullscreen);
      removeFullscreenListener = () => document.removeEventListener("fullscreenchange", updateFullscreen);
    }
    if (audio) {
      const volumeLabel = document.createElement("label");
      volumeLabel.className = "voice-video-viewer-volume";
      volumeLabel.append(iconElement("volume-2"));
      const volume = document.createElement("input");
      volume.type = "range";
      volume.min = "0";
      volume.max = "100";
      volume.value = String(Math.round(audio.getVolume() * 100));
      volume.setAttribute("aria-label", "Shared audio volume (zero mutes)");
      volume.addEventListener("input", () => audio.setVolume(Number(volume.value) / 100));
      volumeLabel.append(volume);
      controls.append(volumeLabel);
    }
    const hint = document.createElement("span");
    hint.className = "voice-video-viewer-hint";
    hint.textContent = "Esc to close";
    controls.append(hint);
    dialog.append(header, stage, controls);
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog!.getBoundingClientRect();
      const pointer = event as MouseEvent;
      if (pointer.clientX < rect.left || pointer.clientX > rect.right || pointer.clientY < rect.top || pointer.clientY > rect.bottom) close();
    });
    document.body.append(dialog);
    dialog.showModal();
    void video.play().catch(() => {});
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
  };
  element.addEventListener("click", open);
  element.addEventListener("keydown", keydown);
  return () => {
    close();
    element.removeEventListener("click", open);
    element.removeEventListener("keydown", keydown);
  };
}
