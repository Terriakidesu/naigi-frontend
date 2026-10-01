// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { confirmVoiceDeviceSwitch } from "../src/ui-dialog";

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  } });
});
afterEach(() => {
  document.body.replaceChildren();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  vi.restoreAllMocks();
});

test("the transfer modal explains disconnection and defaults focus to cancel", async () => {
  const result = confirmVoiceDeviceSwitch();
  const dialog = document.querySelector("dialog")!;
  expect(dialog.open).toBe(true);
  expect(dialog.textContent).toContain("disconnect that device");
  expect(dialog.getAttribute("aria-labelledby")).toBe(dialog.querySelector("h2")!.id);
  expect(document.activeElement?.textContent).toBe("Stay on other device");
  dialog.querySelector("button")!.click();
  await expect(result).resolves.toBe(false);
  expect(document.querySelector("dialog")).toBeNull();
});

test("only the switch button approves a transfer", async () => {
  const result = confirmVoiceDeviceSwitch();
  document.querySelectorAll<HTMLButtonElement>("dialog button")[1]!.click();
  await expect(result).resolves.toBe(true);
});

test("dismissing the modal does not approve a transfer", async () => {
  const result = confirmVoiceDeviceSwitch();
  document.querySelector("dialog")!.close();
  await expect(result).resolves.toBe(false);
});
