export interface PlatformAdapter {
  readonly kind: "web" | "desktop" | "mobile";
  getVersions(): Promise<{
    clientVersion: string;
    appVersion?: string;
    desktopVersion?: string;
    serverVersion?: string;
  }>;
  getServerOrigin(): Promise<string>;
  getRealtimeUrl(): Promise<string>;
}
