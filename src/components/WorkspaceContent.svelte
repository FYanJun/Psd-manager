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
  collapsed={view.sidebar.collapsed}
  toggleCollapsed={actions.sidebar.toggleCollapsed}
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

<div class="sidebar-divider" aria-hidden="true"></div>

<section class="workspace">
  <Topbar
    bulkPasswordDisabled={view.topbar.bulkPasswordDisabled}
    bind:searchInput
    searchQuery={view.topbar.searchQuery}
    searchPlaceholder={view.topbar.searchPlaceholder}
    updateSearchValue={actions.topbar.updateSearchValue}
    openBulkPasswordDialog={actions.topbar.openBulkPasswordDialog}
    openGeneratorPanel={actions.topbar.openGeneratorPanel}
    openSettings={actions.topbar.openSettings}
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
      openDeviceContextMenu={actions.deviceList.openDeviceContextMenu}
      openDeviceListBlankContextMenu={actions.deviceList.openDeviceListBlankContextMenu}
      selectDevice={actions.deviceList.selectDevice}
    />

    <div class="sidebar-divider" aria-hidden="true"></div>

    <DeviceDetailPane
      bind:passwordVisible
      bind:historyOpen
      model={view.deviceDetail}
      actions={actions.deviceDetail}
    />
  </div>
</section>
