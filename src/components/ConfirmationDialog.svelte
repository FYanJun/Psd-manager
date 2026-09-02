<script lang="ts">
  import { AlertTriangle, Server, ShieldCheck, Tags, UserRound } from "@lucide/svelte";
  import ModalFrame from "./ModalFrame.svelte";
  import type { ConfigImportMode, PendingConfirmation } from "../lib/types";

  export let pendingConfirmation: PendingConfirmation | null = null;
  export let importConfigMode: ConfigImportMode = "add-missing";
  export let cancelPendingConfirmation: () => void;
  export let confirmPendingAction: () => void;
  export let setImportConfigMode: (mode: ConfigImportMode) => void;

  $: importModeError = pendingConfirmation?.importModeErrors?.[importConfigMode] ?? "";
  $: isDeleteConfirmation = pendingConfirmation?.action === "delete-device"
    || pendingConfirmation?.action === "delete-account"
    || pendingConfirmation?.action === "delete-device-type";
  $: deleteWarningTitle = pendingConfirmation?.action === "delete-device-type"
    ? "只有没有关联设备的类型可以删除"
    : pendingConfirmation?.action === "delete-account"
      ? "删除后将从当前设备中移除"
    : "删除后将从当前资产库中移除";

  function displayChangeValue(value: string) {
    return value.trim() ? value : "未设置";
  }
</script>

{#if pendingConfirmation}
  <ModalFrame title={pendingConfirmation.title} titleId="confirm-title" close={cancelPendingConfirmation}>
      {#if isDeleteConfirmation}
        <div class="confirmation-delete-body">
          <div class="confirmation-warning" role="note">
            <span class="confirmation-warning-icon" aria-hidden="true"><AlertTriangle size={17} strokeWidth={2.5} /></span>
            <div class="confirmation-warning-copy">
              <strong>{deleteWarningTitle}</strong>
              <p>{pendingConfirmation.message}</p>
            </div>
          </div>

          {#if pendingConfirmation.target}
            <div class="confirmation-section">
              <span class="confirmation-section-label">删除对象</span>
              <div class="confirmation-target">
                <span class="confirmation-target-icon" aria-hidden="true">
                  {#if pendingConfirmation.target.icon === "device"}
                    <Server size={19} />
                  {:else if pendingConfirmation.target.icon === "account"}
                    <UserRound size={19} />
                  {:else}
                    <Tags size={19} />
                  {/if}
                </span>
                <div class="confirmation-target-copy">
                  <strong>{pendingConfirmation.target.label}</strong>
                  <span>{pendingConfirmation.target.description}</span>
                </div>
              </div>
            </div>
          {/if}

          {#if pendingConfirmation.impactItems?.length}
            <div class="confirmation-section">
              <span class="confirmation-section-label">{pendingConfirmation.action === "delete-device-type" ? "本次影响" : "将同时删除"}</span>
              <ul class="confirmation-impact-list" aria-label="删除影响范围">
                {#each pendingConfirmation.impactItems as item}
                  <li>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          <div class="confirmation-recovery">
            <ShieldCheck size={18} aria-hidden="true" />
            <div>
              <strong>删除前会创建加密快照</strong>
              <p>{pendingConfirmation.detail}</p>
            </div>
          </div>
        </div>
      {:else}
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
      {/if}
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
