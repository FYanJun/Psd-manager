<script lang="ts">
  import { ArrowDownAZ, ChartNoAxesColumnDecreasing, Rows3 } from "@lucide/svelte";
  import type { ActivePopover, DeviceTypeSortMode } from "../../lib/types";

  export let mode: DeviceTypeSortMode;
  export let setMode: (mode: DeviceTypeSortMode) => void;
  export let setActivePopover: (popover: ActivePopover | null) => void;
  export let showTitle = false;

  function chooseMode(nextMode: DeviceTypeSortMode) {
    setMode(nextMode);
    setActivePopover(null);
  }
</script>

{#if showTitle}
  <div class="context-menu-title">
    <strong>类型排序</strong>
    <span>调整左栏设备类型顺序</span>
  </div>
{/if}
<button class="menu-item" role="menuitemradio" aria-checked={mode === "default"} class:selected={mode === "default"} on:click={() => chooseMode("default")}>
  <Rows3 size={16} />
  <span>按创建顺序</span>
</button>
<button class="menu-item" role="menuitemradio" aria-checked={mode === "nameAsc"} class:selected={mode === "nameAsc"} on:click={() => chooseMode("nameAsc")}>
  <ArrowDownAZ size={16} />
  <span>按类型名称</span>
</button>
<button class="menu-item" role="menuitemradio" aria-checked={mode === "countDesc"} class:selected={mode === "countDesc"} on:click={() => chooseMode("countDesc")}>
  <ChartNoAxesColumnDecreasing size={16} />
  <span>按设备数量</span>
</button>
