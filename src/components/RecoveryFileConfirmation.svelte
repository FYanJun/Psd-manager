<script lang="ts">
  export let fileName = "";
  export let fileSaved = false;
  export let fileBusy = false;
  export let fileError = "";
  export let acknowledged = false;
  export let lockScreen = false;
  export let save: () => void;
</script>

<button class="secondary-button recovery-file-save" type="button" disabled={fileBusy} on:click={() => save()}>
  {fileBusy ? "正在保存…" : "保存恢复文件"}
</button>
{#if fileName}<p class="recovery-file-status">已保存：{fileName}</p>{/if}
{#if fileError}<p class="recovery-file-error" role="alert">{fileError}</p>{/if}
<label class:recovery-file-ack-disabled={!fileSaved} class:recovery-file-ack-lock={lockScreen} class="recovery-file-ack">
  <input type="checkbox" bind:checked={acknowledged} disabled={!fileSaved} />
  <span>我已将恢复文件保存到安全位置</span>
</label>

<style>
  .recovery-file-save { min-width: 160px; }
  .recovery-file-status { width: 100%; margin: -4px 0 0; color: var(--text-secondary); font-size: var(--font-size-12); overflow-wrap: anywhere; text-align: center; }
  .recovery-file-error { margin: 0; color: var(--danger-panel-text); font-size: var(--font-size-12); line-height: 1.5; text-align: left; }
  .recovery-file-ack { display: inline-flex; align-items: center; justify-content: center; gap: 8px; max-width: 100%; color: var(--text-secondary); font-size: var(--font-size-13); font-weight: var(--weight-medium); line-height: 1.4; text-align: left; }
  .recovery-file-ack-lock { display: grid; gap: 7px; color: var(--text-strong); font-size: var(--font-size-12); font-weight: var(--weight-medium); }
  .recovery-file-ack input { width: 16px; height: 16px; margin: 0; accent-color: var(--blue); }
  .recovery-file-ack-disabled { opacity: 0.58; }
</style>
