// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { setVoiceDockButton } from "./voice-dock-button";

afterEach(() => document.body.replaceChildren());

function splitControl() {
  document.body.innerHTML = '<span class="voice-device-control"><button hidden></button><label class="voice-device-picker"><i class="voice-device-picker-primary-icon"></i><i class="voice-device-picker-chevron"></i><select><option>Default</option></select></label></span>';
  return { control: document.querySelector<HTMLElement>(".voice-device-control")!, button: document.querySelector("button")! };
}

test("loading controls remain visible in their separate icon/button column", () => {
  const { control, button } = splitControl();
  setVoiceDockButton(button, true, "mic", "Mute microphone", false, true);
  expect(button.hidden).toBe(false);
  expect(button.disabled).toBe(true);
  expect(control.dataset.toggleVisible).toBe("true");
  expect(button.querySelector("svg.lucide-mic")).not.toBeNull();
  expect(button.getAttribute("aria-label")).toBe("Mute microphone");
  expect(button.getAttribute("aria-pressed")).toBe("false");
});

test("connecting, connected, and reconnecting retain the same layout", () => {
  const { control, button } = splitControl();
  for (const disabled of [true, false, false, true]) {
    setVoiceDockButton(button, true, "headphones", "Deafen audio", false, disabled);
    expect(button.hidden).toBe(false);
    expect(button.disabled).toBe(disabled);
    expect(control.dataset.toggleVisible).toBe("true");
    expect(button.children).toHaveLength(1);
  }
});

test("mute state is preserved and connected buttons become enabled again", () => {
  const { button } = splitControl();
  setVoiceDockButton(button, true, "mic-off", "Unmute microphone", true, true);
  setVoiceDockButton(button, true, "mic-off", "Unmute microphone", true);
  expect(button.disabled).toBe(false);
  expect(button.classList.contains("is-active")).toBe(true);
  expect(button.getAttribute("aria-pressed")).toBe("true");
});

test("incoming-call controls can still be hidden without leaving a false split state", () => {
  const { control, button } = splitControl();
  setVoiceDockButton(button, false, "mic", "Mute microphone", false, true);
  expect(button.hidden).toBe(true);
  expect(control.dataset.toggleVisible).toBe("false");
});
