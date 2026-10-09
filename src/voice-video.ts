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
  createLocalScreenTracks,
  createLocalVideoTrack,
  type LocalTrack,
  type LocalVideoTrack,
  type Room,
  type Track as LiveKitTrack,
} from "livekit-client";
import { defaultVoiceVideoQuality, type VoiceVideoQuality } from "./voice-video-quality";
import { enableVideoViewer } from "./voice-video-viewer";

export type VoiceVideoSource = "camera" | "screen";

/** Why a source is not running, when the user asked for it and it did not start. */
export type VoiceVideoIssue =
  | "denied"
  | "blocked"
  | "unavailable"
  | "unsupported"
  | "encryption"
  | "insecure"
  | "failed";

export type VoiceVideoLocalView = { camera: boolean; screen: boolean; screenAudio?: boolean; issue?: VoiceVideoIssue };
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
  /** Capture resolution and frame rate; read on every start so a change applies to the next one. */
  getQuality?: (source: VoiceVideoSource) => VoiceVideoQuality;
  getScreenAudio?: () => boolean;
  getScreenVolume?: (identity: string) => number;
  setScreenVolume?: (identity: string, volume: number) => void;
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
  releaseViewer: () => void;
};

export class VoiceVideoMixer {
  private readonly options: VoiceVideoOptions;
  private readonly room: Room;
  private cameraTrack?: LocalVideoTrack;
  private screenTrack?: LocalVideoTrack;
  private screenAudioTrack?: LocalTrack;
  private readonly generations = { camera: 0, screen: 0 };
  private issue?: VoiceVideoIssue;
  /** One in-flight request per source, so a double tap cannot publish twice. */
  private readonly starting = new Map<VoiceVideoSource, Promise<boolean>>();
  private readonly remote = new Map<string, RemoteVideo>();
  private readonly previews = new Map<VoiceVideoSource, { element: HTMLVideoElement; track: LocalVideoTrack; releaseViewer: () => void }>();
  private lastScreenShareBox?: HTMLElement;
  private stopped = false;
  private switchingCamera?: Promise<boolean>;

