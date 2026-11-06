<script lang="ts">
  import { AlertTriangle, Server, ShieldCheck, Tags, UserRound } from "@lucide/svelte";
  import { RadioGroup } from "bits-ui";
  import ModalFrame from "./ModalFrame.svelte";
  import type { ConfigImportMode, ConfirmationAction, PendingConfirmation } from "../lib/types";

  export let pendingConfirmation: PendingConfirmation | null = null;
  export let importConfigMode: ConfigImportMode = "add-missing";
  export let cancelPendingConfirmation: () => void;
  export let confirmPendingAction: () => void;
  export let setImportConfigMode: (mode: ConfigImportMode) => void;
  export let setXlsxOverwriteDeviceKeys: (keys: string[]) => void;

  export let busy = false;
  export let error = "";
  export let progressLabel = "正在执行…";

  const dangerousActions = new Set<ConfirmationAction>([
    "delete-device", "delete-account", "delete-device-type", "update-password",
    "bulk-update-password", "save-account-password", "restore-history", "restore-snapshot", "reset-settings",
  ]);
  let changesExpanded = false;
  let previousConfirmation: PendingConfirmation | null = null;
  $: if (pendingConfirmation !== previousConfirmation) {
    changesExpanded = false;
    previousConfirmation = pendingConfirmation;
  }
  $: isDangerous = pendingConfirmation?.action === "import-config"
    ? pendingConfirmation.xlsxImport
      ? Boolean(pendingConfirmation.xlsxOverwriteDeviceKeys?.length)
      : importConfigMode === "replace"
    : Boolean(pendingConfirmation && dangerousActions.has(pendingConfirmation.action));

  function requestCancel() {
    if (!busy) cancelPendingConfirmation();
  }

  function requestConfirm() {
    if (!busy && !importModeError) confirmPendingAction();
  }

  function changeImportMode(mode: string) {
    if (!busy) setImportConfigMode(mode as ConfigImportMode);
  }

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
  <ModalFrame title={pendingConfirmation.title} titleId="confirm-title" canClose={!busy} close={requestCancel}>
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
          {#if busy}<p class="confirmation-progress" role="status">{progressLabel}</p>{/if}
          {#if error}<p class="confirmation-error" role="alert">{error}</p>{/if}
        </div>
      {:else}
        <div class="confirmation-body">
          <strong>{pendingConfirmation.message}</strong>
          {#if pendingConfirmation.action === "import-config"}
          {#if pendingConfirmation.xlsxImport}
            {#if pendingConfirmation.xlsxDeviceConflicts?.length}
              <fieldset class="xlsx-overwrite-list" disabled={busy}>
                <legend>同名设备 · 勾选整台覆盖</legend>
                {#each pendingConfirmation.xlsxDeviceConflicts as conflict (conflict.key)}
                  <label class="xlsx-overwrite-row">
                    <input
                      type="checkbox"
                      checked={pendingConfirmation.xlsxOverwriteDeviceKeys?.includes(conflict.key) ?? false}
                      on:change={(event) => {
                        const selected = pendingConfirmation?.xlsxOverwriteDeviceKeys ?? [];
                        const next = (event.currentTarget as HTMLInputElement).checked
                          ? [...selected, conflict.key]
                          : selected.filter((key) => key !== conflict.key);
                        setXlsxOverwriteDeviceKeys(next);
                      }}
                    />
                    <span>
                      <strong>{conflict.deviceType} / {conflict.deviceName}</strong>
                      <small>本地 {conflict.localAccountCount} 个账号 → 工作簿 {conflict.incomingAccountCount} 个账号</small>
                    </span>
                  </label>
                {/each}
              </fieldset>
              <p class="confirmation-detail">已选 {pendingConfirmation.xlsxOverwriteDeviceKeys?.length ?? 0} 台设备覆盖，其余同名设备保留本地数据。</p>
            {:else}
              <p class="confirmation-detail">未发现同名设备；工作簿中的设备会添加到本地。</p>
            {/if}
          {:else}
          <RadioGroup.Root orientation="horizontal" class="import-mode-control" bind:value={() => importConfigMode, changeImportMode} aria-label="选择配置导入方式">
            <RadioGroup.Item
              value="add-missing"
              class={importConfigMode === "add-missing" ? "selected" : ""}
              type="button"
              disabled={busy || Boolean(pendingConfirmation.importModeErrors?.["add-missing"])}
              data-tooltip={pendingConfirmation.importModeErrors?.["add-missing"] ?? "仅新增"}
            >
              <strong>仅新增</strong>
              <small>保留现有数据</small>
            </RadioGroup.Item>
            <RadioGroup.Item
              value="replace"
              class={importConfigMode === "replace" ? "selected" : ""}
              type="button"
              disabled={busy}
              data-tooltip="全部覆盖"
            >
              <strong>全部覆盖</strong>
              <small>以导入文件为准</small>
            </RadioGroup.Item>
          </RadioGroup.Root>
          {/if}
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
          <button class="secondary-button confirmation-expand" type="button" aria-expanded={changesExpanded} aria-controls="confirmation-change-list" on:click={() => changesExpanded = !changesExpanded}>
            {changesExpanded ? "收起完整变更" : "展开完整变更"}
          </button>
          <div id="confirmation-change-list" class="confirmation-changes" class:expanded={changesExpanded} aria-label="变更内容">
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
          {#if busy}<p class="confirmation-progress" role="status">{progressLabel}</p>{/if}
          {#if error}<p class="confirmation-error" role="alert">{error}</p>{/if}
        </div>
      {/if}
      <footer class="modal-actions">
        <button class="secondary-button" disabled={busy} on:click={requestCancel}>取消</button>
        <button
          class:danger-button={isDangerous}
          class:primary-button={!isDangerous}
          disabled={busy || Boolean(importModeError)}
          on:click={requestConfirm}
        >{pendingConfirmation.action === "import-config" ? pendingConfirmation.xlsxImport ? "导入 Excel" : importConfigMode === "add-missing" ? "仅新增" : "全部覆盖" : pendingConfirmation.confirmLabel}</button>
      </footer>
  </ModalFrame>
{/if}
