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
  // Stand-ins for the participant tile slot and the separate share box.
  const cameraSlot = document.createElement("div");
  const screenSlot = document.createElement("div");
  const localPreview = document.createElement("div");
  const onChange = vi.fn();
  const resolveRemoteContainer = vi.fn(({ source }: { identity: string; source: "camera" | "screen" }) =>
    (source === "camera" ? cameraSlot : screenSlot));
  const mixer = new VoiceVideoMixer({ room: room as never, localPreview, resolveRemoteContainer, onChange });
  return { room, cameraSlot, screenSlot, localPreview, resolveRemoteContainer, onChange, mixer };
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
  const { room, cameraSlot, mixer, onChange } = setup();
  const track = { ...fakeTrack(), attach: vi.fn(), detach: vi.fn(() => [...cameraSlot.childNodes]) };
  room.remoteParticipants.set("remote-1", { identity: "remote-1" });

  room.fire(RoomEvent.TrackSubscribed, track, { trackSid: "TR_1" }, { identity: "remote-1" });
  expect(cameraSlot.childElementCount).toBe(1);
  expect(cameraSlot.firstElementChild?.getAttribute("data-voice-video")).toBe("camera");
  expect(mixer.view.remote).toEqual([{ identity: "remote-1", camera: true, screen: false }]);

  room.fire(RoomEvent.TrackUnsubscribed, track, { trackSid: "TR_1" });
  expect(cameraSlot.childElementCount).toBe(0);
  expect(mixer.view.remote).toEqual([{ identity: "remote-1", camera: false, screen: false }]);
  expect(onChange).toHaveBeenCalled();
});

test("a camera goes into its participant's slot and a share into the separate share box", () => {
  const { room, cameraSlot, screenSlot, mixer } = setup();
  const camera = fakeTrack(Track.Kind.Video, Track.Source.Camera);
  const screen = fakeTrack(Track.Kind.Video, Track.Source.ScreenShare);
  room.remoteParticipants.set("remote-1", { identity: "remote-1" });

  room.fire(RoomEvent.TrackSubscribed, camera, { trackSid: "TR_C" }, { identity: "remote-1" });
  room.fire(RoomEvent.TrackSubscribed, screen, { trackSid: "TR_S" }, { identity: "remote-1" });

  expect(cameraSlot.childElementCount).toBe(1);
  expect(screenSlot.childElementCount).toBe(1);
  expect(cameraSlot.querySelector("video")?.dataset.voiceVideo).toBe("camera");
  expect(screenSlot.querySelector("video")?.dataset.voiceVideo).toBe("screen");
  // One participant, two sources, reported separately.
  expect(mixer.view.remote).toEqual([{ identity: "remote-1", camera: true, screen: true }]);
});

test("video is re-placed when the interface re-renders and its tile is rebuilt", () => {
  const room = new FakeRoom();
  const firstSlot = document.createElement("div");
  const localPreview = document.createElement("div");
  let slot = firstSlot;
  const onChange = vi.fn();
  const mixer = new VoiceVideoMixer({
    room: room as never,
    localPreview,
    resolveRemoteContainer: () => slot,
    onChange,
  });
  const track = fakeTrack();
  room.fire(RoomEvent.TrackSubscribed, track, { trackSid: "TR_1" }, { identity: "remote-1" });
  expect(firstSlot.childElementCount).toBe(1);

  // The grid render replaces the tile, so the element is gone until it is placed again.
  const rebuilt = document.createElement("div");
  slot = rebuilt;
  mixer.placeRemote();
  expect(rebuilt.childElementCount).toBe(1);
  expect(firstSlot.childElementCount).toBe(0);
});

test("a stream with nowhere to go stays alive rather than being dropped", () => {
  const room = new FakeRoom();
  const onChange = vi.fn();
  const mixer = new VoiceVideoMixer({
    room: room as never,
    localPreview: document.createElement("div"),
    // A participant whose tile is not on screen yet.
    resolveRemoteContainer: () => undefined,
    onChange,
  });
  room.fire(RoomEvent.TrackSubscribed, fakeTrack(), { trackSid: "TR_1" }, { identity: "remote-1" });
  // It is still the room's state that matters: the avatar must not reappear over a live camera.
  expect(mixer.hasRemote("remote-1", "camera")).toBe(true);
  expect(mixer.view.remote).toEqual([{ identity: "remote-1", camera: true, screen: false }]);
});

test("a subscribed camera is what replaces the avatar, a share is not", () => {
  const { room, mixer } = setup();
  room.fire(RoomEvent.TrackSubscribed, fakeTrack(), { trackSid: "TR_1" }, { identity: "remote-1" });
  expect(mixer.hasRemote("remote-1", "camera")).toBe(true);
  // A share is presented away from the participant, so it never stands in for them.
  expect(mixer.hasRemote("remote-1", "screen")).toBe(false);
});

test("audio tracks are left to the audio path", () => {
  const { room, cameraSlot, screenSlot } = setup();
  room.fire(RoomEvent.TrackSubscribed, fakeTrack(Track.Kind.Audio), { trackSid: "TR_2" }, { identity: "remote-1" });
  expect(cameraSlot.childElementCount).toBe(0);
  expect(screenSlot.childElementCount).toBe(0);
});

test("disposing releases the camera, detaches video, and unsubscribes", async () => {
  const track = fakeTrack();
  capture.video.mockResolvedValue(track);
  const { room, cameraSlot, mixer } = setup();
  await mixer.startCamera();
  room.fire(RoomEvent.TrackSubscribed, fakeTrack(), { trackSid: "TR_3" }, { identity: "remote-2" });

  await mixer.dispose();
  expect(track.stop).toHaveBeenCalled();
  expect(cameraSlot.childElementCount).toBe(0);
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