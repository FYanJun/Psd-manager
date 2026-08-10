export type StatusViewState = {
  message: string;
  actionLabel: string;
};

type StatusControllerPort = {
  write(state: StatusViewState): void;
};

export function createStatusController(port: StatusControllerPort) {
  let message = "";
  let actionLabel = "";
  let action: (() => void) | null = null;
  let hovered = false;
  let timer: ReturnType<typeof window.setTimeout> | null = null;

  function publish() {
    port.write({ message, actionLabel });
  }

  function clearTimer() {
    if (timer) window.clearTimeout(timer);
    timer = null;
  }

  function scheduleDismiss(duration = 2200) {
    clearTimer();
    if (!message || hovered) return;
    timer = window.setTimeout(() => {
      message = "";
      actionLabel = "";
      action = null;
      timer = null;
      publish();
    }, duration);
  }

  function show(nextMessage: string, duration = 2200, nextActionLabel = "", nextAction: (() => void) | null = null) {
    message = nextMessage;
    actionLabel = nextActionLabel;
    action = nextAction;
    hovered = false;
    publish();
    scheduleDismiss(duration);
  }

  function dismiss() {
    clearTimer();
    hovered = false;
    message = "";
    actionLabel = "";
    action = null;
    publish();
  }

  function runAction() {
    const currentAction = action;
    dismiss();
    currentAction?.();
  }

  function pause() {
    hovered = true;
    clearTimer();
  }

  function resume() {
    hovered = false;
    scheduleDismiss(3000);
  }

  function destroy() {
    clearTimer();
    action = null;
  }

  return { show, dismiss, runAction, pause, resume, destroy };
}
