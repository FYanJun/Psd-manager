<script lang="ts">
  import { X } from "@lucide/svelte";

  export let copyStatus = "";
  export let pauseStatusDismiss: () => void;
  export let resumeStatusDismiss: () => void;
  export let dismissStatus: () => void;
  export let actionLabel = "";
  export let runAction: () => void;
</script>

{#if copyStatus}
  <div class="toast" role="status" on:pointerenter={pauseStatusDismiss} on:pointerleave={resumeStatusDismiss}>
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
    border: 1px solid #465563;
    border-radius: 10px;
    color: #fff;
    background: var(--tooltip-background);
    box-shadow: 0 18px 54px rgba(24, 28, 32, 0.26);
    font-size: var(--font-size-14);
    font-weight: 600;
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
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
  }

  .toast-action {
    flex: 0 0 auto;
    min-height: 28px;
    padding: 0 10px;
    border: 1px solid rgba(255, 255, 255, 0.34);
    border-radius: 7px;
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
    font-weight: 800;
  }

  .toast-action:hover,
  .toast-close:hover {
    background: rgba(255, 255, 255, 0.2);
  }
</style>
