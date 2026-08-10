<script lang="ts">
  import { ArrowDownUp, Copy, Pencil, Trash2 } from "@lucide/svelte";
  import type { ActivePopover } from "../../lib/types";

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
<button class="menu-item" role="menuitem" disabled={!hasSelectedDevice} data-tooltip={hasSelectedDevice ? "编辑设备信息" : "请先选择设备"} on:click={() => openEditDeviceDialog()}>
  <Pencil size={16} />
  <span>编辑设备信息</span>
</button>
<button class="menu-item" role="menuitem" disabled={!hasSelectedDevice} data-tooltip={hasSelectedDevice ? "复制设备信息" : "请先选择设备"} on:click={() => copySelectedDeviceInfo()}>
  <Copy size={16} />
  <span>复制设备信息</span>
</button>
<button class="menu-item danger-menu-item" role="menuitem" disabled={!hasSelectedDevice} data-tooltip={hasSelectedDevice ? "删除设备" : "请先选择设备"} on:click={() => requestDeleteSelectedDevice()}>
  <Trash2 size={16} />
  <span>删除设备</span>
</button>
<div class="menu-separator"></div>
<button class="menu-item" role="menuitem" on:click={() => setActivePopover("device-sort")}>
  <ArrowDownUp size={16} />
  <span>设备排序</span>
</button>
