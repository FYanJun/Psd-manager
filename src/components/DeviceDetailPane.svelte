<script lang="ts">
  import { ChevronDown, ChevronRight, Clock3, Copy, Eye, EyeOff, Folder, History, KeyRound, MoreVertical, Pencil, Plus, ShieldCheck, Trash2, UserRound } from "@lucide/svelte";
  import type { DeviceAccount, PasswordHistory, VaultItem } from "../lib/types";
  import { formatAccountTag } from "../lib/vault";

  export let hasSelectedDevice = false;
  export let hasDevices = false;
  export let searchQuery = "";
  export let selectedItem: VaultItem;
  export let selectedAccounts: DeviceAccount[];
  export let selectedAccount: DeviceAccount;
  export let selectedAccountIds: number[] = [];
  export let selectedAccountTargetCount = 0;
  export let canDeleteSelectedAccountTargets = false;
  export let sortedHistory: PasswordHistory[];
  export let passwordVisible = false;
  export let historyOpen = true;
  export let visibleHistoryIds: number[] = [];
  export let passwordStrength = "较弱";

  export let openDetailBlankContextMenu: (event: MouseEvent) => void;
  export let openAddAccountDialog: () => void;
  export let openPasswordDialog: () => void;
  export let copySelectedAccountInfo: () => void;
  export let openEditAccountDialog: () => void;
  export let requestDeleteSelectedAccount: () => void;
  export let openMorePopover: (event: MouseEvent) => void;
  export let openSelectedDeviceContextMenu: (event: MouseEvent) => void;
  export let copyText: (text: string, label: string) => void;
  export let selectAccount: (id: number) => void;
  export let toggleAccountBatchSelection: (id: number) => void;
  export let selectAllCurrentAccounts: () => void;
  export let clearAccountBatchSelection: () => void;
  export let maskPassword: (password: string) => string;
  export let toggleHistoryPassword: (id: number) => void;
  export let clearSearch: () => void;
  export let openAddDeviceDialog: () => void;
</script>

