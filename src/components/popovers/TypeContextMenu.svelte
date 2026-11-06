<script lang="ts">
  import { Pencil, Plus, Search, Trash2 } from "@lucide/svelte";
  import type { ActivePopover, DeviceType, DeviceTypeSortMode } from "../../lib/types";
  import DeviceTypeSortMenu from "./DeviceTypeSortMenu.svelte";
  import MenuItem from "../MenuItem.svelte";

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
  <MenuItem icon={Search} label="显示此类型" onSelect={() => { selectDeviceType(contextDeviceType); setActivePopover(null); }} />
{/if}
{#if contextDeviceType !== "全部设备"}
  <div class="menu-separator"></div>
  <MenuItem icon={Pencil} label="编辑设备类型" onSelect={() => openEditTypeDialog(contextDeviceType)} />
  <MenuItem
    icon={Trash2}
    label="删除设备类型"
    danger
    disabled={!canDeleteDeviceType(contextDeviceType)}
    tooltip={getDeviceTypeCount(contextDeviceType) > 0 ? "该类型下还有设备，不能直接删除" : "删除设备类型"}
    onSelect={() => requestDeleteDeviceType(contextDeviceType)}
  />
{/if}
<MenuItem icon={Plus} label="新增设备类型" onSelect={() => openAddTypeDialog()} />
<div class="menu-separator"></div>
<DeviceTypeSortMenu mode={deviceTypeSortMode} setMode={setDeviceTypeSortMode} {setActivePopover} />
