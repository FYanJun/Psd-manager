import { createAccountFromForm, formatDeviceAccountInfo, updateAccountPassword } from "../device-commands";
import {
  getTextInputValidationError,
  hasValidPasswordCharacters,
  INPUT_LIMITS,
  PASSWORD_CHARACTER_ERROR,
} from "../input-validation";
import type { AccountForm, DeviceAccount, PendingConfirmation, VaultItem } from "../types";
import { formatDateTime } from "../utils";
import { createEmptyAccountForm, getAccounts, isBlankPlaceholderAccount, syncItemWithAccounts } from "../vault";
import {
  getAccountSelectionState,
  type AccountPasswordControllerPort,
  type AccountPasswordPatch,
} from "./account-password-types";

export function createAccountController(port: AccountPasswordControllerPort) {
  function deriveAccountState(state = port.read()) {
    return getAccountSelectionState(state);
  }

  function reconcileSelection() {
    const state = port.read();
    const { selectedAccounts } = deriveAccountState(state);
    const patch: AccountPasswordPatch = {};
    if (selectedAccounts.length > 0 && !selectedAccounts.some((account) => account.id === state.selectedAccountId)) {
      patch.selectedAccountId = selectedAccounts[0].id;
    }
    const validSelectedAccountIds = state.selectedAccountIds.filter((id) =>
      selectedAccounts.some((account) => account.id === id)
    );
    if (validSelectedAccountIds.length !== state.selectedAccountIds.length) {
      patch.selectedAccountIds = validSelectedAccountIds;
    }
    if (Object.keys(patch).length > 0) port.write(patch);
  }

  function copyDeviceAccountInfo(account?: DeviceAccount) {
    const selectedAccount = account ?? deriveAccountState().selectedAccount;
    return formatDeviceAccountInfo(selectedAccount);
  }

  function copySelectedAccountInfo() {
    port.setActivePopover(null);
    const state = port.read();
    const { selectedAccountTargets } = deriveAccountState(state);
    if (!state.hasSelectedDevice || selectedAccountTargets.length === 0) {
      port.showStatus("请先选择账号");
      return;
    }
    const accountsWithPassword = selectedAccountTargets.filter((account) => account.password);
    if (accountsWithPassword.length === 0) {
      port.showStatus(selectedAccountTargets.length > 1 ? "选中的账号都没有密码" : "当前账号没有密码");
      return;
    }
    void port.copyText(
      accountsWithPassword.map((account) => copyDeviceAccountInfo(account)).join("\n\n"),
      "账号密码",
    );
  }

  function selectAccount(id: number) {
    const state = port.read();
    if (id === state.selectedAccountId) return;
    port.write({
      selectedAccountId: id,
      passwordVisible: false,
      visibleHistoryIds: [],
    });
  }

  function isAccountSelectedForBatch(id: number) {
    return port.read().selectedAccountIds.includes(id);
  }

  function toggleAccountBatchSelection(id: number) {
    const { selectedAccountIds } = port.read();
    port.write({
      selectedAccountIds: selectedAccountIds.includes(id)
        ? selectedAccountIds.filter((accountId) => accountId !== id)
        : [...selectedAccountIds, id],
    });
  }

  function selectAllCurrentAccounts() {
    port.write({ selectedAccountIds: deriveAccountState().selectedAccounts.map((account) => account.id) });
  }

  function clearAccountBatchSelection() {
    port.write({ selectedAccountIds: [] });
  }

  function openAddAccountDialog() {
    port.setActivePopover(null);
    if (!port.read().hasSelectedDevice) {
      port.showStatus("请先选择设备");
      return;
    }
    port.write({ accountForm: createEmptyAccountForm() });
    port.setActiveDialog("account");
  }

  function openEditAccountDialog() {
    port.setActivePopover(null);
    const state = port.read();
    if (state.selectedAccountIds.length > 1) {
      port.showStatus("编辑账号前请只选择一个账号");
      return;
    }
    const { selectedAccount } = deriveAccountState(state);
    if (!state.hasSelectedDevice || !selectedAccount.id) {
      port.showStatus("请先选择账号");
      return;
    }
    port.write({
      accountForm: {
        id: selectedAccount.id,
        username: selectedAccount.username,
        password: selectedAccount.password,
        tag: selectedAccount.tag,
        notes: selectedAccount.notes,
      },
    });
    port.setActiveDialog("account");
  }

  function hasDuplicateAccountUsername(
    accounts: DeviceAccount[],
    username: string,
    currentAccountUuid: string | null,
  ) {
    const normalizedUsername = username.trim();
    return accounts.some((account) =>
      account.uuid !== currentAccountUuid && account.username.trim() === normalizedUsername
    );
  }

  function validateAccountForSave(
    item: VaultItem | undefined,
    accounts: DeviceAccount[],
    form: AccountForm,
    currentAccountUuid: string | null,
  ) {
    if (!item) {
      port.showStatus("请先选择设备");
      return false;
    }
    const username = form.username.trim();
    if (!username) {
      port.showStatus("请输入用户名");
      return false;
    }
    const textFields: Array<[string, string, number, boolean]> = [
      ["用户名", form.username, INPUT_LIMITS.username, false],
      ["账号标签", form.tag, INPUT_LIMITS.accountTag, false],
      ["账号备注", form.notes, INPUT_LIMITS.notes, true],
    ];
    for (const [label, value, maxLength, allowLineBreaks] of textFields) {
      const error = getTextInputValidationError(value, maxLength, allowLineBreaks);
      if (error) {
        port.showStatus(`${label}${error}`, 5000);
        return false;
      }
    }
    if (!hasValidPasswordCharacters(form.password)) {
      port.showStatus(PASSWORD_CHARACTER_ERROR, 5000);
      return false;
    }
    if (hasDuplicateAccountUsername(accounts, username, currentAccountUuid)) {
      port.showStatus("当前设备下已存在同名账号");
      return false;
    }
    return true;
  }

  function getAccountChanges(account: DeviceAccount, form: AccountForm) {
    const values: Array<[string, string, string]> = [
      ["用户名", account.username, form.username.trim()],
      ["账号标签", account.tag, form.tag.trim()],
      ["备注", account.notes, form.notes.trim()],
    ];
    const changes = values
      .filter(([, from, to]) => from !== to)
      .map(([label, from, to]) => ({ label, from, to }));
    if (account.password !== form.password) {
      changes.push({
        label: "密码",
        from: account.password ? "已设置" : "未设置",
        to: form.password ? "已修改（内容已隐藏）" : "已清除（内容已隐藏）",
      });
    }
    return changes;
  }

  function saveAccount() {
    const state = port.read();
    const { selectedAccounts } = deriveAccountState(state);
    const currentAccount = state.accountForm.id
      ? selectedAccounts.find((account) => account.id === state.accountForm.id)
      : null;
    if (!validateAccountForSave(
      state.hasSelectedDevice ? state.selectedItem : undefined,
      selectedAccounts,
      state.accountForm,
      currentAccount?.uuid ?? null,
    )) return;
    if (currentAccount) {
      const changes = getAccountChanges(currentAccount, state.accountForm);
      if (changes.length === 0) {
        port.showStatus("没有可保存的修改");
        return;
      }
      const passwordChanged = currentAccount.password !== state.accountForm.password;
      port.setActivePopover(null);
      port.setPendingConfirmation({
        action: passwordChanged ? "save-account-password" : "save-account",
        title: passwordChanged ? "保存账号密码变更" : "保存账号修改",
        message: `确认保存“${currentAccount.username || currentAccount.title || "当前账号"}”的修改？`,
        detail: passwordChanged
          ? currentAccount.password
            ? "确认后会更新账号资料，并把当前密码写入密码历史。新密码内容不会显示。"
            : "确认后会更新账号资料并设置新密码，密码内容不会显示。"
          : "确认后会更新账号资料，密码不会改变。",
        confirmLabel: passwordChanged ? "仍然保存" : "保存修改",
        summaryItems: [
          { label: "所属设备", value: state.selectedItem.deviceName },
          { label: "账号", value: currentAccount.username || currentAccount.title || "未填写用户名" },
        ],
        changes,
        itemUuid: state.selectedItem.uuid,
        accountUuid: currentAccount.uuid,
        accountDraft: { ...state.accountForm },
      });
      return;
    }
    executeSaveAccount({
      itemUuid: state.selectedItem.uuid,
      accountDraft: { ...state.accountForm },
    });
  }

  function executeSaveAccount(
    target?: Pick<PendingConfirmation, "itemUuid" | "accountUuid" | "accountDraft">,
  ) {
    const state = port.read();
    const form = target?.accountDraft ? { ...target.accountDraft } : { ...state.accountForm };
    const itemUuid = target?.itemUuid ?? state.selectedItem.uuid;
    const item = state.items.find((candidate) => candidate.uuid === itemUuid);
    const selectedAccounts = item ? getAccounts(item) : [];
    const currentAccount = target?.accountUuid
      ? selectedAccounts.find((account) => account.uuid === target.accountUuid)
      : form.id
        ? selectedAccounts.find((account) => account.id === form.id)
        : null;
    if (target?.accountUuid && !currentAccount) {
      port.showStatus("保存失败：待修改的账号已不存在", 5000);
      return;
    }
    if (!validateAccountForSave(item, selectedAccounts, form, currentAccount?.uuid ?? null)) return;
    if (currentAccount && getAccountChanges(currentAccount, form).length === 0) {
      port.showStatus("没有可保存的修改");
      return;
    }
    const now = formatDateTime(new Date());
    const nextId = currentAccount?.id ?? Math.max(0, ...selectedAccounts.map((account) => account.id)) + 1;
    const nextAccount = createAccountFromForm(form, nextId, now);
    const nextAccounts = currentAccount
      ? selectedAccounts.map((account) => {
          if (account.uuid !== currentAccount.uuid) return account;
          if (account.password !== nextAccount.password) {
            return {
              ...updateAccountPassword(account, nextAccount.password, now, "编辑账号时修改密码"),
              title: nextAccount.title,
              username: nextAccount.username,
              tag: nextAccount.tag,
              notes: nextAccount.notes,
            };
          }
          return {
            ...nextAccount,
            uuid: account.uuid,
            history: account.history,
            updatedAt: now,
            passwordChangedAt: account.passwordChangedAt,
          };
        })
      : [...selectedAccounts.filter((account) => !isBlankPlaceholderAccount(account)), nextAccount];
    port.write({
      items: state.items.map((item) =>
        item.uuid === itemUuid ? syncItemWithAccounts(item, nextAccounts) : item
      ),
    });
    if (state.selectedItem.uuid === itemUuid) {
      port.write({ selectedAccountId: nextId, selectedAccountIds: [] });
    }
    port.setActiveDialog(null);
  }

  async function deleteSelectedAccount(
    target: Pick<PendingConfirmation, "itemUuid" | "accountUuids">,
  ) {
    const itemUuid = target.itemUuid;
    const accountUuids = target.accountUuids ?? [];
    if (!itemUuid || accountUuids.length === 0) {
      port.showStatus("删除失败：账号目标信息不完整，请重新选择");
      return;
    }

    const initialState = port.read();
    const initialItem = initialState.items.find((item) => item.uuid === itemUuid);
    if (!initialItem) {
      port.showStatus("删除失败：待删除的设备已不存在");
      return;
    }
    const initialAccounts = getAccounts(initialItem);
    if (accountUuids.some((uuid) => !initialAccounts.some((account) => account.uuid === uuid))) {
      port.showStatus("删除失败：待删除的账号已不存在，请重新选择");
      return;
    }

    const snapshot = await port.createSafetySnapshot(`删除设备“${initialItem.deviceName}”的账号前`);
    if (!snapshot) return;

    const state = port.read();
    const targetItem = state.items.find((item) => item.uuid === itemUuid);
    if (!targetItem) {
      port.showStatus("删除失败：待删除的设备已不存在");
      return;
    }
    const targetAccounts = getAccounts(targetItem);
    if (accountUuids.some((uuid) => !targetAccounts.some((account) => account.uuid === uuid))) {
      port.showStatus("删除失败：待删除的账号已不存在，请重新选择");
      return;
    }

    const deletedAccounts = targetAccounts.filter((account) => accountUuids.includes(account.uuid));
    const deletedAccountIds = deletedAccounts.map((account) => account.id);
    const nextAccounts = targetAccounts.filter((account) => !accountUuids.includes(account.uuid));
    const patch: AccountPasswordPatch = {
      items: state.items.map((item) =>
        item.uuid === itemUuid
          ? syncItemWithAccounts({ ...item, updatedAt: formatDateTime(new Date()) }, nextAccounts)
          : item
      ),
    };
    if (state.selectedItem.uuid === itemUuid) {
      patch.selectedAccountIds = state.selectedAccountIds.filter((id) => !deletedAccountIds.includes(id));
      if (deletedAccountIds.includes(state.selectedAccountId)) {
        patch.selectedAccountId = nextAccounts[0]?.id ?? 0;
        patch.passwordVisible = false;
        patch.visibleHistoryIds = [];
      }
    }
    port.write(patch);
    port.setActivePopover(null);
    port.offerSnapshotUndo(
      snapshot.id,
      accountUuids.length > 1 ? `${accountUuids.length} 个账号已删除` : "账号已删除",
    );
  }

  function requestDeleteSelectedAccount() {
    const state = port.read();
    const { selectedAccounts, selectedAccountTargets } = deriveAccountState(state);
    if (!state.hasSelectedDevice || selectedAccountTargets.length === 0) {
      port.showStatus("请先选择账号");
      port.setActivePopover(null);
      return;
    }
    port.setActivePopover(null);
    port.setActiveDialog(null);
    const selectedAccountCount = selectedAccountTargets.length;
    const currentPasswordCount = selectedAccountTargets.filter((account) => Boolean(account.password)).length;
    const historyCount = selectedAccountTargets.reduce((count, account) => count + account.history.length, 0);
    const targetLabel = selectedAccountCount > 1
      ? `${selectedAccountCount} 个账号`
      : `账号“${selectedAccountTargets[0].username || selectedAccountTargets[0].title || "当前账号"}”`;
    const deviceDescription = [state.selectedItem.deviceName, state.selectedItem.deviceType]
      .filter(Boolean)
      .join(" · ") || "所属设备信息未设置";
    const removingAllAccounts = selectedAccountCount >= selectedAccounts.length;
    port.setPendingConfirmation({
      action: "delete-account",
      title: "删除账号",
      message: `确认删除${targetLabel}？账号资料、当前密码和密码历史记录都会移除。`,
      detail: `删除前会创建加密快照。删除后可立即撤销；${removingAllAccounts ? "设备仍会保留，但会显示为暂无账号。" : "设备和其他账号不会受影响。"} 如果之后继续修改数据，可从“数据快照”恢复。`,
      confirmLabel: "删除账号",
      target: {
        label: targetLabel,
        description: deviceDescription,
        icon: "account",
      },
      impactItems: [
        { label: "账号资料", value: `${selectedAccountCount} 个` },
        { label: "当前密码", value: `${currentPasswordCount} 个` },
        { label: "密码历史记录", value: `${historyCount} 条` },
      ],
      itemUuid: state.selectedItem.uuid,
      accountUuids: selectedAccountTargets.map((account) => account.uuid),
    });
  }

  function executeAccountConfirmation(confirmation: PendingConfirmation) {
    if (confirmation.action === "delete-account") {
      return deleteSelectedAccount(confirmation).then(() => true);
    }
    if (confirmation.action === "save-account" || confirmation.action === "save-account-password") {
      executeSaveAccount(confirmation);
      return true;
    }
    return false;
  }

  return {
    deriveAccountState,
    reconcileSelection,
    copyDeviceAccountInfo,
    copySelectedAccountInfo,
    selectAccount,
    isAccountSelectedForBatch,
    toggleAccountBatchSelection,
    selectAllCurrentAccounts,
    clearAccountBatchSelection,
    openAddAccountDialog,
    openEditAccountDialog,
    hasDuplicateAccountUsername,
    saveAccount,
    executeSaveAccount,
    deleteSelectedAccount,
    requestDeleteSelectedAccount,
    executeAccountConfirmation,
  };
}
