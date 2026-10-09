/** A focused view shares the existing decoded stream; it never captures or publishes media. */
export function enableVideoViewer(element: HTMLVideoElement, label: string, audio?: { getVolume: () => number; setVolume: (value: number) => void }): () => void {
  let dialog: HTMLDialogElement | undefined;
  element.tabIndex = 0;
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", `Expand ${label}`);
  element.title = `Expand ${label}`;
  const close = () => {
    if (!dialog) return;
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
    dialog.setAttribute("aria-label", label);
    const heading = document.createElement("strong");
    heading.textContent = label;
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true; // Audio remains on the room's deafen/output path, never duplicated.
    video.srcObject = element.srcObject;
    const controls = document.createElement("div");
    controls.className = "voice-video-viewer-controls";
    const button = (text: string, action: () => void) => {
      const control = document.createElement("button");
      control.type = "button";
      control.textContent = text;
      control.addEventListener("click", action);
      controls.append(control);
      return control;
    };
    const fit = button("Fill view", () => {
      const fill = video.style.objectFit !== "cover";
      video.style.objectFit = fill ? "cover" : "contain";
      fit.textContent = fill ? "Fit view" : "Fill view";
    });
    if (typeof dialog.requestFullscreen === "function") {
      const fullscreen = button("Fullscreen", () => {
        void dialog?.requestFullscreen().catch(() => { fullscreen.textContent = "Fullscreen unavailable"; });
      });
    }
    if (audio) {
      const volumeLabel = document.createElement("label");
      volumeLabel.textContent = "Shared audio volume ";
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
    button("Close", close);
    dialog.append(heading, video, controls);
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
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
