<script lang="ts">
  import { X } from "@lucide/svelte";
  import { Combobox } from "bits-ui";
  import type { BulkUsernameSuggestion } from "../lib/types";
  import { INPUT_LIMITS, sanitizeSingleLineTextInput } from "../lib/input-validation";

  export let value = "";
  export let suggestions: BulkUsernameSuggestion[] = [];
  export let open = false;
  export let onValueChange: (value: string) => void;
  export let onSelect: (suggestion: BulkUsernameSuggestion) => void;

  let inputElement: HTMLInputElement | null = null;
  let anchorElement: HTMLDivElement | null = null;
  let menuOpen = false;
  let dismissedValue: string | null = null;
  let composing = false;
  let inkPulseKey = 0;
  let lastInkValue = value;

  $: if (!open) dismissedValue = null;
  $: menuOpen = open && Boolean(value.trim()) && dismissedValue !== value;

  function changeOpen(nextOpen: boolean) {
    dismissedValue = nextOpen ? null : value;
    menuOpen = nextOpen && open && Boolean(value.trim());
  }

  function updateValue(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const nextValue = sanitizeSingleLineTextInput(input.value);
    input.value = nextValue;
    dismissedValue = null;
    onValueChange(nextValue);
    if (!composing && !(event as InputEvent).isComposing) pulseInk(nextValue);
  }

  function pulseInk(nextValue: string) {
    if (nextValue === lastInkValue) return;
    lastInkValue = nextValue;
    inkPulseKey += 1;
  }

  function handleCompositionEnd(event: CompositionEvent) {
    composing = false;
    const nextValue = sanitizeSingleLineTextInput((event.currentTarget as HTMLInputElement).value);
    window.setTimeout(() => pulseInk(nextValue), 0);
  }

  function selectValue(username: string) {
    const suggestion = suggestions.find(suggestion => suggestion.username === username);
    if (suggestion) onSelect(suggestion);
  }

  function clearValue() {
    dismissedValue = value;
    onValueChange("");
    inputElement?.focus({ preventScroll: true });
  }
</script>

<Combobox.Root
  type="single"
  bind:open={() => menuOpen, changeOpen}
  bind:value={() => value, selectValue}
  inputValue={value}
  items={suggestions.slice(0, 8).map(suggestion => ({ value: suggestion.username, label: suggestion.username }))}
  allowDeselect={false}
>
  <div class="bulk-username-input" bind:this={anchorElement}>
    {#if inkPulseKey > 0}
      {#key inkPulseKey}<span class="ink-wash" aria-hidden="true"></span>{/key}
    {/if}
    <Combobox.Input
      bind:ref={inputElement}
      aria-label="匹配用户名"
      placeholder="输入用户名，可直接匹配或选择候选"
      maxlength={INPUT_LIMITS.username}
      autocomplete="off"
      oninput={updateValue}
      oncompositionstart={() => { composing = true; }}
      oncompositionend={handleCompositionEnd}
    >
      {#snippet child({ props })}
        <input {...props} {value} />
      {/snippet}
    </Combobox.Input>
    {#if value}
      <button type="button" class="bulk-username-clear" aria-label="清空输入" data-tooltip="清空输入" onclick={clearValue}><X size={15} /></button>
    {/if}
  </div>

<style>
  .bulk-username-input { isolation: isolate; border-radius: 8px; background: var(--surface-step-1); }
  .bulk-username-input :global(input) { position: relative; z-index: 1; background: transparent !important; }
  .bulk-username-clear { z-index: 2; }
  .ink-wash { position: absolute; inset: 0; z-index: 0; overflow: hidden; border-radius: inherit; pointer-events: none; }
  .ink-wash::before, .ink-wash::after {
    position: absolute; inset: -45% 0; border-radius: 50%; content: ""; filter: blur(9px);
    background: radial-gradient(ellipse, var(--ink-wash) 0%, transparent 68%);
    opacity: 0; transform: scaleX(0.2); transform-origin: left center;
    animation: username-ink-wash 420ms ease-out both;
  }
  .ink-wash::after { animation-delay: 55ms; transform-origin: 38% center; }
  @keyframes username-ink-wash {
    0% { opacity: 0; transform: scaleX(0.2); }
    35% { opacity: 0.7; }
    100% { opacity: 0; transform: scaleX(1.2); }
  }
  @media (prefers-reduced-motion: reduce) { .ink-wash { display: none; } }
</style>
  <Combobox.Portal>
  <Combobox.Content
    class="bulk-username-suggestions"
    aria-label="完整用户名候选"
    sideOffset={4}
    align="start"
    collisionPadding={8}
    strategy="fixed"
    customAnchor={anchorElement}
  >
    <Combobox.Viewport class="bulk-username-viewport">
      {#each suggestions.slice(0, 8) as suggestion (suggestion.username)}
        <Combobox.Item class="bulk-username-option" value={suggestion.username} label={suggestion.username}><strong>{suggestion.username}</strong></Combobox.Item>
      {/each}
      {#if suggestions.length === 0}
        <p class="quiet-text">没有匹配的完整用户名。</p>
      {/if}
    </Combobox.Viewport>
  </Combobox.Content>
  </Combobox.Portal>
</Combobox.Root>
