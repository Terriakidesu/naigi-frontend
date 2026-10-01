// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { devicePresentation, localDeviceId } from "./device-presentation";
import { iconElement } from "./icons";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    get length() { return values.size; },
  });
});
afterEach(() => vi.unstubAllGlobals());

test("desktop and web registrations have distinct labels and real SVG icons", () => {
  const desktop = devicePresentation("Naigi Desktop", false, "web");
  const web = devicePresentation("Web browser", false, "desktop");
  expect(desktop).toEqual({ title: "Naigi Desktop", icon: "app-window" });
  expect(web).toEqual({ title: "Web browser", icon: "globe" });
  expect(iconElement(desktop.icon).tagName.toLowerCase()).toBe("svg");
  expect(iconElement(web.icon).tagName.toLowerCase()).toBe("svg");
});

test("only this client's legacy entry can be identified locally", () => {
  expect(devicePresentation("web", true, "desktop").title).toBe("Naigi Desktop");
  expect(devicePresentation("web", true, "web").title).toBe("Web browser");
  expect(devicePresentation("web", false, "desktop").title).toBe("Unknown client (legacy)");
  expect(devicePresentation(null, false, "web").title).toBe("Unknown client (legacy)");
});

test("custom names are retained, not assumed to be desktop or web", () => {
  expect(devicePresentation("My phone", true, "web")).toEqual({ title: "My phone", icon: "monitor-smartphone" });
});

test("current device lookup is account scoped and never creates an identity", () => {
  localStorage.setItem("priv-chat.device.alice", "alice-device");
  localStorage.setItem("priv-chat.device.bob", "bob-device");
  expect(localDeviceId("alice")).toBe("alice-device");
  expect(localDeviceId("bob")).toBe("bob-device");
  expect(localDeviceId("charlie")).toBeNull();
  expect(localDeviceId(undefined)).toBeNull();
  expect(localStorage.length).toBe(2);
});
