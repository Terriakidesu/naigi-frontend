/**
 * Capture quality for camera and screen share.
 *
 * A fixed choice is wrong for everyone: a phone on mobile data and a desktop on fibre want different
 * things from the same control. Resolution and frame rate are therefore chosen together as one preset,
 * because they trade against each other and picking them separately produces settings that do not
 * exist in any real encoder.
 *
 * The choice is local to the account and device, like the audio device preferences: it describes this
 * machine's network, not the room.
 */

export type VoiceVideoQualityId = "low" | "standard" | "high";

export type VoiceVideoQuality = {
  id: VoiceVideoQualityId;
  label: string;
  width: number;
  height: number;
  frameRate: number;
  /** Shown so the cost of the choice is visible rather than discovered. */
  detail: string;
};

export const voiceVideoQualities: readonly VoiceVideoQuality[] = [
  { id: "low", label: "Low", width: 640, height: 360, frameRate: 15, detail: "360p · 15 fps · least data" },
  { id: "standard", label: "Standard", width: 1280, height: 720, frameRate: 24, detail: "720p · 24 fps · balanced" },
  { id: "high", label: "High", width: 1920, height: 1080, frameRate: 30, detail: "1080p · 30 fps · most data" },
];

export const defaultVoiceVideoQuality: VoiceVideoQuality = voiceVideoQualities[1];

const storageKey = (userId?: string) => userId ? `priv-chat.video-quality.${userId}` : "priv-chat.video-quality";

export function normalizeVoiceVideoQuality(value: unknown): VoiceVideoQuality {
  const id = typeof value === "string" ? value : "";
  return voiceVideoQualities.find((quality) => quality.id === id) ?? defaultVoiceVideoQuality;
}

export function loadVoiceVideoQuality(userId?: string): VoiceVideoQuality {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? normalizeVoiceVideoQuality(JSON.parse(raw)) : defaultVoiceVideoQuality;
  } catch {
    return defaultVoiceVideoQuality;
  }
}

export function saveVoiceVideoQuality(userId: string | undefined, quality: VoiceVideoQuality): VoiceVideoQuality {
  const normalized = normalizeVoiceVideoQuality(quality.id);
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(normalized.id));
  } catch {
    // A quality that cannot be remembered costs one extra tap next time, and nothing else.
  }
  return normalized;
}