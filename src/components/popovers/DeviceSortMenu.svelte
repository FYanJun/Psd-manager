<script lang="ts">
  import { ArrowDownAZ, ClockArrowDown, Tags } from "@lucide/svelte";
  import type { ActivePopover, SortMode } from "../../lib/types";
  import MenuItem from "../MenuItem.svelte";
  import { DropdownMenu } from "bits-ui";

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
<DropdownMenu.RadioGroup bind:value={() => mode, () => {}}>
  <MenuItem icon={ClockArrowDown} label="按最近更新" radioValue="updatedDesc" checked={mode === "updatedDesc"} onSelect={() => chooseMode("updatedDesc")} />
  <MenuItem icon={ArrowDownAZ} label="按设备名称" radioValue="nameAsc" checked={mode === "nameAsc"} onSelect={() => chooseMode("nameAsc")} />
  <MenuItem icon={Tags} label="按设备类型" radioValue="typeAsc" checked={mode === "typeAsc"} onSelect={() => chooseMode("typeAsc")} />
</DropdownMenu.RadioGroup>
