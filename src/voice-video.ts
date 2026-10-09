/**
 * Camera and screen-share media for voice rooms and calls.
 *
 * Both live on the same LiveKit connection as the microphone and are encrypted by the same key
 * provider, so this module never publishes anything before encryption is ready and never offers an
 * unencrypted fallback. It also owns the remote side — subscribing, attaching and detaching video
 * elements — so the controllers only deal with state.
 *
 * The two controls stay independent: a camera can run without a screen share, a screen share can run
 * without a camera, and neither is ever started for the user.
 */

import {
  RoomEvent,
  Track,
  VideoPresets,
  createLocalScreenTracks,
  createLocalVideoTrack,
  type LocalTrack,
  type LocalVideoTrack,
  type Room,
  type Track as LiveKitTrack,
} from "livekit-client";

export type VoiceVideoSource = "camera" | "screen";

/** Why a source is not running, when the user asked for it and it did not start. */
export type VoiceVideoIssue = "denied" | "unavailable" | "unsupported" | "encryption" | "failed";

export type VoiceVideoLocalView = { camera: boolean; screen: boolean; issue?: VoiceVideoIssue };
export type VoiceVideoRemoteView = { identity: string; camera: boolean; screen: boolean };
export type VoiceVideoView = { local: VoiceVideoLocalView; remote: VoiceVideoRemoteView[] };

export type VoiceVideoOptions = {
  room: Room;
  /**
   * Container for the local preview. A preview you cannot see is the difference between sharing on
   * purpose and sharing whatever happened to be on screen, so it exists whenever a source is running.
   */
  localPreview: HTMLElement;
  /**
   * Where a remote stream belongs right now. Called again after the interface re-renders, because a
   * participant tile is rebuilt from scratch and would otherwise drop the video attached to it.
   * Returning undefined keeps the stream alive but off screen.
   */
  resolveRemoteContainer: (stream: { identity: string; source: VoiceVideoSource }) => HTMLElement | undefined;
  onChange: (view: VoiceVideoView) => void;
  /** Camera preference, so a device switch does not silently fall back to the system default. */
  getCameraDeviceId?: () => string;
};

const deniedErrorNames = ["NotAllowedError", "PermissionDeniedError", "SecurityError"];

function isDenied(error: unknown) {
  return error instanceof Error && deniedErrorNames.includes(error.name);
}

/** A front-facing camera, when the platform tells us. Silence is treated as "not known". */
function isUserFacing(track: { mediaStreamTrack?: { getSettings?: () => { facingMode?: string } } }) {
  try {
    return track.mediaStreamTrack?.getSettings?.().facingMode === "user";
  } catch {
    return false;
  }
}

/**
 * Screen capture needs a picker the browser owns. An embedded WebView has no such picker, even where
 * the API object exists, so this reports the truth rather than failing after the user has committed.
 */
export function screenCaptureSupported() {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.mediaDevices?.getDisplayMedia !== "function") return false;
  return !isEmbeddedWebView();
}

function isEmbeddedWebView() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent ?? "";
  // The Android System WebView has no display-media picker.
  return /\bwv\b/.test(userAgent) || "NaigiBeta" in window;
}

type RemoteVideo = {
  element: HTMLVideoElement;
  identity: string;
  source: VoiceVideoSource;
  track: LiveKitTrack;
};

export class VoiceVideoMixer {
  private readonly options: VoiceVideoOptions;
  private readonly room: Room;
  private cameraTrack?: LocalVideoTrack;
  private screenTrack?: LocalVideoTrack;
  private issue?: VoiceVideoIssue;
  /** One in-flight request per source, so a double tap cannot publish twice. */
  private readonly starting = new Map<VoiceVideoSource, Promise<boolean>>();
  private readonly remote = new Map<string, RemoteVideo>();
  private localPreview?: HTMLVideoElement;
  private localPreviewTrack?: LocalVideoTrack;
  private stopped = false;

  constructor(options: VoiceVideoOptions) {
    this.options = options;
    this.room = options.room;
    this.room.on(RoomEvent.TrackSubscribed, this.handleSubscribed);
    this.room.on(RoomEvent.TrackUnsubscribed, this.handleUnsubscribed);
    this.room.on(RoomEvent.LocalTrackUnpublished, this.handleLocalUnpublished);
  }

  get view(): VoiceVideoView {
    return {
      local: {
        camera: Boolean(this.cameraTrack && !this.cameraTrack.isMuted),
        screen: Boolean(this.screenTrack && !this.screenTrack.isMuted),
        ...(this.issue ? { issue: this.issue } : {}),
      },
      remote: this.remoteView(),
    };
  }

