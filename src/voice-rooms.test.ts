// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DisconnectReason, RoomEvent } from "livekit-client";
import { ApiError } from "./api";
import { VoiceRoomController } from "./voice-rooms";

const mockRoom = vi.hoisted(() => ({ value: undefined as any }));
vi.mock("livekit-client", async (importOriginal) => {
  const sdk = await importOriginal<typeof import("livekit-client")>();
  return {
    ...sdk,
    ExternalE2EEKeyProvider: class { async setKey() {} },
    Room: class {
      state = "disconnected";
      isE2EEEnabled = true;
      remoteParticipants = new Map();
      localParticipant = {
        identity: "72d55ee8-4283-491d-bb8c-8b977ddac43f",
        publishTrack: vi.fn(),
        unpublishTrack: vi.fn(),
      };
      listeners = new Map<string, (...args: any[]) => void>();
      constructor() { mockRoom.value = this; }
      on(event: string, callback: (...args: any[]) => void) { this.listeners.set(event, callback); }
      off(event: string) { this.listeners.delete(event); }
      async setE2EEEnabled() {}
      async connect() { this.state = "connected"; }
      async disconnect() { this.state = "disconnected"; }
    },
  };
});
vi.mock("./voice-e2ee", () => ({ assertVoiceSecureContext: vi.fn(), waitForLocalVoiceEncryption: vi.fn() }));
vi.mock("./voice-audio-processor", () => ({
  VoiceAudioProcessor: class { update() {} async destroy() {} },
  setProcessedMicrophone: vi.fn().mockResolvedValue({ track: {} }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("Worker", class { terminate() {} });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
    getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
  } });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const channel = { id: "a4c3d342-62ad-4c04-8e09-41a6935ed5e6", conversationId: "conversation", name: "Test" };
function setup() {
  const options = {
    currentUserId: "user",
    requestToken: vi.fn().mockResolvedValue({ url: "wss://voice.example", token: "token", canStart: false }),
    releaseToken: vi.fn().mockResolvedValue({ released: true }),
    confirmDeviceSwitch: vi.fn().mockResolvedValue(false),
    onDeviceSwitched: vi.fn(),
    onAccessRevoked: vi.fn(),
    checkAccess: vi.fn().mockResolvedValue(true),
    encryptSignal: vi.fn().mockImplementation(async (_conversation, value) => JSON.stringify(value)),
    decryptSignal: vi.fn().mockImplementation(async (_conversation, value) => JSON.parse(value)),
    sendSignal: vi.fn().mockReturnValue(true),
    onState: vi.fn(),
    audioOutput: document.createElement("div"),
    videoOutput: document.createElement("div"),
    getAudioInputDeviceId: () => "",
    getAudioOutputDeviceId: () => "",
  };
  return { controller: new VoiceRoomController(options), options };
}

test("declining a transfer never requests microphone access or connects", async () => {
  const { controller, options } = setup();
  options.requestToken.mockRejectedValue(new ApiError(409, "voice_room_active_on_another_device"));
  await expect(controller.join(channel)).rejects.toThrow("voice_room_switch_cancelled");
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  expect(controller.currentState.status).toBe("idle");
  expect(options.requestToken).toHaveBeenCalledTimes(1);
});

test("a transferred-away device clears resume intent and does not announce its successor's departure", async () => {
  const { controller, options } = setup();
  vi.spyOn(controller as any, "requestRoomKey").mockResolvedValue({ sessionId: "session", mediaKey: "key" });
  await controller.join(channel);
  expect(controller.currentState.status).toBe("connected");
  options.sendSignal.mockClear();
  mockRoom.value.listeners.get(RoomEvent.Disconnected)(DisconnectReason.DUPLICATE_IDENTITY);
  expect(options.onDeviceSwitched).toHaveBeenCalledOnce();
  expect(options.onAccessRevoked).toHaveBeenCalledOnce();
  expect(controller.currentState.status).toBe("idle");
  expect(options.sendSignal).not.toHaveBeenCalled();
});

test("late departures from a replaced device do not remove the new device from the roster", async () => {
  const { controller } = setup();
  const identity = "72d55ee8-4283-491d-bb8c-8b977ddac43f";
  const oldDevice = "529a4e83-3fbd-43b1-87f8-5ce61a8d592f";
  const newDevice = "90d9922c-eb1f-4503-8590-f05182d949c2";
  const signal = (action: string, senderInstanceId: string) => JSON.stringify({ version: 1, kind: "naigi.voice.room", channelId: channel.id, action, senderInstanceId, participantIdentity: identity, expiresAt: Date.now() + 30_000 });
  await controller.receiveSignal(channel.id, channel.conversationId, "user", signal("participant-presence", oldDevice));
  await controller.receiveSignal(channel.id, channel.conversationId, "user", signal("participant-presence", newDevice));
  await controller.receiveSignal(channel.id, channel.conversationId, "user", signal("participant-left", oldDevice));
  expect(controller.participantsForChannel(channel.id)).toHaveLength(1);
  await controller.receiveSignal(channel.id, channel.conversationId, "user", signal("participant-left", newDevice));
  expect(controller.participantsForChannel(channel.id)).toHaveLength(0);
});
