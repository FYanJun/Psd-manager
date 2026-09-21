type SearchClock = {
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(timer: number): void;
};
export function createSearchSession(apply: (value: string) => void, clock: SearchClock) {
  let timer: number | null = null;
  function cancel() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  }
  function update(value: string) {
    cancel();
    if (!value.trim()) { apply(value); return; }
    timer = clock.setTimeout(() => {
      timer = null;
      apply(value);
    }, 140);
  }
  return { update, cancel };
}
