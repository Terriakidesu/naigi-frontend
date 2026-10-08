// @vitest-environment jsdom
import { expect, test } from "vitest";
import { appendMarkdown, parseInlineMarkdown, parseMarkdown } from "./markdown";

test("markdown parser keeps supported formatting as safe tokens", () => {
  expect(parseInlineMarkdown("**bold** *italic* ~~gone~~ `code` [site](https://example.com)")).toEqual([
    { kind: "strong", value: "bold" },
    { kind: "text", value: " " },
    { kind: "emphasis", value: "italic" },
    { kind: "text", value: " " },
    { kind: "strike", value: "gone" },
    { kind: "text", value: " " },
    { kind: "code", value: "code" },
    { kind: "text", value: " " },
    { kind: "link", label: "site", url: "https://example.com/" },
  ]);
});

test("markdown parser keeps adjacent custom emoji shortcodes intact", () => {
  expect(parseInlineMarkdown(":raora_laugh::raora_laugh:")).toEqual([
    { kind: "text", value: ":raora_laugh::raora_laugh:" },
  ]);
});

test("markdown parser does not allow unsafe links", () => {
  expect(parseInlineMarkdown("[bad](javascript:alert(1))")).toEqual([
    { kind: "text", value: "[bad](javascript:alert(1))" },
  ]);
});

test("markdown parser recognizes spoilers without exposing their contents as formatting", () => {
  expect(parseInlineMarkdown("before ||secret text|| after")).toEqual([
    { kind: "text", value: "before " },
    { kind: "spoiler", value: "secret text" },
    { kind: "text", value: " after" },
  ]);
});

test("markdown parser supports code, quotes, lists, and paragraphs", () => {
  expect(parseMarkdown("> quote\n\n- one\n- two\n\n```ts\nconst x = 1;\n```")).toEqual([
    { kind: "quote", value: ["quote"] },
    { kind: "unordered-list", value: ["one", "two"] },
    { kind: "code-block", value: "const x = 1;", language: "ts" },
  ]);
});

test("a message body is not wrapped unless its room spoils everything", () => {
  const parent = document.createElement("div");
  const body = appendMarkdown(parent, "hello");
  expect(parent.querySelector(".block-spoiler")).toBeNull();
  expect(parent.contains(body)).toBe(true);
});

test("a spoiler room wraps the whole body and reveals it on demand", () => {
  const parent = document.createElement("div");
  const body = appendMarkdown(parent, "the **ending**", { spoilerAll: true });
  const spoiler = parent.querySelector<HTMLElement>(".block-spoiler");
  expect(spoiler).not.toBeNull();
  // Nothing is removed from the document, so revealing is reversible and the text stays selectable.
  expect(spoiler!.contains(body)).toBe(true);
  expect(spoiler!.getAttribute("aria-expanded")).toBe("false");

  spoiler!.click();
  expect(spoiler!.classList.contains("revealed")).toBe(true);
  expect(spoiler!.getAttribute("aria-expanded")).toBe("true");

  spoiler!.click();
  expect(spoiler!.classList.contains("revealed")).toBe(false);
});

test("a spoiler room is operable by keyboard, like an inline spoiler", () => {
  const parent = document.createElement("div");
  appendMarkdown(parent, "hidden", { spoilerAll: true });
  const spoiler = parent.querySelector<HTMLElement>(".block-spoiler")!;
  expect(spoiler.getAttribute("role")).toBe("button");
  expect(spoiler.tabIndex).toBe(0);

  spoiler.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  expect(spoiler.classList.contains("revealed")).toBe(true);
  spoiler.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true }));
  expect(spoiler.classList.contains("revealed")).toBe(true);
});
