<script lang="ts">
  import { ArrowDownWideNarrow, Folder, Search } from "@lucide/svelte";
  import type { DeviceType, DeviceTypeMeta, VaultItem } from "../lib/types";
  import { createBlankAccount, getAccounts } from "../lib/vault";

  export let filteredItems: VaultItem[];
  export let selectedId = 0;
  export let selectedDeviceType: "全部设备" | DeviceType = "全部设备";
  export let searchQuery = "";
  export let hasDevices = false;
  export let listContextLabel = "";
  export let listContextMeta: DeviceTypeMeta;

  export let openDeviceSortPopover: (event: MouseEvent) => void;
  export let openDeviceListBlankContextMenu: (event: MouseEvent) => void;
  export let selectDevice: (id: number) => void;
  export let openDeviceContextMenu: (item: VaultItem, event: MouseEvent) => void;
</script>

<section class="item-list" aria-label="设备名称">
  <div class="list-toolbar pane-list-toolbar">
    <div class="list-context" aria-label="当前设备范围">
      {#if searchQuery.trim()}
        <Search size={21} />
      {:else}
        <span class={`context-type-icon type-${listContextMeta.color}`}>{listContextMeta.iconText}</span>
      {/if}
      <span>{listContextLabel}</span>
      <small>{filteredItems.length}</small>
    </div>
    <div class="toolbar-actions">
      <button class="icon-button" aria-label="设备排序" data-tooltip="设备排序" on:click={openDeviceSortPopover}>
        <ArrowDownWideNarrow size={20} />
      </button>
    </div>
  </div>

  <div class="list-scroll" role="group" aria-label="设备列表右键菜单区域" on:contextmenu={openDeviceListBlankContextMenu}>
    {#if filteredItems.length === 0}
      <div class="empty-list" class:onboarding-empty={!hasDevices}>
        <Folder size={24} />
        <div>
          <strong>{hasDevices ? "没有匹配的设备资产" : "资产库还是空的"}</strong>
          <span>{hasDevices ? "换个设备名或 IP 搜索，或新增一台设备。" : "新增第一台设备资产后，这里会保存账号、当前密码和历史密码。"}</span>
        </div>
      </div>
    {:else}
      <h2 class="list-heading">{searchQuery.trim() ? "搜索结果" : "设备名称"}</h2>
      {#each filteredItems as item}
        {@const itemAccounts = getAccounts(item)}
        {@const primaryAccount = itemAccounts[0] ?? createBlankAccount()}
        <button
          class:selected={item.id === selectedId}
          class:no-type-pill={selectedDeviceType !== "全部设备" && !searchQuery.trim()}
          class="item-row"
          on:click={() => selectDevice(item.id)}
          on:contextmenu={(event) => openDeviceContextMenu(item, event)}
        >
          <span class={`item-icon ${item.iconClass}`}>
            {item.iconText}
          </span>
          <span class="item-copy">
            <strong>{item.deviceName}</strong>
            <small>{itemAccounts.length} 个账号 · {primaryAccount.username || "未填写用户名"}{#if item.ipAddress} · {item.ipAddress}{/if}</small>
          </span>
          {#if selectedDeviceType === "全部设备" || searchQuery.trim()}
            <span class="item-type-pill">{item.deviceType}</span>
          {/if}
        </button>
      {/each}
    {/if}
  </div>
</section>
