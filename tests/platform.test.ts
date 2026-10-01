import { describe, expect, test, vi } from "vitest";
import { createWebAdapter } from "../src/platform/web";
import { createDesktopAdapter, type DesktopBridge } from "../src/platform/desktop";

describe("web adapter", () => {
  test("uses same-origin HTTPS realtime and version API", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ name: "Naigi", version: "0.24.0" }));
    const adapter = createWebAdapter(() => "https://chat.test", request);
    expect(adapter.kind).toBe("web");
    expect(await adapter.getServerOrigin()).toBe("https://chat.test");
    expect(await adapter.getRealtimeUrl()).toBe("wss://chat.test/v1/realtime");
    expect(await adapter.getVersions()).toMatchObject({ serverVersion: "0.24.0" });
    expect(String(request.mock.calls[0][0])).toBe("https://chat.test/v1/version");
    expect(request.mock.calls[0][1]?.redirect).toBe("error");
  });
  test("supports HTTP development and missing server versions", async () => {
    const adapter = createWebAdapter(() => "http://localhost:3000", vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })));
    expect(await adapter.getRealtimeUrl()).toBe("ws://localhost:3000/v1/realtime");
    expect((await adapter.getVersions()).serverVersion).toBeUndefined();
  });
  test("handles network failures and invalid metadata", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json({ name: "other", version: "0.24.0" }));
    const adapter = createWebAdapter(() => "https://chat.test", request);
    expect((await adapter.getVersions()).serverVersion).toBeUndefined();
    expect((await adapter.getVersions()).serverVersion).toBeUndefined();
  });
});

describe("desktop adapter", () => {
  function bridge(): DesktopBridge {
    return {
      getInfo: vi.fn().mockResolvedValue({ appVersion: "0.2.2", serverVersion: "0.24.0", serverOrigin: "https://chat.test" }),
      getRealtimeUrl: vi.fn().mockResolvedValue("ws://127.0.0.1:43123/v1/realtime?ticket=opaque"),
    };
  }
  test("uses only the narrow bridge and preserves the loopback realtime ticket", async () => {
    const api = bridge();
    const adapter = createDesktopAdapter(() => api);
    expect(adapter.kind).toBe("desktop");
    expect(await adapter.getServerOrigin()).toBe("https://chat.test");
    expect(await adapter.getVersions()).toMatchObject({ desktopVersion: "0.2.2", serverVersion: "0.24.0" });
    expect(await adapter.getRealtimeUrl()).toBe("ws://127.0.0.1:43123/v1/realtime?ticket=opaque");
    expect(Object.keys(adapter).sort()).toEqual(["getRealtimeUrl", "getServerOrigin", "getVersions", "kind"]);
  });
  test("does not fall back to a local page origin when the bridge fails", async () => {
    const adapter = createDesktopAdapter(() => { throw new Error("bridge unavailable"); });
    await expect(adapter.getServerOrigin()).rejects.toThrow("bridge unavailable");
    await expect(adapter.getRealtimeUrl()).rejects.toThrow("bridge unavailable");
  });
  test("rejects credentials, non-origins, and insecure remote realtime", async () => {
    const api = bridge();
    const adapter = createDesktopAdapter(() => api);
    vi.mocked(api.getInfo).mockResolvedValue({ appVersion: "0.2.2", serverVersion: null, serverOrigin: "https://chat.test/path" });
    await expect(adapter.getServerOrigin()).rejects.toThrow("Invalid desktop server origin");
    vi.mocked(api.getRealtimeUrl).mockResolvedValue("ws://remote.test/v1/realtime");
    await expect(adapter.getRealtimeUrl()).rejects.toThrow("Invalid desktop realtime URL");
    vi.mocked(api.getRealtimeUrl).mockResolvedValue("wss://user:password@remote.test/v1/realtime");
    await expect(adapter.getRealtimeUrl()).rejects.toThrow("Invalid desktop realtime URL");
    vi.mocked(api.getRealtimeUrl).mockResolvedValue("wss://remote.test/v1/realtime");
    expect(await adapter.getRealtimeUrl()).toBe("wss://remote.test/v1/realtime");
  });
});
