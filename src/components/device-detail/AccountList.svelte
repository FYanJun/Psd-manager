<script lang="ts">
  import { ListChecks, ListX, Plus, Trash2, UserRound } from "@lucide/svelte";
  import { Checkbox, Tabs } from "bits-ui";
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
  export let toggleAccountBatchSelection: DeviceDetailActions["toggleAccountBatchSelection"];
  export let selectAllCurrentAccounts: DeviceDetailActions["selectAllCurrentAccounts"];
  export let clearAccountBatchSelection: DeviceDetailActions["clearAccountBatchSelection"];

</script>

<section class="account-section" aria-label="设备账号">
  <div class="panel-heading account-heading">
    <div class="account-heading-label">
      <UserRound size={19} />
      <h2>账号</h2>
      {#if selectedAccountIds.length > 0}
        <span class="account-selection-hint">已选 {selectedAccountIds.length} 个</span>
      {/if}
    </div>
    <div class="account-heading-actions">
      {#if selectedAccounts.length > 1}
        <button class="secondary-button account-heading-action account-batch-action" aria-label="全选账号" data-tooltip="全选账号" on:click={() => selectAllCurrentAccounts()}>
          <ListChecks class="account-action-compact-icon" size={15} />
          <span>全选</span>
        </button>
        <button class="secondary-button account-heading-action account-batch-action" aria-label="清空选择" data-tooltip="清空选择" disabled={selectedAccountIds.length === 0} on:click={() => clearAccountBatchSelection()}>
          <ListX class="account-action-compact-icon" size={15} />
          <span>清空</span>
        </button>
      {/if}
      <button class="secondary-button account-heading-action account-add-action" aria-label="新增账号" data-tooltip="新增账号" on:click={() => openAddAccountDialog()}>
        <Plus size={15} />
        <span>新增账号</span>
      </button>
      <button
        class="secondary-button account-heading-action danger-outline"
        aria-label={canDeleteSelectedAccountTargets ? "删除选中账号" : "请先选择账号"}
        disabled={!canDeleteSelectedAccountTargets}
        data-tooltip={canDeleteSelectedAccountTargets ? "删除选中账号" : "请先选择账号"}
        on:click={() => requestDeleteSelectedAccount()}
      >
        <Trash2 size={15} />
        <span>{selectedAccountTargetCount > 1 ? `删除 ${selectedAccountTargetCount} 个` : "删除账号"}</span>
      </button>
    </div>
  </div>
  <Tabs.List class="account-list" aria-label="当前设备账号">
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
          <Checkbox.Root
            class="account-select-box"
            aria-label={`选择账号 ${account.username || account.title || "未填写用户名"}`}
            bind:checked={() => selectedAccountIds.includes(account.id), () => toggleAccountBatchSelection(account.id)}
          >
            <span class="account-checkbox" class:checked={selectedAccountIds.includes(account.id)} aria-hidden="true"></span>
          </Checkbox.Root>
          <Tabs.Trigger
            value={String(account.id)}
            class="account-tab"
            data-value-tooltip={`${account.username || account.title || "未填写用户名"} · ${formatAccountTag(account, selectedItem.deviceType, selectedItem.tag)}`}
            id={`account-tab-${account.id}`}
          >
            <strong>{account.username || account.title || "未填写用户名"}</strong>
            <span>{formatAccountTag(account, selectedItem.deviceType, selectedItem.tag)}</span>
          </Tabs.Trigger>
        </div>
      {/each}
    {/if}
  </Tabs.List>
</section>