  private remoteView(): VoiceVideoRemoteView[] {
    const byIdentity = new Map<string, VoiceVideoRemoteView>();
    for (const participant of this.room.remoteParticipants.values()) {
      byIdentity.set(participant.identity, { identity: participant.identity, camera: false, screen: false });
    }
    for (const entry of this.remote.values()) {
      const existing = byIdentity.get(entry.identity) ?? { identity: entry.identity, camera: false, screen: false };
      if (entry.source === "camera") existing.camera = true;
      else existing.screen = true;
      byIdentity.set(entry.identity, existing);
    }
    return [...byIdentity.values()];
  }

  private emit() {
    if (!this.stopped) this.options.onChange(this.view);
  }

  async startCamera(): Promise<boolean> {
    return this.start("camera");
  }

  async startScreen(): Promise<boolean> {
    if (!screenCaptureSupported()) {
      // Say so before asking for anything: there is no picker to open.
      this.issue = "unsupported";
      this.emit();
      return false;
    }
    return this.start("screen");
  }

  private start(source: VoiceVideoSource): Promise<boolean> {
    const inFlight = this.starting.get(source);
    if (inFlight) return inFlight;
    const attempt = this.publish(source).finally(() => this.starting.delete(source));
    this.starting.set(source, attempt);
    return attempt;
  }

  private async publish(source: VoiceVideoSource): Promise<boolean> {
    // The microphone is only published once encryption is up; video must not get ahead of it.
    if (!this.room.isE2EEEnabled) {
      this.issue = "encryption";
      this.emit();
      return false;
    }
    try {
      const track = await this.capture(source);
      if (!track) {
        this.issue = "unsupported";
        this.emit();
        return false;
      }
      if (this.stopped) {
        track.stop();
        return false;
      }
      await this.room.localParticipant.publishTrack(track);
      if (source === "camera") this.cameraTrack = track;
      else this.screenTrack = track;
      this.showLocalPreview(track, source);
      this.issue = undefined;
      this.emit();
      return true;
    } catch (error) {
      this.issue = this.issueFor(error);
      this.emit();
      console.warn("[voice-video] capture failed", error instanceof Error ? error.name : "unknown");
      return false;
    }
  }

  private issueFor(error: unknown): VoiceVideoIssue {
    if (isDenied(error)) return "denied";
    if (error instanceof Error && (error.name === "NotFoundError" || error.name === "NotReadableError")) return "unavailable";
    if (error instanceof Error && error.name === "voice_media_encryption_unavailable") return "encryption";
    return "failed";
  }

  private async capture(source: VoiceVideoSource): Promise<LocalVideoTrack | undefined> {
    if (source === "screen") {
      const tracks = await createLocalScreenTracks({
        audio: false,
        // Text legibility matters more than framerate for a shared screen.
        resolution: { width: 1280, height: 720, frameRate: 15 },
        contentHint: "detail",
      });
      return tracks.find((track): track is LocalVideoTrack => track.kind === Track.Kind.Video);
    }
    const deviceId = this.options.getCameraDeviceId?.();
    return createLocalVideoTrack({
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      resolution: VideoPresets.h720.resolution,
    });
  }

  async stop(source: VoiceVideoSource) {
    const track = source === "camera" ? this.cameraTrack : this.screenTrack;
    if (!track) return;
    if (source === "camera") this.cameraTrack = undefined;
    else this.screenTrack = undefined;
    try {
      await this.room.localParticipant.unpublishTrack(track);
    } catch {
      // Already gone with the room.
    }
    track.stop();
    this.clearLocalPreview();
    this.emit();
  }

  /**
   * Shows what is being sent, locally and muted, so a mistake is caught before it reaches the room.
   * A front camera is mirrored because that is what the user expects to see; a shared screen never is,
   * since mirroring a screen would make it unreadable.
   */
  private showLocalPreview(track: LocalVideoTrack, source: VoiceVideoSource) {
    this.clearLocalPreview();
    const element = document.createElement("video");
    element.autoplay = true;
    element.playsInline = true;
    element.muted = true;
    element.setAttribute("playsinline", "");
    element.className = `voice-video-local-preview is-${source}`;
    element.dataset.voiceVideo = "local";
    element.dataset.voiceVideoSource = source;
    // Only a camera that reports itself as user-facing is mirrored. When the platform does not say,
    // it is left alone rather than guessing, because a mirrored desktop webcam looks like a fault.
    element.dataset.mirrored = String(source === "camera" && isUserFacing(track));
    track.attach(element);
    this.localPreview = element;
    this.localPreviewTrack = track;
    this.options.localPreview.append(element);
  }

