import { expect, test, vi } from "vitest";
import { ApiError } from "./api";
import { voiceRoomTicketRequester } from "./voice-room-device-switch";

const conflict = () => new ApiError(409, "voice_room_active_on_another_device");

test("an ordinary join does not prompt or authorize replacement", async () => {
  const request = vi.fn().mockResolvedValue("ticket");
  const confirm = vi.fn();
  await expect(voiceRoomTicketRequester(request, confirm, () => true)()).resolves.toBe("ticket");
  expect(request).toHaveBeenCalledWith(false);
  expect(confirm).not.toHaveBeenCalled();
});

test("replacement is requested only after confirmation, once per join", async () => {
  const request = vi.fn().mockRejectedValueOnce(conflict()).mockResolvedValue("ticket");
  const confirm = vi.fn().mockResolvedValue(true);
  const getTicket = voiceRoomTicketRequester(request, confirm, () => true);
  await getTicket();
  await getTicket();
  expect(request.mock.calls).toEqual([[false], [true], [true]]);
  expect(confirm).toHaveBeenCalledTimes(1);
});

test("cancelling never requests a replacement token", async () => {
  const request = vi.fn().mockRejectedValue(conflict());
  await expect(voiceRoomTicketRequester(request, async () => false, () => true)()).rejects.toThrow("voice_room_switch_cancelled");
  expect(request).toHaveBeenCalledTimes(1);
});

test("leaving while the prompt is open prevents a later transfer", async () => {
  let active = true;
  const request = vi.fn().mockRejectedValue(conflict());
  const confirm = async () => { active = false; return true; };
  await expect(voiceRoomTicketRequester(request, confirm, () => active)()).rejects.toThrow("voice_room_switch_cancelled");
  expect(request).toHaveBeenCalledTimes(1);
});

test("unrelated failures do not open a transfer prompt", async () => {
  const confirm = vi.fn();
  const error = new ApiError(503, "voice_room_service_unavailable");
  await expect(voiceRoomTicketRequester(async () => { throw error; }, confirm, () => true)()).rejects.toBe(error);
  expect(confirm).not.toHaveBeenCalled();
});
