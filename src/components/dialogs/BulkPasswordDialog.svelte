<script lang="ts">
  import ClearableInput from "../ClearableInput.svelte";
  import TypePicker from "../TypePicker.svelte";
  import UsernameCombobox from "../UsernameCombobox.svelte";
  import { formatAccountTag } from "../../lib/vault";
  import {
    INPUT_LIMITS,
    sanitizeSingleLineTextInput,
  } from "../../lib/input-validation";
  import type {
    BulkPasswordForm,
    BulkPasswordMatch,
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

<div class="form-grid bulk-password-form">
  <div class="bulk-password-controls wide-field">
    <div class="form-control type-combo-field">
      <span>设备类型</span>
      <TypePicker
        selectedMeta={selectedBulkTypeMeta}
        selectedValue={bulkPasswordForm.deviceType}
        options={filteredBulkTypeRows}
        bind:search={bulkTypeSearch}
        open={openTypePicker === "bulk"}
        scope="bulk"
        optionsId="bulk-type-options"
        ariaLabel="批量改密设备类型"
        searchAriaLabel="搜索批量改密设备类型"
        showCount={true}
        toggle={toggleTypePicker}
        select={setBulkPasswordDeviceType}
      />
    </div>
    <div class="form-control bulk-username-field">
      <span>匹配用户名（区分大小写）</span>
      <UsernameCombobox value={bulkUsernameSearch} suggestions={bulkUsernameSuggestions} open={bulkUsernameSuggestionsOpen} onValueChange={updateBulkUsernameSearch} onSelect={selectBulkUsername} />
    </div>
    <label>
      <span>新密码</span>
      <ClearableInput bind:value={bulkPasswordForm.password} type="password" maxlength={INPUT_LIMITS.password} validateAccountPassword={true} {revealResetToken} />
    </label>
    <label>
      <span>更新原因</span>
      <ClearableInput bind:value={bulkPasswordForm.reason} maxlength={INPUT_LIMITS.passwordReason} transformValue={sanitizeSingleLineTextInput} />
    </label>
    <button class="secondary-button bulk-random-password" on:click={() => { openGeneratorPanel("bulk-password"); setActiveDialog(null); }}>使用随机密码</button>
  </div>

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
      <p class="quiet-text">输入完整用户名后按大小写精确匹配；候选搜索忽略大小写，可用于选择完整用户名。</p>
    {:else if bulkPasswordMatches.length === 0}
      <p class="quiet-text">没有精确匹配的账号，请检查用户名大小写或从候选框中选择。</p>
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
  <button class="primary-button" disabled={!bulkPasswordForm.password || bulkPasswordSelectedMatches.length === 0} on:click={() => saveBulkPasswordUpdate()}>确认更新</button>
</footer>
