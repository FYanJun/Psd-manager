import { replaceEditableSelection, restoreEditableSelection, selectedEditableText, type EditableSelection, type EditableTarget } from "../editable-context";
import type { OverlayState } from "./overlay-controller";

type EditableContextState = Pick<OverlayState, "activePopover" | "editableContext"> & {
  editableContextTarget: EditableTarget | null;
  editableSelection: EditableSelection;
};

type EditableContextPort = {
  read(): EditableContextState;
  write(patch: Partial<Pick<EditableContextState, "activePopover" | "editableContext" | "editableSelection">>): void;
  copyText(text: string, label: string): Promise<boolean>;
  readClipboardText(): Promise<string>;
  showStatus(message: string): void;
  clearSearch(): void;
};

export function createEditableContextController(port: EditableContextPort) {
  function getActionTarget(permission: "canCopy" | "canCut" | "canPaste" | "canSelectAll" | "canClearSearch") {
    const state = port.read();
    const target = state.editableContextTarget;
    if (state.activePopover !== "editable-context" || !target?.isConnected || !state.editableContext?.[permission] || target.disabled) return null;
    if ((permission === "canCut" || permission === "canPaste" || permission === "canClearSearch") && target.readOnly) return null;
    if ((permission === "canCopy" || permission === "canCut") && target.type === "password") return null;
    if (permission === "canClearSearch" && state.editableContext.kind !== "search") return null;
    return { state, target, context: state.editableContext };
  }

  function isCurrentAction(target: EditableTarget, context: NonNullable<EditableContextState["editableContext"]>, originalValue: string, permission: "canCut" | "canPaste") {
    const current = getActionTarget(permission);
    return current?.target === target && current.context === context && target.value === originalValue;
  }

  async function editCopy() {
    const action = getActionTarget("canCopy");
    if (!action) return;
    const text = selectedEditableText(action.target, action.state.editableSelection);
    if (text) await port.copyText(text, "选中内容");
  }

  async function editCut() {
    const action = getActionTarget("canCut");
    if (!action) return;
    const { target, context } = action;
    const selection = { ...action.state.editableSelection };
    const originalValue = target.value;
    if (!await port.copyText(selectedEditableText(target, selection), "选中内容")) return;
    if (!isCurrentAction(target, context, originalValue, "canCut")) return;
    replaceEditableSelection(target, selection, "");
    port.write({ editableSelection: { start: 0, end: 0 }, activePopover: null, editableContext: null });
  }

  async function editPaste() {
    const action = getActionTarget("canPaste");
    if (!action) return;
    const { target, context } = action;
    const selection = { ...action.state.editableSelection };
    const originalValue = target.value;
    try {
      restoreEditableSelection(target, selection);
      const value = await port.readClipboardText();
      if (!isCurrentAction(target, context, originalValue, "canPaste")) return;
      if (!value) {
        port.write({ editableContext: { ...context, canPaste: false } });
        return;
      }
      replaceEditableSelection(target, selection, value);
      port.write({ activePopover: null, editableContext: null });
    } catch {
      if (isCurrentAction(target, context, originalValue, "canPaste")) {
        port.write({ editableContext: { ...context, canPaste: false } });
      }
      port.showStatus("粘贴失败");
    }
  }

  function editSelectAll() {
    const action = getActionTarget("canSelectAll");
    if (!action) return;
    action.target.focus();
    action.target.select();
    port.write({ activePopover: null, editableContext: null });
  }

  function editClearSearch() {
    if (!getActionTarget("canClearSearch")) return;
    port.clearSearch();
    port.write({ activePopover: null, editableContext: null });
  }

  return { editCopy, editCut, editPaste, editSelectAll, editClearSearch };
}
