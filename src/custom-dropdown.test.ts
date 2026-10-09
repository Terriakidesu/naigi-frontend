// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { customDropdown } from "./custom-dropdown";

let dropdown: ReturnType<typeof customDropdown> | undefined;
afterEach(() => { dropdown?.destroy(); dropdown = undefined; document.body.replaceChildren(); });
function setup() {
  const select = document.createElement("select");
  select.id = "quality";
  select.setAttribute("aria-label", "Resolution");
  select.add(new Option("720p", "720"));
  select.add(new Option("1080p", "1080"));
  document.body.append(select);
  dropdown = customDropdown(select);
  const trigger = document.querySelector<HTMLButtonElement>(".custom-dropdown-trigger")!;
  return { select, trigger, menu: document.querySelector<HTMLElement>('[role="listbox"]')! };
}
test("the native picker is hidden and choosing a custom option updates the existing value/events", () => {
  const { select, trigger, menu } = setup();
  let changes = 0;
  select.addEventListener("change", () => changes++);
  expect(select.hidden).toBe(true);
  trigger.click();
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  menu.querySelectorAll<HTMLButtonElement>("button")[1].click();
  expect(select.value).toBe("1080");
  expect(changes).toBe(1);
  expect(trigger.textContent).toContain("1080p");
  expect(menu.hidden).toBe(true);
  expect(document.activeElement).toBe(trigger);
});
test("arrow keys navigate options and escape restores focus", () => {
  const { trigger, menu } = setup();
  trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  const options = menu.querySelectorAll("button");
  expect(document.activeElement).toBe(options[0]);
  options[0].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
  expect(document.activeElement).toBe(options[1]);
  options[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(menu.hidden).toBe(true);
  expect(document.activeElement).toBe(trigger);
});
test("dynamic camera options and programmatic preference loads are reflected", async () => {
  const { select, trigger, menu } = setup();
  select.add(new Option("Rear camera", "rear"));
  select.value = "rear";
  await Promise.resolve();
  expect(trigger.textContent).toContain("Rear camera");
  expect(menu.querySelectorAll("button")).toHaveLength(3);
  select.disabled = true;
  dropdown!.refresh();
  expect(trigger.disabled).toBe(true);
});
test("outside presses close the menu", () => {
  const { trigger, menu } = setup();
  trigger.click();
  document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  expect(menu.hidden).toBe(true);
});
