<script lang="ts">
  import { ArrowDownUp, ChevronRight, Pencil, Plus, Trash2 } from "@lucide/svelte";
  import type { DeviceType, DeviceTypeMeta } from "../lib/types";

  export let deviceTypeRows: Array<DeviceTypeMeta & { count: number }>;
  export let selectedDeviceType: "全部设备" | DeviceType;
  export let selectedTypeDeviceCount = 0;
  export let canDeleteSelectedDeviceType = false;

  export let openTypeBlankContextMenu: (event: MouseEvent) => void;
  export let openAddTypeDialog: () => void;
  export let openEditTypeDialog: (deviceType?: DeviceType) => void;
  export let requestDeleteSelectedType: () => void;
  export let openTypeSortPopover: (event: MouseEvent) => void;
  export let selectDeviceType: (deviceType: "全部设备" | DeviceType) => void;
  export let openTypeContextMenu: (deviceType: "全部设备" | DeviceType, event: MouseEvent) => void;
</script>

<aside class="sidebar" aria-label="设备类型" on:contextmenu={openTypeBlankContextMenu}>
  <div class="pane-header sidebar-pane-header">
    <div class="sidebar-pane-title">
      <span class="pane-kicker">资产库</span>
      <h2>设备类型</h2>
    </div>
    <div class="pane-actions">
      <button class="icon-button compact-action" aria-label="新增设备类型" data-tooltip="新增设备类型" on:click={() => openAddTypeDialog()}>
        <Plus size={18} />
      </button>
      <button class="icon-button compact-action" aria-label="编辑设备类型" data-tooltip="编辑设备类型" disabled={selectedDeviceType === "全部设备"} on:click={() => openEditTypeDialog()}>
        <Pencil size={17} />
      </button>
      <button
        class="icon-button compact-action"
        aria-label="删除设备类型"
        disabled={!canDeleteSelectedDeviceType}
        data-tooltip={selectedDeviceType === "全部设备" ? "全部设备不能删除" : selectedTypeDeviceCount > 0 ? "该类型下还有设备，不能直接删除" : "删除设备类型"}
        on:click={() => requestDeleteSelectedType()}
      >
        <Trash2 size={17} />
      </button>
      <button class="icon-button compact-action" aria-label="类型排序" data-tooltip="类型排序" on:click={openTypeSortPopover}>
        <ArrowDownUp size={18} />
      </button>
    </div>
  </div>

  <div class="device-type-list">
    {#each deviceTypeRows as type}
      <button
        class:selected={selectedDeviceType === type.label}
        class="device-type-row"
        on:click={() => selectDeviceType(type.label)}
        on:contextmenu={(event) => openTypeContextMenu(type.label, event)}
      >
        <span class={`type-icon type-${type.color}`}>{type.iconText}</span>
        <span class="type-copy">
          <strong>{type.label}</strong>
          <small>{type.count} 个设备</small>
        </span>
        <ChevronRight size={17} />
      </button>
    {/each}
  </div>
</aside>
