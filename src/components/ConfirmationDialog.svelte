<script lang="ts">
  import { X } from "@lucide/svelte";
  import type { ConfigImportMode, PendingConfirmation } from "../lib/types";

  export let pendingConfirmation: PendingConfirmation | null = null;
  export let importConfigMode: ConfigImportMode = "add-missing";
  export let closeOverlays: () => void;
  export let confirmPendingAction: () => void;
  export let setImportConfigMode: (mode: ConfigImportMode) => void;
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
        {#if pendingConfirmation.action === "import-config"}
          <div class="import-mode-control" role="radiogroup" aria-label="选择配置导入方式">
            <button
              class:selected={importConfigMode === "add-missing"}
              type="button"
              role="radio"
              aria-checked={importConfigMode === "add-missing"}
              on:click={() => setImportConfigMode("add-missing")}
            >
              <strong>仅新增</strong>
              <small>保留现有数据</small>
            </button>
            <button
              class:selected={importConfigMode === "replace"}
              type="button"
              role="radio"
              aria-checked={importConfigMode === "replace"}
              on:click={() => setImportConfigMode("replace")}
            >
              <strong>全部覆盖</strong>
              <small>以导入文件为准</small>
            </button>
          </div>
        {/if}
        {#if (pendingConfirmation.importModeSummaries?.[importConfigMode] ?? pendingConfirmation.summaryItems)}
          <div class="confirmation-summary" aria-label="配置摘要">
            {#each (pendingConfirmation.importModeSummaries?.[importConfigMode] ?? pendingConfirmation.summaryItems ?? []) as item}
              <span>
                <small>{item.label}</small>
                <strong>{item.value}</strong>
              </span>
            {/each}
          </div>
        {/if}
        <p>{pendingConfirmation.importModeDetails?.[importConfigMode] ?? pendingConfirmation.detail}</p>
      </div>
      <footer class="modal-actions">
        <button class="secondary-button" on:click={() => closeOverlays()}>取消</button>
        <button
          class:danger-button={pendingConfirmation.action !== "import-config" || importConfigMode === "replace"}
          class:primary-button={pendingConfirmation.action === "import-config" && importConfigMode === "add-missing"}
          on:click={() => confirmPendingAction()}
        >{pendingConfirmation.action === "import-config" ? importConfigMode === "add-missing" ? "仅新增" : "全部覆盖" : pendingConfirmation.confirmLabel}</button>
      </footer>
    </div>
  </div>
{/if}
