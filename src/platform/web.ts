import type { PlatformAdapter } from "./types";
import { clientVersion } from "./version";

export function createWebAdapter(
  origin: () => string = () => window.location.origin,
  request: typeof fetch = (...args) => fetch(...args),
): PlatformAdapter {
  return {
    kind: "web",
    async getVersions() {
      let serverVersion: string | undefined;
      try {
        const response = await request(new URL("/v1/version", origin()), {
          headers: { accept: "application/json" },
          redirect: "error",
          signal: AbortSignal.timeout(6000),
        });
        if (response.ok) {
          const data = await response.json();
          if (data?.name === "Naigi" && typeof data.version === "string"
            && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(data.version)) serverVersion = data.version;
        }
      } catch { /* Older or unreachable servers need not prevent About from opening. */ }
      return { clientVersion, serverVersion };
    },
    async getServerOrigin() { return origin(); },
    async getRealtimeUrl() {
      const url = new URL("/v1/realtime", origin());
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      return url.href;
    },
  };
}

export const platform = createWebAdapter();
