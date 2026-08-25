<script lang="ts">
  import { ArrowDownUp, MoreHorizontal, Pencil, Plus, Search, SearchX, Server, Trash2 } from "@lucide/svelte";
  import type { VaultItem } from "../lib/types";
  import { getAccounts } from "../lib/vault";
  import { iconColorStyle } from "../lib/color";

  export let filteredItems: VaultItem[];
  export let selectedId = 0;
  export let searchQuery = "";
  export let hasDevices = false;
  export let hasSelectedDevice = false;
  export let deviceTypeOptionsLength = 0;
  export let listContextLabel = "";

  export let openAddDeviceDialog: () => void;
  export let openEditDeviceDialog: () => void;
  export let requestDeleteSelectedDevice: () => void;
  export let openDeviceSortPopover: (event: MouseEvent) => void;
  export let openDeviceActionsPopover: (event: MouseEvent) => void;
  export let openDeviceContextMenu: (id: number, event: MouseEvent) => void;
  export let openDeviceListBlankContextMenu: (event: MouseEvent) => void;
  export let selectDevice: (id: number) => void;
</script>

<section class="item-list" aria-label="设备名称">
  <div class="list-toolbar pane-list-toolbar">
    <div class="list-context" aria-label="当前设备范围">
      {#if searchQuery.trim()}
        <Search size={21} />
      {/if}
      <span>{listContextLabel}</span>
      <small>{filteredItems.length}</small>
    </div>
    <div class="toolbar-actions">
      <button class="icon-button compact-action" aria-label="新增设备" data-tooltip={deviceTypeOptionsLength === 0 ? "请先新增设备类型" : "新增设备"} disabled={deviceTypeOptionsLength === 0} on:click={() => openAddDeviceDialog()}>
        <Plus size={18} />
      </button>
      <button class="icon-button compact-action device-secondary-action" aria-label="编辑设备信息" data-tooltip={hasSelectedDevice ? "编辑设备信息" : "请先选择设备"} disabled={!hasSelectedDevice} on:click={() => openEditDeviceDialog()}>
        <Pencil size={17} />
      </button>
      <button class="icon-button compact-action device-secondary-action" aria-label="删除设备" data-tooltip={hasSelectedDevice ? "删除设备" : "请先选择设备"} disabled={!hasSelectedDevice} on:click={() => requestDeleteSelectedDevice()}>
        <Trash2 size={17} />
      </button>
      <button class="icon-button compact-action device-sort-action" aria-label="设备排序" data-tooltip="设备排序" on:click={openDeviceSortPopover}>
        <ArrowDownUp size={18} />
      </button>
      <button class="icon-button compact-action device-overflow-action" aria-label="更多设备操作" data-tooltip="更多设备操作" on:click={openDeviceActionsPopover}>
        <MoreHorizontal size={19} />
      </button>
    </div>
  </div>

  <div class="list-scroll" role="group" aria-label="设备列表右键菜单区域" on:contextmenu={openDeviceListBlankContextMenu}>
    {#if filteredItems.length === 0}
      {@const hasActiveSearch = Boolean(searchQuery.trim())}
      <div class="empty-list" class:onboarding-empty={!hasDevices}>
        {#if hasActiveSearch}
          <SearchX size={24} />
        {:else}
          <Server size={24} />
        {/if}
        <div>
          <strong>{hasActiveSearch ? "没有匹配的设备资产" : hasDevices ? "当前类型暂无设备" : "资产库还是空的"}</strong>
          <span>{hasActiveSearch ? "换个设备名或连接地址搜索，或新增一台设备。" : hasDevices ? "可以在当前类型下新增设备，或切换到其他设备类型。" : "新增第一台设备资产后，这里会保存账号、当前密码和历史密码。"}</span>
        </div>
      </div>
    {:else}
      {#each filteredItems as item}
        {@const itemAccounts = getAccounts(item)}
        {@const deviceReference = item.ipAddress || item.assetCode || item.location || "未填写设备信息"}
        <button
          class:selected={item.id === selectedId}
          class="item-row"
          data-value-tooltip={item.deviceName}
          on:click={() => selectDevice(item.id)}
          on:contextmenu={(event) => openDeviceContextMenu(item.id, event)}
        >
          <span class={`item-icon ${item.iconClass}`} style={iconColorStyle(item.iconClass)}>
            {item.iconText}
          </span>
          <span class="item-copy">
            <span class="item-primary">
              <strong>
                <span class="item-name-text">{item.deviceName}</span>
              </strong>
              <span class="item-type-pill">{item.deviceType}</span>
            </span>
            <span class="item-secondary">
              <small>{deviceReference}</small>
              <small class="item-account-count">{itemAccounts.length} 个账号</small>
            </span>
          </span>
        </button>
      {/each}
    {/if}
  </div>
</section>