  private clearLocalPreview() {
    if (!this.localPreview) return;
    for (const element of this.localPreviewTrack?.detach() ?? []) element.remove();
    this.localPreview.remove();
    this.localPreview = undefined;
    this.localPreviewTrack = undefined;
  }

  /** Move to the next camera, keeping the current one running if the switch fails. */
  async switchCamera(): Promise<boolean> {
    if (!this.cameraTrack) return false;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === "videoinput");
      if (cameras.length < 2) return false;
      const currentId = this.cameraTrack.mediaStreamTrack.getSettings().deviceId;
      const index = cameras.findIndex((device) => device.deviceId === currentId);
      const next = cameras[(index + 1 + cameras.length) % cameras.length];
      if (!next) return false;
      const replacement = await createLocalVideoTrack({ deviceId: { exact: next.deviceId }, resolution: VideoPresets.h720.resolution });
      await this.room.localParticipant.publishTrack(replacement);
      const previous = this.cameraTrack;
      this.cameraTrack = replacement;
      try {
        await this.room.localParticipant.unpublishTrack(previous);
      } catch {
        // Already gone.
      }
      previous.stop();
      this.showLocalPreview(replacement, "camera");
      this.emit();
      return true;
    } catch (error) {
      this.issue = this.issueFor(error);
      this.emit();
      return false;
    }
  }

  private readonly handleSubscribed = (track: LiveKitTrack, publication: { trackSid: string }, participant: { identity: string }) => {
    if (track.kind !== Track.Kind.Video) return;
    const source: VoiceVideoSource = track.source === Track.Source.ScreenShare ? "screen" : "camera";
    const element = document.createElement("video");
    element.autoplay = true;
    element.playsInline = true;
    element.muted = true;
    element.setAttribute("playsinline", "");
    element.dataset.voiceVideo = source;
    element.dataset.voiceIdentity = participant.identity;
    track.attach(element);
    this.remote.set(publication.trackSid, { element, identity: participant.identity, source, track });
    this.placeRemote();
    this.emit();
  };

  /**
   * Moves every remote stream into wherever the interface says it belongs now. A camera replaces its
   * participant's avatar; a screen share goes to the separate share box above the tiles.
   */
  placeRemote() {
    for (const entry of this.remote.values()) {
      const container = this.options.resolveRemoteContainer({ identity: entry.identity, source: entry.source });
      if (!container) continue;
      if (entry.element.parentElement !== container) container.append(entry.element);
    }
  }

  private readonly handleUnsubscribed = (track: LiveKitTrack, publication: { trackSid: string }) => {
    for (const element of track.detach()) element.remove();
    this.remote.delete(publication.trackSid);
    this.emit();
  };

  private readonly handleLocalUnpublished = (publication: { source?: LiveKitTrack.Source }) => {
    if (publication.source === Track.Source.Camera && this.cameraTrack?.isMuted === false) return;
    this.emit();
  };

  /** Detaches everything and releases the camera. Safe to call more than once. */
  async dispose() {
    if (this.stopped) return;
    this.stopped = true;
    this.room.off(RoomEvent.TrackSubscribed, this.handleSubscribed);
    this.room.off(RoomEvent.TrackUnsubscribed, this.handleUnsubscribed);
    this.room.off(RoomEvent.LocalTrackUnpublished, this.handleLocalUnpublished);
    this.cameraTrack?.stop();
    this.screenTrack?.stop();
    this.cameraTrack = undefined;
    this.screenTrack = undefined;
    this.clearLocalPreview();
    for (const entry of this.remote.values()) entry.element.remove();
    this.remote.clear();
  }

  /**
   * True when a stream is subscribed for this participant, which is what decides whether their avatar
   * is replaced. Deliberately independent of where the element ended up: a tile that has not been
   * rendered yet must not flash the avatar back over a camera that is still running.
   */
  hasRemote(identity: string, source: VoiceVideoSource) {
    for (const entry of this.remote.values()) {
      if (entry.identity === identity && entry.source === source) return true;
    }
    return false;
  }
}

/** Re-exported so callers do not need a second livekit import just to build a preset. */
export const cameraVideoPreset = VideoPresets.h720;

export type { LocalTrack };