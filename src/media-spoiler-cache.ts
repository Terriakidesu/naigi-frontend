import type { SpoilerPreview } from "./media-spoiler-preview";

const DATABASE = "naigi-spoiler-previews";
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_ENTRIES = 128;
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
type Entry = { id: string; iv: Uint8Array; ciphertext: ArrayBuffer; size: number; usedAt: number };

async function cacheIdentity(content: Record<string, unknown>, userId: string) {
  const file = content.file as { url?: string; key?: { k?: string }; hashes?: unknown } | undefined;
  if (!file?.url || typeof file.key?.k !== "string") throw new Error("invalid_spoiler_cache_key");
  const encoded = file.key.k.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")), (char) => char.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("invalid_spoiler_cache_key");
  const salt = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(["spoiler-v1", userId, file.url, file.hashes])));
  const material = await crypto.subtle.importKey("raw", bytes, "HKDF", false, ["deriveKey"]);
  // Domain separation: never reuse the attachment's encryption key directly.
  const key = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode("naigi/spoiler-preview/cache/v1") }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  return { id: Array.from(new Uint8Array(salt), (byte) => byte.toString(16).padStart(2, "0")).join(""), key };
}

function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("previews", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("spoiler_cache_blocked"));
  });
}

export async function readSpoilerCache(content: Record<string, unknown>, userId: string): Promise<SpoilerPreview | undefined> {
  let database: IDBDatabase | undefined;
  try {
    const { id, key } = await cacheIdentity(content, userId);
    database = await openCache();
    const entry = await new Promise<Entry | undefined>((resolve, reject) => {
      const transaction = database!.transaction("previews", "readwrite");
      const store = transaction.objectStore("previews");
      const request = store.get(id);
      let result: Entry | undefined;
      request.onsuccess = () => {
        const value = request.result as Entry | undefined;
        if (value && Date.now() - value.usedAt <= MAX_AGE && value.size <= MAX_BYTES) {
          result = value;
          store.put({ ...value, usedAt: Date.now() });
        } else if (value) store.delete(id);
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    if (!entry) return undefined;
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(entry.iv), additionalData: new TextEncoder().encode(id) }, key, entry.ciphertext);
    const preview = JSON.parse(new TextDecoder().decode(plaintext)) as SpoilerPreview;
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(preview.src) || !Number.isFinite(preview.width) || !Number.isFinite(preview.height) || preview.width <= 0 || preview.height <= 0) return undefined;
    return preview;
  } catch {
    return undefined;
  } finally {
    database?.close();
  }
}

export async function writeSpoilerCache(content: Record<string, unknown>, userId: string, preview: SpoilerPreview) {
  let database: IDBDatabase | undefined;
  try {
    const { id, key } = await cacheIdentity(content, userId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) }, key, new TextEncoder().encode(JSON.stringify(preview)));
    if (ciphertext.byteLength > MAX_BYTES) return;
    database = await openCache();
    await new Promise<void>((resolve, reject) => {
      const transaction = database!.transaction("previews", "readwrite");
      const store = transaction.objectStore("previews");
      const request = store.getAll();
      request.onsuccess = () => {
        let bytes = ciphertext.byteLength;
        let count = 1;
        const entries = (request.result as Entry[]).sort((a, b) => b.usedAt - a.usedAt);
        for (const entry of entries) {
          if (entry.id === id) continue;
          if (Date.now() - entry.usedAt > MAX_AGE || count >= MAX_ENTRIES || bytes + entry.size > MAX_BYTES) store.delete(entry.id);
          else { bytes += entry.size; count += 1; }
        }
        store.put({ id, iv, ciphertext, size: ciphertext.byteLength, usedAt: Date.now() } satisfies Entry);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch {
    // Optional, encrypted cache: quota or storage failures never block Reveal.
  } finally {
    database?.close();
  }
}
