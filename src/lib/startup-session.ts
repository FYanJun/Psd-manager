type StartupPort = {
  protectClose(): Promise<void>;
  registerTrayLock(): Promise<() => void>;
  initializeSettings(): Promise<void>;
  initializeVault(): Promise<void>;
  onTrayError(error: unknown): void;
  onStartupError(error: unknown): void;
};

// Each mount owns one session. Destroy stops subsequent stages, not an already
// executing platform operation; late listener registration is released here.
export function createStartupSession(port: StartupPort) {
  let disposed = false;
  let removeTray: (() => void) | undefined;
  let started: Promise<void> | undefined;

  async function initialize() {
    try {
      await port.protectClose();
      if (disposed) return;
      try {
        const remove = await port.registerTrayLock();
        if (disposed) { remove(); return; }
        removeTray = remove;
      } catch (error) {
        if (!disposed) port.onTrayError(error);
      }
      if (disposed) return;
      await port.initializeSettings();
      if (disposed) return;
      await port.initializeVault();
    } catch (error) {
      if (!disposed) port.onStartupError(error);
    }
  }

  return {
    start() {
      if (disposed) return Promise.resolve();
      return started ??= initialize();
    },
    destroy() {
      disposed = true;
      const remove = removeTray;
      removeTray = undefined;
      remove?.();
    },
  };
}
