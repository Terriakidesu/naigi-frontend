import { iconElement } from "./icons";

export function setVoiceDockButton(button: HTMLButtonElement, visible: boolean, icon: string, label: string, pressed?: boolean, disabled = false) {
  button.hidden = !visible;
  button.disabled = disabled;
  button.title = label;
  button.setAttribute("aria-label", label);
  if (pressed === undefined) button.removeAttribute("aria-pressed");
  else button.setAttribute("aria-pressed", String(pressed));
  button.classList.toggle("is-active", Boolean(pressed));
  button.replaceChildren(iconElement(icon));
  const control = button.closest<HTMLElement>(".voice-device-control");
  if (control) control.dataset.toggleVisible = String(visible);
}
