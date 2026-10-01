export type DeviceClient = "web" | "desktop";

export function devicePresentation(name: string | null | undefined, current: boolean, client: DeviceClient) {
  const legacy = !name || name === "web";
  const desktop = name === "Naigi Desktop" || (legacy && current && client === "desktop");
  const web = name === "Web browser" || (legacy && current && client === "web");
  return {
    title: desktop ? "Naigi Desktop" : web ? "Web browser" : legacy ? "Unknown client (legacy)" : name!,
    icon: desktop ? "app-window" : web ? "globe" : "monitor-smartphone",
  };
}

export function localDeviceId(userId: string | undefined) {
  if (!userId) return null;
  try {
    return localStorage.getItem(`priv-chat.device.${userId}`);
  } catch {
    return null;
  }
}
