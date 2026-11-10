<script lang="ts">
  import { tick } from "svelte";
  import { Eye, EyeOff, X } from "@lucide/svelte";
  import { hasValidPasswordCharacters, PASSWORD_CHARACTER_ERROR } from "../lib/input-validation";
  import { createUuid } from "../lib/uuid";

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
  export let revealResetToken = 0;
  export let transformValue: ((value: string) => string) | undefined = undefined;
  export let validateAccountPassword = false;
  export let errorMessage = "";
  export let errorFocusToken = 0;
  export let onValueChange: ((value: string) => void) | undefined = undefined;
  export let onBlur: (() => void) | undefined = undefined;
  export let onKeydown: ((event: KeyboardEvent) => void) | undefined = undefined;

  let appliedErrorFocusToken = 0;
  let errorDismissed = false;
  const fieldErrorId = `field-error-${createUuid()}`;

  $: if (errorMessage && errorFocusToken !== appliedErrorFocusToken) {
    appliedErrorFocusToken = errorFocusToken;
    errorDismissed = false;
    void tick().then(() => inputRef?.focus());
  }
  $: visibleErrorMessage = !errorDismissed ? errorMessage : "";

  let passwordVisible = false;
  let appliedRevealResetToken = revealResetToken;
  let rejectedPasswordPaste = false;
  let composing = false;
  let inkPulseKey = 0;
  let lastInkValue = String(value ?? "");
  const passwordErrorId = `password-error-${createUuid()}`;

  $: if (revealResetToken !== appliedRevealResetToken) {
    appliedRevealResetToken = revealResetToken;
    passwordVisible = false;
  }

  $: isPassword = type === "password";
  $: currentType = isPassword ? (passwordVisible ? "text" : "password") : type;
  $: stringValue = value == null ? "" : String(value);
  $: hasValue = stringValue.length > 0;
  $: showClearButton = clearable && hasValue;
  $: passwordError = validateAccountPassword && (rejectedPasswordPaste || !hasValidPasswordCharacters(stringValue));
  // Native maxlength counts UTF-16 units and can truncate a valid Unicode
  // credential. Account passwords use the code-point validator instead.
  $: nativeMaxlength = validateAccountPassword ? undefined : maxlength;

  function setValue(nextValue: string) {
    if (disabled) return;
    // Credential text must be validated as entered, never silently rewritten.
    if (!validateAccountPassword) nextValue = transformValue?.(nextValue) ?? nextValue;
    rejectedPasswordPaste = false;
    if (!clearable && nextValue === "") {
      value = fallbackValue ?? value;
      return;
    }
    value = nextValue;
    errorDismissed = true;
    onValueChange?.(nextValue);
  }

  function pulseInk(nextValue: string) {
    if (nextValue === lastInkValue) return;
    lastInkValue = nextValue;
    inkPulseKey += 1;
  }

  function handleInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    setValue(input.value);
    if (!composing && !(event as InputEvent).isComposing) pulseInk(input.value);
  }

  function handleCompositionEnd(event: CompositionEvent) {
    composing = false;
    const nextValue = (event.currentTarget as HTMLInputElement).value;
    window.setTimeout(() => pulseInk(nextValue), 0);
  }

  function rejectInvalidPaste(event: Event, candidate: string) {
    if (!validateAccountPassword || hasValidPasswordCharacters(candidate)) return;
    event.preventDefault();
    rejectedPasswordPaste = true;
  }

  function handlePaste(event: ClipboardEvent) {
    if (!event.clipboardData || !inputRef) return;
    const start = inputRef.selectionStart ?? stringValue.length;
    const end = inputRef.selectionEnd ?? start;
    rejectInvalidPaste(event, stringValue.slice(0, start) + event.clipboardData.getData("text/plain") + stringValue.slice(end));
  }

  function clearValue() {
    if (disabled || !clearable) return;
    setValue("");
    inputRef?.focus();
  }
</script>

