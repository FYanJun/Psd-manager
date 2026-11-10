<script lang="ts">
  import type { FormValidationFeedback } from "../lib/form-validation";
  export let validationFeedback: FormValidationFeedback | null = null;
  import ModalFrame from "./ModalFrame.svelte";
  import AccountDialog from "./dialogs/AccountDialog.svelte";
  import BulkPasswordDialog from "./dialogs/BulkPasswordDialog.svelte";
  import DeviceDialog from "./dialogs/DeviceDialog.svelte";
  import DeviceTypeDialog from "./dialogs/DeviceTypeDialog.svelte";
  import ExportConfigDialog from "./dialogs/ExportConfigDialog.svelte";
  import PasswordDialog from "./dialogs/PasswordDialog.svelte";
  import SettingsDialog from "./dialogs/SettingsDialog.svelte";
  import VaultPasswordDialog from "./dialogs/VaultPasswordDialog.svelte";
  import type { ActiveDialog, AccountForm, BulkPasswordForm, ConfigTransferFormat, DeviceForm, TypeForm, TypePickerScope, VaultPasswordDialogMode } from "../lib/types";
  import type { AppDialogActions, AppDialogView } from "../lib/view-models";

  export let activeDialog: ActiveDialog = null;
  export let typeForm: TypeForm;
  export let passwordForm: { password: string; reason: string };
  export let bulkPasswordForm: BulkPasswordForm;
  export let accountForm: AccountForm;
  export let deviceForm: DeviceForm;
  export let exportConfigFormat: ConfigTransferFormat = "json";
  export let exportPasswordConfigured = false;
  export let openTypePicker: TypePickerScope | null = null;
  export let bulkTypeSearch = "";
  export let bulkUsernameSearch = "";
  export let deviceTypeSearch = "";
  export let view: AppDialogView;
  export let actions: AppDialogActions;
  export let settingsView: import("../lib/view-models").SettingsView;
  export let settingsActions: import("../lib/view-models").SettingsActions;
  export let vaultPasswordDialogMode: VaultPasswordDialogMode = "set";
  export let vaultPasswordForm: { currentPassword: string; newPassword: string; confirmPassword: string };
  export let vaultPasswordError = "";
  export let vaultPasswordWarning = "";
  export let vaultPasswordBusy = false;
  export let recoveryKey = "";
  export let recoveryAcknowledged = false;
  export let recoveryFileName = "";
  export let recoveryFileSaved = false;
  export let recoveryFileBusy = false;
  export let recoveryFileError = "";
  export let saveRecoveryFile: () => void;
  export let finishRecoverySetup: () => void;
  export let saveVaultPassword: () => void;

  $: dialogTitle = activeDialog === "type"
    ? (typeForm.originalLabel ? "编辑设备类型" : "新增设备类型")
    : activeDialog === "password"
      ? "修改密码"
      : activeDialog === "bulk-password"
        ? "批量改密"
        : activeDialog === "account"
          ? (accountForm.id ? "编辑账号" : "新增账号")
          : activeDialog === "export-config"
            ? "导出配置"
          : activeDialog === "settings"
              ? "设置"
            : activeDialog === "security-password"
              ? vaultPasswordDialogMode === "set" ? "设置启动密码" : vaultPasswordDialogMode === "change" ? "修改启动密码" : "关闭启动密码"
            : deviceForm.id
              ? "编辑设备信息"
              : "新增设备";

  $: bulkPasswordView = {
    selectedBulkTypeMeta: view.selectedBulkTypeMeta,
    filteredBulkTypeRows: view.filteredBulkTypeRows,
    revealResetToken: view.revealResetToken,
    bulkPasswordAllMatches: view.bulkPasswordAllMatches,
    bulkPasswordSelectedMatches: view.bulkPasswordSelectedMatches,
  };
  $: dialogDescription = activeDialog === "settings" ? "管理界面、数据、安全和应用信息。"
    : activeDialog === "type" ? "设置类型名称、图标和颜色，便于归类查找。"
    : activeDialog === "device" ? "设备属性与账号凭据分别管理。"
    : activeDialog === "account" ? "维护当前设备下的账号、密码和备注。"
    : activeDialog === "password" ? "保存后，原密码会保留在当前账号的历史记录中。"
    : activeDialog === "bulk-password" ? "按账号或设备筛选，勾选目标后统一更新密码。"
    : activeDialog === "export-config" ? "选择配置格式，并将导出文件保存在可信位置。"
    : "管理资产库的本地启动密码与恢复信息。";
  $: canClose = activeDialog !== "security-password" || (
    !vaultPasswordBusy
    && !recoveryFileBusy
    && (!recoveryKey || (recoveryFileSaved && recoveryAcknowledged))
  );
  $: bulkPasswordActions = {
    closeOverlays: actions.closeOverlays,
    openGeneratorPanel: actions.openGeneratorPanel,
    setActiveDialog: actions.setActiveDialog,
    toggleTypePicker: actions.toggleTypePicker,
    setBulkPasswordDeviceType: actions.setBulkPasswordDeviceType,
    clearBulkPasswordFilters: actions.clearBulkPasswordFilters,
    removeBulkPasswordSelection: actions.removeBulkPasswordSelection,
    clearBulkPasswordMatches: actions.clearBulkPasswordMatches,
    isBulkPasswordMatchSelected: actions.isBulkPasswordMatchSelected,
    setBulkPasswordMatchesSelected: actions.setBulkPasswordMatchesSelected,
    saveBulkPasswordUpdate: actions.saveBulkPasswordUpdate,
  };
