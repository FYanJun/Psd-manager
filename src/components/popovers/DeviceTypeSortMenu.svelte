<script lang="ts">
  import { ArrowDownAZ, ChartNoAxesColumnDecreasing, Rows3 } from "@lucide/svelte";
  import type { ActivePopover, DeviceTypeSortMode } from "../../lib/types";
  import MenuItem from "../MenuItem.svelte";
  import { DropdownMenu } from "bits-ui";

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
<DropdownMenu.RadioGroup bind:value={() => mode, () => {}}>
  <MenuItem icon={Rows3} label="按创建顺序" radioValue="default" checked={mode === "default"} onSelect={() => chooseMode("default")} />
  <MenuItem icon={ArrowDownAZ} label="按类型名称" radioValue="nameAsc" checked={mode === "nameAsc"} onSelect={() => chooseMode("nameAsc")} />
  <MenuItem icon={ChartNoAxesColumnDecreasing} label="按设备数量" radioValue="countDesc" checked={mode === "countDesc"} onSelect={() => chooseMode("countDesc")} />
</DropdownMenu.RadioGroup>
