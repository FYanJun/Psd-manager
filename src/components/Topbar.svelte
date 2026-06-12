<script lang="ts">
  import { ChevronRight, Plus, RotateCcwKey, Search, Sparkles } from "@lucide/svelte";
  import ClearableInput from "./ClearableInput.svelte";

  export let backDisabled = false;
  export let forwardDisabled = false;
  export let searchInput: HTMLInputElement | null = null;
  export let searchQuery = "";
  export let searchPlaceholder = "";

  export let goBack: () => void;
  export let goForward: () => void;
  export let updateSearchValue: (value: string) => void;
  export let openAddDeviceDialog: () => void;
  export let openBulkPasswordDialog: () => void;
  export let openGeneratorPanel: () => void;
</script>

<header class="topbar">
  <div class="history-buttons">
    <button class="icon-button" aria-label="后退" data-tooltip="后退" aria-keyshortcuts="Meta+ArrowLeft Control+ArrowLeft" disabled={backDisabled} on:click={() => goBack()}>
      <ChevronRight class="back-icon" size={24} />
    </button>
    <button class="icon-button" aria-label="前进" data-tooltip="前进" aria-keyshortcuts="Meta+ArrowRight Control+ArrowRight" disabled={forwardDisabled} on:click={() => goForward()}>
      <ChevronRight size={24} />
    </button>
  </div>

  <label class="search-box">
    <Search size={22} />
    <ClearableInput
      bind:inputRef={searchInput}
      value={searchQuery}
      placeholder={searchPlaceholder}
      ariaLabel="搜索设备"
      ariaKeyshortcuts="Meta+F Control+F Meta+K Control+K"
      onValueChange={updateSearchValue}
      className="topbar-search-input"
    />
  </label>

  <button class="primary-button" data-tooltip="新增设备" aria-keyshortcuts="Meta+N Control+N" on:click={() => openAddDeviceDialog()}>
    <Plus size={22} />
    <span>新增设备</span>
  </button>
  <button class="tool-button topbar-tool" data-tooltip="批量改密" aria-keyshortcuts="Meta+B Control+B" on:click={() => openBulkPasswordDialog()}>
    <RotateCcwKey size={20} />
    <span>批量改密</span>
  </button>
  <button class="tool-button topbar-tool accent" data-tooltip="密码生成器" aria-keyshortcuts="Meta+G Control+G" on:click={() => openGeneratorPanel()}>
    <Sparkles size={20} />
    <span>密码生成器</span>
  </button>
</header>
