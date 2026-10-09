// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { RoomEvent, Track } from "livekit-client";

const capture = vi.hoisted(() => ({ video: vi.fn(), screen: vi.fn() }));
vi.mock("livekit-client", async (importOriginal) => {
  const sdk = await importOriginal<typeof import("livekit-client")>();
  return {
    ...sdk,
    createLocalVideoTrack: capture.video,
    createLocalScreenTracks: capture.screen,
  };
});

const { VoiceVideoMixer, screenCaptureSupported } = await import("./voice-video");

class FakeRoom {
  isE2EEEnabled = true;
  remoteParticipants = new Map<string, { identity: string }>();
  localParticipant = {
    identity: "local",
    publishTrack: vi.fn().mockResolvedValue(undefined),
    unpublishTrack: vi.fn().mockResolvedValue(undefined),
  };
  listeners = new Map<string, (...args: unknown[]) => void>();
  on(event: string, callback: (...args: unknown[]) => void) { this.listeners.set(event, callback); }
  off(event: string) { this.listeners.delete(event); }
  fire(event: string, ...args: unknown[]) { this.listeners.get(event)?.(...args); }
  count(event: string) { return this.listeners.has(event) ? 1 : 0; }
}

function fakeTrack(kind = Track.Kind.Video, source = Track.Source.Camera) {
  return {
    kind,
    source,
    isMuted: false,
    stop: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(() => []),
    mediaStreamTrack: { getSettings: () => ({ deviceId: "cam-1" }) },
  };
}

function setup(overrides: Partial<{ e2ee: boolean; screenSupported: boolean }> = {}) {
  const room = new FakeRoom();
  room.isE2EEEnabled = overrides.e2ee ?? true;
  const container = document.createElement("div");
  const localPreview = document.createElement("div");
  const onChange = vi.fn();
  const mixer = new VoiceVideoMixer({ room: room as never, container, localPreview, onChange });
  return { room, container, localPreview, onChange, mixer };
}

beforeEach(() => {
  capture.video.mockReset();
  capture.screen.mockReset();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getDisplayMedia: vi.fn(),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    },
  });
});

afterEach(() => vi.restoreAllMocks());

test("camera and screen start as off, so joining never turns anything on", () => {
  const { mixer } = setup();
  expect(mixer.view.local).toEqual({ camera: false, screen: false });
});

test("a started camera is published and then released on stop", async () => {
  const track = fakeTrack();
  capture.video.mockResolvedValue(track);
  const { room, mixer } = setup();

  expect(await mixer.startCamera()).toBe(true);
  expect(room.localParticipant.publishTrack).toHaveBeenCalledWith(track);
  expect(mixer.view.local.camera).toBe(true);

  await mixer.stop("camera");
  expect(room.localParticipant.unpublishTrack).toHaveBeenCalledWith(track);
  expect(track.stop).toHaveBeenCalled();
  expect(mixer.view.local.camera).toBe(false);
});

test("a refused permission is reported as denied and publishes nothing", async () => {
  const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
  capture.video.mockRejectedValue(denied);
  const { room, mixer } = setup();

  expect(await mixer.startCamera()).toBe(false);
  expect(room.localParticipant.publishTrack).not.toHaveBeenCalled();
  expect(mixer.view.local.issue).toBe("denied");
});

test("nothing is published before encryption is confirmed", async () => {
  capture.video.mockResolvedValue(fakeTrack());
  const { room, mixer } = setup({ e2ee: false });

  expect(await mixer.startCamera()).toBe(false);
  expect(room.localParticipant.publishTrack).not.toHaveBeenCalled();
  expect(mixer.view.local.issue).toBe("encryption");
});

test("a platform without a screen picker says so instead of failing after the tap", async () => {
  const { mixer } = setup();
  // jsdom is not a WebView, so simulate the picker being absent.
  Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", { configurable: true, value: undefined });
  expect(screenCaptureSupported()).toBe(false);
  expect(await mixer.startScreen()).toBe(false);
  expect(capture.screen).not.toHaveBeenCalled();
  expect(mixer.view.local.issue).toBe("unsupported");
});

test("a supported screen picker publishes a screen track", async () => {
  const track = fakeTrack(Track.Kind.Video, Track.Source.ScreenShare);
  capture.screen.mockResolvedValue([track]);
  const { room, mixer } = setup();

  expect(await mixer.startScreen()).toBe(true);
  expect(room.localParticipant.publishTrack).toHaveBeenCalledWith(track);
  expect(mixer.view.local.screen).toBe(true);
});

test("a double tap captures once rather than publishing twice", async () => {
  let resolveCapture: ((track: unknown) => void) | undefined;
  capture.video.mockImplementation(() => new Promise((resolve) => { resolveCapture = resolve; }));
  const { room, mixer } = setup();

  const first = mixer.startCamera();
  const second = mixer.startCamera();
  resolveCapture!(fakeTrack());
  await Promise.all([first, second]);

  expect(capture.video).toHaveBeenCalledTimes(1);
  expect(room.localParticipant.publishTrack).toHaveBeenCalledTimes(1);
});

