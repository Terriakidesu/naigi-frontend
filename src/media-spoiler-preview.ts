export type SpoilerPreview = { src: string; width: number; height: number };

// Reduce detail before blurring. The only visible result is a small static PNG;
// no full-size CSS filters or animated spoiler images are left in the page.
export function renderSpoilerFrame(source: CanvasImageSource, width: number, height: number): SpoilerPreview {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("invalid_media_dimensions");
  const sample = document.createElement("canvas");
  sample.width = Math.max(1, Math.round(24 * width / Math.max(width, height)));
  sample.height = Math.max(1, Math.round(24 * height / Math.max(width, height)));
  const sampleContext = sample.getContext("2d");
  if (!sampleContext) throw new Error("spoiler_canvas_unavailable");
  sampleContext.drawImage(source, 0, 0, sample.width, sample.height);

  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(64 * width / Math.max(width, height)));
  output.height = Math.max(1, Math.round(64 * height / Math.max(width, height)));
  const context = output.getContext("2d");
  if (!context) throw new Error("spoiler_canvas_unavailable");
  context.fillStyle = "#08090b";
  context.fillRect(0, 0, output.width, output.height);
  context.filter = "blur(8px) brightness(0.5)";
  // Overscan the tiny sample to keep blur edges inside the generated image.
  context.drawImage(sample, -16, -16, output.width + 32, output.height + 32);
  return { src: output.toDataURL("image/png"), width, height };
}

export async function createSpoilerPreview(blob: Blob, video: boolean, signal: AbortSignal): Promise<SpoilerPreview> {
  signal.throwIfAborted();
  if (!video) {
    const bitmap = await createImageBitmap(blob);
    try {
      signal.throwIfAborted();
      return renderSpoilerFrame(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  }

  const player = document.createElement("video");
  const url = URL.createObjectURL(blob);
  player.muted = true;
  player.playsInline = true;
  player.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: unknown) => {
        clearTimeout(timer);
        player.removeEventListener("loadeddata", ready);
        player.removeEventListener("error", failed);
        signal.removeEventListener("abort", aborted);
        if (error) reject(error);
        else resolve();
      };
      const ready = () => finish();
      const failed = () => finish(new Error("spoiler_video_preview_unavailable"));
      const aborted = () => finish(signal.reason ?? new DOMException("Aborted", "AbortError"));
      const timer = setTimeout(failed, 10_000);
      player.addEventListener("loadeddata", ready);
      player.addEventListener("error", failed);
      signal.addEventListener("abort", aborted, { once: true });
      player.src = url;
      if (signal.aborted) aborted();
    });
    signal.throwIfAborted();
    return renderSpoilerFrame(player, player.videoWidth, player.videoHeight);
  } finally {
    player.pause();
    player.removeAttribute("src");
    player.load();
    URL.revokeObjectURL(url);
  }
}
