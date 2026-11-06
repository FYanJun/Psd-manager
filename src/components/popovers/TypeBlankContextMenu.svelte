<script lang="ts">
  import { Plus } from "@lucide/svelte";
  import type { ActivePopover, DeviceTypeSortMode } from "../../lib/types";
  import DeviceTypeSortMenu from "./DeviceTypeSortMenu.svelte";
  import MenuItem from "../MenuItem.svelte";

  export let deviceTypeSortMode: DeviceTypeSortMode;
  export let openAddTypeDialog: () => void;
  export let setDeviceTypeSortMode: (mode: DeviceTypeSortMode) => void;
  export let setActivePopover: (popover: ActivePopover | null) => void;
</script>

<div class="context-menu-title">
  <strong>设备类型</strong>
  <span>管理设备分类</span>
</div>
<MenuItem icon={Plus} label="新增设备类型" onSelect={() => openAddTypeDialog()} />
<div class="menu-separator"></div>
<DeviceTypeSortMenu mode={deviceTypeSortMode} setMode={setDeviceTypeSortMode} {setActivePopover} />
