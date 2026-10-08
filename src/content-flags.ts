/**
 * Room content markers: the adult-content gate and the channel-wide spoiler default.
 *
 * Both are room flags set by someone with room-management permission. The adult-content one is a
 * warning the user has to pass before the room renders anything at all; the spoiler one changes how
 * every message in the room is presented.
 *
 * Confirmations are deliberately local and per account. They are a statement about what this device
 * is willing to show, not a room setting, so they are never sent to the server and never shared with
 * the people in the room.
 */

const confirmedKey = (userId: string) => `priv-chat.nsfw-confirmed.${userId}`;

export function nsfwConfirmedChannelIds(userId: string | undefined): Set<string> {
  if (!userId) return new Set();
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(confirmedKey(userId)) ?? "[]");
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === "string" && value.length > 0));
  } catch {
    return new Set();
  }
}

function storeConfirmedChannelIds(userId: string, channelIds: Set<string>) {
  try {
    localStorage.setItem(confirmedKey(userId), JSON.stringify([...channelIds].slice(-500)));
  } catch {
    // A confirmation that cannot be remembered costs one extra warning next time, and nothing else.
  }
}

/** Remembers that the user chose to continue into a room, so the warning is not shown again. */
export function rememberNsfwConfirmation(userId: string | undefined, channelId: string) {
  if (!userId || !channelId) return;
  const confirmed = nsfwConfirmedChannelIds(userId);
  if (confirmed.has(channelId)) return;
  confirmed.add(channelId);
  storeConfirmedChannelIds(userId, confirmed);
}

/**
 * Whether opening a room should be blocked pending the user continuing past the warning.
 *
 * A room that is not marked never asks. A marked room that was already confirmed on this device never
 * asks again. A voice room is not blocked: it holds no message content to conceal.
 */
export function needsNsfwConfirmation(channel: { id: string; nsfw?: boolean; kind?: string } | undefined, confirmed: ReadonlySet<string>) {
  if (!channel || channel.nsfw !== true || channel.kind === "voice") return false;
  return !confirmed.has(channel.id);
}

/**
 * Whether the adult-content mark may still be turned off for a room.
 *
 * The mark is one-way, so this is false for any room that already carries it. The settings row uses it
 * to lock the control, and the save path uses it to never send a clear.
 */
export function canClearNsfw(channel: { nsfw?: boolean } | undefined) {
  return channel?.nsfw !== true;
}