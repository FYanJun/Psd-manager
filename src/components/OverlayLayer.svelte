<script lang="ts">
  import ActionPopover from "./ActionPopover.svelte";
  import AppDialog from "./AppDialog.svelte";
  import ConfirmationDialog from "./ConfirmationDialog.svelte";
  import GlobalTooltip from "./GlobalTooltip.svelte";
  import PasswordGeneratorDrawer from "./PasswordGeneratorDrawer.svelte";
  import StatusToast from "./StatusToast.svelte";
  import VaultSnapshotsDialog from "./VaultSnapshotsDialog.svelte";
  import type {
    AccountForm,
    ActiveDialog,
    BulkPasswordForm,
    ConfigTransferFormat,
    ConfigImportMode,
    DeviceForm,
    PendingConfirmation,
    TypeForm,
    TypePickerScope,
    VaultSnapshot,
  } from "../lib/types";
  import type {
    ActionPopoverActions,
    ActionPopoverModel,
    AppDialogActions,
    AppDialogView,
    PasswordGeneratorActions,
    PasswordGeneratorView,
  } from "../lib/view-models";

  import type { FormValidationFeedback } from "../lib/form-validation";

  export let validationFeedback: FormValidationFeedback | null = null;
  export let popover: { model: ActionPopoverModel; actions: ActionPopoverActions };
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
  export let appDialogView: AppDialogView;
  export let appDialogActions: AppDialogActions;
  export let snapshots: { items: VaultSnapshot[]; close: () => void; restore: (snapshot: VaultSnapshot) => void };
  export let confirmation: {
    pending: PendingConfirmation | null;
    busy?: boolean;
    error?: string;
    progressLabel?: string;
    importMode: ConfigImportMode;
    cancel: () => void;
    confirm: () => void;
    setImportMode: (mode: ConfigImportMode) => void;
    setXlsxOverwriteDeviceKeys: (keys: string[]) => void;
  };
  export let generatorPanelOpen = false;
  export let generatedPassword = "";
  export let generatorLength = 8;
  export let generatorLengthInput = "8";
  export let useUpper = true;
  export let useLower = true;
  export let useNumbers = true;
  export let useSymbols = true;
  export let excludeSimilar = true;
  export let preventRepeats = false;
  export let minimumNumbers = 2;
  export let minimumSymbols = 2;
  export let allowedSymbols = "";
  export let excludedCharacters = "";
  export let passwordGeneratorView: PasswordGeneratorView;
  export let passwordGeneratorActions: PasswordGeneratorActions;
  export let status: {
    message: string;
    pause: () => void;
    resume: () => void;
    dismiss: () => void;
    actionLabel: string;
    runAction: () => void;
  };
  export let tooltipEnabled = true;
  export let settingsView: import("../lib/view-models").SettingsView;
  export let settingsActions: import("../lib/view-models").SettingsActions;
  export let vaultPasswordDialogMode: import("../lib/types").VaultPasswordDialogMode = "set";
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
</script>

<ActionPopover model={popover.model} actions={popover.actions} />

<AppDialog
  bind:typeForm
  bind:passwordForm
  bind:bulkPasswordForm
  bind:accountForm
  bind:deviceForm
  bind:exportConfigFormat
  {exportPasswordConfigured}
  bind:openTypePicker
  bind:bulkTypeSearch
  bind:bulkUsernameSearch
  bind:deviceTypeSearch
  activeDialog={activeDialog === "snapshots" ? null : activeDialog}
  {validationFeedback}
  view={appDialogView}
  actions={appDialogActions}
  {settingsView}
  {settingsActions}
  {vaultPasswordDialogMode}
  {vaultPasswordForm}
  {vaultPasswordError}
  {vaultPasswordBusy}
  {recoveryKey}
  bind:recoveryAcknowledged
  {recoveryFileName}
  {recoveryFileSaved}
  {recoveryFileBusy}
  {recoveryFileError}
  {saveRecoveryFile}
  {finishRecoverySetup}
  {saveVaultPassword}
/>

<VaultSnapshotsDialog
  open={activeDialog === "snapshots"}
  snapshots={snapshots.items}
  close={snapshots.close}
  requestRestore={snapshots.restore}
/>

<ConfirmationDialog
  pendingConfirmation={confirmation.pending}
  busy={confirmation.busy}
  error={confirmation.error}
  progressLabel={confirmation.progressLabel}
  importConfigMode={confirmation.importMode}
  cancelPendingConfirmation={confirmation.cancel}
  confirmPendingAction={confirmation.confirm}
  setImportConfigMode={confirmation.setImportMode}
  setXlsxOverwriteDeviceKeys={confirmation.setXlsxOverwriteDeviceKeys}
/>

{#if generatorPanelOpen}
  <PasswordGeneratorDrawer
    bind:generatedPassword
    bind:generatorLength
    bind:generatorLengthInput
    bind:useUpper
    bind:useLower
    bind:useNumbers
    bind:useSymbols
    bind:excludeSimilar
    bind:preventRepeats
    bind:minimumNumbers
    bind:minimumSymbols
    bind:allowedSymbols
    bind:excludedCharacters
    view={passwordGeneratorView}
    actions={passwordGeneratorActions}
  />
{/if}

<StatusToast
  copyStatus={status.message}
  pauseStatusDismiss={status.pause}
  resumeStatusDismiss={status.resume}
  dismissStatus={status.dismiss}
  actionLabel={status.actionLabel}
  runAction={status.runAction}
/>
<GlobalTooltip enabled={tooltipEnabled} />
