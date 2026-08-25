<script lang="ts">
  import ModalFrame from "./ModalFrame.svelte";
  import type { ConfigImportMode, PendingConfirmation } from "../lib/types";

  export let pendingConfirmation: PendingConfirmation | null = null;
  export let importConfigMode: ConfigImportMode = "add-missing";
  export let cancelPendingConfirmation: () => void;
  export let confirmPendingAction: () => void;
  export let setImportConfigMode: (mode: ConfigImportMode) => void;

  $: importModeError = pendingConfirmation?.importModeErrors?.[importConfigMode] ?? "";

  function displayChangeValue(value: string) {
    return value.trim() ? value : "未设置";
  }
</script>

{#if pendingConfirmation}
  <ModalFrame title={pendingConfirmation.title} titleId="confirm-title" close={cancelPendingConfirmation}>
      <div class="confirmation-body">
        <strong>{pendingConfirmation.message}</strong>
        {#if pendingConfirmation.action === "import-config"}
          <div class="import-mode-control" role="radiogroup" aria-label="选择配置导入方式">
            <button
              class:selected={importConfigMode === "add-missing"}
              type="button"
              role="radio"
              aria-checked={importConfigMode === "add-missing"}
              aria-disabled={Boolean(pendingConfirmation.importModeErrors?.["add-missing"])}
              disabled={Boolean(pendingConfirmation.importModeErrors?.["add-missing"])}
              data-tooltip={pendingConfirmation.importModeErrors?.["add-missing"] ?? "仅新增"}
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
              data-tooltip="全部覆盖"
              on:click={() => setImportConfigMode("replace")}
            >
              <strong>全部覆盖</strong>
              <small>以导入文件为准</small>
            </button>
          </div>
        {/if}
        {#if (pendingConfirmation.importModeSummaries?.[importConfigMode] ?? pendingConfirmation.summaryItems)}
          <div class="confirmation-summary" aria-label="操作摘要">
            {#each (pendingConfirmation.importModeSummaries?.[importConfigMode] ?? pendingConfirmation.summaryItems ?? []) as item}
              <span class:summary-emphasis={item.label === "影响账号" || item.label === "影响设备"}>
                <small>{item.label}</small>
                <strong>{item.value}</strong>
              </span>
            {/each}
          </div>
        {/if}
        {#if pendingConfirmation.changes?.length}
          <div class="confirmation-changes" aria-label="变更内容">
            {#each pendingConfirmation.changes as change}
              <div class="confirmation-change">
                <small>{change.label}</small>
                <div class="confirmation-change-values">
                  <span class="confirmation-change-value">
                    <em>旧值</em>
                    <strong title={displayChangeValue(change.from)}>{displayChangeValue(change.from)}</strong>
                  </span>
                  <span class="confirmation-change-value">
                    <em>新值</em>
                    <strong title={displayChangeValue(change.to)}>{displayChangeValue(change.to)}</strong>
                  </span>
                </div>
              </div>
            {/each}
          </div>
        {/if}
        <p class="confirmation-detail">{pendingConfirmation.importModeDetails?.[importConfigMode] ?? pendingConfirmation.detail}</p>
        {#if importModeError}
          <p class="confirmation-error" role="alert">{importModeError}</p>
        {/if}
      </div>
      <footer class="modal-actions">
        <button class="secondary-button" on:click={() => cancelPendingConfirmation()}>取消</button>
        <button
          class:danger-button={pendingConfirmation.action !== "import-config" || importConfigMode === "replace"}
          class:primary-button={pendingConfirmation.action === "import-config" && importConfigMode === "add-missing"}
          disabled={Boolean(importModeError)}
          on:click={() => confirmPendingAction()}
        >{pendingConfirmation.action === "import-config" ? importConfigMode === "add-missing" ? "仅新增" : "全部覆盖" : pendingConfirmation.confirmLabel}</button>
      </footer>
  </ModalFrame>
{/if}
