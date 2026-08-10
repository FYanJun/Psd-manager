import type {
  ActiveDialog,
  ActivePopover,
  ConfigData,
  DeviceType,
  PendingConfirmation,
  PopoverPosition,
  TypePickerScope,
} from "../types";

const POPOVER_WIDTH = 236;
const POINTER_POPOVER_HEIGHT = 330;
const VIEWPORT_PADDING = 12;

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
};

type OverlayPatch = Partial<OverlayState>;

type OverlayControllerPort = {
  read(): OverlayState;
  write(patch: OverlayPatch): void;
  hasSelectedDevice(): boolean;
  hasAccount(id: number): boolean;
  selectDevice(id: number): void;
  selectAccount(id: number): void;
};

function isHtmlElement(target: EventTarget | null): target is HTMLElement {
  return typeof HTMLElement !== "undefined" && target instanceof HTMLElement;
}

export function createOverlayController(port: OverlayControllerPort) {
  let mounted = false;

  function getPopoverPosition(trigger: HTMLElement): PopoverPosition {
    const rect = trigger.getBoundingClientRect();
    const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING);
    const left = Math.min(Math.max(rect.right - POPOVER_WIDTH, VIEWPORT_PADDING), maxLeft);
    const top = Math.min(Math.max(rect.bottom + 8, VIEWPORT_PADDING), window.innerHeight - VIEWPORT_PADDING);
    return { top, left };
  }

  function getPointerPopoverPosition(event: MouseEvent): PopoverPosition {
    const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING);
    const maxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - POINTER_POPOVER_HEIGHT - VIEWPORT_PADDING);
    const left = Math.min(
      Math.max(event.clientX, VIEWPORT_PADDING),
      maxLeft,
    );
    const top = Math.min(
      Math.max(event.clientY, VIEWPORT_PADDING),
      maxTop,
    );
    return { top, left };
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

  function isContextMenuControlTarget(target: EventTarget | null) {
    if (!isHtmlElement(target)) return false;
    return Boolean(target.closest("button, a, input, textarea, select, [role='button']"));
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
    if (!port.read().activePopover) return;
    if (isHtmlElement(event.target) && event.target.closest(".action-popover")) return;
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

  function handleGlobalPointerDown(event: PointerEvent) {
    closePopoverWhenPointerLeavesMenu(event);
    const target = event.target;
    if (!isHtmlElement(target)) return;
    const state = port.read();
    const patch: OverlayPatch = {};
    if (state.openTypePicker && !target.closest(".type-combo")) patch.openTypePicker = null;
    if (state.bulkUsernameSuggestionsOpen && !target.closest(".bulk-username-field")) {
      patch.bulkUsernameSuggestionsOpen = false;
    }
    if (Object.keys(patch).length > 0) port.write(patch);
  }

  function handleGlobalContextMenu(event: MouseEvent) {
    const target = event.target;
    const targetElement = isHtmlElement(target) ? target : null;
    const isEditableControl = Boolean(targetElement?.closest(
      "input:not([type]), input[type='text'], input[type='search'], input[type='password'], input[type='email'], input[type='url'], input[type='tel'], input[type='number'], textarea, select, [contenteditable='true']",
    ));
    const state = port.read();

    if (isEditableControl) {
      if (state.activePopover) port.write({ activePopover: null });
      return;
    }

    event.preventDefault();
    if (!state.activePopover || targetElement?.closest(".action-popover")) return;
    const hasContextMenuOwner = targetElement?.closest(".sidebar, .list-scroll, .detail-pane");
    if (!hasContextMenuOwner) port.write({ activePopover: null });
  }

  function mount() {
    if (mounted) return;
    mounted = true;
    window.addEventListener("pointerdown", handleGlobalPointerDown, true);
    window.addEventListener("contextmenu", handleGlobalContextMenu, true);
  }

  function destroy() {
    if (!mounted) return;
    mounted = false;
    window.removeEventListener("pointerdown", handleGlobalPointerDown, true);
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
    handleGlobalContextMenu,
    mount,
    destroy,
  };
}