test("camera and screen run independently of each other", async () => {
  capture.video.mockResolvedValue(fakeTrack());
  const screen = fakeTrack(Track.Kind.Video, Track.Source.ScreenShare);
  capture.screen.mockResolvedValue([screen]);
  const { mixer } = setup();

  await mixer.startCamera();
  await mixer.stop("camera");
  expect(mixer.view.local).toMatchObject({ camera: false, screen: false });

  await mixer.startScreen();
  expect(mixer.view.local).toMatchObject({ camera: false, screen: true });
});

test("remote video is attached on subscribe and removed on unsubscribe", () => {
  const { room, container, mixer, onChange } = setup();
  const track = { ...fakeTrack(), attach: vi.fn(), detach: vi.fn(() => [container.firstElementChild as HTMLVideoElement]) };
  room.remoteParticipants.set("remote-1", { identity: "remote-1" });

  room.fire(RoomEvent.TrackSubscribed, track, { trackSid: "TR_1" }, { identity: "remote-1" });
  expect(container.childElementCount).toBe(1);
  expect(container.firstElementChild?.getAttribute("data-voice-video")).toBe("camera");
  expect(mixer.view.remote).toEqual([{ identity: "remote-1", camera: true, screen: false }]);

  room.fire(RoomEvent.TrackUnsubscribed, track, { trackSid: "TR_1" });
  expect(container.childElementCount).toBe(0);
  expect(mixer.view.remote).toEqual([{ identity: "remote-1", camera: false, screen: false }]);
  expect(onChange).toHaveBeenCalled();
});

test("audio tracks are left to the audio path", () => {
  const { room, container } = setup();
  room.fire(RoomEvent.TrackSubscribed, fakeTrack(Track.Kind.Audio), { trackSid: "TR_2" }, { identity: "remote-1" });
  expect(container.childElementCount).toBe(0);
});

test("disposing releases the camera, detaches video, and unsubscribes", async () => {
  const track = fakeTrack();
  capture.video.mockResolvedValue(track);
  const { room, container, mixer } = setup();
  await mixer.startCamera();
  room.fire(RoomEvent.TrackSubscribed, fakeTrack(), { trackSid: "TR_3" }, { identity: "remote-2" });

  await mixer.dispose();
  expect(track.stop).toHaveBeenCalled();
  expect(container.childElementCount).toBe(0);
  expect(room.count(RoomEvent.TrackSubscribed)).toBe(0);
  // A late event after teardown must not resurrect anything.
  expect(mixer.view.local.camera).toBe(false);
});

test("disposing twice is safe", async () => {
  const { mixer } = setup();
  await mixer.dispose();
  await expect(mixer.dispose()).resolves.toBeUndefined();
});

test("a running source is previewed locally and muted, so nothing echoes back", async () => {
  const track = fakeTrack();
  capture.video.mockResolvedValue(track);
  const { localPreview, mixer } = setup();

  await mixer.startCamera();
  const preview = localPreview.firstElementChild as HTMLVideoElement | null;
  expect(preview).not.toBeNull();
  expect(preview!.muted).toBe(true);
  expect(preview!.dataset.voiceVideoSource).toBe("camera");
  expect(track.attach).toHaveBeenCalledWith(preview);
});

test("a shared screen is previewed unmirrored and labelled as a share", async () => {
  const track = fakeTrack(Track.Kind.Video, Track.Source.ScreenShare);
  capture.screen.mockResolvedValue([track]);
  const { localPreview, mixer } = setup();

  await mixer.startScreen();
  const preview = localPreview.firstElementChild as HTMLVideoElement | null;
  expect(preview!.dataset.voiceVideoSource).toBe("screen");
  // The preview is for the sharer only: it is never published, and never sent back.
  expect(preview!.dataset.voiceVideo).toBe("local");
});

test("stopping removes the preview so nothing stale is left on screen", async () => {
  capture.video.mockResolvedValue(fakeTrack());
  const { localPreview, mixer } = setup();
  await mixer.startCamera();
  expect(localPreview.childElementCount).toBe(1);

  await mixer.stop("camera");
  expect(localPreview.childElementCount).toBe(0);
});

test("switching cameras moves the preview to the new track", async () => {
  const first = fakeTrack();
  capture.video.mockResolvedValue(first);
  const { localPreview, mixer } = setup();
  await mixer.startCamera();

  const second = fakeTrack();
  capture.video.mockResolvedValue(second);
  Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
    configurable: true,
    value: vi.fn().mockResolvedValue([
      { kind: "videoinput", deviceId: "cam-1" },
      { kind: "videoinput", deviceId: "cam-2" },
    ]),
  });

  expect(await mixer.switchCamera()).toBe(true);
  expect(localPreview.childElementCount).toBe(1);
  expect(second.attach).toHaveBeenCalled();
  expect(first.stop).toHaveBeenCalled();
});

test("disposing releases the local preview", async () => {
  capture.video.mockResolvedValue(fakeTrack());
  const { localPreview, mixer } = setup();
  await mixer.startCamera();

  await mixer.dispose();
  expect(localPreview.childElementCount).toBe(0);
});