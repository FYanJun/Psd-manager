<script context="module" lang="ts">
  let nextModalId = 0;
</script>

<script lang="ts">
  import { Dialog } from "bits-ui";
  import { X } from "@lucide/svelte";

  export let title: string;
  export let description = "";
  export let titleId = "app-modal-title";
  export let close: () => void;
  export let canClose = true;

  let dialogElement: HTMLDivElement | null = null;
  const modalId = `modal-${nextModalId++}`;

  function handleOpenAutoFocus(event: Event) {
    const initialElement = dialogElement?.querySelector<HTMLElement>("[data-modal-autofocus]");
    if (initialElement) {
      event.preventDefault();
      initialElement.focus({ preventScroll: true });
    }
  }

  function handleEscapeKeydown(event: KeyboardEvent) {
    event.preventDefault();
    if (document.querySelector(`[data-modal-owner="${modalId}"][role="menu"]`)) return;
    requestClose();
  }

  function requestClose() {
    if (canClose) close();
  }

  function allowOwnedEditingMenuFocus(event: FocusEvent) {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(`[data-modal-owner="${modalId}"]`)) return;
    const modals = document.querySelectorAll("[data-modal-id][data-state='open']");
    if (modals[modals.length - 1] !== dialogElement) return;
    event.stopImmediatePropagation();
  }
</script>

<svelte:document on:focusin|capture={allowOwnedEditingMenuFocus} />

<Dialog.Root open={true}>
  <Dialog.Overlay>
    {#snippet child({ props })}
      <div {...props} class="modal-backdrop">
        <Dialog.Content
          bind:ref={dialogElement}
          onOpenAutoFocus={handleOpenAutoFocus}
          onEscapeKeydown={handleEscapeKeydown}
          interactOutsideBehavior="ignore"
        >
          {#snippet child({ props })}
            <div {...props} class="modal" data-modal-id={modalId} tabindex="-1">
              <header class="modal-header">
                <div class="modal-heading-copy">
                  <Dialog.Title id={titleId}>
                    {#snippet child({ props })}
                      <h2 {...props}>{title}</h2>
                    {/snippet}
                  </Dialog.Title>
                  {#if description}<Dialog.Description class="modal-description">{description}</Dialog.Description>{/if}
                </div>
                <button class="icon-button" aria-label="关闭弹窗" data-tooltip="关闭弹窗" type="button" disabled={!canClose} on:click={requestClose}>
                  <X size={20} />
                </button>
              </header>
              <slot></slot>
            </div>
          {/snippet}
        </Dialog.Content>
      </div>
    {/snippet}
  </Dialog.Overlay>
</Dialog.Root>

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
    width: min(680px, calc(100vw - 48px));
    height: auto;
    min-height: 0;
    max-height: calc(100vh - 48px);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-elevated);
    box-shadow: var(--modal-shadow);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: var(--space-5) var(--space-6);
    border-bottom: 1px solid var(--divider);
  }

  .modal-header h2 {
    margin: 0;
    color: var(--text-strong);
    font-size: var(--type-title);
    font-weight: var(--weight-semibold);
    line-height: var(--leading-title);
  }

  .modal-heading-copy {
    min-width: 0;
    display: grid;
    gap: 6px;
  }

  .modal-heading-copy :global(.modal-description) {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--type-label);
    line-height: var(--leading-body);
  }

  .modal:has(:global(.settings-layout)) {
    width: min(1000px, calc(100vw - 48px));
    height: min(760px, calc(100vh - 48px));
  }
</style>
