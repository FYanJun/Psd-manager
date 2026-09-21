import type { AppSettings } from "./types";

type Clock = { setTimeout(callback: () => void, delay: number): number; clearTimeout(timer: number): void };
export function createSettingsSaveSession(port: {
  read(): AppSettings;
  ready(): boolean;
  save(settings: AppSettings): Promise<void>;
  onError(error: unknown): void;
}, clock: Clock) {
  let timer: number | null = null;
  let queue: Promise<void> = Promise.resolve();
  function cancel() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  }
  function persist() {
    cancel();
    const snapshot = port.read();
    const save = queue.then(() => port.save(snapshot));
    queue = save.catch(() => undefined);
    return save;
  }
  function schedule() {
    if (!port.ready()) return;
    cancel();
    timer = clock.setTimeout(() => {
      timer = null;
      void persist().catch(port.onError);
    }, 220);
  }
  return { persist, schedule, cancel, settled: () => queue };
}
