/** The select remains the value/event source, but never opens the browser's native picker. */
export function customDropdown(select: HTMLSelectElement) {
  const root = document.createElement("span");
  root.className = "custom-dropdown";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "custom-dropdown-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const menu = document.createElement("span");
  menu.id = `${select.id}-options`;
  menu.className = "custom-dropdown-menu";
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", select.getAttribute("aria-label") ?? "Options");
  menu.hidden = true;
  trigger.setAttribute("aria-controls", menu.id);
  select.after(root);
  root.append(trigger, menu);
  select.hidden = true;

  const close = (restoreFocus = false) => {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger.focus();
  };
  const refresh = () => {
    const focusedIndex = [...menu.children].indexOf(document.activeElement as Element);
    trigger.textContent = `${select.selectedOptions[0]?.textContent ?? "Choose"} ▾`;
    trigger.setAttribute("aria-label", `${select.getAttribute("aria-label") ?? "Choose"}: ${select.selectedOptions[0]?.textContent ?? ""}`);
    trigger.disabled = select.disabled;
    menu.replaceChildren();
    for (const option of select.options) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "custom-dropdown-option";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.selected));
      item.textContent = option.textContent;
      item.disabled = option.disabled;
      item.tabIndex = -1;
      item.addEventListener("click", () => {
        select.value = option.value;
        close(true);
        refresh();
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      menu.append(item);
    }
    if (!menu.hidden && focusedIndex >= 0) (menu.children[focusedIndex] as HTMLButtonElement | undefined)?.focus();
  };
  const open = () => {
    if (select.disabled) return;
    refresh();
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    (menu.querySelector<HTMLButtonElement>('[aria-selected="true"]:not(:disabled)') ?? menu.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus();
  };
  trigger.addEventListener("click", () => menu.hidden ? open() : close());
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(true); return; }
    if (event.key === "Tab") { close(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (menu.hidden) { open(); return; }
    const items = [...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
      : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  });
  root.addEventListener("focusout", (event) => {
    if (!root.contains(event.relatedTarget as Node | null)) close();
  });
  const outside = (event: PointerEvent) => { if (!root.contains(event.target as Node)) close(); };
  document.addEventListener("pointerdown", outside);
  select.addEventListener("change", refresh);
  const observer = new MutationObserver(refresh);
  observer.observe(select, { childList: true, subtree: true, attributes: true, characterData: true });
  refresh();
  return { refresh, close, destroy: () => {
    observer.disconnect();
    document.removeEventListener("pointerdown", outside);
    select.removeEventListener("change", refresh);
    root.remove();
    select.hidden = false;
  } };
}
