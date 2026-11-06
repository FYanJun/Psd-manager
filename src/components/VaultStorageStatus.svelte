<script lang="ts">
  import { AlertTriangle, LoaderCircle, LogOut, RefreshCw, RotateCcw } from "@lucide/svelte";

  export let state: "loading" | "load-error" | "save-error" = "loading";
  export let error = "";
  export let retry: () => void | Promise<void>;
  export let canRecoverBackup = false;
  export let recoverBackup: () => void | Promise<void>;
  export let canExit = false;
  export let exitError = "";
  export let exiting = false;
  export let exitApplication: () => void | Promise<void> = () => {};

  type CriticalStorageAction = "recover-backup";

  const criticalActionCopy: Record<CriticalStorageAction, { title: string; detail: string; confirmLabel: string }> = {
    "recover-backup": {
      title: "确认恢复安全备份？",
      detail: "当前主资产库会被安全备份替换；请确认这是你要恢复的数据版本。",
      confirmLabel: "确认恢复",
    },
  };

  let pendingCriticalAction: CriticalStorageAction | null = null;

  async function confirmCriticalAction() {
    const action = pendingCriticalAction;
    pendingCriticalAction = null;
    if (action === "recover-backup") await recoverBackup();
  }
</script>

<div class="vault-storage-backdrop" role={state === "loading" ? "status" : "alert"}>
  <section class="vault-storage-status">
    <span class:error={state !== "loading"} class="vault-storage-icon">
      {#if state !== "loading"}
        <AlertTriangle size={26} />
      {:else}
        <span class="spin"><LoaderCircle size={26} /></span>
      {/if}
    </span>
    <div>
      <h1>{state === "load-error" ? "无法打开本地资产库" : state === "save-error" ? "无法保存本地资产库" : "正在读取本地资产库"}</h1>
      <p>{state === "loading" ? "正在读取本地加密资产库中的设备和账号。" : error}</p>
    </div>
    {#if state !== "loading" && pendingCriticalAction}
      {@const confirmation = criticalActionCopy[pendingCriticalAction]}
      <div class="vault-storage-confirmation" role="alertdialog" aria-labelledby="vault-storage-confirm-title" aria-describedby="vault-storage-confirm-detail">
        <strong id="vault-storage-confirm-title">{confirmation.title}</strong>
        <p id="vault-storage-confirm-detail">{confirmation.detail}</p>
        <div class="vault-storage-actions">
          <button class="danger-button" disabled={exiting} on:click={() => confirmCriticalAction()}>{confirmation.confirmLabel}</button>
          <button class="secondary-button" disabled={exiting} on:click={() => (pendingCriticalAction = null)}>取消</button>
        </div>
      </div>
    {:else if state !== "loading"}
      <div class="vault-storage-actions">
        {#if state === "load-error" && canRecoverBackup}
          <button class="primary-button" disabled={exiting} on:click={() => (pendingCriticalAction = "recover-backup")}><RotateCcw size={17} /><span>恢复安全备份</span></button>
        {:else}
          <button class="secondary-button" disabled={exiting} on:click={() => retry()}><RefreshCw size={17} /><span>{state === "save-error" ? "重试保存" : "重新读取"}</span></button>
        {/if}
        {#if state === "load-error"}
          <button class="secondary-button" disabled={!canExit || exiting} on:click={() => exitApplication()}><LogOut size={17} /><span>{exiting ? "正在退出…" : exitError ? "重试退出" : "退出应用"}</span></button>
        {/if}
      </div>
    {/if}
    {#if state === "load-error" && !canExit}
      <p class="vault-storage-exit-detail">退出仅适用于桌面应用中尚未加载资产且无待保存内容的读取失败；浏览器预览请关闭当前标签页。</p>
    {/if}
    {#if state !== "loading" && exitError}
      <p class="vault-storage-exit-error" role="alert">{exitError}</p>
    {/if}
  </section>
</div>

<style>
  .vault-storage-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: grid;
    place-items: center;
    padding: 24px;
    background: color-mix(in srgb, var(--app-background) 96%, transparent);
  }

  .vault-storage-status {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 16px;
    width: min(560px, 100%);
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    color: var(--app-text);
    background: var(--surface);
    box-shadow: var(--popover-shadow);
  }

  .vault-storage-actions {
    grid-column: 2;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .vault-storage-actions .primary-button,
  .vault-storage-actions .secondary-button,
  .vault-storage-actions .danger-button {
    min-height: 36px;
    padding: 0 12px;
  }

  .vault-storage-confirmation {
    grid-column: 2;
    display: grid;
    gap: 8px;
  }

  .vault-storage-exit-detail,
  .vault-storage-exit-error {
    grid-column: 2;
  }

  .vault-storage-status .vault-storage-exit-error {
    color: var(--danger-panel-text);
  }

  .vault-storage-confirmation > strong {
    font-size: var(--font-size-15);
  }

  .vault-storage-confirmation .vault-storage-actions {
    grid-column: auto;
  }

  .vault-storage-status h1 {
    margin: 0 0 4px;
    font-size: var(--font-size-18);
  }

  .vault-storage-status p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .vault-storage-icon {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: var(--radius-lg);
    color: var(--blue);
    background: var(--accent-subtle);
  }

  .vault-storage-icon.error {
    color: var(--danger-panel-text);
    background: var(--danger-panel);
  }

  .spin {
    display: inline-flex;
    animation: vault-spin 0.9s linear infinite;
  }

  @keyframes vault-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