<div class={`clearable-input ${className}`} class:has-actions={showClearButton || isPassword}>
<div class="clearable-input-field">
  {#if inkPulseKey > 0}
    {#key inkPulseKey}<span class="ink-wash" aria-hidden="true"></span>{/key}
  {/if}
  <input
    bind:this={inputRef}
    class={inputClass}
    type={currentType}
    data-editable-context={isPassword ? "password" : className.includes("topbar-search-input") ? "search" : undefined}
    data-account-password={validateAccountPassword ? "true" : undefined}
    value={stringValue}
    {placeholder}
    aria-label={ariaLabel || undefined}
    aria-keyshortcuts={ariaKeyshortcuts || undefined}
    aria-invalid={passwordError || visibleErrorMessage ? "true" : undefined}
    aria-describedby={passwordError ? passwordErrorId : visibleErrorMessage ? fieldErrorId : undefined}
    {autocomplete}
    {disabled}
    {min}
    {max}
    maxlength={nativeMaxlength}
    on:input={handleInput}
    on:compositionstart={() => { composing = true; }}
    on:compositionend={handleCompositionEnd}
    on:paste={handlePaste}
    on:editable-before-replace={(event) => rejectInvalidPaste(event, (event as CustomEvent<{ value: string }>).detail.value)}
    on:blur={() => onBlur?.()}
    on:keydown={(event) => onKeydown?.(event)}
  />
  {#if showClearButton || isPassword}
    <span class="clearable-input-actions">
      {#if showClearButton}
        <button type="button" class="input-icon-button" {disabled} aria-label="清空输入" data-tooltip="清空输入" on:click={clearValue}>
          <X size={15} />
        </button>
      {/if}
      {#if isPassword}
        <button type="button" class="input-icon-button" {disabled} aria-label={passwordVisible ? "隐藏密码" : "显示密码"} data-tooltip={passwordVisible ? "隐藏密码" : "显示密码"} on:click={() => { if (!disabled) passwordVisible = !passwordVisible; }}>
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
{#if passwordError}
  <span id={passwordErrorId} class="password-input-error" role="alert">{rejectedPasswordPaste ? "未粘贴：" : ""}{PASSWORD_CHARACTER_ERROR}，输入内容不会被自动修改。</span>
{:else if visibleErrorMessage}
  <span id={fieldErrorId} class="password-input-error" role="alert">{visibleErrorMessage}</span>
{/if}
</div>

<style>
  .clearable-input-field { position: relative; isolation: isolate; border-radius: 8px; background: var(--field); }

  .clearable-input-field :global(input) { position: relative; z-index: 1; background: transparent !important; }
  .clearable-input-actions { position: relative; z-index: 2; }

  .clearable-input-field :global(.ink-wash) {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    border-radius: inherit;
    pointer-events: none;
  }

  .ink-wash::before,
  .ink-wash::after {
    position: absolute;
    inset: -45% 0;
    border-radius: 50%;
    background: radial-gradient(ellipse, var(--ink-wash) 0%, transparent 68%);
    content: "";
    filter: blur(9px);
    opacity: 0;
    transform: scaleX(0.2);
    transform-origin: left center;
    animation: input-ink-wash 420ms ease-out both;
  }

  .ink-wash::after { animation-delay: 55ms; transform-origin: 38% center; }

  @keyframes input-ink-wash {
    0% { opacity: 0; transform: scaleX(0.2); }
    35% { opacity: 0.7; }
    100% { opacity: 0; transform: scaleX(1.2); }
  }

  @media (prefers-reduced-motion: reduce) {
    .ink-wash { display: none; }
  }

  .password-input-error {
    display: block;
    margin-top: 6px;
    color: var(--danger-panel-text);
    font-size: 12px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

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
    color: var(--text-secondary);
    background: transparent;
  }

  .input-icon-button:hover:not(:disabled) {
    color: var(--text-strong);
    background: var(--control-hover);
  }

  .input-icon-button:focus-visible {
    outline: 2px solid var(--accent-focus);
    outline-offset: 1px;
  }
</style>
