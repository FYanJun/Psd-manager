<script lang="ts">
  import { ChevronDown, Search } from "@lucide/svelte";
  import ClearableInput from "../ClearableInput.svelte";
  import { formatAccountTag } from "../../lib/vault";
  import { sanitizePasswordInput } from "../../lib/input-validation";
  import type {
    BulkPasswordForm,
    BulkUsernameSuggestion,
    TypePickerScope,
  } from "../../lib/types";
  import type { BulkPasswordDialogActions, BulkPasswordDialogView } from "../../lib/view-models";

  export let bulkPasswordForm: BulkPasswordForm;
  export let openTypePicker: TypePickerScope | null = null;
  export let bulkTypeSearch = "";
  export let bulkUsernameSearch = "";
  export let view: BulkPasswordDialogView;
  export let actions: BulkPasswordDialogActions;

  let selectedBulkTypeMeta: BulkPasswordDialogView["selectedBulkTypeMeta"];
  let bulkUsernameSuggestionsOpen: boolean;
  let filteredBulkTypeRows: BulkPasswordDialogView["filteredBulkTypeRows"];
  let revealResetToken: number;
  let bulkUsernameSuggestions: BulkUsernameSuggestion[];
  let bulkPasswordMatches: BulkPasswordMatch[];
  let bulkPasswordSelectedMatches: BulkPasswordMatch[];
  let closeOverlays: BulkPasswordDialogActions["closeOverlays"];
  let openGeneratorPanel: BulkPasswordDialogActions["openGeneratorPanel"];
  let setActiveDialog: BulkPasswordDialogActions["setActiveDialog"];
  let toggleTypePicker: BulkPasswordDialogActions["toggleTypePicker"];
  let setBulkPasswordDeviceType: BulkPasswordDialogActions["setBulkPasswordDeviceType"];
  let updateBulkUsernameSearch: BulkPasswordDialogActions["updateBulkUsernameSearch"];
  let selectBulkUsername: BulkPasswordDialogActions["selectBulkUsername"];
  let selectAllBulkPasswordMatches: BulkPasswordDialogActions["selectAllBulkPasswordMatches"];
  let clearBulkPasswordMatches: BulkPasswordDialogActions["clearBulkPasswordMatches"];
  let isBulkPasswordMatchSelected: BulkPasswordDialogActions["isBulkPasswordMatchSelected"];
  let toggleBulkPasswordMatch: BulkPasswordDialogActions["toggleBulkPasswordMatch"];
  let saveBulkPasswordUpdate: BulkPasswordDialogActions["saveBulkPasswordUpdate"];

  $: ({ selectedBulkTypeMeta, bulkUsernameSuggestionsOpen, filteredBulkTypeRows, revealResetToken,
    bulkUsernameSuggestions, bulkPasswordMatches, bulkPasswordSelectedMatches } = view);
  $: ({ closeOverlays, openGeneratorPanel, setActiveDialog, toggleTypePicker,
    setBulkPasswordDeviceType, updateBulkUsernameSearch, selectBulkUsername,
    selectAllBulkPasswordMatches, clearBulkPasswordMatches, isBulkPasswordMatchSelected,
    toggleBulkPasswordMatch, saveBulkPasswordUpdate } = actions);
</script>

