<script lang="ts">
  import { X } from "@lucide/svelte";

  export let value = "";
  export let placeholder = "";
  export let ariaLabel = "";
  export let disabled = false;
  export let onValueChange: ((value: string) => void) | undefined = undefined;

  let textareaRef: HTMLTextAreaElement | null = null;

  $: hasValue = value.length > 0;

  function setValue(nextValue: string) {
    value = nextValue;
    onValueChange?.(nextValue);
  }

  function clearValue() {
    setValue("");
    textareaRef?.focus();
  }
</script>

<div class="clearable-textarea" class:has-actions={hasValue}>
  <textarea
    bind:this={textareaRef}
    {value}
    {placeholder}
    aria-label={ariaLabel || undefined}
    {disabled}
    on:input={(event) => setValue((event.currentTarget as HTMLTextAreaElement).value)}
  ></textarea>
  {#if hasValue}
    <button type="button" class="textarea-icon-button" aria-label="清空输入" on:click={clearValue}>
      <X size={15} />
    </button>
  {/if}
</div>

<style>
  .clearable-textarea {
    position: relative;
    min-width: 0;
    width: 100%;
  }

  .clearable-textarea :global(textarea) {
    width: 100%;
  }

  .clearable-textarea.has-actions :global(textarea) {
    padding-right: 42px;
  }

  .textarea-icon-button {
    position: absolute;
    top: 7px;
    right: 7px;
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

  .textarea-icon-button:hover {
    color: #24282c;
    background: #eef2f6;
  }

  .textarea-icon-button:focus-visible {
    outline: 2px solid rgba(15, 115, 232, 0.45);
    outline-offset: 1px;
  }
</style>

