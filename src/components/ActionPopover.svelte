<script lang="ts">
  import { tick } from "svelte";
  import type { ActivePopover, DeviceType, DeviceTypeSortMode, PopoverPosition, SortMode } from "../lib/types";
  import type { ActionPopoverActions, ActionPopoverModel } from "../lib/view-models";
  import AccountContextMenu from "./popovers/AccountContextMenu.svelte";
  import BlankDeviceContextMenu from "./popovers/BlankDeviceContextMenu.svelte";
  import DeviceActionsMenu from "./popovers/DeviceActionsMenu.svelte";
  import DeviceSortMenu from "./popovers/DeviceSortMenu.svelte";
  import DeviceTypeSortMenu from "./popovers/DeviceTypeSortMenu.svelte";
  import TypeBlankContextMenu from "./popovers/TypeBlankContextMenu.svelte";
  import TypeContextMenu from "./popovers/TypeContextMenu.svelte";

  export let model: ActionPopoverModel;
  export let actions: ActionPopoverActions;

  let activePopover: ActivePopover;
  let popoverPosition: PopoverPosition;
  let deviceTypeSortMode: DeviceTypeSortMode;
  let sortMode: SortMode;
  let contextDeviceType: "全部设备" | DeviceType;
  let selectedDeviceType: "全部设备" | DeviceType;
  let searchQuery: string;
  let listContextLabel: string;
  let selectedDeviceName: string;
  let selectedAccountLabel: string;
  let selectedAccountHasPassword: boolean;
  let deviceTypeOptionsLength: number;
  let hasSelectedDevice: boolean;
  let setDeviceTypeSortMode: ActionPopoverActions["setDeviceTypeSortMode"];
  let setSortMode: ActionPopoverActions["setSortMode"];
  let selectDeviceType: ActionPopoverActions["selectDeviceType"];
  let openEditTypeDialog: ActionPopoverActions["openEditTypeDialog"];
  let requestDeleteDeviceType: ActionPopoverActions["requestDeleteDeviceType"];
  let canDeleteDeviceType: ActionPopoverActions["canDeleteDeviceType"];
  let getDeviceTypeCount: ActionPopoverActions["getDeviceTypeCount"];
  let openAddTypeDialog: ActionPopoverActions["openAddTypeDialog"];
  let clearSearch: ActionPopoverActions["clearSearch"];
  let openAddDeviceDialog: ActionPopoverActions["openAddDeviceDialog"];
  let openEditDeviceDialog: ActionPopoverActions["openEditDeviceDialog"];
  let requestDeleteSelectedDevice: ActionPopoverActions["requestDeleteSelectedDevice"];
  let copySelectedDeviceInfo: ActionPopoverActions["copySelectedDeviceInfo"];
  let openPasswordDialog: ActionPopoverActions["openPasswordDialog"];
  let copySelectedAccountInfo: ActionPopoverActions["copySelectedAccountInfo"];
  let openEditAccountDialog: ActionPopoverActions["openEditAccountDialog"];
  let requestDeleteSelectedAccount: ActionPopoverActions["requestDeleteSelectedAccount"];
  let setActivePopover: ActionPopoverActions["setActivePopover"];
  let menuElement: HTMLDivElement;
  let previousPopover: ActivePopover = null;

  function getMenuItems() {
    return menuElement
      ? Array.from(menuElement.querySelectorAll<HTMLButtonElement>("button.menu-item:not(:disabled)"))
      : [];
  }

  async function focusFirstMenuItem() {
    await tick();
    getMenuItems()[0]?.focus({ preventScroll: true });
  }

  function handleMenuKeydown(event: KeyboardEvent) {
    const menuItems = getMenuItems();
    if (event.key === "Escape") {
      event.preventDefault();
      setActivePopover(null);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || menuItems.length === 0) return;
    event.preventDefault();
    const currentIndex = menuItems.findIndex((item) => item === document.activeElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? menuItems.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1 + menuItems.length) % menuItems.length
          : (currentIndex - 1 + menuItems.length) % menuItems.length;
    menuItems[nextIndex]?.focus({ preventScroll: true });
  }

  $: ({
    activePopover,
    popoverPosition,
    deviceTypeSortMode,
    sortMode,
    contextDeviceType,
    selectedDeviceType,
    searchQuery,
    listContextLabel,
    selectedDeviceName,
    selectedAccountLabel,
    selectedAccountHasPassword,
    deviceTypeOptionsLength,
    hasSelectedDevice,
  } = model);
  $: ({
    setDeviceTypeSortMode,
    setSortMode,
    selectDeviceType,
    openEditTypeDialog,
    requestDeleteDeviceType,
    canDeleteDeviceType,
    getDeviceTypeCount,
    openAddTypeDialog,
    clearSearch,
    openAddDeviceDialog,
    openEditDeviceDialog,
    requestDeleteSelectedDevice,
    copySelectedDeviceInfo,
    openPasswordDialog,
    copySelectedAccountInfo,
    openEditAccountDialog,
    requestDeleteSelectedAccount,
    setActivePopover,
  } = actions);
  $: if (activePopover !== previousPopover) {
    previousPopover = activePopover;
    if (activePopover) void focusFirstMenuItem();
  }
