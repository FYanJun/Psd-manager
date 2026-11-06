<script lang="ts">
  import { Clipboard, Copy, Eraser, Scissors, TextSelect } from "@lucide/svelte";
  import type { ActivePopover, DeviceType, DeviceTypeSortMode, PopoverPosition, SortMode } from "../lib/types";
  import BusinessMenu from "./BusinessMenu.svelte";
  import EditableMenu from "./EditableMenu.svelte";
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
  let editableContext: ActionPopoverModel["editableContext"];
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
  function closeMenu() { setActivePopover(null); }

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
    editableContext,
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
    editCopy,
    editCut,
    editPaste,
    editSelectAll,
    editClearSearch,
  } = actions);
</script>

<div class="action-popover-host">
{#if activePopover}
  {#key `${activePopover}`}
  {#key popoverPosition}
  <svelte:component this={activePopover === "editable-context" ? EditableMenu : BusinessMenu} position={popoverPosition} close={closeMenu}>
    {#if activePopover === "editable-context" && editableContext}
      <div class="context-menu-title">
        <strong>{editableContext.kind === "search" ? "搜索" : editableContext.kind === "password" ? "密码字段" : "编辑内容"}</strong>
        <span>文本编辑</span>
      </div>
      <button class="menu-item" role="menuitem" disabled={!editableContext.canCut} on:click={() => editCut()}><Scissors size={16} /><span>剪切</span></button>
      <button class="menu-item" role="menuitem" disabled={!editableContext.canCopy} on:click={() => editCopy()}><Copy size={16} /><span>复制</span></button>
      <button class="menu-item" role="menuitem" disabled={!editableContext.canPaste} on:click={() => editPaste()}><Clipboard size={16} /><span>粘贴</span></button>
      <button class="menu-item" role="menuitem" disabled={!editableContext.canSelectAll} on:click={() => editSelectAll()}><TextSelect size={16} /><span>全选</span></button>
      {#if editableContext.canClearSearch}
        <div class="menu-separator"></div>
        <button class="menu-item" role="menuitem" on:click={() => editClearSearch()}><Eraser size={16} /><span>清空搜索</span></button>
      {/if}
    {:else if activePopover === "type-sort"}
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
  </svelte:component>
  {/key}
  {/key}
{/if}
</div>

<style>
  .action-popover-host {
    display: contents;
  }

  .action-popover-host :global(.action-popover) {
    position: fixed;
    z-index: 70;
    display: grid;
    gap: 4px;
    width: min(236px, calc(100vw - 24px));
    max-height: min(330px, var(--bits-dropdown-menu-content-available-height, calc(100vh - 24px)));
    overflow: auto;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    color: var(--app-text);
    background: var(--surface);
    box-shadow: var(--popover-shadow);
  }

  .action-popover-host :global(.action-popover h3) {
    margin: 4px 6px 6px;
    color: var(--text-secondary);
    font-size: var(--font-size-12);
  }

  .action-popover-host :global(.action-popover [data-dropdown-menu-radio-group]) {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .action-popover-host :global(.action-popover .context-menu-title) {
    display: grid;
    gap: 2px;
    padding: 7px 8px 8px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 3px;
  }

  .action-popover-host :global(.action-popover .context-menu-title strong),
  .action-popover-host :global(.action-popover .context-menu-title span) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .action-popover-host :global(.action-popover .context-menu-title strong) {
    color: var(--text-strong);
    font-size: var(--font-size-13);
  }

  .action-popover-host :global(.action-popover .context-menu-title span) {
    color: var(--muted);
    font-size: var(--font-size-12);
    font-weight: var(--weight-medium);
  }

  .action-popover-host :global(.action-popover button) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 34px;
    width: 100%;
    border-radius: 7px;
    padding: 0 9px;
    text-align: left;
    font-size: var(--font-size-14);
    font-weight: var(--weight-medium);
  }

  .action-popover-host :global(.action-popover button.menu-item) {
    justify-content: flex-start;
  }

  .action-popover-host :global(.action-popover button.menu-item svg) {
    flex: 0 0 auto;
    color: var(--text-secondary);
  }

  .action-popover-host :global(.action-popover button.menu-item.danger-menu-item svg) {
    color: currentColor;
  }

  .action-popover-host :global(.action-popover .menu-separator) {
    height: 1px;
    margin: 4px 6px;
    background: var(--border);
  }

  .action-popover-host :global(.action-popover button small) {
    color: var(--muted);
    font-size: var(--font-size-12);
  }

  .action-popover-host :global(.action-popover button:hover),
  .action-popover-host :global(.action-popover button[data-highlighted]) {
    background: var(--control-hover);
  }

  .action-popover-host :global(.action-popover button.selected) {
    background: var(--accent-subtle);
  }

  .action-popover-host :global(.action-popover button:disabled) {
    color: var(--text-quiet);
    cursor: default;
    opacity: 0.58;
  }

  .action-popover-host :global(.action-popover button:disabled:hover) {
    background: transparent;
  }

  .action-popover-host :global(.action-popover .danger-menu-item) {
    color: var(--danger-panel-text);
  }
</style>
