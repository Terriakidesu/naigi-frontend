import { platform } from "#platform";
import type { PlatformAdapter } from "./platform/types";
import { clientVersion } from "./platform/version";

export async function setupAbout(adapter: PlatformAdapter = platform, root: Document = document) {
  const frontend = root.getElementById("frontend-version");
  const server = root.getElementById("server-version");
  const desktop = root.getElementById("desktop-app-version");
  const desktopRow = root.getElementById("desktop-version-row");
  if (!frontend || !server || !desktop || !desktopRow) return;
  frontend.textContent = clientVersion;
  desktopRow.hidden = adapter.kind !== "desktop";
  try {
    const versions = await adapter.getVersions();
    frontend.textContent = versions.clientVersion;
    server.textContent = versions.serverVersion ?? "Unavailable";
    desktop.textContent = versions.desktopVersion ?? "Unavailable";
  } catch {
    server.textContent = "Unavailable";
    desktop.textContent = "Unavailable";
  }
  for (const notice of root.querySelectorAll<HTMLElement>("[data-license-path]")) {
    const details = notice.closest("details");
    let loaded = false;
    details?.addEventListener("toggle", () => {
      if (!details.open || loaded) return;
      loaded = true;
      void fetch(notice.dataset.licensePath!).then(async (response) => {
        if (!response.ok) throw new Error("license_unavailable");
        notice.textContent = await response.text();
      }).catch(() => {
        notice.textContent = "Could not load this license notice. Close and reopen to retry.";
        loaded = false;
      });
    });
  }
}
