export type PermissionOutcome = "granted" | "denied" | "blocked" | "unavailable";

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
  /**
   * Asks the platform for a device permission, in context, at the moment the feature needs it.
   *
   * A platform with no native permission bridge answers `unavailable`, which leaves the browser's own
   * prompt in charge — so callers only have to handle the outcomes a real bridge can produce.
   */
  requestPermission?(name: "camera" | "microphone"): Promise<PermissionOutcome>;
}
