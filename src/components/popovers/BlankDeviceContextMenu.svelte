<script lang="ts">
  import { Plus, Search } from "@lucide/svelte";
  import type { ActivePopover, DeviceType, SortMode } from "../../lib/types";
  import DeviceSortMenu from "./DeviceSortMenu.svelte";

  export let activePopover: ActivePopover;
  export let listContextLabel: string;
  export let searchQuery: string;
  export let deviceTypeOptionsLength: number;
  export let contextDeviceType: "全部设备" | DeviceType;
  export let sortMode: SortMode;
  export let clearSearch: () => void;
  export let openAddDeviceDialog: (deviceType?: "全部设备" | DeviceType) => void;
  export let setSortMode: (mode: SortMode) => void;
  export let setActivePopover: (popover: ActivePopover | null) => void;
</script>

<div class="context-menu-title">
  <strong>{activePopover === "detail-blank-context" ? "设备账号" : listContextLabel}</strong>
  <span>{activePopover === "detail-blank-context" ? "未选择设备" : "当前资产库范围"}</span>
</div>
{#if searchQuery.trim()}
  <button class="menu-item" role="menuitem" on:click={() => { clearSearch(); setActivePopover(null); }}>
    <Search size={16} />
    <span>清空搜索</span>
  </button>
{/if}
<button
  class="menu-item"
  role="menuitem"
  disabled={deviceTypeOptionsLength === 0}
  data-tooltip={deviceTypeOptionsLength === 0 ? "请先在左栏创建设备类型" : "新增设备"}
  on:click={() => openAddDeviceDialog(contextDeviceType)}
>
  <Plus size={16} />
  <span>新增设备</span>
</button>
<div class="menu-separator"></div>
<DeviceSortMenu mode={sortMode} setMode={setSortMode} {setActivePopover} />
