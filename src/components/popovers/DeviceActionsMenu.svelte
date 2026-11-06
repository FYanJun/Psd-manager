<script lang="ts">
  import { ArrowDownUp, Copy, Pencil, Trash2 } from "@lucide/svelte";
  import type { ActivePopover } from "../../lib/types";
  import MenuItem from "../MenuItem.svelte";

  export let selectedDeviceName: string;
  export let hasSelectedDevice: boolean;
  export let openEditDeviceDialog: () => void;
  export let requestDeleteSelectedDevice: () => void;
  export let copySelectedDeviceInfo: () => void;
  export let setActivePopover: (popover: ActivePopover | null) => void;
</script>

<div class="context-menu-title">
  <strong>{selectedDeviceName || "设备操作"}</strong>
  <span>设备操作</span>
</div>
<MenuItem icon={Pencil} label="编辑设备信息" disabled={!hasSelectedDevice} tooltip={hasSelectedDevice ? "编辑设备信息" : "请先选择设备"} onSelect={() => openEditDeviceDialog()} />
<MenuItem icon={Copy} label="复制设备信息" disabled={!hasSelectedDevice} tooltip={hasSelectedDevice ? "复制设备信息" : "请先选择设备"} onSelect={() => copySelectedDeviceInfo()} />
<MenuItem
  icon={Trash2}
  label="删除设备"
  danger
  disabled={!hasSelectedDevice}
  tooltip={hasSelectedDevice ? "删除设备" : "请先选择设备"}
  onSelect={() => requestDeleteSelectedDevice()}
/>
<div class="menu-separator"></div>
<MenuItem icon={ArrowDownUp} label="设备排序" closeOnSelect={false} onSelect={() => setActivePopover("device-sort")} />
