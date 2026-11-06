<script lang="ts">
  import { tick } from "svelte";
  import { createUuid } from "../lib/uuid";
  import { X } from "@lucide/svelte";

  export let value = "";
  export let placeholder = "";
  export let ariaLabel = "";
  export let disabled = false;
  export let errorMessage = "";
  export let errorFocusToken = 0;
  export let maxlength: number | undefined = undefined;
  export let transformValue: ((value: string) => string) | undefined = undefined;
  export let onValueChange: ((value: string) => void) | undefined = undefined;

  let textareaRef: HTMLTextAreaElement | null = null;
  let composing = false;
  let inkPulseKey = 0;
  let lastInkValue = value;

  let appliedErrorFocusToken = 0;
  let errorDismissed = false;
  const fieldErrorId = `field-error-${createUuid()}`;

  $: if (errorMessage && errorFocusToken !== appliedErrorFocusToken) {
    appliedErrorFocusToken = errorFocusToken;
    errorDismissed = false;
    void tick().then(() => textareaRef?.focus());
  }
  $: visibleErrorMessage = !errorDismissed ? errorMessage : "";

  $: hasValue = value.length > 0;

  function pulseInk(nextValue: string) {
    if (nextValue === lastInkValue) return;
    lastInkValue = nextValue;
    inkPulseKey += 1;
  }

  function setValue(nextValue: string, animate = true) {
    if (disabled) return;
    nextValue = transformValue?.(nextValue) ?? nextValue;
    value = nextValue;
    errorDismissed = true;
    onValueChange?.(nextValue);
    if (animate) pulseInk(nextValue);
  }

  function handleCompositionEnd(event: CompositionEvent) {
    composing = false;
    const nextValue = (event.currentTarget as HTMLTextAreaElement).value;
    window.setTimeout(() => pulseInk(nextValue), 0);
  }

  function clearValue() {
    if (disabled) return;
    setValue("");
    textareaRef?.focus();
  }
</script>

<div class="clearable-textarea" class:has-actions={hasValue}>
  {#if inkPulseKey > 0}
    {#key inkPulseKey}<span class="ink-wash" aria-hidden="true"></span>{/key}
  {/if}
  <textarea
    bind:this={textareaRef}
    {value}
    {placeholder}
    aria-label={ariaLabel || undefined}
    aria-invalid={visibleErrorMessage ? "true" : undefined}
    aria-describedby={visibleErrorMessage ? fieldErrorId : undefined}
    {disabled}
    {maxlength}
    on:input={(event) => setValue((event.currentTarget as HTMLTextAreaElement).value, !composing && !(event as InputEvent).isComposing)}
    on:compositionstart={() => { composing = true; }}
    on:compositionend={handleCompositionEnd}
  ></textarea>
  {#if hasValue}
    <button type="button" class="textarea-icon-button" {disabled} aria-label="清空输入" data-tooltip="清空输入" on:click={clearValue}>
      <X size={15} />
    </button>
  {/if}
  {#if visibleErrorMessage}
    <span id={fieldErrorId} class="field-error" role="alert">{visibleErrorMessage}</span>
  {/if}
</div>

<style>
  .field-error {
    display: block;
    margin-top: 6px;
    color: var(--danger-panel-text);
    font-size: 12px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .clearable-textarea {
    position: relative;
    isolation: isolate;
    min-width: 0;
    width: 100%;
    border-radius: 8px;
    background: var(--surface-step-1);
  }

  .clearable-textarea .ink-wash {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    border-radius: inherit;
    pointer-events: none;
  }

  .clearable-textarea .ink-wash::before,
  .clearable-textarea .ink-wash::after {
    position: absolute;
    inset: -20% 0;
    border-radius: 50%;
    background: radial-gradient(ellipse, var(--ink-wash) 0%, transparent 68%);
    content: "";
    filter: blur(10px);
    opacity: 0;
    transform: scaleX(0.2);
    transform-origin: left center;
    animation: textarea-ink-wash 420ms ease-out both;
  }

  .clearable-textarea .ink-wash::after { animation-delay: 55ms; transform-origin: 38% center; }

  @keyframes textarea-ink-wash {
    0% { opacity: 0; transform: scaleX(0.2); }
    35% { opacity: 0.7; }
    100% { opacity: 0; transform: scaleX(1.2); }
  }

  .clearable-textarea :global(textarea) { position: relative; z-index: 1; background: transparent !important; }
  .textarea-icon-button { z-index: 2; }

  @media (prefers-reduced-motion: reduce) {
    .ink-wash { display: none; }
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
    color: var(--text-secondary);
    background: transparent;
  }

  .textarea-icon-button:hover:not(:disabled) {
    color: var(--text-strong);
    background: var(--control-hover);
  }

  .textarea-icon-button:focus-visible {
    outline: 2px solid var(--accent-focus);
    outline-offset: 1px;
  }
</style>
