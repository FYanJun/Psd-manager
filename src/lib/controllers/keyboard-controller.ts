import type { VaultStorageState } from "./vault-storage-controller";
import type { ActiveDialog, ActivePopover, PendingConfirmation, TypePickerScope, VaultItem } from "../types";

export type KeyboardState = {
  vaultStorageState: VaultStorageState;
  openTypePicker: TypePickerScope | null;
  bulkUsernameSuggestionsOpen: boolean;
  pendingConfirmation: PendingConfirmation | null;
  activeDialog: ActiveDialog;
  generatorPanelOpen: boolean;
  activePopover: ActivePopover;
  searchQuery: string;
  filteredItems: VaultItem[];
  selectedItemId: number;
  selectedAccountId: number;
  hasSelectedDevice: boolean;
  backCount: number;
  forwardCount: number;
};

type KeyboardPatch = Partial<Pick<KeyboardState,
  "openTypePicker" | "bulkUsernameSuggestionsOpen" | "pendingConfirmation" | "activeDialog" | "activePopover"
>>;

type KeyboardActions = {
  closeGenerator(): void;
  closeOverlays(): void;
  cancelPendingConfirmation(): void;
  clearSearch(): void;
  confirmPendingAction(): void;
  saveActiveDialog(): void;
  selectDevice(id: number): void;
  focusSearch(): void;
  goBack(): void;
  goForward(): void;
  openAddAccount(): void;
  openAddDevice(): void;
  openGenerator(): void;
  openBulkPassword(): void;
  openPassword(): void;
  openEditDevice(): void;
};

type KeyboardControllerPort = {
  read(): KeyboardState;
  write(patch: KeyboardPatch): void;
  actions: KeyboardActions;
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function createKeyboardController(port: KeyboardControllerPort) {
  function closeSurface() {
    const state = port.read();
    if (state.openTypePicker) port.write({ openTypePicker: null });
    else if (state.bulkUsernameSuggestionsOpen) port.write({ bulkUsernameSuggestionsOpen: false });
    else if (state.pendingConfirmation) port.actions.cancelPendingConfirmation();
    else if (state.activeDialog) port.actions.closeOverlays();
    else if (state.generatorPanelOpen) port.actions.closeGenerator();
    else if (state.activePopover) port.write({ activePopover: null });
    else if (state.searchQuery.trim()) port.actions.clearSearch();
    else return false;
    return true;
  }

  function selectRelativeDevice(direction: 1 | -1) {
    const state = port.read();
    if (state.filteredItems.length === 0) return;
    const currentIndex = state.filteredItems.findIndex((item) => item.id === state.selectedItemId);
    const nextIndex = currentIndex === -1
      ? direction === 1 ? 0 : state.filteredItems.length - 1
      : (currentIndex + direction + state.filteredItems.length) % state.filteredItems.length;
    port.actions.selectDevice(state.filteredItems[nextIndex].id);
  }

  function handle(event: KeyboardEvent) {
    const state = port.read();
    if (state.vaultStorageState !== "ready") return;
    const shortcutModifier = event.metaKey || event.ctrlKey;
    const editableTarget = isEditableTarget(event.target);

    if (event.key === "Escape") {
      if (closeSurface()) event.preventDefault();
      else if (editableTarget) (event.target as HTMLElement).blur();
      return;
    }

    if (shortcutModifier && event.key === "Enter" && (state.activeDialog || state.pendingConfirmation)) {
      event.preventDefault();
      if (state.pendingConfirmation) port.actions.confirmPendingAction();
      else port.actions.saveActiveDialog();
      return;
    }

    if (state.pendingConfirmation) return;
    if (!shortcutModifier && !editableTarget && !state.activeDialog && !state.activePopover && !state.generatorPanelOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        selectRelativeDevice(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        selectRelativeDevice(-1);
        return;
      }
    }
    if (!shortcutModifier) return;

    const key = event.key.toLowerCase();
    if (key === "f" || key === "k") {
      event.preventDefault();
      port.actions.focusSearch();
      return;
    }
    if (editableTarget) return;
    if (event.key === "ArrowLeft" && state.backCount > 0) {
      event.preventDefault();
      port.actions.goBack();
      return;
    }
    if (event.key === "ArrowRight" && state.forwardCount > 0) {
      event.preventDefault();
      port.actions.goForward();
      return;
    }
    if (key === "n") {
      event.preventDefault();
      if (event.shiftKey && state.hasSelectedDevice) port.actions.openAddAccount();
      else port.actions.openAddDevice();
      return;
    }
    if (key === "g") {
      event.preventDefault();
      port.actions.openGenerator();
      return;
    }
    if (key === "b") {
      event.preventDefault();
      port.actions.openBulkPassword();
      return;
    }
    if (key === "u" && state.hasSelectedDevice && state.selectedAccountId) {
      event.preventDefault();
      port.actions.openPassword();
      return;
    }
    if (key === "e" && state.hasSelectedDevice) {
      event.preventDefault();
      port.actions.openEditDevice();
    }
  }

  return { handle };
}
