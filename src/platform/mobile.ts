import type { PermissionOutcome, PlatformAdapter } from "./types";
import { clientVersion } from "./version";

export type MobileBuild = { app?: string; frontend?: string } | null;

export type MobilePermissionResult = { granted?: boolean; blocked?: boolean };

export type MobileBridge = {
  platform?: string;
  build?: MobileBuild;
  /** Server the user selected; the app shell owns the picker and stores it. */
  serverOrigin?: string;
  permissions?: {
    available?: boolean;
    request(alias: string): Promise<MobilePermissionResult>;
  };
};

declare global {
  interface Window { naigiMobile?: MobileBridge }
}

export function mobileBridge(): MobileBridge {
  const bridge = window.naigiMobile;
  if (!bridge) throw new Error("Native bridge unavailable. Open this page in the Naigi mobile app.");
  return bridge;
}

/** Only HTTPS servers are accepted; cleartext traffic is disabled on Android. */
export function normalizeServerOrigin(value: string | undefined) {
  if (!value) throw new Error("No Naigi server selected. Choose a server in the app first.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.origin !== url.href.replace(/\/$/, "")) {
    throw new Error("Invalid Naigi server origin.");
  }
  return url.origin;
}

export function createMobileAdapter(bridge: () => MobileBridge = mobileBridge): PlatformAdapter {
  return {
    kind: "mobile",
    async getVersions() {
      const info = bridge();
      const appVersion = info.build?.app;
      let serverVersion: string | undefined;
      try {
        const response = await fetch(new URL("/v1/version", normalizeServerOrigin(info.serverOrigin)), {
          headers: { accept: "application/json" },
          redirect: "error",
          signal: AbortSignal.timeout(6000),
        });
        if (response.ok) {
          const data = await response.json();
          if (data?.name === "Naigi" && typeof data.version === "string"
            && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(data.version)) serverVersion = data.version;
        }
      } catch { /* An unconfigured or unreachable server must not block the About view. */ }
      return { clientVersion, appVersion, serverVersion };
    },
    async getServerOrigin() {
      return normalizeServerOrigin(bridge().serverOrigin);
    },
    async getRealtimeUrl() {
      const url = new URL("/v1/realtime", normalizeServerOrigin(bridge().serverOrigin));
      url.protocol = "wss:";
      return url.href;
    },
    /**
     * The WebView will not open a camera the app itself has not been granted, so the native permission
     * has to come first. Requesting it here is what makes the camera work inside the app at all.
     */
    async requestPermission(name: "camera" | "microphone") {
      const permissions = bridge().permissions;
      if (!permissions?.available) return "unavailable";
      try {
        const result = await permissions.request(name);
        if (result.granted === true) return "granted";
        // Blocked means the user chose "don't ask again", which needs system settings, not a retry.
        return result.blocked === true ? "blocked" : "denied";
      } catch {
        return "denied";
      }
    },
  };
}

export const platform = createMobileAdapter();
