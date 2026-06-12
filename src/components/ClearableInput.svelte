<script lang="ts">
  import { Eye, EyeOff, X } from "@lucide/svelte";

  export let value: string | number = "";
  export let type: "text" | "password" | "number" | "search" = "text";
  export let placeholder = "";
  export let ariaLabel = "";
  export let ariaKeyshortcuts = "";
  export let autocomplete = "off";
  export let disabled = false;
  export let clearable = true;
  export let fallbackValue: string | number | undefined = undefined;
  export let min: string | number | undefined = undefined;
  export let max: string | number | undefined = undefined;
  export let maxlength: number | undefined = undefined;
  export let className = "";
  export let inputClass = "";
  export let inputRef: HTMLInputElement | null = null;
  export let onValueChange: ((value: string) => void) | undefined = undefined;
  export let onBlur: (() => void) | undefined = undefined;
  export let onKeydown: ((event: KeyboardEvent) => void) | undefined = undefined;

  let passwordVisible = false;

  $: isPassword = type === "password";
  $: currentType = isPassword ? (passwordVisible ? "text" : "password") : type;
  $: stringValue = value == null ? "" : String(value);
  $: hasValue = stringValue.length > 0;
  $: showClearButton = clearable && hasValue;

  function setValue(nextValue: string) {
    if (!clearable && nextValue === "") {
      value = fallbackValue ?? value;
      return;
    }
    value = nextValue;
    onValueChange?.(nextValue);
  }

  function handleInput(event: Event) {
    setValue((event.currentTarget as HTMLInputElement).value);
  }

  function clearValue() {
    if (!clearable) return;
    setValue("");
    inputRef?.focus();
  }
</script>

<div class={`clearable-input ${className}`} class:has-actions={showClearButton || isPassword}>
  <input
    bind:this={inputRef}
    class={inputClass}
    type={currentType}
    value={stringValue}
    {placeholder}
    aria-label={ariaLabel || undefined}
    aria-keyshortcuts={ariaKeyshortcuts || undefined}
    {autocomplete}
    {disabled}
    {min}
    {max}
    {maxlength}
    on:input={handleInput}
    on:blur={() => onBlur?.()}
    on:keydown={(event) => onKeydown?.(event)}
  />
  {#if showClearButton || isPassword}
    <span class="clearable-input-actions">
      {#if showClearButton}
        <button type="button" class="input-icon-button" aria-label="清空输入" on:click={clearValue}>
          <X size={15} />
        </button>
      {/if}
      {#if isPassword}
        <button type="button" class="input-icon-button" aria-label={passwordVisible ? "隐藏密码" : "显示密码"} on:click={() => (passwordVisible = !passwordVisible)}>
          {#if passwordVisible}
            <EyeOff size={15} />
          {:else}
            <Eye size={15} />
          {/if}
        </button>
      {/if}
    </span>
  {/if}
</div>

<style>
  .clearable-input {
    position: relative;
    min-width: 0;
    width: 100%;
  }

  .clearable-input :global(input) {
    width: 100%;
  }

  .clearable-input.has-actions :global(input) {
    padding-right: 42px;
  }

  .clearable-input.has-actions:has(.input-icon-button + .input-icon-button) :global(input) {
    padding-right: 74px;
  }

  .clearable-input-actions {
    position: absolute;
    top: 50%;
    right: 7px;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    transform: translateY(-50%);
  }

  .input-icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 7px;
    padding: 0;
    color: #68717a;
    background: transparent;
  }

  .input-icon-button:hover {
    color: #24282c;
    background: #eef2f6;
  }

  .input-icon-button:focus-visible {
    outline: 2px solid rgba(15, 115, 232, 0.45);
    outline-offset: 1px;
  }
</style>
