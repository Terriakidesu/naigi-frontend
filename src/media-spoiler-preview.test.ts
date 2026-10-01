// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { createSpoilerPreview, renderSpoilerFrame } from "./media-spoiler-preview";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mockCanvas() {
  const contexts: Array<{ drawImage: ReturnType<typeof vi.fn>; fillRect: ReturnType<typeof vi.fn>; filter: string; fillStyle: string }> = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    const context = { drawImage: vi.fn(), fillRect: vi.fn(), filter: "none", fillStyle: "" };
    contexts.push(context);
    return context as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AA==");
  return contexts;
}

test("full-size media is sampled at 24px and blurred only on a 64px output", () => {
  const contexts = mockCanvas();
  const source = document.createElement("img");
  const preview = renderSpoilerFrame(source, 4000, 2000);
  expect(contexts[0].drawImage).toHaveBeenCalledWith(source, 0, 0, 24, 12);
  expect(contexts[1].fillRect).toHaveBeenCalledWith(0, 0, 64, 32);
  expect(contexts[1].filter).toBe("blur(8px) brightness(0.5)");
  expect(preview).toEqual({ src: "data:image/png;base64,AA==", width: 4000, height: 2000 });
});

test("image decoding resources are released after thumbnail generation", async () => {
  mockCanvas();
  const bitmap = { width: 650, height: 650, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  await createSpoilerPreview(new Blob(), false, new AbortController().signal);
  expect(bitmap.close).toHaveBeenCalledOnce();
});

test("cancellation releases a decoded bitmap without rendering a preview", async () => {
  const controller = new AbortController();
  const bitmap = { width: 650, height: 650, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn().mockImplementation(async () => { controller.abort(); return bitmap; }));
  await expect(createSpoilerPreview(new Blob(), false, controller.signal)).rejects.toThrow();
  expect(bitmap.close).toHaveBeenCalledOnce();
});

test("invalid dimensions cannot allocate a thumbnail canvas", () => {
  for (const size of [0, -1, NaN, Infinity]) expect(() => renderSpoilerFrame(document.createElement("img"), size, 100)).toThrow("invalid_media_dimensions");
});

test("unsupported canvas fails closed instead of returning clear source media", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  expect(() => renderSpoilerFrame(document.createElement("img"), 100, 100)).toThrow("spoiler_canvas_unavailable");
});
