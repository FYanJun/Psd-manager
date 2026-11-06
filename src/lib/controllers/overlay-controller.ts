import type {
  ActiveDialog,
  ActivePopover,
  ConfigData,
  DeviceType,
  PendingConfirmation,
  PopoverPosition,
  TypePickerScope,
  EditableContextKind,
} from "../types";
import { captureEditableSelection, restoreEditableSelection, type EditableSelection } from "../editable-context";

const EDITABLE_CONTEXT_SELECTOR = "input:not([type]), input[type='text'], input[type='search'], input[type='password'], input[type='email'], input[type='url'], input[type='tel'], input[type='number'], textarea";

export type OverlayState = {
  activeDialog: ActiveDialog;
  activePopover: ActivePopover;
  pendingConfirmation: PendingConfirmation | null;
  pendingImportedConfig: ConfigData | null;
  popoverPosition: PopoverPosition;
  contextDeviceType: "全部设备" | DeviceType;
  selectedDeviceType: "全部设备" | DeviceType;
  selectedAccountId: number;
  selectedAccountIds: number[];
  passwordVisible: boolean;
  visibleHistoryIds: number[];
  openTypePicker: TypePickerScope | null;
  bulkUsernameSuggestionsOpen: boolean;
  editableContext: {
    kind: EditableContextKind;
    canCopy: boolean;
    canCut: boolean;
    canPaste: boolean;
    canSelectAll: boolean;
    canClearSearch: boolean;
  } | null;
};

type OverlayPatch = Partial<OverlayState>;

type OverlayControllerPort = {
  read(): OverlayState;
  write(patch: OverlayPatch): void;
  hasSelectedDevice(): boolean;
  hasAccount(id: number): boolean;
  selectDevice(id: number): void;
  selectAccount(id: number): void;
  setEditableContextTarget(target: Element | null): void;
  hasClipboardText(): Promise<boolean>;
};

function isDomElement(target: EventTarget | null): target is Element {
  return typeof Element !== "undefined" && target instanceof Element;
}

export function isContextMenuControlTarget(target: EventTarget | null) {
  if (!isDomElement(target)) return false;
  return Boolean(target.closest("button, a, input, textarea, select, [role='button']"));
}

function isAccountSelectionTarget(target: EventTarget | null) {
  if (!isDomElement(target)) return false;
  return Boolean(target.closest(".account-select-box, input[type='checkbox']"));
}

function getEditableContextKind(target: Element): EditableContextKind | null {
  if (target.getAttribute("data-editable-context") === "search") return "search";
  if (target.getAttribute("data-editable-context") === "password") return "password";
  if (target.matches("input[type='search']")) return "search";
  if (target.matches("input[type='password']")) return "password";
  if (target.matches("input[type='number']")) return "number";
  if (target.matches("input, textarea")) return "text";
  return null;
}

