// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  defaultVoiceVideoQuality,
  loadVoiceVideoQuality,
  normalizeVoiceVideoQuality,
  saveVoiceVideoQuality,
  voiceVideoQualities,
} from "./voice-video-quality";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    get length() { return values.size; },
  });
});
afterEach(() => vi.unstubAllGlobals());

test("a balanced default is chosen when nothing is stored", () => {
  expect(loadVoiceVideoQuality("user-1")).toEqual(defaultVoiceVideoQuality);
  expect(defaultVoiceVideoQuality.id).toBe("standard");
});

test("every preset names its cost, so the data use is visible before choosing", () => {
  for (const quality of voiceVideoQualities) {
    expect(quality.detail).toMatch(/\d+p · \d+ fps/);
    expect(quality.width).toBeGreaterThan(quality.height);
    expect(quality.frameRate).toBeGreaterThan(0);
  }
});

test("a saved choice is restored for that account only", () => {
  saveVoiceVideoQuality("user-1", voiceVideoQualities[0]);
  expect(loadVoiceVideoQuality("user-1").id).toBe("low");
  expect(loadVoiceVideoQuality("user-2")).toEqual(defaultVoiceVideoQuality);
});

test("an unknown or broken stored value falls back rather than throwing", () => {
  expect(normalizeVoiceVideoQuality("nonsense")).toEqual(defaultVoiceVideoQuality);
  expect(normalizeVoiceVideoQuality(undefined)).toEqual(defaultVoiceVideoQuality);
  vi.stubGlobal("localStorage", {
    getItem: () => "{broken",
    setItem: () => undefined,
    get length() { return 0; },
  });
  expect(loadVoiceVideoQuality("user-1")).toEqual(defaultVoiceVideoQuality);
});

test("saving normalises, so a crafted id cannot be persisted", () => {
  const saved = saveVoiceVideoQuality("user-1", { id: "bogus" } as never);
  expect(saved.id).toBe("standard");
});