</script>

{#if activeDialog}
  {#key activeDialog}
  <ModalFrame
    title={dialogTitle}
    description={dialogDescription}
    titleId="business-dialog-title"
    close={actions.closeOverlays}
    {canClose}
  >

      {#if activeDialog === "type"}
        <DeviceTypeDialog {validationFeedback} bind:typeForm closeOverlays={actions.closeOverlays} saveDeviceType={actions.saveDeviceType} />
      {:else if activeDialog === "password"}
        <PasswordDialog
          bind:passwordForm
          selectedItem={view.selectedItem}
          selectedAccount={view.selectedAccount}
          selectedAccountTargets={view.selectedAccountTargets}
          revealResetToken={view.revealResetToken}
          closeOverlays={actions.closeOverlays}
          openGeneratorPanel={actions.openGeneratorPanel}
          setActiveDialog={actions.setActiveDialog}
          savePasswordUpdate={actions.savePasswordUpdate}
        />
      {:else if activeDialog === "bulk-password"}
        <BulkPasswordDialog
          bind:bulkPasswordForm
          bind:openTypePicker
          bind:bulkTypeSearch
          bind:bulkUsernameSearch
          view={bulkPasswordView}
          actions={bulkPasswordActions}
        />
      {:else if activeDialog === "export-config"}
        <ExportConfigDialog bind:exportConfigFormat {exportPasswordConfigured} revealResetToken={view.revealResetToken} closeOverlays={actions.closeOverlays} exportConfig={actions.exportConfig} />
      {:else if activeDialog === "settings"}
        <SettingsDialog view={settingsView} actions={settingsActions} close={actions.closeOverlays} />
      {:else if activeDialog === "security-password"}
        <VaultPasswordDialog
          mode={vaultPasswordDialogMode}
          bind:currentPassword={vaultPasswordForm.currentPassword}
          bind:newPassword={vaultPasswordForm.newPassword}
          bind:confirmPassword={vaultPasswordForm.confirmPassword}
          error={vaultPasswordError}
          warning={vaultPasswordWarning}
          busy={vaultPasswordBusy}
          revealResetToken={view.revealResetToken}
          {recoveryKey}
          bind:recoveryAcknowledged
          {recoveryFileName}
          {recoveryFileSaved}
          {recoveryFileBusy}
          {recoveryFileError}
          {saveRecoveryFile}
          {finishRecoverySetup}
          close={actions.closeOverlays}
          save={saveVaultPassword}
        />
      {:else if activeDialog === "account"}
        <AccountDialog {validationFeedback} bind:accountForm selectedItem={view.selectedItem} revealResetToken={view.revealResetToken} closeOverlays={actions.closeOverlays} saveAccount={actions.saveAccount} />
      {:else}
        <DeviceDialog {validationFeedback}
          bind:deviceForm
          bind:openTypePicker
          bind:deviceTypeSearch
          selectedDeviceFormTypeMeta={view.selectedDeviceFormTypeMeta}
          filteredDeviceTypeOptions={view.filteredDeviceTypeOptions}
          deviceTypeOptionsLength={view.deviceTypeOptionsLength}
          closeOverlays={actions.closeOverlays}
          toggleTypePicker={actions.toggleTypePicker}
          setDeviceFormType={actions.setDeviceFormType}
          saveDevice={actions.saveDevice}
        />
      {/if}
  </ModalFrame>
  {/key}
{/if}