</script>

{#if activePopover}
  <div bind:this={menuElement} class="action-popover" role="menu" aria-label="操作菜单" tabindex="-1" style={`top: ${popoverPosition.top}px; left: ${popoverPosition.left}px;`} on:keydown={handleMenuKeydown} on:contextmenu={(event) => event.preventDefault()}>
    {#if activePopover === "type-sort"}
      <DeviceTypeSortMenu mode={deviceTypeSortMode} setMode={setDeviceTypeSortMode} {setActivePopover} showTitle />
    {:else if activePopover === "device-sort"}
      <DeviceSortMenu mode={sortMode} setMode={setSortMode} {setActivePopover} showTitle />
    {:else if activePopover === "type-context"}
      <TypeContextMenu
        {contextDeviceType}
        {selectedDeviceType}
        {searchQuery}
        {deviceTypeSortMode}
        {selectDeviceType}
        {openEditTypeDialog}
        {requestDeleteDeviceType}
        {canDeleteDeviceType}
        {getDeviceTypeCount}
        {openAddTypeDialog}
        {setDeviceTypeSortMode}
        {setActivePopover}
      />
    {:else if activePopover === "type-blank-context"}
      <TypeBlankContextMenu {deviceTypeSortMode} {openAddTypeDialog} {setDeviceTypeSortMode} {setActivePopover} />
    {:else if activePopover === "list-blank-context" || activePopover === "detail-blank-context"}
      <BlankDeviceContextMenu
        {activePopover}
        {listContextLabel}
        {searchQuery}
        {deviceTypeOptionsLength}
        {contextDeviceType}
        {sortMode}
        {clearSearch}
        {openAddDeviceDialog}
        {setSortMode}
        {setActivePopover}
      />
    {:else if activePopover === "device-actions"}
      <DeviceActionsMenu {selectedDeviceName} {hasSelectedDevice} {openEditDeviceDialog} {requestDeleteSelectedDevice} {copySelectedDeviceInfo} {setActivePopover} />
    {:else if activePopover === "account-context"}
      <AccountContextMenu {selectedAccountLabel} {selectedAccountHasPassword} {openPasswordDialog} {copySelectedAccountInfo} {openEditAccountDialog} {requestDeleteSelectedAccount} />
    {/if}
  </div>
{/if}

<style>
  .action-popover {
    position: fixed;
    z-index: 25;
    display: grid;
    gap: 4px;
    width: min(236px, calc(100vw - 24px));
    max-height: calc(100vh - 24px);
    overflow: auto;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--app-text);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  .action-popover :global(h3) {
    margin: 4px 6px 6px;
    color: var(--text-secondary);
    font-size: var(--font-size-12);
  }

  .action-popover :global(.context-menu-title) {
    display: grid;
    gap: 2px;
    padding: 7px 8px 8px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 3px;
  }

  .action-popover :global(.context-menu-title strong),
  .action-popover :global(.context-menu-title span) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .action-popover :global(.context-menu-title strong) {
    color: var(--text-strong);
    font-size: var(--font-size-13);
  }

  .action-popover :global(.context-menu-title span) {
    color: var(--muted);
    font-size: var(--font-size-12);
    font-weight: 700;
  }

  .action-popover :global(button) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 34px;
    border-radius: 7px;
    padding: 0 9px;
    text-align: left;
    font-size: var(--font-size-14);
    font-weight: 650;
  }

  .action-popover :global(button.menu-item) {
    justify-content: flex-start;
  }

  .action-popover :global(button.menu-item svg) {
    flex: 0 0 auto;
    color: var(--text-secondary);
  }

  .action-popover :global(button.menu-item.danger-menu-item svg) {
    color: currentColor;
  }

  .action-popover :global(.menu-separator) {
    height: 1px;
    margin: 4px 6px;
    background: var(--border);
  }

  .action-popover :global(button small) {
    color: var(--muted);
    font-size: var(--font-size-12);
  }

  .action-popover :global(button:hover),
  .action-popover :global(button.selected) {
    background: var(--accent-subtle);
  }

  .action-popover :global(button:disabled) {
    color: #9aa1a9;
    cursor: default;
    opacity: 0.58;
  }

  .action-popover :global(button:disabled:hover) {
    background: transparent;
  }

  .action-popover :global(.danger-menu-item) {
    color: #c4382b;
  }
</style>
