// Mobile composer sheets.
//
// On phones the attachment and emoji/GIF controls are too small and the popovers
// have nowhere to go, so they move into a full-width sheet that sits directly
// under the composer:
//
//   media add                 emoji / GIF
//   [ composer ]              [ composer ]
//   [ Photos ] [ Files ]      [ Emoji ] [ GIFs ]
//   [ grid of attachments ]   [ grid of emoji or GIFs ]
//
// The same DOM nodes are reused: the sheet borrows them and returns them on close,
// so there is still only one composer, one picker, and one attachment list.

export type SheetMode = "media" | "emoji" | "gif";

export type SheetNodes = {
  sheet: HTMLElement;
  body: HTMLElement;
  tabs: HTMLElement;
  tabButtons: Partial<Record<"emoji" | "gif", HTMLButtonElement>>;
  closeButton: HTMLButtonElement;
  scrim?: HTMLElement;
  /** Moved into the sheet while it is open. */
  media: HTMLElement[];
  emojiPicker: HTMLElement;
  gifPicker: HTMLElement;
  /** Shown instead of the desktop popover toggles on mobile. */
  photoButton: HTMLButtonElement;
  filesButton: HTMLButtonElement;
  mediaTab: HTMLButtonElement;
};

type Placement = { parent: Node; before: Node | null };

function borrow(node: HTMLElement, into: HTMLElement): Placement {
  const placement: Placement = { parent: node.parentNode ?? into, before: node.nextSibling };
  into.append(node);
  return placement;
}

function returnNode(node: HTMLElement, placement: Placement) {
  placement.parent.insertBefore(node, placement.before);
}

export function createMobileSheet(
  nodes: SheetNodes,
  hooks: { onModeChange?: (mode: SheetMode) => void; onOpen?: () => void; onClose?: () => void } = {},
) {
  const borrowed = new Map<HTMLElement, Placement>();
  let open = false;
  let mode: SheetMode = "media";

  const tabFor = (candidate: SheetMode) => (candidate === "gif" ? nodes.tabButtons.gif : nodes.tabButtons.emoji);

  function place(node: HTMLElement) {
    if (borrowed.has(node) || !node.isConnected || !node.parentNode) return;
    borrowed.set(node, borrow(node, nodes.body));
  }

  function release(node: HTMLElement) {
    const placement = borrowed.get(node);
    if (!placement) return;
    borrowed.delete(node);
    returnNode(node, placement);
  }

  /** Only the active panel stays in the sheet, so two grids never show at once. */
  function releaseAllExcept(keep: Set<HTMLElement>) {
    for (const node of [...borrowed.keys()]) if (!keep.has(node)) release(node);
  }

  function showMode(next: SheetMode) {
    mode = next;
    const media = next === "media";
    const active = media ? nodes.media : next === "gif" ? [nodes.gifPicker] : [nodes.emojiPicker];
    releaseAllExcept(new Set(active));
    for (const node of active) place(node);
    for (const [candidate, button] of Object.entries(nodes.tabButtons)) {
      if (!button) continue;
      const activeTab = candidate === next;
      button.hidden = media;
      button.setAttribute("aria-selected", String(activeTab));
      button.tabIndex = activeTab ? 0 : -1;
    }
    nodes.mediaTab?.setAttribute("aria-selected", String(media));
    nodes.emojiPicker.hidden = next !== "emoji";
    nodes.gifPicker.hidden = next !== "gif";
    nodes.tabs.hidden = false;
    nodes.body.dataset.mode = next;
    hooks.onModeChange?.(next);
  }

  function show() {
    if (open) return;
    open = true;
    nodes.sheet.hidden = false;
    nodes.sheet.setAttribute("data-sheet-open", "true");
    showMode(mode);
    // Opening from a composer button should not steal focus and raise the keyboard.
    if (document.activeElement?.closest(".composer")) return;
    hooks.onOpen?.();
    (tabFor(mode) ?? nodes.closeButton).focus({ preventScroll: true });
  }

  function hide() {
    if (!open) return;
    open = false;
    nodes.sheet.removeAttribute("data-sheet-open");
    releaseAllExcept(new Set());
    nodes.sheet.hidden = true;
    nodes.emojiPicker.hidden = true;
    nodes.gifPicker.hidden = true;
    hooks.onClose?.();
  }

  function openMode(next: SheetMode) {
    if (open && mode === next) return hide();
    mode = next;
    // An already open sheet must re-render, otherwise the previous panel stays visible.
    if (open) showMode(next);
    else show();
  }

  nodes.closeButton.addEventListener("click", hide);
  nodes.scrim?.addEventListener("click", hide);
  nodes.mediaTab?.addEventListener("click", () => openMode("media"));
  nodes.tabButtons.emoji?.addEventListener("click", () => openMode("emoji"));
  nodes.tabButtons.gif?.addEventListener("click", () => openMode("gif"));

  return {
    show,
    hide,
    openMode,
    isOpen: () => open,
    mode: () => mode,
    destroy: hide,
  };
}

export type MobileSheet = ReturnType<typeof createMobileSheet>;
