// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { enableVideoViewer } from "./voice-video-viewer";

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true,
    value: function (this: HTMLDialogElement) { this.open = true; } });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

test("tap opens a muted focused view, and releasing the source closes it", () => {
  const video = document.createElement("video");
  document.body.append(video);
  const release = enableVideoViewer(video, "Your screen");
  video.click();
  const dialog = document.querySelector("dialog")!;
  expect(dialog.open).toBe(true);
  expect(dialog.querySelector("video")!.muted).toBe(true);
  expect(dialog.getAttribute("aria-label")).toBe("Your screen");
  release();
  expect(document.querySelector("dialog")).toBeNull();
  video.click();
  expect(document.querySelector("dialog")).toBeNull();
});

test("keyboard expansion, fit/fill and escape keep the original stream intact", () => {
  const video = document.createElement("video");
  document.body.append(video);
  const release = enableVideoViewer(video, "Camera");
  video.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  const dialog = document.querySelector("dialog")!;
  const fit = [...dialog.querySelectorAll("button")].find((button) => button.textContent === "Fill view")!;
  fit.click();
  expect(dialog.querySelector("video")!.style.objectFit).toBe("cover");
  fit.click();
  expect(dialog.querySelector("video")!.style.objectFit).toBe("contain");
  dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
  expect(document.querySelector("dialog")).toBeNull();
  expect(video.isConnected).toBe(true);
  release();
});

test("share volume is delegated to the room audio path", () => {
  const video = document.createElement("video");
  const setVolume = vi.fn();
  const release = enableVideoViewer(video, "Screen", { getVolume: () => 0.5, setVolume });
  video.click();
  const volume = document.querySelector<HTMLInputElement>("input[type=range]")!;
  expect(volume.value).toBe("50");
  volume.value = "0";
  volume.dispatchEvent(new Event("input"));
  expect(setVolume).toHaveBeenCalledWith(0);
  release();
});

test("participant names resolve when opening, and portrait cameras get a narrower viewer", () => {
  const video = document.createElement("video");
  Object.defineProperty(video, "videoWidth", { value: 720 });
  Object.defineProperty(video, "videoHeight", { value: 1280 });
  let name = "Participant";
  const release = enableVideoViewer(video, () => name);
  name = "2nd";
  video.click();
  const dialog = document.querySelector<HTMLDialogElement>("dialog")!;
  expect(dialog.querySelector("strong")!.textContent).toBe("2nd");
  expect(dialog.dataset.portrait).toBe("true");
  expect(dialog.querySelector('.voice-video-viewer-close')!.getAttribute("aria-label")).toBe("Close viewer");
  expect(dialog.textContent).not.toContain("undefined");
  release();
});

test("screen sharing stays widescreen even for tall content", () => {
  const video = document.createElement("video");
  Object.defineProperty(video, "videoWidth", { value: 720 });
  Object.defineProperty(video, "videoHeight", { value: 1280 });
  const release = enableVideoViewer(video, "2nd", undefined, "screen");
  video.click();
  expect(document.querySelector<HTMLDialogElement>("dialog")!.dataset.portrait).toBe("false");
  expect(document.querySelector(".voice-video-viewer-identity")!.textContent).toContain("Screen share");
  release();
});
