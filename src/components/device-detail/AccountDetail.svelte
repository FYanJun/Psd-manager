<script lang="ts">
  import { ArrowDownUp, ChevronDown, ChevronRight, Clock3, Copy, Eye, EyeOff, History, RotateCcwKey } from "@lucide/svelte";
  import type { DeviceAccount, PasswordHistory } from "../../lib/types";
  import type { DeviceDetailActions } from "../../lib/view-models";

  export let passwordVisible = false;
  export let historyOpen = false;
  export let selectedAccount: DeviceAccount;
  export let sortedHistory: PasswordHistory[];
  export let historySortDesc: boolean;
  export let visibleHistoryIds: number[];
  export let passwordStrength: string;
  export let copyText: DeviceDetailActions["copyText"];
  export let maskPassword: DeviceDetailActions["maskPassword"];
  export let toggleHistoryPassword: DeviceDetailActions["toggleHistoryPassword"];
  export let requestRestoreHistoryPassword: DeviceDetailActions["requestRestoreHistoryPassword"];
  export let toggleHistorySort: DeviceDetailActions["toggleHistorySort"];
</script>

{#if selectedAccount.id}
  <div class="field-group" id="selected-account-detail" role="tabpanel" aria-label="当前账号详情">
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
        <p class="password-value" class:empty={!selectedAccount.password}>{selectedAccount.password ? (passwordVisible ? selectedAccount.password : "••••••••••") : "未设置密码"}</p>
      </div>
      {#if selectedAccount.password}
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
        </div>
      {/if}
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
      <div class="panel-heading history-heading">
        <History size={19} />
        <h2>密码历史</h2>
        {#if selectedAccount.history.length > 1}
          <button
            class="icon-button inline history-sort-action"
            aria-label={historySortDesc ? "按最早记录排序" : "按最新记录排序"}
            data-tooltip={historySortDesc ? "按最早记录排序" : "按最新记录排序"}
            on:click={() => toggleHistorySort()}
          >
            <ArrowDownUp size={17} />
          </button>
        {/if}
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
              <button
                class="icon-button inline"
                aria-label={history.password ? "复制旧密码" : "该历史没有密码"}
                data-tooltip={history.password ? "复制旧密码" : "该历史没有密码"}
                disabled={!history.password}
                on:click={() => copyText(history.password, "旧密码")}
              >
                <Copy size={17} />
              </button>
              <button class="icon-button inline" aria-label="恢复为此密码" data-tooltip="恢复为此密码" on:click={() => requestRestoreHistoryPassword(history)}>
                <RotateCcwKey size={17} />
              </button>
            </div>
            <time>{history.changedAt}</time>
          </div>
        {/each}
      {/if}
    </section>
  {/if}
{/if}
