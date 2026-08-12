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
    ConfigFormat,
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

  export let actionPopoverModel: ActionPopoverModel;
  export let actionPopoverActions: ActionPopoverActions;
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
  export let appDialogView: AppDialogView;
  export let appDialogActions: AppDialogActions;
  export let vaultSnapshots: VaultSnapshot[] = [];
  export let closeOverlays: () => void;
  export let cancelPendingConfirmation: () => void;
  export let requestRestoreSnapshot: (snapshot: VaultSnapshot) => void;
  export let pendingConfirmation: PendingConfirmation | null = null;
  export let importConfigMode: ConfigImportMode = "add-missing";
  export let confirmPendingAction: () => void;
  export let setImportConfigMode: (mode: ConfigImportMode) => void;
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
  export let copyStatus = "";
  export let pauseStatusDismiss: () => void;
  export let resumeStatusDismiss: () => void;
  export let dismissStatus: () => void;
  export let statusActionLabel = "";
  export let runStatusAction: () => void;
  export let tooltipEnabled = true;
</script>

<ActionPopover model={actionPopoverModel} actions={actionPopoverActions} />

<AppDialog
  bind:typeForm
  bind:passwordForm
  bind:bulkPasswordForm
  bind:accountForm
  bind:deviceForm
  bind:exportConfigFormat
  bind:openTypePicker
  bind:bulkTypeSearch
  bind:bulkUsernameSearch
  bind:deviceTypeSearch
  activeDialog={activeDialog === "snapshots" ? null : activeDialog}
  view={appDialogView}
  actions={appDialogActions}
/>

<VaultSnapshotsDialog
  open={activeDialog === "snapshots"}
  snapshots={vaultSnapshots}
  close={closeOverlays}
  requestRestore={requestRestoreSnapshot}
/>

<ConfirmationDialog
  {pendingConfirmation}
  {importConfigMode}
  {cancelPendingConfirmation}
  {confirmPendingAction}
  {setImportConfigMode}
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
  {copyStatus}
  {pauseStatusDismiss}
  {resumeStatusDismiss}
  {dismissStatus}
  actionLabel={statusActionLabel}
  runAction={runStatusAction}
/>
<GlobalTooltip enabled={tooltipEnabled} />
