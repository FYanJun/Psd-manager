<script lang="ts">
  import DeviceDetailPane from "./DeviceDetailPane.svelte";
  import DeviceListPane from "./DeviceListPane.svelte";
  import SidebarPane from "./SidebarPane.svelte";
  import Topbar from "./Topbar.svelte";
  import type { WorkspaceActions, WorkspaceView } from "../lib/view-models";

  export let view: WorkspaceView;
  export let actions: WorkspaceActions;
  export let searchInput: HTMLInputElement | null = null;
  export let passwordVisible = false;
  export let historyOpen = false;
</script>

<SidebarPane
  deviceTypeRows={view.sidebar.deviceTypeRows}
  selectedDeviceType={view.sidebar.selectedDeviceType}
  selectedTypeDeviceCount={view.sidebar.selectedTypeDeviceCount}
  canDeleteSelectedDeviceType={view.sidebar.canDeleteSelectedDeviceType}
  openTypeBlankContextMenu={actions.sidebar.openTypeBlankContextMenu}
  openAddTypeDialog={actions.sidebar.openAddTypeDialog}
  openEditTypeDialog={actions.sidebar.openEditTypeDialog}
  requestDeleteSelectedType={actions.sidebar.requestDeleteSelectedType}
  openTypeSortPopover={actions.sidebar.openTypeSortPopover}
  selectDeviceType={actions.sidebar.selectDeviceType}
  openTypeContextMenu={actions.sidebar.openTypeContextMenu}
/>

<button
  class:active={view.resizingPane === "sidebar"}
  class="pane-resizer"
  type="button"
  aria-label="调整设备类型宽度"
  on:pointerdown={(event) => actions.startPaneResize("sidebar", event)}
></button>

<section class="workspace">
  <Topbar
    backDisabled={view.topbar.backDisabled}
    forwardDisabled={view.topbar.forwardDisabled}
    bind:searchInput
    searchQuery={view.topbar.searchQuery}
    searchPlaceholder={view.topbar.searchPlaceholder}
    goBack={actions.topbar.goBack}
    goForward={actions.topbar.goForward}
    updateSearchValue={actions.topbar.updateSearchValue}
    openBulkPasswordDialog={actions.topbar.openBulkPasswordDialog}
    openGeneratorPanel={actions.topbar.openGeneratorPanel}
    openConfigPopover={actions.topbar.openConfigPopover}
  />

  <div class="content-grid">
    <DeviceListPane
      filteredItems={view.deviceList.filteredItems}
      selectedId={view.deviceList.selectedId}
      searchQuery={view.deviceList.searchQuery}
      hasDevices={view.deviceList.hasDevices}
      hasSelectedDevice={view.deviceList.hasSelectedDevice}
      deviceTypeOptionsLength={view.deviceList.deviceTypeOptionsLength}
      listContextLabel={view.deviceList.listContextLabel}
      openAddDeviceDialog={actions.deviceList.openAddDeviceDialog}
      openEditDeviceDialog={actions.deviceList.openEditDeviceDialog}
      requestDeleteSelectedDevice={actions.deviceList.requestDeleteSelectedDevice}
      openDeviceSortPopover={actions.deviceList.openDeviceSortPopover}
      openDeviceActionsPopover={actions.deviceList.openDeviceActionsPopover}
      openDeviceContextMenu={actions.deviceList.openDeviceContextMenu}
      openDeviceListBlankContextMenu={actions.deviceList.openDeviceListBlankContextMenu}
      selectDevice={actions.deviceList.selectDevice}
    />

    <button
      class:active={view.resizingPane === "list"}
      class="pane-resizer"
      type="button"
      aria-label="调整设备列表宽度"
      on:pointerdown={(event) => actions.startPaneResize("list", event)}
    ></button>

    <DeviceDetailPane
      bind:passwordVisible
      bind:historyOpen
      model={view.deviceDetail}
      actions={actions.deviceDetail}
    />
  </div>
</section>
