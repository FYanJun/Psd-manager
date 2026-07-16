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
