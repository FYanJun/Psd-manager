<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { writable } from "svelte/store";
  import { CircleAlert, TriangleAlert, X } from "@lucide/svelte";
  import { getFeedbackAlert, type FeedbackAlert } from "../lib/feedback-alert";

  export let owner = "";
  const alert = getFeedbackAlert() ?? writable<FeedbackAlert | null>(null);

  onDestroy(() => {
    if (!owner) return;
    void tick().then(() => {
      const dialogs = document.querySelectorAll<HTMLElement>("[data-modal-id][data-state='open']");
      const remainingOwner = dialogs[dialogs.length - 1]?.dataset.modalId ?? "";
      alert.update(value => value?.owner === owner ? { ...value, owner: remainingOwner } : value);
    });
  });
</script>

{#if $alert && $alert.owner === owner}
  <div class="feedback-alert" class:error={$alert.presentation.tone === "error"} role="alert" aria-atomic="true">
    <span class="feedback-alert-icon" aria-hidden="true">
      {#if $alert.presentation.tone === "error"}<CircleAlert size={18} />{:else}<TriangleAlert size={18} />{/if}
    </span>
    <span class="feedback-alert-message">{$alert.message}</span>
    {#if $alert.actionLabel}
      <button type="button" on:click={$alert.runAction}>{$alert.actionLabel}</button>
    {/if}
    <button type="button" class="feedback-alert-close" aria-label="关闭提醒" on:click={$alert.dismiss}>
      <X size={16} />
    </button>
  </div>
{/if}

<style>
  .feedback-alert {
    flex-basis: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-subtle);
    color: var(--app-text);
    font-size: var(--font-size-14);
    font-weight: var(--weight-medium);
  }

  .feedback-alert.error {
    border-color: var(--danger-panel-border);
    background: var(--danger-panel);
  }

  .feedback-alert-icon {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--text-secondary);
  }

  .error .feedback-alert-icon {
    color: var(--danger-panel-text);
  }

  .feedback-alert-message {
    flex: 1;
    min-width: 0;
    max-height: 30vh;
    overflow: auto;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    line-height: 1.5;
  }

  button {
    flex: 0 0 auto;
    min-height: 28px;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: inherit;
  }

  .feedback-alert-close {
    display: grid;
    place-items: center;
    width: 28px;
  }
</style>
