<script lang="ts">
  import { ChevronDown, Search, X } from "@lucide/svelte";
  import ClearableInput from "./ClearableInput.svelte";
  import ClearableTextarea from "./ClearableTextarea.svelte";
  import { typeColorOptions } from "../lib/constants";
  import { formatAccountTag } from "../lib/vault";
  import type {
    AccountForm,
    ActiveDialog,
    BulkPasswordForm,
    BulkPasswordMatch,
    BulkUsernameSuggestion,
    ConfigFormat,
    DeviceAccount,
    DeviceForm,
    DeviceType,
    DeviceTypeMeta,
    TypeForm,
    TypePickerScope,
    VaultItem,
  } from "../lib/types";

  export let activeDialog: ActiveDialog = null;
  export let typeForm: TypeForm;
  export let passwordForm: { password: string; reason: string };
  export let bulkPasswordForm: BulkPasswordForm;
  export let accountForm: AccountForm;
  export let deviceForm: DeviceForm;
  export let exportConfigFormat: ConfigFormat = "json";
  export let selectedItem: VaultItem;
  export let selectedAccount: DeviceAccount;
  export let selectedAccountTargets: DeviceAccount[] = [];
  export let selectedBulkTypeMeta: (DeviceTypeMeta & { count: number }) | undefined;
  export let selectedDeviceFormTypeMeta: DeviceTypeMeta;
  export let openTypePicker: TypePickerScope | null = null;
  export let bulkTypeSearch = "";
  export let bulkUsernameSearch = "";
  export let deviceTypeSearch = "";
  export let filteredBulkTypeRows: Array<DeviceTypeMeta & { count: number }>;
  export let filteredDeviceTypeOptions: DeviceTypeMeta[];
  export let deviceTypeOptionsLength = 0;
  export let bulkUsernameSuggestions: BulkUsernameSuggestion[];
  export let bulkPasswordMatches: BulkPasswordMatch[];
  export let bulkPasswordSelectedMatches: BulkPasswordMatch[];

  export let closeOverlays: () => void;
  export let saveDeviceType: () => void;
  export let openGeneratorPanel: (target?: "current-account" | "bulk-password" | null) => void;
  export let setActiveDialog: (dialog: ActiveDialog) => void;
  export let toggleTypePicker: (scope: TypePickerScope) => void;
  export let setBulkPasswordDeviceType: (deviceType: "全部设备" | DeviceType) => void;
  export let updateBulkUsernameSearch: (username: string) => void;
  export let selectBulkUsername: (suggestion: BulkUsernameSuggestion) => void;
  export let selectAllBulkPasswordMatches: () => void;
  export let clearBulkPasswordMatches: () => void;
  export let isBulkPasswordMatchSelected: (match: BulkPasswordMatch) => boolean;
  export let toggleBulkPasswordMatch: (match: BulkPasswordMatch) => void;
  export let saveBulkPasswordUpdate: () => void;
  export let savePasswordUpdate: () => void;
  export let saveAccount: () => void;
  export let setDeviceFormType: (deviceType: DeviceType) => void;
  export let saveDevice: () => void;
  export let exportConfig: (format?: ConfigFormat) => void;
</script>

