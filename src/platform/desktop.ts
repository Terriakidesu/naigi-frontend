import type { PlatformAdapter } from "./types";
import { clientVersion } from "./version";

export type DesktopInfo = {
  appVersion: string;
  serverVersion: string | null;
  serverOrigin: string;
  customTitleBar?: boolean;
};

export type DesktopBridge = {
  getInfo(): Promise<DesktopInfo>;
  getRealtimeUrl(): Promise<string>;
};

declare global {
  interface Window { naigiDesktop?: DesktopBridge }
}

export function desktopBridge(): DesktopBridge {
  const bridge = window.naigiDesktop;
  if (!bridge) throw new Error("Desktop bridge unavailable. Open this page in the Naigi desktop app.");
  return bridge;
}

export function createDesktopAdapter(bridge: () => DesktopBridge = desktopBridge): PlatformAdapter {
  return {
    kind: "desktop",
    async getVersions() {
      const info = await bridge().getInfo();
      return { clientVersion, desktopVersion: info.appVersion, serverVersion: info.serverVersion ?? undefined };
    },
    async getServerOrigin() {
      const info = await bridge().getInfo();
      const url = new URL(info.serverOrigin);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password
        || url.origin !== info.serverOrigin) throw new Error("Invalid desktop server origin.");
      return url.origin;
    },
    async getRealtimeUrl() {
      const value = await bridge().getRealtimeUrl();
      const url = new URL(value);
      const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
      if (url.username || url.password || (url.protocol !== "wss:" && !(url.protocol === "ws:" && loopback))) {
        throw new Error("Invalid desktop realtime URL.");
      }
      return url.href;
    },
  };
}

export const platform = createDesktopAdapter();
