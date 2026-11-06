export type EditableTarget = HTMLInputElement | HTMLTextAreaElement;
export type EditableSelection = { start: number; end: number };

export function captureEditableSelection(target: EditableTarget): EditableSelection {
  if (target.type === "number") {
    return { start: 0, end: target.value.length };
  }
  if (target.ownerDocument?.activeElement !== target) {
    return { start: target.value.length, end: target.value.length };
  }
  return { start: target.selectionStart ?? target.value.length, end: target.selectionEnd ?? target.value.length };
}

export function selectedEditableText(target: EditableTarget, selection: EditableSelection) {
  return target.value.slice(selection.start, selection.end);
}

export function restoreEditableSelection(target: EditableTarget, selection: EditableSelection) {
  target.focus({ preventScroll: true });
  if (target.type !== "number") {
    const start = Math.max(0, Math.min(selection.start, target.value.length));
    const end = Math.max(start, Math.min(selection.end, target.value.length));
    target.setSelectionRange(start, end);
  }
}

export function replaceEditableSelection(target: EditableTarget, selection: EditableSelection, value: string) {
  restoreEditableSelection(target, selection);
  // Single-line DOM inputs strip line breaks. Let credential fields reject the
  // original paste before that normalization can change a password silently.
  if (target.dataset?.accountPassword === "true") {
    const beforeReplace = new CustomEvent("editable-before-replace", {
      bubbles: true,
      cancelable: true,
      detail: { value: target.value.slice(0, selection.start) + value + target.value.slice(selection.end) },
    });
    if (!target.dispatchEvent(beforeReplace)) return;
  }
  if (target.type === "number") {
    target.value = value;
  } else {
    target.setRangeText(value, selection.start, selection.end, "end");
  }
  target.dispatchEvent(new Event("input", { bubbles: true }));
}
