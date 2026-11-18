<script lang="ts">
  import { afterUpdate, onMount } from "svelte";
  import { CircleCheck, Info } from "@lucide/svelte";
  import type { StatusTone, StatusOperation } from "../lib/status-presentation";

  export let message = "";
  export let tone: StatusTone = "info";
  export let operation: StatusOperation = "general";
  export let pauseStatusDismiss: () => void;
  export let resumeStatusDismiss: () => void;
  export let dismissStatus: () => void;
  export let actionLabel = "";
  export let runAction: () => void;

  let toastElement: HTMLDivElement | null = null;
  let pointerInside = false;
  let focusInside = false;
  $: visible = Boolean(message) && (tone === "success" || tone === "info");
  $: if (visible && (pointerInside || focusInside)) pauseStatusDismiss();
  $: if (!visible) {
    pointerInside = false;
    focusInside = false;
  }

  afterUpdate(() => {
    if (focusInside && toastElement && !toastElement.contains(document.activeElement)) {
      focusInside = false;
      updatePause();
    }
  });

  function updatePause() {
    if (pointerInside || focusInside) pauseStatusDismiss();
    else resumeStatusDismiss();
  }

  function handleFocusOut(event: FocusEvent) {
    if (event.relatedTarget instanceof Node && toastElement?.contains(event.relatedTarget)) return;
    focusInside = false;
    updatePause();
  }

  onMount(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !visible || event.isComposing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      dismissStatus();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  });
</script>

<div class="toast-region" role="status" aria-live="polite" aria-atomic="true" aria-relevant="additions text">
  {#if visible}
    <div bind:this={toastElement} class="toast" role="group" data-tone={tone} data-operation={operation}
      on:pointerenter={() => { pointerInside = true; updatePause(); }} on:pointerleave={() => { pointerInside = false; updatePause(); }}
      on:focusin={() => { focusInside = true; updatePause(); }} on:focusout={handleFocusOut}>
      <span class="toast-icon" aria-hidden="true">
        {#if tone === "success"}<CircleCheck size={18} />{:else}<Info size={18} />{/if}
      </span>
      <span class="toast-message">{message}</span>
      {#if actionLabel}
        <button type="button" class="toast-action" on:click={runAction}>{actionLabel}</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .toast-region {
    position: fixed;
    bottom: 24px;
    left: 50%;
    z-index: 90;
    transform: translateX(-50%);
    width: max-content;
    max-width: calc(100vw - 32px);
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    box-sizing: border-box;
    width: max-content;
    max-width: min(420px, calc(100vw - 32px));
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius-md) + 10px + var(--radius-nested-inset));
    background: var(--surface-elevated);
    color: var(--app-text);
    box-shadow: var(--popover-shadow);
    font-size: var(--font-size-14);
    font-weight: var(--weight-medium);
    cursor: default;
    pointer-events: auto;
  }

  .toast-icon {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--text-secondary);
  }

  .toast[data-tone="success"] .toast-icon {
    color: var(--toast-success);
  }

  .toast-message {
    min-width: 0;
    line-height: 1.5;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .toast-action {
    flex: 0 0 auto;
    min-height: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--radius-md);
    color: var(--blue);
    background: transparent;
    font-weight: var(--weight-semibold);
  }

  .toast-action:hover {
    background: var(--control-hover);
  }
</style>
