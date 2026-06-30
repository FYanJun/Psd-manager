<script lang="ts">
  import { Copy, Grid2X2, KeyRound, RefreshCcw, RotateCcwKey, SlidersHorizontal, X } from "@lucide/svelte";
  import ClearableInput from "./ClearableInput.svelte";
  import type { DeviceAccount, VaultItem } from "../lib/types";

  export let generatedPassword = "";
  export let generatorLength = 8;
  export let generatorLengthInput = "8";
  export let useUpper = true;
  export let useLower = true;
  export let useNumbers = true;
  export let useSymbols = true;
  export let excludeSimilar = true;
  export let preventRepeats = false;
  export let minimumNumbers = 2;
  export let minimumSymbols = 2;
  export let allowedSymbols = "";
  export let excludedCharacters = "";
  export let canUseGeneratorForCurrentAccount = true;
  export let canUseGeneratorForBulkUpdate = true;
  export let selectedItem: VaultItem;
  export let selectedAccount: DeviceAccount;
  export let itemCount = 0;

  export let closeGeneratorPanel: (restoreDialog?: boolean) => void;
  export let startGeneratorResize: (event: PointerEvent) => void;
  export let generatePassword: () => void;
  export let copyGeneratedPassword: () => void;
  export let setGeneratorLength: (length: number) => void;
  export let setGeneratorMinimumNumbers: (value: number | string) => void;
  export let setGeneratorMinimumSymbols: (value: number | string) => void;
  export let setAllowedSymbols: (value: string) => void;
  export let setExcludedCharacters: (value: string) => void;
  export let updateGeneratorLengthFromSlider: (event: Event) => void;
  export let handleGeneratorLengthInput: (value: string) => void;
  export let commitGeneratorLengthInput: () => void;
  export let handleGeneratorLengthKeydown: (event: KeyboardEvent) => void;
  export let useGeneratedPasswordForCurrentDevice: () => void;
  export let useGeneratedPasswordForBulkUpdate: () => void;
</script>

