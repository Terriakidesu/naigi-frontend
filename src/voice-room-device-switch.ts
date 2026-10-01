import { ApiError } from "./api";

export function voiceRoomTicketRequester<T>(
  request: (replaceExisting: boolean) => Promise<T>,
  confirmSwitch: () => Promise<boolean>,
  isActive: () => boolean,
) {
  let confirmed = false;
  return async () => {
    try {
      return await request(confirmed);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409 || error.code !== "voice_room_active_on_another_device" || confirmed) throw error;
      if (!isActive() || !await confirmSwitch() || !isActive()) throw new Error("voice_room_switch_cancelled");
      confirmed = true;
      return request(true);
    }
  };
}
