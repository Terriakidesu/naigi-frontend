// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from "vitest";
import { setupRecoveryUnlock } from "../src/recovery-unlock";

beforeEach(() => {
  document.body.innerHTML = `<form id="recovery-unlock-form">
    <input id="recovery-local-passphrase" type="password" required>
    <button id="recovery-unlock-button" type="submit">Unlock recovery</button>
    <p id="recovery-unlock-status" role="status"></p>
  </form>`;
});
const input = () => document.getElementById("recovery-local-passphrase") as HTMLInputElement;
const button = () => document.getElementById("recovery-unlock-button") as HTMLButtonElement;
const status = () => document.getElementById("recovery-unlock-status")!;

test("shows success, clears the secret field, and reuses the unlocked client", async () => {
  input().value = "private passphrase";
  const client = {};
  const open = vi.fn().mockResolvedValue(client);
  const controller = setupRecoveryUnlock(open);
  expect(await controller.unlock()).toBe(client);
  expect(input().value).toBe("");
  expect(input().disabled).toBe(true);
  expect(button().disabled).toBe(true);
  expect(status().textContent).toContain("Unlocked for this settings session");
  expect(await controller.unlock()).toBe(client);
  expect(open).toHaveBeenCalledTimes(1);
});

test("shows failure and permits another attempt", async () => {
  const open = vi.fn().mockRejectedValueOnce(new Error("Wrong passphrase")).mockResolvedValueOnce({});
  const controller = setupRecoveryUnlock(open);
  await expect(controller.unlock()).rejects.toThrow("Wrong passphrase");
  expect(status().textContent).toBe("Wrong passphrase");
  expect(status().classList.contains("error")).toBe(true);
  expect(button().disabled).toBe(false);
  await controller.unlock();
  expect(status().classList.contains("error")).toBe(false);
});

test("deduplicates concurrent form and recovery-action attempts", async () => {
  let finish!: (value: object) => void;
  const open = vi.fn(() => new Promise<object>((resolve) => { finish = resolve; }));
  const controller = setupRecoveryUnlock(open);
  const first = controller.unlock();
  const second = controller.unlock();
  expect(first).toBe(second);
  document.getElementById("recovery-unlock-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
  await Promise.resolve();
  expect(open).toHaveBeenCalledTimes(1);
  expect(button().disabled).toBe(true);
  expect(button().textContent).toBe("Unlocking…");
  const client = {};
  finish(client);
  expect(await first).toBe(client);
  expect(await second).toBe(client);
});

test("handles native form submission, the path used by Enter", async () => {
  input().value = "passphrase";
  const open = vi.fn().mockResolvedValue({});
  const controller = setupRecoveryUnlock(open);
  const event = new Event("submit", { bubbles: true, cancelable: true });
  document.getElementById("recovery-unlock-form")!.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  await controller.unlock();
  expect(open).toHaveBeenCalledTimes(1);
});

test("reset waits for initialization and permits unlocking after local-data clear", async () => {
  let finish!: (value: object) => void;
  const open = vi.fn(() => new Promise<object>((resolve) => { finish = resolve; }));
  const controller = setupRecoveryUnlock(open);
  const pending = controller.unlock();
  const resetting = controller.reset();
  await Promise.resolve();
  finish({});
  await pending;
  await resetting;
  expect(input().disabled).toBe(false);
  expect(button().disabled).toBe(false);
  expect(status().textContent).toContain("Locked.");
  open.mockResolvedValueOnce({});
  await controller.unlock();
  expect(open).toHaveBeenCalledTimes(2);
});
