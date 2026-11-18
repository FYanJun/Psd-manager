import { shortStatusResult, type StatusPresentation } from "../status-presentation";

export type StatusViewState = {
  message: string;
  actionLabel: string;
  presentation: StatusPresentation;
};
type Notice = StatusViewState & {
  action: (() => void) | null;
  duration: number;
};
type StatusControllerPort = {
  write(state: StatusViewState): void;
  writeAlert?(state: StatusViewState): void;
};

const emptyState = (): StatusViewState => ({
  message: "",
  actionLabel: "",
  presentation: { tone: "info", operation: "general" },
});

export function createStatusController(port: StatusControllerPort) {
  const queue: Notice[] = [];
  let current: Notice | null = null;
  let alert: Notice | null = null;
  let paused = false;
  let remaining = 0;
  let startedAt = 0;
  let timer: ReturnType<typeof window.setTimeout> | null = null;

  function clearTimer() {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    clearTimer();
    if (!current || paused) return;
    startedAt = Date.now();
    timer = window.setTimeout(dismiss, remaining);
  }

  function advance() {
    current = queue.shift() ?? null;
    if (!current) paused = false;
    remaining = current?.duration ?? 0;
    port.write(current ?? emptyState());
    schedule();
  }

  function show(
    message: string,
    duration?: number,
    actionLabel = "",
    action: (() => void) | null = null,
    presentation: StatusPresentation = { tone: "info", operation: "general" },
  ) {
    if (!message) return;
    const actionable = Boolean(actionLabel && action);
    const limit = actionable ? 7000 : 3000;
    const requested = duration !== undefined && Number.isFinite(duration)
      ? duration
      : actionable ? 7000 : 2500;
    const notice: Notice = {
      message,
      actionLabel: actionable ? actionLabel : "",
      action: actionable ? action : null,
      presentation,
      duration: Math.max(2000, Math.min(requested, limit)),
    };
    if (presentation.tone === "error" || presentation.tone === "warning") {
      alert = notice;
      port.writeAlert?.(notice);
      return;
    }
    notice.message = shortStatusResult(message, presentation);
    queue.push(notice);
    if (!current) advance();
  }

  function dismiss() {
    clearTimer();
    advance();
  }

  function runAction() {
    const action = current?.action;
    if (!action) return;
    current!.action = null;
    dismiss();
    action();
  }

  function pause() {
    if (paused) return;
    paused = true;
    if (timer !== null) remaining = Math.max(0, remaining - (Date.now() - startedAt));
    clearTimer();
  }

  function resume() {
    if (!paused) return;
    paused = false;
    schedule();
  }

  function dismissAlert() {
    alert = null;
    port.writeAlert?.(emptyState());
  }

  function runAlertAction() {
    const action = alert?.action;
    dismissAlert();
    action?.();
  }

  function destroy() {
    clearTimer();
    queue.length = 0;
    current = null;
    alert = null;
    paused = false;
    port.write(emptyState());
    port.writeAlert?.(emptyState());
  }

  return { show, dismiss, runAction, pause, resume, dismissAlert, runAlertAction, destroy };
}
