<script lang="ts">
  import { Plus, Trash2, UserRound } from "@lucide/svelte";
  import { tick } from "svelte";
  import type { DeviceAccount, VaultItem } from "../../lib/types";
  import type { DeviceDetailActions } from "../../lib/view-models";
  import { formatAccountTag } from "../../lib/vault";

  export let selectedItem: VaultItem;
  export let selectedAccounts: DeviceAccount[];
  export let selectedAccount: DeviceAccount;
  export let selectedAccountIds: number[];
  export let selectedAccountTargetCount: number;
  export let canDeleteSelectedAccountTargets: boolean;
  export let openAccountContextMenu: DeviceDetailActions["openAccountContextMenu"];
  export let openAddAccountDialog: DeviceDetailActions["openAddAccountDialog"];
  export let requestDeleteSelectedAccount: DeviceDetailActions["requestDeleteSelectedAccount"];
  export let selectAccount: DeviceDetailActions["selectAccount"];
  export let toggleAccountBatchSelection: DeviceDetailActions["toggleAccountBatchSelection"];
  export let selectAllCurrentAccounts: DeviceDetailActions["selectAllCurrentAccounts"];
  export let clearAccountBatchSelection: DeviceDetailActions["clearAccountBatchSelection"];

  function handleAccountTabKeydown(event: KeyboardEvent, accountId: number) {
    if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    const currentIndex = selectedAccounts.findIndex((account) => account.id === accountId);
    if (currentIndex < 0) return;
    const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? selectedAccounts.length - 1
        : (currentIndex + direction + selectedAccounts.length) % selectedAccounts.length;
    const nextAccount = selectedAccounts[nextIndex];
    if (!nextAccount) return;
    event.preventDefault();
    selectAccount(nextAccount.id);
    void tick().then(() => document.getElementById(`account-tab-${nextAccount.id}`)?.focus());
  }
</script>

<section class="account-section" aria-label="设备账号">
  <div class="panel-heading account-heading">
    <UserRound size={19} />
    <h2>账号</h2>
    {#if selectedAccountIds.length > 0}
      <span class="account-selection-hint">已选 {selectedAccountIds.length} 个</span>
    {/if}
    <div class="account-heading-actions">
      {#if selectedAccounts.length > 1}
        <button class="secondary-button account-heading-action" on:click={() => selectAllCurrentAccounts()}>
          <span>全选</span>
        </button>
        <button class="secondary-button account-heading-action" disabled={selectedAccountIds.length === 0} on:click={() => clearAccountBatchSelection()}>
          <span>清空</span>
        </button>
      {/if}
      <button class="secondary-button account-heading-action account-add-action" on:click={() => openAddAccountDialog()}>
        <Plus size={15} />
        <span>新增账号</span>
      </button>
      <button
        class="secondary-button account-heading-action danger-outline"
        disabled={!canDeleteSelectedAccountTargets}
        data-tooltip={canDeleteSelectedAccountTargets ? "删除选中账号" : "请先选择账号"}
        on:click={() => requestDeleteSelectedAccount()}
      >
        <Trash2 size={15} />
        <span>{selectedAccountTargetCount > 1 ? `删除 ${selectedAccountTargetCount} 个` : "删除账号"}</span>
      </button>
    </div>
  </div>
  <div class="account-list" role="tablist" aria-label="当前设备账号" aria-orientation="vertical">
    {#if selectedAccounts.length === 0}
      <div class="account-empty-state">
        <strong>暂无账号</strong>
        <span>新增账号后，这里会显示用户名、密码和历史记录。</span>
      </div>
    {:else}
      {#each selectedAccounts as account}
        <div
          class="account-row"
          class:selected={account.id === selectedAccount.id}
          role="group"
          aria-label={`账号 ${account.username || account.title || "未填写用户名"}`}
          on:contextmenu={(event) => openAccountContextMenu(account.id, event)}
        >
          <label class="account-select-box">
            <input
              type="checkbox"
              aria-label={`选择账号 ${account.username || account.title || "未填写用户名"}`}
              checked={selectedAccountIds.includes(account.id)}
              on:change={() => toggleAccountBatchSelection(account.id)}
            />
            <span class="account-checkbox" class:checked={selectedAccountIds.includes(account.id)} aria-hidden="true"></span>
          </label>
          <button
            class="account-tab"
            role="tab"
            id={`account-tab-${account.id}`}
            aria-controls="selected-account-detail"
            aria-selected={account.id === selectedAccount.id}
            tabindex={account.id === selectedAccount.id ? 0 : -1}
            on:keydown={(event) => handleAccountTabKeydown(event, account.id)}
            on:click={() => selectAccount(account.id)}
          >
            <strong>{account.username || account.title || "未填写用户名"}</strong>
            <span>{formatAccountTag(account, selectedItem.deviceType, selectedItem.tag)}</span>
          </button>
        </div>
      {/each}
    {/if}
  </div>
</section>