<section class="detail-pane" aria-label="设备详情" on:contextmenu={openDetailBlankContextMenu}>
  {#if hasSelectedDevice}
    <div class="detail-topline">
      <div class="breadcrumb" aria-label="当前详情设备类型">
        <span class="device-type-badge"><ShieldCheck size={16} /></span>
        <span>{selectedItem.deviceType}</span>
      </div>
      <div class="detail-actions">
        <button class="tool-button update-password-action" data-tooltip={selectedAccountTargetCount > 0 ? "更新密码" : "请先新增账号"} disabled={selectedAccountTargetCount === 0} on:click={() => openPasswordDialog()}>
          <KeyRound size={19} />
          <span>{selectedAccountTargetCount > 1 ? `更新 ${selectedAccountTargetCount} 个` : "更新密码"}</span>
        </button>
        <button class="tool-button" data-tooltip={selectedAccountTargetCount > 0 ? "复制账号密码" : "请先新增账号"} disabled={selectedAccountTargetCount === 0} on:click={() => copySelectedAccountInfo()}>
          <Copy size={20} />
          <span>{selectedAccountTargetCount > 1 ? `复制 ${selectedAccountTargetCount} 个` : "复制账号密码"}</span>
        </button>
        <button class="tool-button" data-tooltip={selectedAccountTargetCount > 0 ? "编辑账号" : "请先新增账号"} disabled={selectedAccountTargetCount === 0} on:click={() => openEditAccountDialog()}>
          <Pencil size={20} />
          <span>编辑账号</span>
        </button>
        <button class="icon-button" aria-label="更多操作" data-tooltip="更多操作" on:click={openMorePopover}>
          <MoreVertical size={22} />
        </button>
      </div>
    </div>

    <div class="detail-scroll" role="group" aria-label="当前设备右键菜单区域" on:contextmenu={openSelectedDeviceContextMenu}>
      <div class="identity-row">
        <span class={`detail-icon ${selectedItem.iconClass}`}>
          {selectedItem.iconText}
        </span>
        <div>
          <h1>{selectedItem.deviceName}</h1>
          <p class="identity-subtitle">{selectedItem.deviceType} · {selectedAccounts.length} 个账号</p>
          <div class="identity-meta">
            {#if selectedAccount.id}
              <span>{formatAccountTag(selectedAccount, selectedItem.deviceType, selectedItem.tag)}</span>
            {:else}
              <span>暂无账号</span>
            {/if}
            {#if selectedAccount.id}
              <span>当前账号更新于 {selectedAccount.updatedAt}</span>
            {/if}
          </div>
        </div>
      </div>

      {#if selectedItem.ipAddress || selectedItem.assetCode || selectedItem.location}
        <div class="device-info-card" aria-label="设备信息">
          {#if selectedItem.ipAddress}
            <div class="device-info-item">
              <div>
                <span class="field-label">IP 地址</span>
                <div class="device-info-value" data-value-tooltip={selectedItem.ipAddress}>
                  <p>{selectedItem.ipAddress}</p>
                </div>
              </div>
              <button class="icon-button inline" aria-label="复制 IP 地址" data-tooltip="复制 IP 地址" on:click={() => copyText(selectedItem.ipAddress, "IP 地址")}>
                <Copy size={18} />
              </button>
            </div>
          {/if}

          {#if selectedItem.assetCode}
            <div class="device-info-item">
              <div>
                <span class="field-label">资产编号</span>
                <div class="device-info-value" data-value-tooltip={selectedItem.assetCode}>
                  <p>{selectedItem.assetCode}</p>
                </div>
              </div>
              <button class="icon-button inline" aria-label="复制资产编号" data-tooltip="复制资产编号" on:click={() => copyText(selectedItem.assetCode, "资产编号")}>
                <Copy size={18} />
              </button>
            </div>
          {/if}

          {#if selectedItem.location}
            <div class="device-info-item">
              <div>
                <span class="field-label">设备位置</span>
                <div class="device-info-value" data-value-tooltip={selectedItem.location}>
                  <p>{selectedItem.location}</p>
                </div>
              </div>
              <button class="icon-button inline" aria-label="复制设备位置" data-tooltip="复制设备位置" on:click={() => copyText(selectedItem.location, "设备位置")}>
                <Copy size={18} />
              </button>
            </div>
          {/if}
        </div>
      {/if}

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
            <button class="secondary-button account-heading-action" on:click={() => openAddAccountDialog()}>
              <Plus size={15} />
              <span>新增账号</span>
            </button>
            <button
              class="secondary-button account-heading-action danger-outline"
              disabled={!canDeleteSelectedAccountTargets}
              title={canDeleteSelectedAccountTargets ? "删除选中账号" : "请先选择账号"}
              on:click={() => requestDeleteSelectedAccount()}
            >
              <Trash2 size={15} />
              <span>{selectedAccountTargetCount > 1 ? `删除 ${selectedAccountTargetCount} 个` : "删除账号"}</span>
            </button>
          </div>
        </div>
        <div class="account-list" role="tablist" aria-label="当前设备账号">
          {#if selectedAccounts.length === 0}
            <div class="account-empty-state">
              <strong>暂无账号</strong>
              <span>新增账号后，这里会显示用户名、密码和历史记录。</span>
            </div>
          {:else}
            {#each selectedAccounts as account}
              <div class="account-row" class:selected={account.id === selectedAccount.id}>
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
                  class:batch-selected={selectedAccountIds.includes(account.id)}
                  role="tab"
                  aria-selected={account.id === selectedAccount.id}
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

      {#if selectedAccount.id}
        <div class="field-group">
          <div class="field-row">
            <div>
              <span class="field-label">用户名</span>
              <p>{selectedAccount.username}</p>
            </div>
            <button class="icon-button inline" aria-label="复制用户名" data-tooltip="复制用户名" on:click={() => copyText(selectedAccount.username, "用户名")}>
              <Copy size={18} />
            </button>
          </div>
          <div class="field-row">
            <div>
              <span class="field-label">密码</span>
              <p class="password-value">{passwordVisible ? selectedAccount.password : "••••••••••"}</p>
            </div>
            <div class="field-tools">
              <span class={`strength ${passwordStrength === "较弱" ? "weak" : ""}`}>{passwordStrength}</span>
              <button class="icon-button inline" aria-label={passwordVisible ? "隐藏密码" : "显示密码"} data-tooltip={passwordVisible ? "隐藏密码" : "显示密码"} on:click={() => (passwordVisible = !passwordVisible)}>
                {#if passwordVisible}
                  <EyeOff size={18} />
                {:else}
                  <Eye size={18} />
                {/if}
              </button>
              <button class="icon-button inline" aria-label="复制密码" data-tooltip="复制密码" on:click={() => copyText(selectedAccount.password, "密码")}>
                <Copy size={18} />
              </button>
              <button class="secondary-button inline-update" on:click={() => openPasswordDialog()}>更新</button>
            </div>
          </div>
          {#if selectedAccount.notes}
            <div class="field-row">
              <div>
                <span class="field-label">备注</span>
                <p>{selectedAccount.notes}</p>
              </div>
            </div>
          {/if}
        </div>

        <button class="meta-row" on:click={() => (historyOpen = !historyOpen)}>
          {#if historyOpen}
            <ChevronDown size={19} />
          {:else}
            <ChevronRight size={19} />
          {/if}
          <Clock3 size={18} />
          <span>当前账号最后编辑 {selectedAccount.updatedAt}</span>
        </button>

        {#if historyOpen}
          <section class="history-section">
            <div class="panel-heading">
              <History size={19} />
              <h2>密码历史</h2>
            </div>
            {#if selectedAccount.history.length === 0}
              <p class="quiet-text">暂无旧密码记录</p>
            {:else}
              {#each sortedHistory as history}
                <div class="history-row">
                  <div>
                    <div class="history-password-pair">
                      <span>旧密码</span>
                      <strong class:masked={!visibleHistoryIds.includes(history.id)}>
                        {visibleHistoryIds.includes(history.id) ? history.password : maskPassword(history.password)}
                      </strong>
                      {#if history.newPassword}
                        <span>新密码</span>
                        <strong class:masked={!visibleHistoryIds.includes(history.id)}>
                          {visibleHistoryIds.includes(history.id) ? history.newPassword : maskPassword(history.newPassword)}
                        </strong>
                      {/if}
                    </div>
                    <span>{history.reason}</span>
                  </div>
                  <div class="history-actions">
                    <button class="icon-button inline" aria-label={visibleHistoryIds.includes(history.id) ? "隐藏旧密码" : "显示旧密码"} data-tooltip={visibleHistoryIds.includes(history.id) ? "隐藏旧密码" : "显示旧密码"} on:click={() => toggleHistoryPassword(history.id)}>
                      {#if visibleHistoryIds.includes(history.id)}
                        <EyeOff size={17} />
                      {:else}
                        <Eye size={17} />
                      {/if}
                    </button>
                    <button class="icon-button inline" aria-label="复制旧密码" data-tooltip="复制旧密码" on:click={() => copyText(history.password, "旧密码")}>
                      <Copy size={17} />
                    </button>
                  </div>
                  <time>{history.changedAt}</time>
                </div>
              {/each}
            {/if}
          </section>
        {/if}
      {/if}
    </div>
  {:else}
    <div class="detail-topline">
      <div class="breadcrumb" aria-label="当前详情设备类型">
        <span class="device-type-badge"><ShieldCheck size={16} /></span>
        <span>设备账号</span>
      </div>
    </div>

    <div class="detail-empty-state">
      <span class="empty-state-icon"><Folder size={34} /></span>
      <h1>{hasDevices ? "没有匹配的设备资产" : "资产库还是空的"}</h1>
      <p>{hasDevices ? "当前搜索会匹配设备名和 IP。清空搜索后可以回到全部设备。" : "新增第一台设备资产后，账号、当前密码和旧密码记录会在这里集中管理。"}</p>
      <div class="empty-state-actions">
        {#if searchQuery.trim()}
          <button class="secondary-button" on:click={() => clearSearch()}>清空搜索</button>
        {/if}
        <button class="primary-button" on:click={() => openAddDeviceDialog()}>新增设备</button>
      </div>
    </div>
  {/if}
</section>
