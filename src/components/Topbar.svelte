<script lang="ts">
  import { ChevronLeft, ChevronRight, Search, Settings, UsersRound, WandSparkles } from "@lucide/svelte";
  import ClearableInput from "./ClearableInput.svelte";
  import { INPUT_LIMITS, sanitizeSingleLineTextInput } from "../lib/input-validation";

  export let backDisabled = false;
  export let forwardDisabled = false;
  export let searchInput: HTMLInputElement | null = null;
  export let searchQuery = "";
  export let searchPlaceholder = "";

  export let goBack: () => void;
  export let goForward: () => void;
  export let updateSearchValue: (value: string) => void;
  export let openBulkPasswordDialog: () => void;
  export let openGeneratorPanel: () => void;
  export let openSettings: () => void;
</script>

<header class="topbar">
  <div class="history-buttons">
    <button class="icon-button" aria-label="后退" data-tooltip="后退" aria-keyshortcuts="Meta+ArrowLeft Control+ArrowLeft" disabled={backDisabled} on:click={() => goBack()}>
      <ChevronLeft size={24} />
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
      maxlength={INPUT_LIMITS.connectionAddress}
      transformValue={sanitizeSingleLineTextInput}
      onValueChange={updateSearchValue}
      className="topbar-search-input"
    />
  </label>

  <button class="tool-button topbar-tool" aria-label="批量改密" data-tooltip="批量改密" aria-keyshortcuts="Meta+B Control+B" on:click={() => openBulkPasswordDialog()}>
    <UsersRound size={20} />
    <span>批量改密</span>
  </button>
  <button class="tool-button topbar-tool accent" aria-label="密码生成器" data-tooltip="密码生成器" aria-keyshortcuts="Meta+G Control+G" on:click={() => openGeneratorPanel()}>
    <WandSparkles size={20} />
    <span>密码生成器</span>
  </button>
  <button class="icon-button topbar-tool" aria-label="设置" data-tooltip="设置" on:click={openSettings}>
    <Settings size={21} />
  </button>
</header>
