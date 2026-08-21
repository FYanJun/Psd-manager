<script context="module" lang="ts">
  const modalStack: HTMLDivElement[] = [];
</script>

<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { X } from "@lucide/svelte";

  export let title: string;
  export let titleId = "app-modal-title";
  export let modalClass = "";
  export let dialogWidth = "";
  export let close: () => void;

  let dialogElement: HTMLDivElement;
  let restoreFocusElement: HTMLElement | null = null;

  const focusableSelector = [
    "a[href]",
    "area[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "summary",
    "[contenteditable='true']",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  $: modalClasses = ["modal", modalClass].filter(Boolean).join(" ");
  $: modalStyle = dialogWidth ? `--dialog-width: ${dialogWidth};` : undefined;

  function getFocusableElements() {
    if (!dialogElement) return [];
    return Array.from(dialogElement.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => element.getClientRects().length > 0 || element === document.activeElement);
  }

  async function focusInitialElement() {
    await tick();
    if (!dialogElement) return;
    const initialElement = dialogElement.querySelector<HTMLElement>("[data-modal-autofocus]")
      ?? getFocusableElements()[0]
      ?? dialogElement;
    initialElement.focus({ preventScroll: true });
  }

  function handleDialogKeydown(event: KeyboardEvent) {
    if (event.key !== "Tab" || !dialogElement) return;
    const focusableElements = getFocusableElements();
    if (focusableElements.length === 0) {
      event.preventDefault();
      dialogElement.focus({ preventScroll: true });
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    if (event.shiftKey && (activeElement === firstElement || !dialogElement.contains(activeElement))) {
      event.preventDefault();
      lastElement.focus({ preventScroll: true });
    } else if (!event.shiftKey && (activeElement === lastElement || !dialogElement.contains(activeElement))) {
      event.preventDefault();
      firstElement.focus({ preventScroll: true });
    }
  }

  function handleDocumentFocusIn(event: FocusEvent) {
    if (modalStack[modalStack.length - 1] !== dialogElement) return;
    const target = event.target;
    if (target instanceof Node && !dialogElement.contains(target)) {
      void focusInitialElement();
    }
  }

  onMount(() => {
    restoreFocusElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalStack.push(dialogElement);
    dialogElement.addEventListener("keydown", handleDialogKeydown);
    document.addEventListener("focusin", handleDocumentFocusIn, true);
    void focusInitialElement();
  });

  onDestroy(() => {
    dialogElement?.removeEventListener("keydown", handleDialogKeydown);
    document.removeEventListener("focusin", handleDocumentFocusIn, true);
    const stackIndex = modalStack.indexOf(dialogElement);
    if (stackIndex >= 0) modalStack.splice(stackIndex, 1);
    if (restoreFocusElement?.isConnected) {
      restoreFocusElement.focus({ preventScroll: true });
      return;
    }
    modalStack[modalStack.length - 1]?.focus({ preventScroll: true });
  });
</script>

<div class="modal-backdrop">
  <div
    bind:this={dialogElement}
    class={modalClasses}
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    tabindex="-1"
    style={modalStyle}
  >
    <header class="modal-header">
      <h2 id={titleId}>{title}</h2>
      <button class="icon-button" aria-label="关闭弹窗" data-tooltip="关闭弹窗" on:click={() => close()}>
        <X size={20} />
      </button>
    </header>
    <slot></slot>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    background: var(--overlay);
  }

  .modal {
    --dialog-width: 720px;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    width: min(var(--dialog-width), calc(100vw - 48px));
    max-height: calc(100vh - 48px);
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: var(--modal-shadow);
  }

  .modal:global(.type-modal) {
    --dialog-width: 720px;
    border-radius: 14px;
  }

  .modal:global(.bulk-modal) {
    --dialog-width: 920px;
  }

  .modal:global(.confirm-modal) {
    --dialog-width: 760px;
  }

  .modal:global(.settings-modal) {
    --dialog-width: 860px;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 {
    margin: 0;
    font-size: var(--font-size-20);
  }
</style>
