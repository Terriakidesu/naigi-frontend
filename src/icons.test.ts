// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { iconElement, renderIcons } from "./icons";

afterEach(() => document.body.replaceChildren());

describe("UI icons", () => {
  test("dynamic icons are SVGs immediately, even before insertion", () => {
    for (const name of ["x", "check", "external-link", "grip-vertical", "play", "sparkles", "more-horizontal", "settings-2", "volume-2"]) {
      const icon = iconElement(name, "test-icon");
      expect(icon.namespaceURI).toBe("http://www.w3.org/2000/svg");
      expect(icon.tagName).toBe("svg");
      expect(icon.children.length).toBeGreaterThan(0);
      expect(icon.textContent).toBe("");
      expect(icon.classList.contains("lucide")).toBe(true);
      expect(icon.classList.contains("test-icon")).toBe(true);
      expect(icon.getAttribute("aria-hidden")).toBe("true");
      expect(icon.getAttribute("focusable")).toBe("false");
    }
  });

  test("static placeholders render without changing existing dynamic SVGs", () => {
    document.body.innerHTML = '<button aria-label="Close"><i data-lucide="x" aria-hidden="true"></i></button>';
    const icon = iconElement("check");
    document.body.append(icon);
    renderIcons();
    expect(document.querySelector("button svg.lucide-x")).not.toBeNull();
    expect(document.querySelector("i[data-lucide]")).toBeNull();
    expect(document.body.lastElementChild).toBe(icon);
  });

  test("unknown icons fail explicitly", () => {
    expect(() => iconElement("missing-icon")).toThrow("Unknown icon: missing-icon");
  });
});
