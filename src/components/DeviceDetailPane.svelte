<script lang="ts">
  import { Copy, KeyRound, Pencil, SearchX, Server, ServerCog } from "@lucide/svelte";
  import AccountDetail from "./device-detail/AccountDetail.svelte";
  import AccountList from "./device-detail/AccountList.svelte";
  import DeviceInfoCard from "./device-detail/DeviceInfoCard.svelte";
  import type { DeviceAccount, PasswordHistory, VaultItem } from "../lib/types";
  import type { DeviceDetailActions, DeviceDetailModel } from "../lib/view-models";

  export let passwordVisible = false;
  export let historyOpen = false;
  export let model: DeviceDetailModel;
  export let actions: DeviceDetailActions;

  let hasSelectedDevice: boolean;
  let hasDevices: boolean;
  let searchQuery: string;
  let selectedItem: VaultItem;
  let selectedAccounts: DeviceAccount[];
  let selectedAccount: DeviceAccount;
  let selectedAccountIds: number[];
  let selectedAccountTargetCount: number;
  let copyableAccountTargetCount: number;
  let canDeleteSelectedAccountTargets: boolean;
  let sortedHistory: PasswordHistory[];
  let historySortDesc: boolean;
  let visibleHistoryIds: number[];
  let passwordStrength: string;
  let openDetailBlankContextMenu: DeviceDetailActions["openDetailBlankContextMenu"];
  let openAccountContextMenu: DeviceDetailActions["openAccountContextMenu"];
  let openAddAccountDialog: DeviceDetailActions["openAddAccountDialog"];
  let openPasswordDialog: DeviceDetailActions["openPasswordDialog"];
  let copySelectedAccountInfo: DeviceDetailActions["copySelectedAccountInfo"];
  let openEditAccountDialog: DeviceDetailActions["openEditAccountDialog"];
  let requestDeleteSelectedAccount: DeviceDetailActions["requestDeleteSelectedAccount"];
  let copyText: DeviceDetailActions["copyText"];
  let selectAccount: DeviceDetailActions["selectAccount"];
  let toggleAccountBatchSelection: DeviceDetailActions["toggleAccountBatchSelection"];
  let selectAllCurrentAccounts: DeviceDetailActions["selectAllCurrentAccounts"];
  let clearAccountBatchSelection: DeviceDetailActions["clearAccountBatchSelection"];
  let maskPassword: DeviceDetailActions["maskPassword"];
  let toggleHistoryPassword: DeviceDetailActions["toggleHistoryPassword"];
  let requestRestoreHistoryPassword: DeviceDetailActions["requestRestoreHistoryPassword"];
  let toggleHistorySort: DeviceDetailActions["toggleHistorySort"];
  let clearSearch: DeviceDetailActions["clearSearch"];
  let openAddDeviceDialog: DeviceDetailActions["openAddDeviceDialog"];

  $: ({ hasSelectedDevice, hasDevices, searchQuery, selectedItem, selectedAccounts, selectedAccount,
    selectedAccountIds, selectedAccountTargetCount, copyableAccountTargetCount,
    canDeleteSelectedAccountTargets, sortedHistory, historySortDesc, visibleHistoryIds,
    passwordStrength } = model);
  $: ({ openDetailBlankContextMenu, openAccountContextMenu, openAddAccountDialog, openPasswordDialog,
    copySelectedAccountInfo, openEditAccountDialog, requestDeleteSelectedAccount, copyText,
    selectAccount, toggleAccountBatchSelection, selectAllCurrentAccounts, clearAccountBatchSelection,
    maskPassword, toggleHistoryPassword, requestRestoreHistoryPassword, toggleHistorySort,
    clearSearch, openAddDeviceDialog } = actions);

</script>

