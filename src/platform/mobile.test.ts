// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createMobileAdapter } from "./mobile";

/**
 * The camera only works inside the app if the native grant is taken before the WebView asks for the
 * camera. These cover the outcomes the adapter has to distinguish.
 */
function setup(request: ((alias: string) => Promise<{ granted?: boolean; blocked?: boolean }>) | undefined, available = true) {
  return createMobileAdapter(() => ({
    platform: "capacitor",
    serverOrigin: "https://chat.example.com",
    permissions: request ? { available, request } : undefined,
  }));
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

test("a granted native permission lets the camera start", async () => {
  const request = vi.fn().mockResolvedValue({ granted: true, blocked: false });
  expect(await setup(request).requestPermission?.("camera")).toBe("granted");
  expect(request).toHaveBeenCalledWith("camera");
});

test("a refusal is denied, and a permanent refusal is blocked so the app can point at settings", async () => {
  expect(await setup(vi.fn().mockResolvedValue({ granted: false, blocked: false })).requestPermission?.("camera")).toBe("denied");
  expect(await setup(vi.fn().mockResolvedValue({ granted: false, blocked: true })).requestPermission?.("camera")).toBe("blocked");
});

test("a missing plugin or a thrown call leaves the browser's own prompt in charge", async () => {
  // No bridge at all: the WebView has nobody to ask, so the browser prompt is left in charge.
  expect(await setup(undefined).requestPermission?.("camera")).toBe("unavailable");
  // A bridge that exists but fails is a refusal, not an absence.
  expect(await setup(vi.fn().mockRejectedValue(new Error("no plugin"))).requestPermission?.("camera")).toBe("denied");
  // Likewise a bridge that reports itself unavailable.
  expect(await setup(vi.fn().mockResolvedValue({ granted: true }), false).requestPermission?.("camera")).toBe("unavailable");
});

test("the adapter only ever asks for the two capture permissions it declares", async () => {
  const request = vi.fn().mockResolvedValue({ granted: true });
  const adapter = setup(request);
  await adapter.requestPermission?.("microphone");
  await adapter.requestPermission?.("camera");
  expect(request.mock.calls.map((call) => call[0])).toEqual(["microphone", "camera"]);
});