export function createOverlayController(port: OverlayControllerPort) {
  let mounted = false;
  let pendingRightClick: { target: Element; x: number; y: number; selection: EditableSelection } | null = null;

  function getPopoverPosition(trigger: HTMLElement): PopoverPosition {
    const rect = trigger.getBoundingClientRect();
    return { top: rect.bottom, left: rect.left, reference: trigger };
  }

  function getPointerPopoverPosition(event: MouseEvent): PopoverPosition {
    return { top: event.clientY, left: event.clientX, contextElement: isDomElement(event.target) ? event.target : undefined };
  }

  function openPopover(popover: ActivePopover, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (port.read().activePopover === popover) {
      port.write({ activePopover: null });
      return;
    }

    port.write({
      popoverPosition: getPopoverPosition(event.currentTarget as HTMLElement),
      activePopover: popover,
    });
  }

  function openTypeContextMenu(deviceType: "全部设备" | DeviceType, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    port.write({
      contextDeviceType: deviceType,
      activeDialog: null,
      popoverPosition: getPointerPopoverPosition(event),
      activePopover: "type-context",
    });
  }

  function openDeviceContextMenu(id: number, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    port.selectDevice(id);
    port.write({
      activeDialog: null,
      popoverPosition: getPointerPopoverPosition(event),
      activePopover: "device-actions",
    });
  }

  function openAccountContextMenu(id: number, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (isAccountSelectionTarget(event.target)) return;
    if (!port.hasAccount(id)) return;
    port.selectAccount(id);
    port.write({
      selectedAccountId: id,
      selectedAccountIds: [],
      passwordVisible: false,
      visibleHistoryIds: [],
      activeDialog: null,
      popoverPosition: getPointerPopoverPosition(event),
      activePopover: "account-context",
    });
  }

  function openTypeBlankContextMenu(event: MouseEvent) {
    if (isContextMenuControlTarget(event.target)) return;
    event.preventDefault();
    const { selectedDeviceType } = port.read();
    port.write({
      contextDeviceType: selectedDeviceType,
      activeDialog: null,
      popoverPosition: getPointerPopoverPosition(event),
      activePopover: "type-blank-context",
    });
  }

  function openDeviceListBlankContextMenu(event: MouseEvent) {
    if (isContextMenuControlTarget(event.target)) return;
    event.preventDefault();
    const { selectedDeviceType } = port.read();
    port.write({
      contextDeviceType: selectedDeviceType,
      activeDialog: null,
      popoverPosition: getPointerPopoverPosition(event),
      activePopover: "list-blank-context",
    });
  }

  function openDetailBlankContextMenu(event: MouseEvent) {
    if (port.hasSelectedDevice() || isContextMenuControlTarget(event.target)) return;
    event.preventDefault();
    const { selectedDeviceType } = port.read();
    port.write({
      contextDeviceType: selectedDeviceType,
      activeDialog: null,
      popoverPosition: getPointerPopoverPosition(event),
      activePopover: "detail-blank-context",
    });
  }

  function closePopoverWhenPointerLeavesMenu(event: Event) {
    if (port.read().activePopover !== "editable-context") return;
    if (isDomElement(event.target) && event.target.closest(".action-popover")) return;
    port.write({ activePopover: null });
  }

  function closeOverlays() {
    port.write({
      activePopover: null,
      activeDialog: null,
      pendingConfirmation: null,
      pendingImportedConfig: null,
      openTypePicker: null,
      bulkUsernameSuggestionsOpen: false,
    });
  }

  function cancelPendingConfirmation() {
    const state = port.read();
    port.write({
      activePopover: null,
      pendingConfirmation: null,
      pendingImportedConfig: null,
      openTypePicker: null,
      bulkUsernameSuggestionsOpen: false,
      ...(state.activeDialog ? {} : { activeDialog: null }),
    });
  }

  function handleEditableMouseDown(event: MouseEvent) {
    if (pendingRightClick) return;
    const pointerTarget = isDomElement(event.target) ? event.target : null;
    const contextPress = event.button === 2 || (event.button === 0 && event.ctrlKey);
    const editableTarget = contextPress
      ? pointerTarget?.closest(EDITABLE_CONTEXT_SELECTOR)
      : null;
    const editableKind = editableTarget ? getEditableContextKind(editableTarget) : null;
    if (editableTarget && editableKind) {
      const input = editableTarget as HTMLInputElement;
      const selection = captureEditableSelection(input);
      pendingRightClick = {
        target: editableTarget,
        x: event.clientX,
        y: event.clientY,
        selection,
      };
      port.setEditableContextTarget(editableTarget);
    }
  }

  function handleGlobalPointerDown(event: PointerEvent) {
    pendingRightClick = null;
    handleEditableMouseDown(event);
    closePopoverWhenPointerLeavesMenu(event);
  }

  function handleGlobalContextMenu(event: MouseEvent) {
    const target = event.target;
    const targetElement = isDomElement(target) ? target : null;
    const pressed = pendingRightClick;
    pendingRightClick = null;
    const editableTarget = targetElement?.closest(EDITABLE_CONTEXT_SELECTOR);
    const editableKind = editableTarget ? getEditableContextKind(editableTarget) : null;
    const state = port.read();

    if (editableTarget && editableKind) {
      event.preventDefault();
      const preservedSelection = pressed?.target === editableTarget && pressed.x === event.clientX && pressed.y === event.clientY;
      const input = editableTarget as HTMLInputElement;
      if (preservedSelection) restoreEditableSelection(input, pressed.selection);
      else port.setEditableContextTarget(editableTarget);
      const isHiddenPassword = editableKind === "password" && input.type === "password";
      const hasSelection = preservedSelection ? pressed.selection.start !== pressed.selection.end
        : editableKind === "number" ? Boolean(input.value) : input.selectionStart !== input.selectionEnd;
      const editableContext = {
        kind: editableKind,
        canCopy: !input.disabled && !isHiddenPassword && hasSelection,
        canCut: !input.disabled && !isHiddenPassword && hasSelection && !input.readOnly,
        canPaste: false,
        canSelectAll: !input.disabled && Boolean(input.value),
        canClearSearch: editableKind === "search" && !input.disabled && !input.readOnly && Boolean(input.value),
      };
      port.write({
        popoverPosition: getPointerPopoverPosition(event),
        activePopover: "editable-context",
        editableContext,
      });
      if (!input.readOnly && !input.disabled) {
        void port.hasClipboardText().then((hasText) => {
          const current = port.read();
          if (current.activePopover !== "editable-context" || current.editableContext !== editableContext
            || !input.isConnected || input.readOnly || input.disabled) return;
          port.write({ editableContext: { ...editableContext, canPaste: hasText } });
        }).catch(() => {});
      }
      return;
    }

    if (targetElement?.closest("select, [contenteditable='true'], input[type='date'], input[type='datetime-local'], input[type='month'], input[type='week'], input[type='time'], input[type='color']")) {
      event.preventDefault();
      port.write({ activePopover: null, editableContext: null });
      return;
    }

    event.preventDefault();
    port.setEditableContextTarget(null);
    if (state.editableContext) port.write({ editableContext: null });
    if (!state.activePopover || targetElement?.closest(".action-popover")) return;
    const hasContextMenuOwner = targetElement?.closest(".sidebar, .list-scroll, .detail-pane");
    if (!hasContextMenuOwner) port.write({ activePopover: null });
  }

  function mount() {
    if (mounted) return;
    mounted = true;
    window.addEventListener("pointerdown", handleGlobalPointerDown, true);
    window.addEventListener("mousedown", handleEditableMouseDown, true);
    window.addEventListener("contextmenu", handleGlobalContextMenu, true);
  }

  function destroy() {
    if (!mounted) return;
    mounted = false;
    pendingRightClick = null;
    window.removeEventListener("pointerdown", handleGlobalPointerDown, true);
    window.removeEventListener("mousedown", handleEditableMouseDown, true);
    window.removeEventListener("contextmenu", handleGlobalContextMenu, true);
  }

  return {
    getPopoverPosition,
    getPointerPopoverPosition,
    openPopover,
    openTypeContextMenu,
    openDeviceContextMenu,
    openAccountContextMenu,
    isContextMenuControlTarget,
    openTypeBlankContextMenu,
    openDeviceListBlankContextMenu,
    openDetailBlankContextMenu,
    closePopoverWhenPointerLeavesMenu,
    closeOverlays,
    cancelPendingConfirmation,
    handleGlobalPointerDown,
    handleEditableMouseDown,
    handleGlobalContextMenu,
    mount,
    destroy,
  };
}