<button class="drawer-scrim" aria-label="关闭密码生成器" on:click={() => closeGeneratorPanel(true)}></button>
<aside class="generator-drawer" aria-label="密码生成器">
  <button
    type="button"
    class="drawer-resizer"
    aria-label="调整密码生成器宽度"
    on:pointerdown={startGeneratorResize}
  ></button>
  <header class="drawer-header">
    <div>
      <span class="drawer-kicker">密码工具</span>
      <h2>密码生成器</h2>
    </div>
    <button class="icon-button" aria-label="关闭密码生成器" data-tooltip="关闭密码生成器" on:click={() => closeGeneratorPanel(true)}>
      <X size={21} />
    </button>
  </header>

  <div class="generator-result">
    <div>
      <span>随机密码</span>
      <code>{generatedPassword || "未选择可用字符"}</code>
    </div>
    <div class="result-actions">
      <button class="icon-button inline" aria-label="重新生成" data-tooltip="重新生成" on:click={() => generatePassword()}>
        <RefreshCcw size={18} />
      </button>
      <button class="icon-button inline" aria-label="复制生成密码" data-tooltip="复制生成密码" disabled={!generatedPassword} on:click={() => copyGeneratedPassword()}>
        <Copy size={18} />
      </button>
    </div>
  </div>

  <div class="drawer-body">
    <section class="drawer-section">
      <div class="drawer-section-title">
        <SlidersHorizontal size={18} />
        <h3>基础规则</h3>
      </div>

      <div class="quick-lengths" role="group" aria-label="常用密码长度">
        {#each [3, 8, 16, 24] as length}
          <button class:selected={generatorLength === length} on:click={() => setGeneratorLength(length)}>{length}</button>
        {/each}
      </div>

      <label class="range-control drawer-range">
        <span>长度</span>
        <input
          type="range"
          min="3"
          max="24"
          value={generatorLength}
          aria-label="拖动调整密码长度"
          on:input={updateGeneratorLengthFromSlider}
        />
        <ClearableInput
          inputClass="length-input"
          type="number"
          min="3"
          max="24"
          clearable={false}
          fallbackValue={generatorLength}
          value={generatorLengthInput}
          ariaLabel="密码长度"
          onValueChange={handleGeneratorLengthInput}
          onBlur={commitGeneratorLengthInput}
          onKeydown={handleGeneratorLengthKeydown}
        />
      </label>

      <div class="stepper-grid">
        <label class="number-control">
          <span>最少数字</span>
          <ClearableInput
            type="number"
            min="0"
            max={generatorLength}
            clearable={false}
            fallbackValue={minimumNumbers}
            value={minimumNumbers}
            disabled={!useNumbers}
            onValueChange={setGeneratorMinimumNumbers}
          />
        </label>
        <label class="number-control">
          <span>最少符号</span>
          <ClearableInput
            type="number"
            min="0"
            max={generatorLength}
            clearable={false}
            fallbackValue={minimumSymbols}
            value={minimumSymbols}
            disabled={!useSymbols}
            onValueChange={setGeneratorMinimumSymbols}
          />
        </label>
      </div>
    </section>

    <section class="drawer-section">
      <div class="drawer-section-title">
        <Grid2X2 size={24} />
        <h3>使用哪些字符</h3>
      </div>

      <div class="switch-list">
        <label><input type="checkbox" bind:checked={useUpper} on:change={() => generatePassword()} /> 大写字母 A-Z</label>
        <label><input type="checkbox" bind:checked={useLower} on:change={() => generatePassword()} /> 小写字母 a-z</label>
        <label><input type="checkbox" bind:checked={useNumbers} on:change={() => generatePassword()} /> 数字 0-9</label>
        <label><input type="checkbox" bind:checked={useSymbols} on:change={() => generatePassword()} /> 符号</label>
      </div>

      <label class="text-control">
        <span>允许使用的符号</span>
        <ClearableInput value={allowedSymbols} clearable={false} fallbackValue="!@#$%^&*+-_=?." disabled={!useSymbols} onValueChange={setAllowedSymbols} />
      </label>
    </section>

    <section class="drawer-section">
      <div class="drawer-section-title">
        <KeyRound size={18} />
        <h3>排除哪些字符</h3>
      </div>

      <div class="switch-list">
        <label><input type="checkbox" bind:checked={excludeSimilar} on:change={() => generatePassword()} /> 排除易混字符 0 O 1 I l</label>
        <label><input type="checkbox" bind:checked={preventRepeats} on:change={() => generatePassword()} /> 避免相邻重复字符</label>
      </div>

      <label class="text-control">
        <span>额外排除字符</span>
        <ClearableInput value={excludedCharacters} placeholder="例如：@ / \\ &quot; 空格" onValueChange={setExcludedCharacters} />
      </label>
    </section>
  </div>

  <footer class="drawer-footer">
    <button class="drawer-action primary-action" aria-label="重新生成" data-tooltip="重新生成" on:click={() => generatePassword()}>
      <RefreshCcw size={20} />
      <span>重新生成</span>
    </button>
    {#if canUseGeneratorForCurrentAccount}
      <button class="drawer-action" aria-label="填入当前账号" data-tooltip="填入当前账号" disabled={!generatedPassword || !selectedItem.id || !selectedAccount.id} on:click={() => useGeneratedPasswordForCurrentDevice()}>
        <KeyRound size={18} />
        <span>填入当前账号</span>
      </button>
    {/if}
    {#if canUseGeneratorForBulkUpdate}
      <button class="drawer-action" aria-label="批量改密" data-tooltip="批量改密" disabled={!generatedPassword || itemCount === 0} on:click={() => useGeneratedPasswordForBulkUpdate()}>
        <RotateCcwKey size={20} />
        <span>批量改密</span>
      </button>
    {/if}
    <button class="drawer-action" aria-label="复制密码" data-tooltip="复制密码" disabled={!generatedPassword} on:click={() => copyGeneratedPassword()}>
      <Copy size={18} />
      <span>复制密码</span>
    </button>
  </footer>
</aside>
