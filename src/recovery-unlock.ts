export function setupRecoveryUnlock<T>(open: () => Promise<T>, root: Document = document) {
  const form = root.getElementById("recovery-unlock-form") as HTMLFormElement;
  const input = root.getElementById("recovery-local-passphrase") as HTMLInputElement;
  const button = root.getElementById("recovery-unlock-button") as HTMLButtonElement;
  const status = root.getElementById("recovery-unlock-status") as HTMLElement;
  let pending: Promise<T> | undefined;
  let ready: T | undefined;

  function reset() {
    ready = undefined;
    input.value = "";
    input.disabled = false;
    button.disabled = false;
    button.textContent = "Unlock recovery";
    status.textContent = "Locked. Unlock this device to restore, back up, or transfer history. Your passphrase stays on this device.";
    status.classList.remove("error");
  }

  function unlock(): Promise<T> {
    if (pending) return pending;
    if (ready !== undefined) return Promise.resolve(ready);
    button.disabled = true;
    button.textContent = "Unlocking…";
    status.textContent = "Opening this device’s encrypted key store…";
    status.classList.remove("error");
    // Defer opening until pending is assigned, including synchronous failures.
    pending = Promise.resolve().then(open).then((client) => {
      ready = client;
      input.value = "";
      input.disabled = true;
      button.textContent = "Recovery unlocked";
      status.textContent = "Unlocked for this settings session. You can now restore, back up, or transfer history.";
      return client;
    }).catch((error: unknown) => {
      button.disabled = false;
      button.textContent = "Unlock recovery";
      status.textContent = error instanceof Error ? error.message : "Unable to unlock recovery. Try again.";
      status.classList.add("error");
      throw error;
    }).finally(() => { pending = undefined; });
    return pending;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void unlock().catch(() => undefined);
  });

  return {
    unlock,
    async reset() {
      // Let an active initialization settle before the caller closes/deletes it.
      await pending?.catch(() => undefined);
      reset();
    },
  };
}
