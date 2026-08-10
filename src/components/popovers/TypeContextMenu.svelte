<script lang="ts">
  import { Pencil, Plus, Search, Trash2 } from "@lucide/svelte";
  import type { ActivePopover, DeviceType, DeviceTypeSortMode } from "../../lib/types";
  import DeviceTypeSortMenu from "./DeviceTypeSortMenu.svelte";

  export let contextDeviceType: "全部设备" | DeviceType;
  export let selectedDeviceType: "全部设备" | DeviceType;
  export let searchQuery: string;
  export let deviceTypeSortMode: DeviceTypeSortMode;
  export let selectDeviceType: (deviceType: "全部设备" | DeviceType) => void;
  export let openEditTypeDialog: (deviceType?: "全部设备" | DeviceType) => void;
  export let requestDeleteDeviceType: (deviceType?: "全部设备" | DeviceType) => void;
  export let canDeleteDeviceType: (deviceType: "全部设备" | DeviceType) => boolean;
  export let getDeviceTypeCount: (deviceType: "全部设备" | DeviceType) => number;
  export let openAddTypeDialog: () => void;
  export let setDeviceTypeSortMode: (mode: DeviceTypeSortMode) => void;
  export let setActivePopover: (popover: ActivePopover | null) => void;
</script>

<div class="context-menu-title">
  <strong>{contextDeviceType}</strong>
  <span>设备类型</span>
</div>
{#if contextDeviceType !== selectedDeviceType || searchQuery.trim()}
  <button class="menu-item" role="menuitem" on:click={() => { selectDeviceType(contextDeviceType); setActivePopover(null); }}>
    <Search size={16} />
    <span>显示此类型</span>
  </button>
{/if}
{#if contextDeviceType !== "全部设备"}
  <div class="menu-separator"></div>
  <button class="menu-item" role="menuitem" on:click={() => openEditTypeDialog(contextDeviceType)}>
    <Pencil size={16} />
    <span>编辑设备类型</span>
  </button>
  <button
    class="menu-item danger-menu-item"
    role="menuitem"
    disabled={!canDeleteDeviceType(contextDeviceType)}
    data-tooltip={getDeviceTypeCount(contextDeviceType) > 0 ? "该类型下还有设备，不能直接删除" : "删除设备类型"}
    on:click={() => requestDeleteDeviceType(contextDeviceType)}
  >
    <Trash2 size={16} />
    <span>删除设备类型</span>
  </button>
{/if}
<button class="menu-item" role="menuitem" on:click={() => openAddTypeDialog()}>
  <Plus size={16} />
  <span>新增设备类型</span>
</button>
<div class="menu-separator"></div>
<DeviceTypeSortMenu mode={deviceTypeSortMode} setMode={setDeviceTypeSortMode} {setActivePopover} />
