import { confirmExternalUrl as showExternalUrlDialog } from "./ui-dialog";
import { platform } from "#platform";

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function confirmExternalUrl(value: string, mode: "link" | "media"): Promise<boolean> {
  const url = safeUrl(value);
  if (!url) return Promise.resolve(false);
  if (typeof window === "undefined" || url.origin === window.location.origin) return Promise.resolve(true);
  return platform.getServerOrigin().then((origin) => origin === url.origin
    ? true
    : showExternalUrlDialog(url, mode)).catch(() => false);
}

export function confirmExternalLink(value: string) {
  return confirmExternalUrl(value, "link");
}

export function confirmExternalMedia(value: string) {
  return confirmExternalUrl(value, "media");
}

export function guardExternalLink(link: HTMLAnchorElement, value = link.href) {
  const url = safeUrl(value);
  if (!url || typeof window === "undefined" || url.origin === window.location.origin) return;

  const navigate = (event: MouseEvent) => {
    if (event.defaultPrevented) return;
    if (event.type === "click" && event.button !== 0) return;
    if (event.type === "auxclick" && event.button !== 1) return;
    event.preventDefault();
    void platform.getServerOrigin().then(async (origin) => {
      if (platform.kind === "desktop" && url.origin === origin) {
        const appUrl = new URL(`${url.pathname}${url.search}${url.hash}`, window.location.href);
        window.location.assign(appUrl.href);
        return;
      }
      const approved = await confirmExternalLink(url.href);
      if (!approved) return;
      const target = link.target || "_blank";
      if (target === "_self") {
        window.location.assign(url.href);
        return;
      }
      window.open(url.href, target, "noopener,noreferrer");
    }).catch(() => undefined);
  };

  link.addEventListener("click", navigate);
  link.addEventListener("auxclick", navigate);
}