  constructor(options: VoiceVideoOptions) {
    this.options = options;
    this.room = options.room;
    this.room.on(RoomEvent.TrackSubscribed, this.handleSubscribed);
    this.room.on(RoomEvent.TrackUnsubscribed, this.handleUnsubscribed);
    this.room.on(RoomEvent.LocalTrackUnpublished, this.handleLocalUnpublished);
    // connect() can deliver initial subscriptions before the controller creates this mixer.
    // Seed those tracks as well as listening for future subscriptions (late join/reconnect).
    for (const participant of this.room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications?.values() ?? []) {
        if (publication.track) this.handleSubscribed(publication.track, publication, participant);
      }
    }
  }

  get view(): VoiceVideoView {
    return {
      local: {
        camera: Boolean(this.cameraTrack && !this.cameraTrack.isMuted),
        screen: Boolean(this.screenTrack && !this.screenTrack.isMuted),
        ...(this.screenTrack ? { screenAudio: Boolean(this.screenAudioTrack) } : {}),
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
    if (this.stopped) return Promise.resolve(false);
    if (source === "camera" ? this.cameraTrack : this.screenTrack) return Promise.resolve(true);
    const inFlight = this.starting.get(source);
    if (inFlight) return inFlight;
    const attempt = this.publish(source).finally(() => this.starting.delete(source));
    this.starting.set(source, attempt);
    return attempt;
  }

  private async publish(source: VoiceVideoSource): Promise<boolean> {
    const generation = this.generations[source];
    let tracks: LocalTrack[] = [];
    const cancelled = () => this.stopped || generation !== this.generations[source];
    // The microphone is only published once encryption is up; video must not get ahead of it.
    if (!this.room.isE2EEEnabled) {
      this.issue = "encryption";
      this.emit();
      return false;
    }
    try {
      tracks = await this.capture(source);
      const track = tracks.find((candidate): candidate is LocalVideoTrack => candidate.kind === Track.Kind.Video);
      if (!track) {
        for (const captured of tracks) captured.stop();
        this.issue = "unsupported";
        this.emit();
        return false;
      }
      if (cancelled()) throw new Error("capture_cancelled");
      for (const captured of tracks) {
        if (cancelled()) throw new Error("capture_cancelled");
        if (!this.room.isE2EEEnabled) throw new Error("voice_media_encryption_unavailable");
        await this.room.localParticipant.publishTrack(captured);
      }
      if (cancelled()) throw new Error("capture_cancelled");
      if (source === "camera") this.cameraTrack = track;
      else {
        this.screenTrack = track;
        this.screenAudioTrack = tracks.find((candidate) => candidate.kind === Track.Kind.Audio);
      }
      this.watchLocalEnd(track, source);
      this.showLocalPreview(track, source);
      this.issue = undefined;
      this.emit();
      return true;
    } catch (error) {
      if (tracks.includes(this.cameraTrack!)) this.cameraTrack = undefined;
      if (tracks.includes(this.screenTrack!)) this.screenTrack = undefined;
      if (tracks.includes(this.screenAudioTrack!)) this.screenAudioTrack = undefined;
      if (tracks.includes(this.previews.get(source)?.track!)) this.clearLocalPreview(source);
      for (const captured of tracks) {
        captured.stop();
        try { await this.room.localParticipant.unpublishTrack(captured); } catch { /* Already disconnected. */ }
      }
      if (cancelled()) return false;
      this.issue = this.issueFor(error);
      this.emit();
      console.warn("[voice-video] capture failed", error instanceof Error ? error.name : "unknown");
      return false;
    }
  }

  private issueFor(error: unknown): VoiceVideoIssue {
    if (isDenied(error)) return "denied";
    if (error instanceof Error && (error.name === "NotFoundError" || error.name === "NotReadableError")) return "unavailable";
    if (error instanceof Error && error.name === "OverconstrainedError") return "unavailable";
    if (error instanceof Error && error.name === "voice_media_encryption_unavailable") return "encryption";
    // A browser only allows capture in a secure context; naming it beats a bare "failed".
    if (typeof window !== "undefined" && !window.isSecureContext) return "insecure";
    return "failed";
  }

  private watchLocalEnd(track: LocalVideoTrack, source: VoiceVideoSource) {
    const mediaTrack = track.mediaStreamTrack;
    mediaTrack.addEventListener?.("ended", () => {
      if ((source === "camera" ? this.cameraTrack : this.screenTrack) === track && track.mediaStreamTrack === mediaTrack) void this.stop(source);
    }, { once: true });
  }

  private async capture(source: VoiceVideoSource): Promise<LocalTrack[]> {
    const quality = this.options.getQuality?.(source) ?? defaultVoiceVideoQuality;
    if (source === "screen") {
      const tracks = await createLocalScreenTracks({
        // Screen audio: a tab or window the user shares may be the thing they want to hear. Browsers
        // that cannot offer it simply return no audio track rather than failing the whole capture.
        audio: this.options.getScreenAudio?.() ?? true,
        systemAudio: "include",
        resolution: { width: quality.width, height: quality.height, frameRate: quality.frameRate },
        // Text legibility matters more than framerate for a shared screen.
        contentHint: "detail",
      });
      return tracks;
    }
    const deviceId = this.options.getCameraDeviceId?.();
    return [await createLocalVideoTrack({
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      resolution: { width: quality.width, height: quality.height, frameRate: quality.frameRate },
    })];
  }

  async stop(source: VoiceVideoSource) {
    this.generations[source]++;
    const track = source === "camera" ? this.cameraTrack : this.screenTrack;
    const audio = source === "screen" ? this.screenAudioTrack : undefined;
    if (source === "screen") this.screenAudioTrack = undefined;
    if (source === "camera") this.cameraTrack = undefined;
    else this.screenTrack = undefined;
    this.clearLocalPreview(source);
    this.emit();
    for (const captured of [track, audio]) {
      if (!captured) continue;
      captured.stop();
      try { await this.room.localParticipant.unpublishTrack(captured); } catch { /* Already gone. */ }
    }
  }

  /**
   * Shows what is being sent. The local camera goes into the local participant's own tile, under the
   * same rule as everyone else's, so you never see a blank tile where your own face should be. The
   * separate preview box is only the fallback for when there is no tile to sit in.
   */
  private showLocalPreview(track: LocalVideoTrack, source: VoiceVideoSource) {
    this.clearLocalPreview(source);
    const element = document.createElement("video");
    element.autoplay = true;
    element.playsInline = true;
    element.muted = true;
    element.setAttribute("playsinline", "");
    element.className = `voice-video-local-preview is-${source}`;
    element.dataset.voiceVideo = source;
    element.dataset.voiceIdentity = this.room.localParticipant.identity;
    element.dataset.voiceVideoSource = source;
    // Only a camera that reports itself as user-facing is mirrored. When the platform does not say,
    // it is left alone rather than guessing, because a mirrored desktop webcam looks like a fault.
    element.dataset.mirrored = String(source === "camera" && isUserFacing(track));
    track.attach(element);
    this.previews.set(source, { element, track, releaseViewer: enableVideoViewer(element, source === "screen" ? "your screen share" : "your camera") });
    const tile = this.options.resolveRemoteContainer({ identity: this.room.localParticipant.identity, source });
    (tile ?? this.options.localPreview).append(element);
  }

  private clearLocalPreview(source: VoiceVideoSource) {
    const preview = this.previews.get(source);
    if (!preview) return;
    preview.releaseViewer();
    preview.track.detach(preview.element);
    preview.element.remove();
    this.previews.delete(source);
  }

  /** Restart the existing publication: phones often cannot open front and rear simultaneously. */
  switchCamera(deviceId?: string): Promise<boolean> {
    if (this.switchingCamera) return this.switchingCamera;
    const attempt = this.restartCamera(deviceId).finally(() => { this.switchingCamera = undefined; });
    this.switchingCamera = attempt;
    return attempt;
  }

  private async restartCamera(deviceId?: string): Promise<boolean> {
    if (!this.cameraTrack) return false;
    const previous = this.cameraTrack;
    const generation = ++this.generations.camera;
    const cancelled = () => this.stopped || generation !== this.generations.camera || this.cameraTrack !== previous;
    const settings = previous.mediaStreamTrack.getSettings();
    const restore = settings.deviceId ? { deviceId: { exact: settings.deviceId } }
      : settings.facingMode === "environment" ? { facingMode: "environment" as const } : { facingMode: "user" as const };
    const quality = this.options.getQuality?.("camera") ?? defaultVoiceVideoQuality;
    let restarted = false;
    try {
      let target: { deviceId?: { exact: string }; facingMode?: "user" | "environment" };
      if (deviceId) target = { deviceId: { exact: deviceId } };
      else if (settings.facingMode === "user" || settings.facingMode === "environment") {
        target = { facingMode: settings.facingMode === "user" ? "environment" : "user" };
      } else {
        const cameras = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput" && device.deviceId);
        if (cameras.length < 2) return false;
        const index = cameras.findIndex((device) => device.deviceId === settings.deviceId);
        target = { deviceId: { exact: cameras[(index + 1 + cameras.length) % cameras.length].deviceId } };
      }
      if (cancelled()) return false;
      if (!this.room.isE2EEEnabled) throw new Error("voice_media_encryption_unavailable");
      restarted = true;
      await previous.restartTrack({
        ...target,
        resolution: {
          width: quality.width,
          height: quality.height,
          frameRate: quality.frameRate,
        },
      });
      if (cancelled()) { previous.stop(); return false; }
      if (!this.room.isE2EEEnabled) {
        this.issue = "encryption";
        await this.stop("camera");
        return false;
      }
      const facing = previous.mediaStreamTrack.getSettings().facingMode;
      if (target.facingMode && facing && facing !== target.facingMode) throw new Error("camera_switch_unavailable");
      this.watchLocalEnd(previous, "camera");
      this.showLocalPreview(previous, "camera");
      this.issue = undefined;
      this.emit();
      return true;
    } catch (error) {
      if (cancelled()) { previous.stop(); return false; }
      if (restarted && this.room.isE2EEEnabled) {
        try {
          await previous.restartTrack({ ...restore, resolution: { width: quality.width, height: quality.height, frameRate: quality.frameRate } });
          if (cancelled()) { previous.stop(); return false; }
          this.watchLocalEnd(previous, "camera");
          this.showLocalPreview(previous, "camera");
        } catch {
          if (!cancelled()) await this.stop("camera");
        }
      }
      if (this.stopped) return false;
      this.issue = this.issueFor(error);
      this.emit();
      return false;
    }
  }

  private readonly handleSubscribed = (track: LiveKitTrack, publication: { trackSid: string }, participant: { identity: string }) => {
    if (this.stopped) return;
    if (track.kind !== Track.Kind.Video) return;
    const previous = this.remote.get(publication.trackSid);
    previous?.releaseViewer();
    if (previous) { previous.track.detach(previous.element); previous.element.remove(); }
    const source: VoiceVideoSource = track.source === Track.Source.ScreenShare ? "screen" : "camera";
    const element = document.createElement("video");
    element.autoplay = true;
    element.playsInline = true;
    element.muted = true;
    element.setAttribute("playsinline", "");
    element.dataset.voiceVideo = source;
    element.dataset.voiceIdentity = participant.identity;
    track.attach(element);
    this.remote.set(publication.trackSid, { element, identity: participant.identity, source, track,
      releaseViewer: enableVideoViewer(element, `${participant.identity}'s ${source === "screen" ? "screen share" : "camera"}`,
        source === "screen" && this.options.setScreenVolume ? {
          getVolume: () => this.options.getScreenVolume?.(participant.identity) ?? 1,
          setVolume: (value) => this.options.setScreenVolume?.(participant.identity, value),
        } : undefined) });
    this.placeRemote();
    this.emit();
  };

  /**
   * Moves every remote stream into wherever the interface says it belongs now. A camera replaces its
   * participant's avatar; a screen share goes to the separate share box above the tiles.
   *
   * Any video element sitting in one of those boxes that is not ours is removed, so the box always
   * converges on the live subscriptions. Without this, a stream left over from a previous session
   * would sit in the share box forever and each rejoin would add another one.
   */
  placeRemote() {
    const wanted = new Set<Element>();
    for (const [source, preview] of this.previews) {
      const container = this.options.resolveRemoteContainer({ identity: this.room.localParticipant.identity, source }) ?? this.options.localPreview;
      wanted.add(preview.element);
      if (preview.element.parentElement !== container) container.append(preview.element);
    }
    for (const entry of this.remote.values()) {
      const container = this.options.resolveRemoteContainer({ identity: entry.identity, source: entry.source });
      if (!container) continue;
      wanted.add(entry.element);
      if (entry.element.parentElement !== container) container.append(entry.element);
    }
    for (const container of this.managedContainers()) {
      for (const child of [...container.querySelectorAll("video")]) {
        if (!wanted.has(child)) child.remove();
      }
    }
  }

  /** Every container the mixer can place into, so leftovers can be swept from all of them. */
  private managedContainers() {
    const containers = new Set<HTMLElement>();
    for (const entry of this.remote.values()) {
      const container = this.options.resolveRemoteContainer({ identity: entry.identity, source: entry.source });
      if (container) containers.add(container);
    }
    if (this.lastScreenShareBox) containers.add(this.lastScreenShareBox);
    return containers;
  }

  /** Remembers the share box so it can be cleared after the last share is gone from the room. */
  noteShareBox(container: HTMLElement | undefined) {
    if (container) this.lastScreenShareBox = container;
  }

  private readonly handleUnsubscribed = (track: LiveKitTrack, publication: { trackSid: string }) => {
    for (const element of track.detach()) element.remove();
    // Remove the element we created rather than trusting detach to hand it back, so a share can never
    // be left behind in its box when the stream goes away.
    const entry = this.remote.get(publication.trackSid);
    entry?.releaseViewer();
    entry?.element.remove();
    this.remote.delete(publication.trackSid);
    this.emit();
  };

  private readonly handleLocalUnpublished = (publication: { track?: LocalTrack }) => {
    if (!publication.track) return;
    if (publication.track === this.cameraTrack) void this.stop("camera");
    else if (publication.track === this.screenTrack) void this.stop("screen");
  };

  /** Detaches everything and releases the camera. Safe to call more than once. */
  async dispose() {
    if (this.stopped) return;
    this.stopped = true;
    this.generations.camera++;
    this.generations.screen++;
    this.room.off(RoomEvent.TrackSubscribed, this.handleSubscribed);
    this.room.off(RoomEvent.TrackUnsubscribed, this.handleUnsubscribed);
    this.room.off(RoomEvent.LocalTrackUnpublished, this.handleLocalUnpublished);
    this.cameraTrack?.stop();
    this.screenTrack?.stop();
    this.screenAudioTrack?.stop();
    this.screenAudioTrack = undefined;
    this.cameraTrack = undefined;
    this.screenTrack = undefined;
    this.clearLocalPreview("camera");
    this.clearLocalPreview("screen");
    for (const entry of this.remote.values()) {
      entry.releaseViewer();
      entry.track.detach(entry.element);
      entry.element.remove();
    }
    this.remote.clear();
    // The share box is emptied even when its last stream had already unsubscribed, so leaving a room
    // never leaves a picture of what was shared behind.
    this.lastScreenShareBox?.replaceChildren();
    this.lastScreenShareBox = undefined;
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

/** Re-exported so callers can label the control without importing the preset module separately. */
export { voiceVideoQualities } from "./voice-video-quality";
