// @vitest-environment jsdom
import { beforeEach, expect, test } from "vitest";
import { createMobileSheet, type SheetNodes } from "./mobile-sheets";

function render() {
  document.body.innerHTML = `
    <form id="composer">
      <div id="attachment-preview"><div id="attachment-preview-list"></div></div>
      <div id="emoji-picker" hidden><input id="emoji-picker-search"></div>
      <div id="gif-picker" hidden><input id="gif-picker-search"></div>
      <button id="emoji-toggle" type="button">emoji</button>
      <button id="gif-toggle" type="button">gif</button>
    </form>
    <div id="mobile-sheet" hidden>
      <div class="mobile-sheet-scrim"></div>
      <div id="mobile-sheet-tabs" hidden>
        <button id="mobile-sheet-tab-media" type="button"></button>
        <button id="mobile-sheet-tab-emoji" type="button"></button>
        <button id="mobile-sheet-tab-gif" type="button"></button>
      </div>
      <button id="mobile-sheet-close" type="button"></button>
      <div id="mobile-sheet-body" data-mode="media">
        <div class="mobile-sheet-sources">
          <button id="mobile-sheet-photos" type="button"><span>Photos</span></button>
          <button id="mobile-sheet-files" type="button"><span>Files</span></button>
        </div>
      </div>
    </div>`;
  const byId = <T extends HTMLElement>(id: string) => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`missing fixture element: ${id}`);
    return element as T;
  };
  document.getElementById("composer")!.classList.add("composer");
  return {
    sheet: byId<HTMLElement>("mobile-sheet"),
    body: byId<HTMLElement>("mobile-sheet-body"),
    tabs: byId<HTMLElement>("mobile-sheet-tabs"),
    tabButtons: { emoji: byId<HTMLButtonElement>("mobile-sheet-tab-emoji"), gif: byId<HTMLButtonElement>("mobile-sheet-tab-gif") },
    mediaTab: byId<HTMLButtonElement>("mobile-sheet-tab-media"),
    closeButton: byId<HTMLButtonElement>("mobile-sheet-close"),
    scrim: document.querySelector<HTMLElement>(".mobile-sheet-scrim")!,
    media: [byId<HTMLElement>("attachment-preview")],
    emojiPicker: byId<HTMLElement>("emoji-picker"),
    gifPicker: byId<HTMLElement>("gif-picker"),
    photoButton: byId<HTMLButtonElement>("mobile-sheet-photos"),
    filesButton: byId<HTMLButtonElement>("mobile-sheet-files"),
  } satisfies SheetNodes;
}

const click = (element: HTMLElement) => element.dispatchEvent(new MouseEvent("click", { bubbles: true }));

let nodes: SheetNodes;
beforeEach(() => { nodes = render(); });

test("the media sheet sits under the composer and offers Photos and Files", () => {
  const sheet = createMobileSheet(nodes);
  sheet.openMode("media");
  expect(nodes.sheet.hidden).toBe(false);
  expect(nodes.sheet.getAttribute("data-sheet-open")).toBe("true");
  expect(nodes.body.contains(nodes.media[0])).toBe(true);
  expect(nodes.media[0].querySelector("#attachment-preview-list")).not.toBeNull();
  expect(nodes.body.querySelector(".mobile-sheet-sources")).not.toBeNull();
  expect(nodes.photoButton.textContent).toContain("Photos");
  expect(nodes.filesButton.textContent).toContain("Files");
});

test("emoji and GIF share one panel with a tab for each", () => {
  const sheet = createMobileSheet(nodes);
  sheet.openMode("emoji");
  expect(nodes.body.contains(nodes.emojiPicker)).toBe(true);
  expect(nodes.emojiPicker.hidden).toBe(false);
  expect(nodes.gifPicker.hidden).toBe(true);
  expect(nodes.tabs.hidden).toBe(false);
  expect(nodes.tabButtons.emoji!.getAttribute("aria-selected")).toBe("true");
  expect(nodes.tabButtons.gif!.getAttribute("aria-selected")).toBe("false");

  click(nodes.tabButtons.gif!);
  expect(nodes.body.contains(nodes.gifPicker)).toBe(true);
  expect(nodes.gifPicker.hidden).toBe(false);
  expect(nodes.emojiPicker.hidden).toBe(true);
  expect(nodes.tabButtons.gif!.getAttribute("aria-selected")).toBe("true");
  expect(nodes.body.dataset.mode).toBe("gif");
});

