<script lang="ts">
  import { afterUpdate } from "svelte";
  import { X } from "@lucide/svelte";

  export let copyStatus = "";
  export let pauseStatusDismiss: () => void;
  export let resumeStatusDismiss: () => void;
  export let dismissStatus: () => void;
  export let actionLabel = "";
  export let runAction: () => void;

  let toastElement: HTMLDivElement | null = null;
  let pointerInside = false;
  let focusInside = false;

  // Content can be replaced while this same toast remains under the pointer or focus.
  $: if (copyStatus && (pointerInside || focusInside)) pauseStatusDismiss();
  $: if (!copyStatus) {
    pointerInside = false;
    focusInside = false;
  }

  afterUpdate(() => {
    // Replacing the action can remove its focused button without a focusout event.
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
    if (event.relatedTarget instanceof Node && event.currentTarget instanceof HTMLElement && event.currentTarget.contains(event.relatedTarget)) return;
    focusInside = false;
    updatePause();
  }
</script>

{#if copyStatus}
  <div bind:this={toastElement} class="toast" role="status" on:pointerenter={() => { pointerInside = true; updatePause(); }} on:pointerleave={() => { pointerInside = false; updatePause(); }}
    on:focusin={() => { focusInside = true; updatePause(); }} on:focusout={handleFocusOut}>
    <span>{copyStatus}</span>
    {#if actionLabel}<button class="toast-action" on:click={() => runAction()}>{actionLabel}</button>{/if}
    <button class="toast-close" aria-label="关闭提示" on:click={dismissStatus}>
      <X size={16} />
    </button>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    top: 54px;
    left: 50%;
    z-index: 90;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: clamp(32%, var(--toast-share), 92%);
    padding: 10px 10px 10px 16px;
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--app-text);
    background: var(--surface-elevated);
    box-shadow: var(--popover-shadow);
    font-size: var(--font-size-14);
    font-weight: var(--weight-semibold);
    transform: translateX(-50%);
  }

  .toast span {
    min-width: 0;
    line-height: 1.45;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .toast-close {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 8px;
    color: var(--app-text);
    background: var(--surface-subtle);
  }

  .toast-action {
    flex: 0 0 auto;
    min-height: 28px;
    padding: 0 10px;
    border: 1px solid var(--field-border);
    border-radius: 7px;
    color: var(--app-text);
    background: var(--surface-subtle);
    font-weight: var(--weight-semibold);
  }

  .toast-action:hover,
  .toast-close:hover {
    background: var(--control-hover);
  }
</style>
