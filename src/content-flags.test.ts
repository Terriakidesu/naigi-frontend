// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { needsNsfwConfirmation, nsfwConfirmedChannelIds, rememberNsfwConfirmation } from "./content-flags";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    get length() { return values.size; },
  });
});
afterEach(() => vi.unstubAllGlobals());

test("an unmarked room never asks", () => {
  expect(needsNsfwConfirmation({ id: "a" }, new Set())).toBe(false);
  expect(needsNsfwConfirmation({ id: "a", nsfw: false }, new Set())).toBe(false);
});

test("a server that does not send the flag at all is treated as unmarked", () => {
  // An older server omits the field entirely; the room must not be gated on a guess.
  expect(needsNsfwConfirmation({ id: "a", kind: "text" }, new Set())).toBe(false);
  expect(needsNsfwConfirmation(undefined, new Set())).toBe(false);
});

test("a marked text room blocks until the user continues", () => {
  expect(needsNsfwConfirmation({ id: "a", kind: "text", nsfw: true }, new Set())).toBe(true);
});

test("a marked room stops asking once it has been confirmed on this device", () => {
  rememberNsfwConfirmation("user-1", "room-9");
  const confirmed = nsfwConfirmedChannelIds("user-1");
  expect(needsNsfwConfirmation({ id: "room-9", kind: "text", nsfw: true }, confirmed)).toBe(false);
  // Confirming one room says nothing about any other.
  expect(needsNsfwConfirmation({ id: "room-10", kind: "text", nsfw: true }, confirmed)).toBe(true);
});

test("a marked voice room is not blocked: it holds no message content", () => {
  expect(needsNsfwConfirmation({ id: "a", kind: "voice", nsfw: true }, new Set())).toBe(false);
});

test("confirmations are kept per account, so one person never inherits another's", () => {
  rememberNsfwConfirmation("user-1", "room-9");
  expect(nsfwConfirmedChannelIds("user-2")).toEqual(new Set());
  expect(nsfwConfirmedChannelIds(undefined)).toEqual(new Set());
});

test("a broken or tampered store is treated as no confirmations rather than failing the room", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => "{not json",
    setItem: () => undefined,
    get length() { return 0; },
  });
  expect(nsfwConfirmedChannelIds("user-1")).toEqual(new Set());
  vi.stubGlobal("localStorage", {
    getItem: () => JSON.stringify(["room-9", 42, null, ""]),
    setItem: () => undefined,
    get length() { return 0; },
  });
  expect(nsfwConfirmedChannelIds("user-1")).toEqual(new Set(["room-9"]));
});

test("confirming the same room twice does not duplicate it", () => {
  rememberNsfwConfirmation("user-1", "room-9");
  rememberNsfwConfirmation("user-1", "room-9");
  expect([...nsfwConfirmedChannelIds("user-1")]).toEqual(["room-9"]);
});