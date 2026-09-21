export type AutoLockSession = {
  schedule(): void;
  clear(): void;
  activity(): void;
};

type AutoLockSessionOptions = {
  read(): {
    enabled: boolean;
    locked: boolean;
    hasRecoveryKey: boolean;
    minutes: number;
    storageReady: boolean;
    settingsLoaded: boolean;
  };
  lock(): void | Promise<void>;
  activityThrottleMs?: number;
  clock?: {
    now(): number;
    setTimeout(callback: () => void, delay: number): number;
    clearTimeout(timer: number): void;
  };
};

export function createAutoLockSession({
  read, lock, activityThrottleMs = 1000,
  clock = { now: () => Date.now(), setTimeout: (callback, delay) => window.setTimeout(callback, delay), clearTimeout: timer => window.clearTimeout(timer) },
}: AutoLockSessionOptions): AutoLockSession {
  let timer: ReturnType<typeof window.setTimeout> | null = null;
  let lastActivityAt = 0;

  function clear() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    clear();
    const state = read();
    if (!state.settingsLoaded || !state.storageReady || !state.enabled || state.locked || state.hasRecoveryKey || state.minutes <= 0) return;
    timer = clock.setTimeout(() => {
      timer = null;
      void lock();
    }, state.minutes * 60 * 1000);
  }

  function activity() {
    if (read().locked) return;
    const now = clock.now();
    if (now - lastActivityAt < activityThrottleMs) return;
    lastActivityAt = now;
    schedule();
  }

  return { schedule, clear, activity };
}
