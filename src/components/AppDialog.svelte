<script lang="ts">
  import ModalFrame from "./ModalFrame.svelte";
  import AccountDialog from "./dialogs/AccountDialog.svelte";
  import BulkPasswordDialog from "./dialogs/BulkPasswordDialog.svelte";
  import DeviceDialog from "./dialogs/DeviceDialog.svelte";
  import DeviceTypeDialog from "./dialogs/DeviceTypeDialog.svelte";
  import ExportConfigDialog from "./dialogs/ExportConfigDialog.svelte";
  import PasswordDialog from "./dialogs/PasswordDialog.svelte";
  import SettingsDialog from "./dialogs/SettingsDialog.svelte";
  import VaultPasswordDialog from "./dialogs/VaultPasswordDialog.svelte";
  import type { ActiveDialog, AccountForm, BulkPasswordForm, ConfigFormat, DeviceForm, TypeForm, TypePickerScope, VaultPasswordDialogMode } from "../lib/types";
  import type { AppDialogActions, AppDialogView } from "../lib/view-models";

  export let activeDialog: ActiveDialog = null;
  export let typeForm: TypeForm;
  export let passwordForm: { password: string; reason: string };
  export let bulkPasswordForm: BulkPasswordForm;
  export let accountForm: AccountForm;
  export let deviceForm: DeviceForm;
  export let exportConfigFormat: ConfigFormat = "json";
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
    bulkUsernameSuggestionsOpen: view.bulkUsernameSuggestionsOpen,
    filteredBulkTypeRows: view.filteredBulkTypeRows,
    revealResetToken: view.revealResetToken,
    bulkUsernameSuggestions: view.bulkUsernameSuggestions,
    bulkPasswordMatches: view.bulkPasswordMatches,
    bulkPasswordSelectedMatches: view.bulkPasswordSelectedMatches,
  };
  $: bulkPasswordActions = {
    closeOverlays: actions.closeOverlays,
    openGeneratorPanel: actions.openGeneratorPanel,
    setActiveDialog: actions.setActiveDialog,
    toggleTypePicker: actions.toggleTypePicker,
    setBulkPasswordDeviceType: actions.setBulkPasswordDeviceType,
    updateBulkUsernameSearch: actions.updateBulkUsernameSearch,
    selectBulkUsername: actions.selectBulkUsername,
    selectAllBulkPasswordMatches: actions.selectAllBulkPasswordMatches,
    clearBulkPasswordMatches: actions.clearBulkPasswordMatches,
    isBulkPasswordMatchSelected: actions.isBulkPasswordMatchSelected,
    toggleBulkPasswordMatch: actions.toggleBulkPasswordMatch,
    saveBulkPasswordUpdate: actions.saveBulkPasswordUpdate,
  };
</script>

{#if activeDialog}
  <ModalFrame
    title={dialogTitle}
    titleId="business-dialog-title"
    close={actions.closeOverlays}
  >

      {#if activeDialog === "type"}
        <DeviceTypeDialog bind:typeForm closeOverlays={actions.closeOverlays} saveDeviceType={actions.saveDeviceType} />
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
        <ExportConfigDialog bind:exportConfigFormat closeOverlays={actions.closeOverlays} exportConfig={actions.exportConfig} />
      {:else if activeDialog === "settings"}
        <SettingsDialog view={settingsView} actions={settingsActions} close={actions.closeOverlays} />
      {:else if activeDialog === "security-password"}
        <VaultPasswordDialog
          mode={vaultPasswordDialogMode}
          bind:currentPassword={vaultPasswordForm.currentPassword}
          bind:newPassword={vaultPasswordForm.newPassword}
          bind:confirmPassword={vaultPasswordForm.confirmPassword}
          error={vaultPasswordError}
          busy={vaultPasswordBusy}
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
        <AccountDialog bind:accountForm selectedItem={view.selectedItem} revealResetToken={view.revealResetToken} closeOverlays={actions.closeOverlays} saveAccount={actions.saveAccount} />
      {:else}
        <DeviceDialog
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
{/if}