{#if activeDialog}
  <div class="modal-backdrop">
    <div class="modal" class:type-modal={activeDialog === "type"} class:bulk-modal={activeDialog === "bulk-password"} class:type-picker-open={Boolean(openTypePicker)} role="dialog" aria-modal="true">
      <header class="modal-header">
        <h2>
          {#if activeDialog === "type"}
            {typeForm.originalLabel ? "编辑设备类型" : "新增设备类型"}
          {:else if activeDialog === "password"}
            修改密码
          {:else if activeDialog === "bulk-password"}
            批量改密
          {:else if activeDialog === "account"}
            {accountForm.id ? "编辑账号" : "新增账号"}
          {:else if activeDialog === "export-config"}
            导出配置
          {:else if deviceForm.id}
            编辑设备信息
          {:else}
            新增设备
          {/if}
        </h2>
        <button class="icon-button" aria-label="关闭弹窗" data-tooltip="关闭弹窗" on:click={() => closeOverlays()}><X size={20} /></button>
      </header>

      {#if activeDialog === "type"}
        <div class="type-editor-layout">
          <div class="type-preview-card">
            <span class={`type-icon type-${typeForm.color} type-preview-icon`}>{typeForm.iconText.trim() || typeForm.label.trim().slice(0, 1) || "类"}</span>
            <div>
              <strong>{typeForm.label.trim() || "设备类型"}</strong>
              <small>预览</small>
            </div>
          </div>
          <div class="type-editor-fields">
            <label>
              <span>类型名称</span>
              <ClearableInput bind:value={typeForm.label} placeholder="例如：交换机" />
            </label>
            <label>
              <span>图标文字</span>
              <ClearableInput bind:value={typeForm.iconText} placeholder="例如：交" maxlength={2} />
            </label>
          </div>
          <div class="form-control type-color-control">
            <span>颜色</span>
            <div class="color-swatch-grid" role="group" aria-label="设备类型颜色">
              {#each typeColorOptions as option}
                <button
                  type="button"
                  class:selected={typeForm.color === option.value}
                  class="color-swatch-button"
                  aria-label={option.label}
                  on:click={() => (typeForm.color = option.value)}
                >
                  <span class={`swatch-dot type-${option.value}`}></span>
                </button>
              {/each}
            </div>
          </div>
        </div>
        <footer class="modal-actions">
          <button class="secondary-button" on:click={() => closeOverlays()}>取消</button>
          <button class="primary-button" on:click={() => saveDeviceType()}>{typeForm.originalLabel ? "保存修改" : "保存类型"}</button>
        </footer>
      {:else if activeDialog === "password"}
        <div class="form-grid">
          <section class="password-target-card wide-field" aria-label="当前更新账号">
            <span class={`type-icon ${selectedItem.iconClass}`}>{selectedItem.iconText}</span>
            <div>
              <strong>{selectedAccountTargets.length > 1 ? `已选择 ${selectedAccountTargets.length} 个账号` : selectedAccount.username || selectedAccount.title || "未填写用户名"}</strong>
              <span>{selectedItem.deviceName} · {selectedAccountTargets.length > 1 ? "批量更新密码" : formatAccountTag(selectedAccount, selectedItem.deviceType, selectedItem.tag)}</span>
            </div>
          </section>
          <section class="password-change-card wide-field" aria-label="密码变更预览">
            <div>
              <span>旧密码</span>
              <strong>{selectedAccountTargets.length > 1 ? `将同时更新 ${selectedAccountTargets.length} 个账号` : selectedAccount.password || "未填写密码"}</strong>
            </div>
            <div>
              <span>新密码</span>
              <strong>{passwordForm.password || "待输入"}</strong>
            </div>
          </section>
          <label class="wide-field">
            <span>新密码</span>
            <ClearableInput bind:value={passwordForm.password} type="password" />
          </label>
          <label class="wide-field">
            <span>更新原因</span>
            <ClearableInput bind:value={passwordForm.reason} />
          </label>
          <button class="secondary-button wide-field" on:click={() => { openGeneratorPanel("current-account"); setActiveDialog(null); }}>使用随机密码</button>
        </div>
        <footer class="modal-actions">
          <button class="secondary-button" on:click={() => closeOverlays()}>取消</button>
          <button class="primary-button" disabled={!passwordForm.password.trim()} on:click={() => savePasswordUpdate()}>保存修改</button>
        </footer>
      {:else if activeDialog === "bulk-password"}
        <div class="form-grid bulk-password-grid" class:type-picker-open={openTypePicker === "bulk"}>
          <div class="form-control type-combo-field wide-field">
            <span>设备类型</span>
            <div class="type-combo">
              {#if selectedBulkTypeMeta}
                <button
                  type="button"
                  class="type-combo-trigger"
                  aria-expanded={openTypePicker === "bulk"}
                  aria-controls="bulk-type-options"
                  on:click={() => toggleTypePicker("bulk")}
                >
                  <span class={`type-combo-icon type-${selectedBulkTypeMeta.color}`}>{selectedBulkTypeMeta.iconText}</span>
                  <span class="type-combo-copy">
                    <strong>{selectedBulkTypeMeta.label}</strong>
                    <small>{selectedBulkTypeMeta.count} 个设备</small>
                  </span>
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
                        <button
                          type="button"
                          class:selected={bulkPasswordForm.deviceType === type.label}
                          role="option"
                          aria-selected={bulkPasswordForm.deviceType === type.label}
                          on:click={() => setBulkPasswordDeviceType(type.label)}
                        >
                          <span class={`type-combo-icon type-${type.color}`}>{type.iconText}</span>
                          <span class="type-combo-copy">
                            <strong>{type.label}</strong>
                            <small>{type.count} 个设备</small>
                          </span>
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
            <ClearableInput
              value={bulkUsernameSearch}
              placeholder="输入用户名，先选择完整用户名"
              onValueChange={updateBulkUsernameSearch}
            />
            {#if bulkUsernameSearch.trim() && !bulkPasswordForm.username.trim() && bulkUsernameSuggestions.length > 0}
              <div class="bulk-username-suggestions" role="listbox" aria-label="完整用户名候选">
                {#each bulkUsernameSuggestions.slice(0, 8) as suggestion}
                  <button type="button" role="option" aria-selected={false} on:click={() => selectBulkUsername(suggestion)}>
                    <strong>{suggestion.username}</strong>
                  </button>
                {/each}
              </div>
            {:else if bulkUsernameSearch.trim() && !bulkPasswordForm.username.trim()}
              <p class="quiet-text username-search-empty">没有匹配的完整用户名。</p>
            {/if}
          </div>
          <label>
            <span>新密码</span>
            <ClearableInput bind:value={bulkPasswordForm.password} type="password" />
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
                    <input
                      type="checkbox"
                      checked={isBulkPasswordMatchSelected(match)}
                      on:change={() => toggleBulkPasswordMatch(match)}
                    />
                    <span class="bulk-match-copy">
                      <strong>{match.deviceName}</strong>
                      <span>{match.username || "未填写用户名"} · {match.ipAddress || match.deviceType} · {formatAccountTag(match, match.deviceType, match.deviceTag)}</span>
                      <time datetime={match.updatedAt}>最近更新：{match.updatedAt || "未记录"}</time>
                    </span>
                  </label>
                {/each}
              </div>
              {#if bulkPasswordSelectedMatches.length === 0}
                <p class="quiet-text">请选择至少一个需要改密的账号。</p>
              {/if}
            {/if}
          </section>
        </div>
        <footer class="modal-actions">
          <button class="secondary-button" on:click={() => closeOverlays()}>取消</button>
          <button class="primary-button" disabled={!bulkPasswordForm.password.trim() || bulkPasswordSelectedMatches.length === 0} on:click={() => saveBulkPasswordUpdate()}>确认更新</button>
        </footer>
      {:else if activeDialog === "export-config"}
        <div class="form-grid export-config-grid">
          <div class="format-choice-list wide-field" role="radiogroup" aria-label="选择导出配置格式">
            <button
              type="button"
              class:selected={exportConfigFormat === "json"}
              role="radio"
              aria-checked={exportConfigFormat === "json"}
              on:click={() => (exportConfigFormat = "json")}
            >
              <strong>JSON</strong>
              <span>完整保留应用结构，适合日常迁移和交接。</span>
            </button>
            <button
              type="button"
              class:selected={exportConfigFormat === "csv"}
              role="radio"
              aria-checked={exportConfigFormat === "csv"}
              on:click={() => (exportConfigFormat = "csv")}
            >
              <strong>CSV</strong>
              <span>按账号展开，适合表格查看和批量整理。</span>
            </button>
            <button
              type="button"
              class:selected={exportConfigFormat === "ini"}
              role="radio"
              aria-checked={exportConfigFormat === "ini"}
              on:click={() => (exportConfigFormat = "ini")}
            >
              <strong>INI</strong>
              <span>分段配置文本，适合简单脚本或手动编辑。</span>
            </button>
          </div>
          <p class="export-config-note wide-field">导出的配置会包含明文用户名、密码和密码历史，请只保存到可信位置。</p>
        </div>
        <footer class="modal-actions">
          <button class="secondary-button" on:click={() => closeOverlays()}>取消</button>
          <button class="primary-button" on:click={() => exportConfig(exportConfigFormat)}>导出配置</button>
        </footer>
      {:else if activeDialog === "account"}
        <div class="form-grid">
          <label>
            <span>用户名</span>
            <ClearableInput bind:value={accountForm.username} />
          </label>
          <label>
            <span>密码</span>
            <ClearableInput bind:value={accountForm.password} type="password" />
          </label>
          <label>
            <span>账号标签</span>
            <ClearableInput bind:value={accountForm.tag} placeholder="例如：普通账号、管理账号" />
          </label>
          <div class="readonly-field" aria-label="所属设备">
            <span>所属设备</span>
            <strong>{selectedItem.deviceName || "未选择设备"}</strong>
          </div>
          <label class="wide-field">
            <span>备注</span>
            <ClearableTextarea bind:value={accountForm.notes} />
          </label>
        </div>
        <footer class="modal-actions">
          <button class="secondary-button" on:click={() => closeOverlays()}>取消</button>
          <button class="primary-button" on:click={() => saveAccount()}>{accountForm.id ? "保存账号" : "新增账号"}</button>
        </footer>
      {:else}
        <div class="form-grid" class:type-picker-open={openTypePicker === "device"}>
          <label>
            <span>设备名称</span>
            <ClearableInput bind:value={deviceForm.deviceName} />
          </label>
          <div class="form-control type-combo-field">
            <span>设备类型</span>
            {#if deviceTypeOptionsLength === 0}
              <div class="type-combo-empty-state">请先新增设备类型</div>
            {:else}
              <div class="type-combo">
                {#if selectedDeviceFormTypeMeta}
                  <button
                    type="button"
                    class="type-combo-trigger"
                    aria-expanded={openTypePicker === "device"}
                    aria-controls="device-type-options"
                    on:click={() => toggleTypePicker("device")}
                  >
                    <span class={`type-combo-icon type-${selectedDeviceFormTypeMeta.color}`}>{selectedDeviceFormTypeMeta.iconText}</span>
                    <span class="type-combo-copy">
                      <strong>{selectedDeviceFormTypeMeta.label || "选择设备类型"}</strong>
                    </span>
                    <ChevronDown size={18} />
                  </button>
                {/if}
                {#if openTypePicker === "device"}
                  <div class="type-combo-popover" id="device-type-options">
                      <div class="type-combo-search">
                        <Search size={15} />
                        <ClearableInput bind:value={deviceTypeSearch} placeholder="搜索设备类型" ariaLabel="搜索设备类型" />
                      </div>
                    <div class="type-combo-list" role="listbox" aria-label="设备类型">
                      {#if filteredDeviceTypeOptions.length === 0}
                        <div class="type-combo-empty">没有匹配的设备类型</div>
                      {:else}
                        {#each filteredDeviceTypeOptions as type}
                          <button
                            type="button"
                            class:selected={deviceForm.deviceType === type.label}
                            role="option"
                            aria-selected={deviceForm.deviceType === type.label}
                            on:click={() => setDeviceFormType(type.label)}
                          >
                            <span class={`type-combo-icon type-${type.color}`}>{type.iconText}</span>
                            <span class="type-combo-copy">
                              <strong>{type.label}</strong>
                            </span>
                          </button>
                        {/each}
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
          <label>
            <span>IP 地址</span>
            <ClearableInput bind:value={deviceForm.ipAddress} placeholder="例如：192.168.1.1" />
          </label>
          {#if !deviceForm.id}
              <label>
                <span>用户名</span>
                <ClearableInput bind:value={deviceForm.username} />
              </label>
              <label>
                <span>密码</span>
                <ClearableInput bind:value={deviceForm.password} type="password" />
              </label>
              <label class="wide-field">
                <span>备注</span>
                <ClearableTextarea bind:value={deviceForm.notes} />
              </label>
          {/if}
        </div>
        <footer class="modal-actions">
          <button class="secondary-button" on:click={() => closeOverlays()}>取消</button>
          <button class="primary-button" disabled={!deviceForm.deviceName.trim() || !deviceForm.deviceType.trim()} on:click={() => saveDevice()}>{deviceForm.id ? "保存设备" : "新增设备"}</button>
        </footer>
      {/if}
    </div>
  </div>
{/if}
