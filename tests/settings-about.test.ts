// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { setupAbout } from "../src/settings-about";
import type { PlatformAdapter } from "../src/platform/types";

beforeEach(() => {
  document.body.innerHTML = `<strong id="frontend-version"></strong><strong id="server-version"></strong>
    <span id="desktop-version-row" hidden><strong id="desktop-app-version"></strong></span>
    <details><pre data-license-path="/LICENSE"></pre></details>`;
});
afterEach(() => vi.unstubAllGlobals());

function adapter(kind: "web" | "desktop"): PlatformAdapter {
  return {
    kind,
    getVersions: vi.fn().mockResolvedValue({ clientVersion: "0.1.0", serverVersion: "0.24.0", desktopVersion: kind === "desktop" ? "0.2.2" : undefined }),
    getServerOrigin: vi.fn(),
    getRealtimeUrl: vi.fn(),
  };
}

test("web About distinguishes frontend/server and hides desktop version", async () => {
  await setupAbout(adapter("web"));
  expect(document.getElementById("frontend-version")!.textContent).toBe("0.1.0");
  expect(document.getElementById("server-version")!.textContent).toBe("0.24.0");
  expect(document.getElementById("desktop-version-row")!.hidden).toBe(true);
});
test("desktop About displays the shell version separately", async () => {
  await setupAbout(adapter("desktop"));
  expect(document.getElementById("desktop-version-row")!.hidden).toBe(false);
  expect(document.getElementById("desktop-app-version")!.textContent).toBe("0.2.2");
});
test("unavailable metadata does not break About", async () => {
  const api = adapter("desktop");
  vi.mocked(api.getVersions).mockRejectedValue(new Error("offline"));
  await setupAbout(api);
  expect(document.getElementById("server-version")!.textContent).toBe("Unavailable");
  expect(document.getElementById("frontend-version")!.textContent).not.toBe("");
});
test("license loads lazily, displays text safely, and retries failure", async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(new Response("MIT <script>not markup</script>"));
  vi.stubGlobal("fetch", request);
  await setupAbout(adapter("web"));
  expect(request).not.toHaveBeenCalled();
  const details = document.querySelector("details")!;
  details.open = true;
  await vi.waitFor(() => expect(document.querySelector("pre")!.textContent).toContain("Close and reopen to retry"));
  await new Promise<void>((resolve) => {
    details.addEventListener("toggle", () => resolve(), { once: true });
    details.open = false;
  });
  details.open = true;
  await vi.waitFor(() => expect(document.querySelector("pre")!.textContent).toBe("MIT <script>not markup</script>"));
  expect(document.querySelector("pre script")).toBeNull();
});
