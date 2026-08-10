<script lang="ts">
  import { ArrowDownAZ, ClockArrowDown, Tags } from "@lucide/svelte";
  import type { ActivePopover, SortMode } from "../../lib/types";

  export let mode: SortMode;
  export let setMode: (mode: SortMode) => void;
  export let setActivePopover: (popover: ActivePopover | null) => void;
  export let showTitle = false;

  function chooseMode(nextMode: SortMode) {
    setMode(nextMode);
    setActivePopover(null);
  }
</script>

{#if showTitle}
  <div class="context-menu-title">
    <strong>设备排序</strong>
    <span>调整中栏设备列表顺序</span>
  </div>
{/if}
<button class="menu-item" role="menuitemradio" aria-checked={mode === "updatedDesc"} class:selected={mode === "updatedDesc"} on:click={() => chooseMode("updatedDesc")}>
  <ClockArrowDown size={16} />
  <span>按最近更新</span>
</button>
<button class="menu-item" role="menuitemradio" aria-checked={mode === "nameAsc"} class:selected={mode === "nameAsc"} on:click={() => chooseMode("nameAsc")}>
  <ArrowDownAZ size={16} />
  <span>按设备名称</span>
</button>
<button class="menu-item" role="menuitemradio" aria-checked={mode === "typeAsc"} class:selected={mode === "typeAsc"} on:click={() => chooseMode("typeAsc")}>
  <Tags size={16} />
  <span>按设备类型</span>
</button>
