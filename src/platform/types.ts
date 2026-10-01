export interface PlatformAdapter {
  readonly kind: "web" | "desktop";
  getVersions(): Promise<{
    clientVersion: string;
    desktopVersion?: string;
    serverVersion?: string;
  }>;
  getServerOrigin(): Promise<string>;
  getRealtimeUrl(): Promise<string>;
}