test("only the active panel is shown so a stale picker cannot stay on screen", () => {
  const sheet = createMobileSheet(nodes);
  sheet.openMode("emoji");
  click(nodes.tabButtons.gif!);
  click(nodes.mediaTab!);
  expect(nodes.emojiPicker.hidden).toBe(true);
  expect(nodes.gifPicker.hidden).toBe(true);
  expect(nodes.tabButtons.emoji!.hidden).toBe(true);
  expect(sheet.mode()).toBe("media");
});

test("borrowed nodes return to the composer when the sheet closes", () => {
  const sheet = createMobileSheet(nodes);
  const composer = document.getElementById("composer")!;
  sheet.openMode("emoji");
  expect(nodes.body.contains(nodes.emojiPicker)).toBe(true);
  sheet.hide();
  expect(nodes.sheet.hidden).toBe(true);
  expect(nodes.sheet.hasAttribute("data-sheet-open")).toBe(false);
  expect(composer.contains(nodes.emojiPicker)).toBe(true);
  expect(composer.contains(nodes.media[0])).toBe(true);
  expect(composer.contains(nodes.gifPicker)).toBe(true);
});

test("close, scrim, and the active tab all dismiss the sheet", () => {
  const sheet = createMobileSheet(nodes);
  click(nodes.closeButton);
  expect(sheet.isOpen()).toBe(false);
  sheet.openMode("gif");
  click(nodes.scrim!);
  expect(sheet.isOpen()).toBe(false);
  sheet.openMode("media");
  click(nodes.mediaTab!);
  expect(sheet.isOpen()).toBe(false);
});

test("reopening the active tab closes the sheet instead of re-rendering", () => {
  const sheet = createMobileSheet(nodes);
  sheet.openMode("emoji");
  click(nodes.tabButtons.emoji!);
  expect(sheet.isOpen()).toBe(false);
  expect(document.getElementById("composer")!.contains(nodes.emojiPicker)).toBe(true);
});

test("opening one mode never duplicates a borrowed node", () => {
  const sheet = createMobileSheet(nodes);
  sheet.openMode("emoji");
  click(nodes.tabButtons.gif!);
  click(nodes.tabButtons.emoji!);
  expect(nodes.body.querySelectorAll("#emoji-picker")).toHaveLength(1);
  // Inactive panels are returned to the composer, never cloned.
  expect(nodes.body.querySelectorAll("#gif-picker")).toHaveLength(0);
  expect(nodes.body.querySelectorAll("#attachment-preview")).toHaveLength(0);
  expect(document.querySelectorAll("#emoji-picker")).toHaveLength(1);
  expect(document.querySelectorAll("#gif-picker")).toHaveLength(1);
  expect(document.querySelectorAll("#attachment-preview")).toHaveLength(1);
});

test("switching from media to emoji leaves only the emoji grid in the sheet", () => {
  const sheet = createMobileSheet(nodes);
  const composer = document.getElementById("composer")!;
  sheet.openMode("media");
  expect(nodes.body.contains(nodes.media[0])).toBe(true);
  click(nodes.tabButtons.emoji!);
  expect(nodes.body.contains(nodes.emojiPicker)).toBe(true);
  // The attachment grid must go back to the composer, not linger above the emoji grid.
  expect(composer.contains(nodes.media[0])).toBe(true);
  expect(nodes.body.querySelectorAll("#attachment-preview")).toHaveLength(0);
  expect(nodes.gifPicker.hidden).toBe(true);
  click(nodes.tabButtons.gif!);
  expect(composer.contains(nodes.emojiPicker)).toBe(true);
  expect(nodes.body.contains(nodes.gifPicker)).toBe(true);
  click(nodes.mediaTab!);
  expect(composer.contains(nodes.gifPicker)).toBe(true);
  expect(nodes.body.contains(nodes.media[0])).toBe(true);
  expect(nodes.emojiPicker.hidden).toBe(true);
  expect(nodes.gifPicker.hidden).toBe(true);
});

test("a hidden attachment list keeps the Photos and Files buttons reachable", () => {
  const sheet = createMobileSheet(nodes);
  nodes.media[0].hidden = true;
  sheet.openMode("media");
  expect(nodes.media[0].hidden).toBe(true);
  expect(nodes.photoButton.hidden).toBe(false);
  expect(nodes.filesButton.hidden).toBe(false);
});
