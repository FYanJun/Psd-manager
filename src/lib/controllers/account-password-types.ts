import { getSelectedAccountTargets, resolveSelectedAccount } from "../selectors/account-selectors";
import type {
  AccountForm,
  ActiveDialog,
  ActivePopover,
  BulkPasswordForm,
  BulkPasswordMatch,
  BulkUsernameSuggestion,
  DeviceAccount,
  DeviceType,
  GeneratorTarget,
  PendingConfirmation,
  TypePickerScope,
  VaultItem,
  VaultSnapshot,
} from "../types";

export type PasswordUpdateForm = {
  password: string;
  reason: string;
};

export type AccountPasswordState = {
  items: VaultItem[];
  selectedItem: VaultItem;
  hasSelectedDevice: boolean;
  selectedDeviceType: "全部设备" | DeviceType;
  selectedId: number;
  selectedAccountId: number;
  selectedAccountIds: number[];
  accountForm: AccountForm;
  passwordForm: PasswordUpdateForm;
  bulkPasswordForm: BulkPasswordForm;
  bulkUsernameSearch: string;
  bulkUsernameSuggestionsOpen: boolean;
  bulkPasswordDeselectedKeys: string[];
  bulkTypeSearch: string;
  passwordVisible: boolean;
  visibleHistoryIds: number[];
};

export type AccountPasswordPatch = Partial<Pick<
  AccountPasswordState,
  | "items"
  | "selectedId"
  | "selectedAccountId"
  | "selectedAccountIds"
  | "accountForm"
  | "passwordForm"
  | "bulkPasswordForm"
  | "bulkUsernameSearch"
  | "bulkUsernameSuggestionsOpen"
  | "bulkPasswordDeselectedKeys"
  | "bulkTypeSearch"
  | "passwordVisible"
  | "visibleHistoryIds"
>>;

export type AccountSelectionState = {
  selectedAccounts: DeviceAccount[];
  selectedAccount: DeviceAccount;
  selectedAccountTargets: DeviceAccount[];
};

export type AccountPasswordDerivedState = AccountSelectionState & {
  bulkUsernameSuggestions: BulkUsernameSuggestion[];
  bulkPasswordMatches: BulkPasswordMatch[];
  bulkPasswordSelectedMatches: BulkPasswordMatch[];
};

export type AccountPasswordControllerPort = {
  read(): AccountPasswordState;
  write(patch: AccountPasswordPatch): void;
  showStatus(message: string, duration?: number): void;
  copyText(text: string, label: string): void | Promise<void>;
  createSafetySnapshot(reason: string): Promise<VaultSnapshot | null>;
  offerSnapshotUndo(snapshotId: string, message: string): void;
  setActiveDialog(dialog: ActiveDialog): void;
  getActiveDialog(): ActiveDialog;
  setActivePopover(popover: ActivePopover): void;
  setPendingConfirmation(confirmation: PendingConfirmation | null): void;
  setOpenTypePicker(scope: TypePickerScope | null): void;
  getGeneratorState(): {
    target: GeneratorTarget;
    generatedPassword: string;
  };
  generatePassword(): void;
  closeGeneratorPanel(restoreDialog?: boolean): void;
};

export function getAccountSelectionState(state: AccountPasswordState): AccountSelectionState {
  const { accounts, selectedAccount } = resolveSelectedAccount(state.selectedItem, state.selectedAccountId);
  return {
    selectedAccounts: accounts,
    selectedAccount,
    selectedAccountTargets: getSelectedAccountTargets(accounts, selectedAccount, state.selectedAccountIds),
  };
}
