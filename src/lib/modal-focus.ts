type FocusTarget = { isConnected: boolean; focus(options?: FocusOptions): void };
type ModalTarget = FocusTarget & { contains(node: Node | null): boolean };

export function restoreModalFocus(top: ModalTarget | undefined, previous: (FocusTarget & Node) | null) {
  if (previous?.isConnected && (!top || top.contains(previous))) {
    previous.focus({ preventScroll: true });
  } else if (top?.isConnected) {
    top.focus({ preventScroll: true });
  }
}

export function removeModal<T>(stack: T[], modal: T): boolean {
  const index = stack.indexOf(modal);
  if (index < 0) return false;
  const wasTop = index === stack.length - 1;
  stack.splice(index, 1);
  return wasTop;
}
