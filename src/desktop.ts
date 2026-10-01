// This renderer is an entrypoint of the desktop build only. Window management
// and native title-bar policy remain in the Electron shell.
import { desktopBridge } from "./platform/desktop";

async function showDesktopTitleBar() {
  const info = await desktopBridge().getInfo();
  if (!info.customTitleBar) return;
  document.body.classList.add("desktop-window");
  const bar = document.createElement("header");
  bar.className = "desktop-titlebar";
  const navigation = document.createElement("nav");
  navigation.className = "desktop-titlebar-navigation";
  navigation.setAttribute("aria-label", "Page history");
  for (const [label, glyph, action] of [
    ["Go back", "←", () => window.history.back()],
    ["Go forward", "→", () => window.history.forward()],
  ] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.textContent = glyph;
    button.addEventListener("click", action);
    navigation.append(button);
  }
  const title = document.createElement("span");
  title.className = "desktop-titlebar-title";
  const updateTitle = () => { title.textContent = document.title || "Naigi"; };
  updateTitle();
  const titleElement = document.querySelector("title");
  if (titleElement) new MutationObserver(updateTitle).observe(titleElement, { childList: true, subtree: true, characterData: true });
  bar.append(navigation, title);
  document.body.prepend(bar);
}

void showDesktopTitleBar().catch(() => { /* The shared UI reports bridge failures where needed. */ });