<section class="detail-pane" aria-label="设备详情" on:contextmenu={openDetailBlankContextMenu}>
  {#if hasSelectedDevice}
    <div class="detail-topline">
      <div class="detail-header-identity">
        <span class={`detail-icon ${selectedItem.iconClass}`}>
          {selectedItem.iconText}
        </span>
        <div class="detail-header-copy">
          <h1>{selectedItem.deviceName}</h1>
          <p class="identity-subtitle">
            <span>{selectedItem.deviceType}</span>
            <span>{selectedAccounts.length} 个账号</span>
          </p>
        </div>
      </div>
      <div class="detail-actions">
        <button class="tool-button update-password-action" aria-label={selectedAccountTargetCount > 0 ? "更新密码" : "请先新增账号"} data-tooltip={selectedAccountTargetCount > 0 ? "更新密码" : "请先新增账号"} disabled={selectedAccountTargetCount === 0} on:click={() => openPasswordDialog()}>
          <KeyRound size={19} />
          <span>{selectedAccountTargetCount > 1 ? `更新 ${selectedAccountTargetCount} 个` : "更新密码"}</span>
        </button>
        <button class="tool-button detail-copy-action" aria-label={copyableAccountTargetCount > 0 ? "复制账号密码" : selectedAccountTargetCount > 0 ? "所选账号未设置密码" : "请先新增账号"} data-tooltip={copyableAccountTargetCount > 0 ? "复制账号密码" : selectedAccountTargetCount > 0 ? "所选账号未设置密码" : "请先新增账号"} disabled={copyableAccountTargetCount === 0} on:click={() => copySelectedAccountInfo()}>
          <Copy size={20} />
          <span>{copyableAccountTargetCount > 1 ? `复制 ${copyableAccountTargetCount} 个` : "复制账号密码"}</span>
        </button>
        <button class="tool-button detail-edit-action" aria-label={selectedAccountTargetCount > 0 ? "编辑账号" : "请先新增账号"} data-tooltip={selectedAccountTargetCount > 0 ? "编辑账号" : "请先新增账号"} disabled={selectedAccountTargetCount === 0} on:click={() => openEditAccountDialog()}>
          <Pencil size={20} />
          <span>编辑账号</span>
        </button>
      </div>
    </div>

    <div class="detail-scroll" role="group" aria-label="当前设备详情">
      <DeviceInfoCard {selectedItem} {copyText} />

      <AccountList
        {selectedItem}
        {selectedAccounts}
        {selectedAccount}
        {selectedAccountIds}
        {selectedAccountTargetCount}
        {canDeleteSelectedAccountTargets}
        {openAccountContextMenu}
        {openAddAccountDialog}
        {requestDeleteSelectedAccount}
        {selectAccount}
        {toggleAccountBatchSelection}
        {selectAllCurrentAccounts}
        {clearAccountBatchSelection}
      />

      <AccountDetail
        bind:passwordVisible
        bind:historyOpen
        {selectedAccount}
        {sortedHistory}
        {historySortDesc}
        {visibleHistoryIds}
        {passwordStrength}
        {copyText}
        {maskPassword}
        {toggleHistoryPassword}
        {requestRestoreHistoryPassword}
        {toggleHistorySort}
      />
    </div>
  {:else}
    <div class="detail-topline">
      <div class="breadcrumb" aria-label="当前详情设备类型">
        <span class="device-type-badge"><ServerCog size={16} /></span>
        <span>设备账号</span>
      </div>
    </div>

    <div class="detail-empty-state">
      <span class="empty-state-icon">
        {#if searchQuery.trim()}
          <SearchX size={34} />
        {:else}
          <Server size={34} />
        {/if}
      </span>
      <h1>{searchQuery.trim() ? "没有匹配的设备资产" : hasDevices ? "当前类型暂无设备" : "资产库还是空的"}</h1>
      <p>{searchQuery.trim() ? "当前搜索会匹配设备名、连接地址、资产编号和位置。清空搜索后可以回到全部设备。" : hasDevices ? "可以在当前类型下新增设备，或切换到其他设备类型。" : "新增第一台设备资产后，账号、当前密码和旧密码记录会在这里集中管理。"}</p>
      <div class="empty-state-actions">
        {#if searchQuery.trim()}
          <button class="secondary-button" on:click={() => clearSearch()}>清空搜索</button>
        {/if}
        <button class="primary-button" on:click={() => openAddDeviceDialog()}>新增设备</button>
      </div>
    </div>
  {/if}
</section>