<div class="form-grid">
  <div class="form-control type-combo-field wide-field">
    <span>设备类型</span>
    <div class="type-combo">
      {#if selectedBulkTypeMeta}
        <button type="button" class="type-combo-trigger" aria-expanded={openTypePicker === "bulk"} aria-controls="bulk-type-options" on:click={() => toggleTypePicker("bulk")}>
          <span class={`type-combo-icon type-${selectedBulkTypeMeta.color}`}>{selectedBulkTypeMeta.iconText}</span>
          <span class="type-combo-copy"><strong>{selectedBulkTypeMeta.label}</strong><small>{selectedBulkTypeMeta.count} 个设备</small></span>
          <ChevronDown size={18} />
        </button>
      {/if}
      {#if openTypePicker === "bulk"}
        <div class="type-combo-popover" id="bulk-type-options">
          <div class="type-combo-search">
            <Search size={15} />
            <ClearableInput bind:value={bulkTypeSearch} placeholder="搜索设备类型" ariaLabel="搜索批量改密设备类型" />
          </div>
          <div class="type-combo-list" role="listbox" aria-label="批量改密设备类型">
            {#if filteredBulkTypeRows.length === 0}
              <div class="type-combo-empty">没有匹配的设备类型</div>
            {:else}
              {#each filteredBulkTypeRows as type}
                <button type="button" class:selected={bulkPasswordForm.deviceType === type.label} role="option" aria-selected={bulkPasswordForm.deviceType === type.label} on:click={() => setBulkPasswordDeviceType(type.label)}>
                  <span class={`type-combo-icon type-${type.color}`}>{type.iconText}</span>
                  <span class="type-combo-copy"><strong>{type.label}</strong><small>{type.count} 个设备</small></span>
                </button>
              {/each}
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
  <div class="form-control bulk-username-field">
    <span>匹配用户名</span>
    <ClearableInput value={bulkUsernameSearch} placeholder="输入用户名，先选择完整用户名" onValueChange={updateBulkUsernameSearch} />
    {#if bulkUsernameSuggestionsOpen && bulkUsernameSearch.trim() && !bulkPasswordForm.username.trim() && bulkUsernameSuggestions.length > 0}
      <div class="bulk-username-suggestions" role="listbox" aria-label="完整用户名候选">
        {#each bulkUsernameSuggestions.slice(0, 8) as suggestion}
          <button type="button" role="option" aria-selected={false} on:click={() => selectBulkUsername(suggestion)}><strong>{suggestion.username}</strong></button>
        {/each}
      </div>
    {:else if bulkUsernameSuggestionsOpen && bulkUsernameSearch.trim() && !bulkPasswordForm.username.trim()}
      <p class="quiet-text">没有匹配的完整用户名。</p>
    {/if}
  </div>
  <label>
    <span>新密码</span>
    <ClearableInput bind:value={bulkPasswordForm.password} type="password" transformValue={sanitizePasswordInput} {revealResetToken} />
  </label>
  <label class="wide-field">
    <span>更新原因</span>
    <ClearableInput bind:value={bulkPasswordForm.reason} />
  </label>
  <button class="secondary-button wide-field" on:click={() => { openGeneratorPanel("bulk-password"); setActiveDialog(null); }}>使用随机密码</button>

  <section class="bulk-preview wide-field" aria-label="批量更新命中账号">
    <div class="bulk-preview-head">
      <div>
        <strong>{bulkPasswordForm.username.trim() && bulkPasswordMatches.length > 0 ? `已选择 ${bulkPasswordSelectedMatches.length} / ${bulkPasswordMatches.length} 个账号` : "待选择账号"}</strong>
        <span>{bulkPasswordForm.deviceType === "全部设备" ? "全部设备" : `类型：${bulkPasswordForm.deviceType}`} · {bulkPasswordForm.username.trim() ? `用户名：${bulkPasswordForm.username.trim()}` : "先选择完整用户名"}</span>
      </div>
      {#if bulkPasswordForm.username.trim() && bulkPasswordMatches.length > 0}
        <div class="bulk-selection-actions" aria-label="批量改密账号选择">
          <button type="button" class="compact-button" on:click={() => selectAllBulkPasswordMatches()}>全选</button>
          <button type="button" class="compact-button" on:click={() => clearBulkPasswordMatches()}>清空</button>
        </div>
      {/if}
    </div>
    {#if !bulkPasswordForm.username.trim()}
      <p class="quiet-text">{bulkUsernameSearch.trim() ? "请先从上方选择一个完整用户名。" : "输入用户名后，先选择完整用户名，再选择需要改密的账号。"}</p>
    {:else if bulkPasswordMatches.length === 0}
      <p class="quiet-text">这个用户名没有匹配账号，请重新选择。</p>
    {:else}
      <div class="bulk-match-list">
        {#each bulkPasswordMatches as match}
          <label class="bulk-match-row">
            <input type="checkbox" checked={isBulkPasswordMatchSelected(match)} on:change={() => toggleBulkPasswordMatch(match)} />
            <span class="bulk-match-copy">
              <strong>{match.deviceName}</strong>
              <span>{match.username || "未填写用户名"} · {match.ipAddress || match.deviceType} · {formatAccountTag(match, match.deviceType, match.deviceTag)}</span>
              <time datetime={match.updatedAt}>最近更新：{match.updatedAt || "未记录"}</time>
            </span>
          </label>
        {/each}
      </div>
      {#if bulkPasswordSelectedMatches.length === 0}<p class="quiet-text">请选择至少一个需要改密的账号。</p>{/if}
    {/if}
  </section>
</div>
<footer class="modal-actions">
  <button class="secondary-button" on:click={() => closeOverlays()}>取消</button>
  <button class="primary-button" disabled={!bulkPasswordForm.password.trim() || bulkPasswordSelectedMatches.length === 0} on:click={() => saveBulkPasswordUpdate()}>确认更新</button>
</footer>
