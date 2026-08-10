<script lang="ts">
  import { Plus } from "@lucide/svelte";
  import type { ActivePopover, DeviceTypeSortMode } from "../../lib/types";
  import DeviceTypeSortMenu from "./DeviceTypeSortMenu.svelte";

  export let deviceTypeSortMode: DeviceTypeSortMode;
  export let openAddTypeDialog: () => void;
  export let setDeviceTypeSortMode: (mode: DeviceTypeSortMode) => void;
  export let setActivePopover: (popover: ActivePopover | null) => void;
</script>

<div class="context-menu-title">
  <strong>设备类型</strong>
  <span>管理设备分类</span>
</div>
<button class="menu-item" role="menuitem" on:click={() => openAddTypeDialog()}>
  <Plus size={16} />
  <span>新增设备类型</span>
</button>
<div class="menu-separator"></div>
<DeviceTypeSortMenu mode={deviceTypeSortMode} setMode={setDeviceTypeSortMode} {setActivePopover} />
