export type PasswordStrengthSession = {
  refresh(password: string, userInputs: string[]): void;
  reset(): void;
};

type PasswordStrengthSessionOptions = {
  setLabel(label: string): void;
  delayMs?: number;
  loadEstimator?: () => Promise<{ getPasswordStrengthLabel(password: string, inputs: string[]): string }>;
  clock?: { setTimeout(callback: () => void, delay: number): number; clearTimeout(timer: number): void };
};

export function createPasswordStrengthSession({
  setLabel, delayMs = 180,
  loadEstimator = () => import("./password-strength"),
  clock = { setTimeout: (callback, delay) => window.setTimeout(callback, delay), clearTimeout: timer => window.clearTimeout(timer) },
}: PasswordStrengthSessionOptions): PasswordStrengthSession {
  let requestId = 0;
  let timer: ReturnType<typeof window.setTimeout> | null = null;
  let cacheKey = "";
  let cacheValue = "";

  function clearTimer() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  }

  function reset() {
    clearTimer();
    requestId += 1;
    cacheKey = "";
    cacheValue = "";
    setLabel("");
  }

  function refresh(password: string, userInputs: string[]) {
    const currentRequestId = ++requestId;
    clearTimer();
    if (!password) {
      setLabel("");
      return;
    }

    const nextCacheKey = `${password}\u0000${userInputs.join("\u0000")}`;
    if (nextCacheKey === cacheKey) {
      setLabel(cacheValue);
      return;
    }

    setLabel("计算中");
    timer = clock.setTimeout(() => {
      timer = null;
      void (async () => {
        try {
          const { getPasswordStrengthLabel } = await loadEstimator();
          if (currentRequestId !== requestId) return;
          const label = getPasswordStrengthLabel(password, userInputs);
          cacheKey = nextCacheKey;
          cacheValue = label;
          setLabel(label);
        } catch {
          if (currentRequestId === requestId) setLabel("暂不可用");
        }
      })();
    }, delayMs);
  }

  return { refresh, reset };
}
