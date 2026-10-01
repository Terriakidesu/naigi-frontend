export function resolveSettingsHash(root: Document, hash: string) {
  const requested = hash === "#app" ? "#appearance" : hash || "#profile";
  const views = [...root.querySelectorAll<HTMLElement>("[data-settings-view]")];
  return views.some((view) => `#${view.id}` === requested) ? requested : "#profile";
}

export function renderSettingsNavigation(root: Document, hash: string) {
  const form = root.getElementById("app-preferences-form")!;
  form.hidden = !["#appearance", "#accessibility", "#chat-media", "#notifications"].includes(hash);
  for (const view of root.querySelectorAll<HTMLElement>("[data-settings-view]")) view.hidden = `#${view.id}` !== hash;
  let activeLink: HTMLAnchorElement | undefined;
  for (const link of root.querySelectorAll<HTMLAnchorElement>(".settings-nav-item")) {
    const active = link.hash === hash;
    link.classList.toggle("active", active);
    if (active) {
      activeLink = link;
      link.setAttribute("aria-current", "location");
    } else link.removeAttribute("aria-current");
  }
  root.getElementById("settings-page-title")!.textContent = activeLink?.dataset.title ?? "Settings";
  root.getElementById("settings-page-description")!.textContent = activeLink?.dataset.description ?? "Manage your Naigi account and this browser.";
}
