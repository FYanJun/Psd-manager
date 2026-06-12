<script lang="ts">
  import { X } from "@lucide/svelte";
  import type { PendingConfirmation } from "../lib/types";

  export let pendingConfirmation: PendingConfirmation | null = null;
  export let closeOverlays: () => void;
  export let confirmPendingAction: () => void;
</script>

{#if pendingConfirmation}
  <div class="modal-backdrop">
    <div class="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <header class="modal-header">
        <h2 id="confirm-title">{pendingConfirmation.title}</h2>
        <button class="icon-button" aria-label="关闭弹窗" data-tooltip="关闭弹窗" on:click={() => closeOverlays()}>
          <X size={20} />
        </button>
      </header>
      <div class="confirmation-body">
        <strong>{pendingConfirmation.message}</strong>
        {#if pendingConfirmation.summaryItems}
          <div class="confirmation-summary" aria-label="配置摘要">
            {#each pendingConfirmation.summaryItems as item}
              <span>
                <small>{item.label}</small>
                <strong>{item.value}</strong>
              </span>
            {/each}
          </div>
        {/if}
        <p>{pendingConfirmation.detail}</p>
      </div>
      <footer class="modal-actions">
        <button class="secondary-button" on:click={() => closeOverlays()}>取消</button>
        <button class="danger-button" on:click={() => confirmPendingAction()}>{pendingConfirmation.confirmLabel}</button>
      </footer>
    </div>
  </div>
{/if}
