// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { renderSettingsNavigation, resolveSettingsHash } from "../src/settings-navigation";

test("account gear opens Profile while the voice settings shortcut opens Audio", () => {
  document.documentElement.innerHTML = readFileSync("pages/chat.html", "utf8");
  expect(document.querySelector('a[aria-label="Settings"]')!.getAttribute("href")).toBe("/settings#profile");
  expect(document.querySelector("#voice-call-settings")!.getAttribute("href")).toBe("/settings#audio");
});

test("recovery details closes before local-data and About is a navigable view", () => {
  document.documentElement.innerHTML = readFileSync("pages/settings.html", "utf8");
  expect(document.querySelector("#local-data")!.closest("details")).toBeNull();
  expect(document.querySelector("#recovery .history-manual-backup #import-recovery-button")).not.toBeNull();
  const about = document.querySelector<HTMLAnchorElement>('[data-settings-tab][href="#about"]')!;
  expect(about.hidden).toBe(false);
  expect(document.querySelector("#about[data-settings-view]")).not.toBeNull();
  expect(document.querySelector<HTMLInputElement>("#recovery-local-passphrase")!.required).toBe(true);
});

test("the mobile composer sheet follows the composer and offers photos, files, emoji, and GIFs", () => {
  document.documentElement.innerHTML = readFileSync("pages/chat.html", "utf8");
  const composer = document.getElementById("composer")!;
  const sheet = document.getElementById("mobile-sheet")!;
  expect(sheet.hidden).toBe(true);
  expect(composer.nextElementSibling).toBe(sheet);
  expect(sheet.querySelector("#mobile-sheet-photos")!.textContent).toContain("Photos");
  expect(sheet.querySelector("#mobile-sheet-files")!.textContent).toContain("Files");
  for (const tab of ["media", "emoji", "gif"]) {
    const button = sheet.querySelector(`[data-mobile-sheet-mode="${tab}"], #mobile-sheet-tab-${tab}`)!;
    expect(button.getAttribute("role")).toBe("tab");
  }
  expect(sheet.querySelector("#mobile-sheet-tab-media")!.getAttribute("aria-selected")).toBe("true");
  // The sheet borrows existing nodes, so the composer keeps exactly one of each.
  for (const id of ["emoji-picker", "gif-picker", "attachment-preview"]) {
    expect(document.querySelectorAll(`#${id}`)).toHaveLength(1);
  }
  expect(document.querySelectorAll("#mobile-sheet")).toHaveLength(1);
});

test("conversation search belongs to right-hand actions and retains accessible controls", () => {
  document.documentElement.innerHTML = readFileSync("pages/chat.html", "utf8");
  expect(document.querySelector(".chat-actions #message-search-container")).not.toBeNull();
  expect(document.querySelector(".chat-header-main #message-search-container")).toBeNull();
  expect(document.querySelector("#message-search")!.getAttribute("aria-label")).toBe("Search this conversation");
  expect(document.querySelector("#message-search-close")!.getAttribute("aria-label")).toBe("Close search");
});

test("settings hash navigation selects About, preserves legacy hashes, and falls back safely", () => {
  document.documentElement.innerHTML = readFileSync("pages/settings.html", "utf8");
  expect(resolveSettingsHash(document, "#about")).toBe("#about");
  renderSettingsNavigation(document, "#about");
  expect(document.getElementById("about")!.hidden).toBe(false);
  expect(document.getElementById("profile")!.hidden).toBe(true);
  expect(document.getElementById("app-preferences-form")!.hidden).toBe(true);
  expect(document.getElementById("settings-page-title")!.textContent).toBe("About");
  expect(document.querySelector('[href="#about"]')!.getAttribute("aria-current")).toBe("location");
  expect(resolveSettingsHash(document, "#app")).toBe("#appearance");
  expect(resolveSettingsHash(document, "#unknown")).toBe("#profile");
  renderSettingsNavigation(document, "#appearance");
  expect(document.getElementById("app-preferences-form")!.hidden).toBe(false);
  expect(document.querySelector('[href="#about"]')!.hasAttribute("aria-current")).toBe(false);
});
