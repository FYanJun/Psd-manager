import {
  getBulkPasswordMatches,
  getBulkPasswordMatchKey,
  getBulkUsernameSuggestions,
  updateAccountPassword,
} from "../device-commands";
import {
  getTextInputValidationError,
  hasValidPasswordCharacters,
  INPUT_LIMITS,
  PASSWORD_CHARACTER_ERROR,
} from "../input-validation";
import type {
  BulkPasswordMatch,
  BulkUsernameSuggestion,
  DeviceType,
  PendingConfirmation,
  PasswordHistory,
} from "../types";
import { formatDateTime } from "../utils";
import { getAccounts, syncItemWithAccounts } from "../vault";
import {
  getAccountSelectionState,
  type AccountPasswordControllerPort,
  type AccountPasswordPatch,
  type AccountPasswordState,
} from "./account-password-types";

export function createPasswordController(port: AccountPasswordControllerPort) {
  function validateNewPassword(password: string) {
    if (!password) {
      port.showStatus("请输入新密码");
      return false;
    }
    if (!hasValidPasswordCharacters(password)) {
      port.showStatus(PASSWORD_CHARACTER_ERROR, 5000);
      return false;
    }
    return true;
  }

  function validatePasswordReason(reason: string) {
    const error = getTextInputValidationError(reason, INPUT_LIMITS.passwordReason);
    if (error) {
      port.showStatus(`更新原因${error}`, 5000);
      return false;
    }
    return true;
  }

  function derivePasswordState(state = port.read()) {
    const bulkUsernameSuggestions = state.bulkUsernameSearch.trim() && !state.bulkPasswordForm.username.trim()
      ? getBulkUsernameSuggestions(state.items, state.bulkPasswordForm, state.bulkUsernameSearch)
      : [];
    const bulkPasswordMatches = state.bulkPasswordForm.username.trim()
      ? getBulkPasswordMatches(state.items, state.bulkPasswordForm)
      : [];
    const bulkPasswordSelectedMatches = bulkPasswordMatches.filter((match) =>
      !state.bulkPasswordDeselectedKeys.includes(getBulkPasswordMatchKey(match))
    );
    return {
      bulkUsernameSuggestions,
      bulkPasswordMatches,
      bulkPasswordSelectedMatches,
    };
  }

  function maskPassword(password: string) {
    return "•".repeat(Math.min(Math.max(password.length, 8), 14));
  }

  function toggleHistoryPassword(id: number) {
    const { visibleHistoryIds } = port.read();
    port.write({
      visibleHistoryIds: visibleHistoryIds.includes(id)
        ? visibleHistoryIds.filter((visibleId) => visibleId !== id)
        : [...visibleHistoryIds, id],
    });
  }

  function canUseGeneratorForCurrentAccount() {
    return port.getGeneratorState().target === "current-account";
  }

  function canUseGeneratorForBulkUpdate() {
    return port.getGeneratorState().target === "bulk-password";
  }

  function ensureGeneratedPassword() {
    let password = port.getGeneratorState().generatedPassword;
    if (!password) {
      port.generatePassword();
      password = port.getGeneratorState().generatedPassword;
    }
    return password;
  }

  function useGeneratedPasswordForCurrentDevice() {
    if (!canUseGeneratorForCurrentAccount()) {
      port.showStatus("请从修改密码窗口打开随机密码生成器");
      return;
    }
    const generatedPassword = ensureGeneratedPassword();
    if (!generatedPassword) return;
    port.write({ passwordForm: { password: generatedPassword, reason: "" } });
    port.closeGeneratorPanel(true);
    port.setActiveDialog("password");
  }

  function useGeneratedPasswordForBulkUpdate() {
    if (!canUseGeneratorForBulkUpdate()) {
      port.showStatus("请从批量改密窗口打开随机密码生成器");
      return;
    }
    const generatedPassword = ensureGeneratedPassword();
    if (!generatedPassword) return;
    const target = port.getGeneratorState().target;
    port.closeGeneratorPanel(true);
    if (target === "bulk-password") {
      const { bulkPasswordForm } = port.read();
      port.write({
        bulkPasswordForm: {
          ...bulkPasswordForm,
          password: generatedPassword,
          reason: bulkPasswordForm.reason,
        },
      });
      port.setActiveDialog("bulk-password");
    }
  }

  function openPasswordDialog() {
    port.setActivePopover(null);
    const state = port.read();
    if (!state.hasSelectedDevice || getAccountSelectionState(state).selectedAccountTargets.length === 0) {
      port.showStatus("请先选择账号");
      return;
    }
    port.write({ passwordForm: { password: "", reason: "" } });
    port.setActiveDialog("password");
  }

  function requestRestoreHistoryPassword(history: PasswordHistory) {
    const state = port.read();
    const { selectedAccount } = getAccountSelectionState(state);
    if (!state.hasSelectedDevice || !selectedAccount.id) return;
    if (!hasValidPasswordCharacters(history.password)) {
      port.showStatus(`这条历史${PASSWORD_CHARACTER_ERROR}`, 5000);
      return;
    }
    port.setPendingConfirmation({
      action: "restore-history",
      itemUuid: state.selectedItem.uuid,
      accountUuid: selectedAccount.uuid,
      historyUuid: history.uuid,
      passwordValue: history.password,
      title: "恢复历史密码",
      message: `将“${selectedAccount.username || selectedAccount.title}”恢复到这条历史密码？`,
      detail: "当前密码会先写入新的历史记录，然后再恢复选中的旧密码。",
      confirmLabel: "确认恢复",
      summaryItems: [
        { label: "所属设备", value: state.selectedItem.deviceName },
        { label: "历史时间", value: history.changedAt || "未记录" },
      ],
    });
  }

  function executeRestoreHistoryPassword(confirmation: PendingConfirmation) {
    const state = port.read();
    const item = state.items.find((candidate) => candidate.uuid === confirmation.itemUuid);
    const account = item && getAccounts(item).find((candidate) => candidate.uuid === confirmation.accountUuid);
    const history = account?.history.find((candidate) => candidate.uuid === confirmation.historyUuid);
    if (!item || !account || !history) {
      port.showStatus("要恢复的密码历史已经不存在", 5000);
      return;
    }
    const password = confirmation.passwordValue ?? "";
    if (!hasValidPasswordCharacters(password)) {
      port.showStatus(`这条历史${PASSWORD_CHARACTER_ERROR}`, 5000);
      return;
    }
    if (account.password === password) {
      port.showStatus("当前密码已经与这条历史记录相同");
      return;
    }
    const changedAt = formatDateTime(new Date());
    const nextAccounts = getAccounts(item).map((candidate) =>
      candidate.uuid === account.uuid
        ? updateAccountPassword(
            candidate,
            password,
            changedAt,
            `恢复历史密码（原记录：${history.changedAt || "未记录"}）`,
          )
        : candidate
    );
    port.write({
      items: state.items.map((candidate) =>
        candidate.uuid === item.uuid ? syncItemWithAccounts(candidate, nextAccounts) : candidate
      ),
      selectedId: item.id,
      selectedAccountId: account.id,
      passwordVisible: false,
      visibleHistoryIds: [],
    });
    port.showStatus("历史密码已恢复");
  }

  function openBulkPasswordDialog(useGenerated = false) {
    const state = port.read();
    port.setActivePopover(null);
    port.setOpenTypePicker(null);
    port.write({
      bulkTypeSearch: "",
      bulkUsernameSearch: "",
      bulkUsernameSuggestionsOpen: false,
      bulkPasswordDeselectedKeys: [],
      bulkPasswordForm: {
        deviceType: state.selectedDeviceType,
        username: "",
        password: useGenerated ? port.getGeneratorState().generatedPassword : "",
        reason: "",
      },
    });
    port.setActiveDialog("bulk-password");
  }

  function setBulkPasswordDeviceType(deviceType: "全部设备" | DeviceType) {
    const { bulkPasswordForm } = port.read();
    port.write({
      bulkPasswordForm: { ...bulkPasswordForm, deviceType, username: "" },
      bulkUsernameSearch: "",
      bulkUsernameSuggestionsOpen: false,
      bulkPasswordDeselectedKeys: [],
      bulkTypeSearch: "",
    });
    port.setOpenTypePicker(null);
  }

  function updateBulkUsernameSearch(username: string) {
    const state = port.read();
    const patch: AccountPasswordPatch = {
      bulkUsernameSearch: username,
      bulkUsernameSuggestionsOpen: Boolean(username.trim()),
    };
    if (state.bulkPasswordForm.username) {
      patch.bulkPasswordForm = { ...state.bulkPasswordForm, username: "" };
      patch.bulkPasswordDeselectedKeys = [];
    }
    port.write(patch);
  }

  function selectBulkUsername(suggestion: BulkUsernameSuggestion) {
    const { bulkPasswordForm } = port.read();
    port.write({
      bulkUsernameSearch: suggestion.username,
      bulkUsernameSuggestionsOpen: false,
      bulkPasswordForm: { ...bulkPasswordForm, username: suggestion.username },
      bulkPasswordDeselectedKeys: [],
    });
  }

  function isBulkPasswordMatchSelected(match: BulkPasswordMatch) {
    return !port.read().bulkPasswordDeselectedKeys.includes(getBulkPasswordMatchKey(match));
  }

  function toggleBulkPasswordMatch(match: BulkPasswordMatch) {
    const state = port.read();
    const key = getBulkPasswordMatchKey(match);
    port.write({
      bulkPasswordDeselectedKeys: state.bulkPasswordDeselectedKeys.includes(key)
        ? state.bulkPasswordDeselectedKeys.filter((deselectedKey) => deselectedKey !== key)
        : [...state.bulkPasswordDeselectedKeys, key],
    });
  }

  function selectAllBulkPasswordMatches() {
    const state = port.read();
    const candidateKeySet = new Set(derivePasswordState(state).bulkPasswordMatches.map(getBulkPasswordMatchKey));
    port.write({
      bulkPasswordDeselectedKeys: state.bulkPasswordDeselectedKeys.filter((key) => !candidateKeySet.has(key)),
    });
  }

  function clearBulkPasswordMatches() {
    const state = port.read();
    const matchKeys = derivePasswordState(state).bulkPasswordMatches.map(getBulkPasswordMatchKey);
    port.write({
      bulkPasswordDeselectedKeys: Array.from(new Set([...state.bulkPasswordDeselectedKeys, ...matchKeys])),
    });
  }

  function resetBulkPasswordSelection() {
    port.write({ bulkPasswordDeselectedKeys: [] });
  }

  function savePasswordUpdate() {
    const state = port.read();
    const { selectedAccount, selectedAccountTargets } = getAccountSelectionState(state);
    if (!state.hasSelectedDevice || selectedAccountTargets.length === 0) {
      port.showStatus("请先选择账号");
      port.setActiveDialog(null);
      return;
    }
    if (!validateNewPassword(state.passwordForm.password)) return;
    if (!validatePasswordReason(state.passwordForm.reason)) return;
    const updatesMultipleAccounts = selectedAccountTargets.length > 1;
    port.setPendingConfirmation({
      action: "update-password",
      title: updatesMultipleAccounts ? "批量更新所选账号密码" : "确认更新密码",
      message: updatesMultipleAccounts
        ? `确认更新 ${selectedAccountTargets.length} 个账号的密码？`
        : `确认更新“${selectedAccount.username || selectedAccount.title || "当前账号"}”的密码？`,
      detail: updatesMultipleAccounts
        ? "确认后会替换这些账号的当前密码，并把旧密码分别写入密码历史。"
        : "当前密码会被替换，旧密码会自动保存在密码历史中。",
      confirmLabel: updatesMultipleAccounts ? "确认更新" : "更新密码",
      itemUuid: state.selectedItem.uuid,
      accountUuids: selectedAccountTargets.map((account) => account.uuid),
      passwordValue: state.passwordForm.password,
      reasonValue: state.passwordForm.reason,
      summaryItems: updatesMultipleAccounts
        ? [
            { label: "所属设备", value: state.selectedItem.deviceName },
            { label: "影响账号", value: `${selectedAccountTargets.length} 个` },
          ]
        : undefined,
    });
  }

  function executePasswordUpdate(confirmation: PendingConfirmation) {
    const state = port.read();
    const item = state.items.find((candidate) => candidate.uuid === confirmation.itemUuid);
    const accountUuids = confirmation.accountUuids ?? [];
    const password = confirmation.passwordValue ?? "";
    if (!item || accountUuids.length === 0) {
      port.showStatus("更新失败：密码目标已不存在", 5000);
      return;
    }
    if (!validateNewPassword(password)) return;
    if (!validatePasswordReason(confirmation.reasonValue ?? "")) return;
    const selectedAccounts = getAccounts(item);
    const selectedAccountTargets = selectedAccounts.filter((account) => accountUuids.includes(account.uuid));
    if (selectedAccountTargets.length !== accountUuids.length) {
      port.showStatus("更新失败：部分账号已不存在，请重新选择", 5000);
      return;
    }
    const changedAt = formatDateTime(new Date());
    const reason = (confirmation.reasonValue ?? "").trim();
    const nextAccounts = selectedAccounts.map((account) =>
      accountUuids.includes(account.uuid)
        ? updateAccountPassword(account, password, changedAt, reason)
        : account
    );
    port.write({
      items: state.items.map((item) =>
        item.uuid === confirmation.itemUuid ? syncItemWithAccounts(item, nextAccounts) : item
      ),
    });
    port.setActiveDialog(null);
    port.write({
      passwordVisible: false,
      visibleHistoryIds: [],
    });
    const selectedAccount = selectedAccountTargets[0];
    port.showStatus(
      accountUuids.length > 1
        ? `${accountUuids.length} 个账号密码已更新`
        : `${selectedAccount.username || selectedAccount.title || "当前账号"}密码已更新`,
    );
  }

  function validateBulkPasswordUpdate(state: AccountPasswordState) {
    const derived = derivePasswordState(state);
    if (!validateNewPassword(state.bulkPasswordForm.password)) return null;
    if (!validatePasswordReason(state.bulkPasswordForm.reason)) return null;
    if (derived.bulkPasswordMatches.length === 0) {
      port.showStatus("没有匹配账号");
      return null;
    }
    if (derived.bulkPasswordSelectedMatches.length === 0) {
      port.showStatus("请选择需要改密的账号");
      return null;
    }
    return derived.bulkPasswordSelectedMatches;
  }

  function saveBulkPasswordUpdate() {
    const state = port.read();
    const matches = validateBulkPasswordUpdate(state);
    if (!matches) return;
    port.setPendingConfirmation({
      action: "bulk-update-password",
      title: "批量更新密码",
      message: `确认更新 ${matches.length} 个账号的密码？`,
      detail: "确认后会批量替换当前密码，并为每个账号写入旧密码历史。",
      confirmLabel: "确认批量更新",
      accountTargets: matches.map((match) => ({
        itemUuid: match.itemUuid,
        accountUuid: match.accountUuid,
      })),
      passwordValue: state.bulkPasswordForm.password,
      reasonValue: state.bulkPasswordForm.reason,
      summaryItems: [
        { label: "设备范围", value: state.bulkPasswordForm.deviceType },
        { label: "匹配用户名", value: state.bulkPasswordForm.username },
        { label: "影响账号", value: `${matches.length} 个` },
      ],
    });
  }

  function executeBulkPasswordUpdate(confirmation: PendingConfirmation) {
    const state = port.read();
    const targets = confirmation.accountTargets ?? [];
    const password = confirmation.passwordValue ?? "";
    if (!validateNewPassword(password)) return;
    if (!validatePasswordReason(confirmation.reasonValue ?? "")) return;
    if (targets.length === 0) {
      port.showStatus("更新失败：批量改密目标不完整", 5000);
      return;
    }
    const targetAccountUuidsByItem = new Map<string, Set<string>>();
    targets.forEach((target) => {
      const accountUuids = targetAccountUuidsByItem.get(target.itemUuid) ?? new Set<string>();
      accountUuids.add(target.accountUuid);
      targetAccountUuidsByItem.set(target.itemUuid, accountUuids);
    });
    const existingTargetCount = state.items.reduce((count, item) => {
      const accountUuids = targetAccountUuidsByItem.get(item.uuid);
      if (!accountUuids) return count;
      return count + getAccounts(item).filter((account) => accountUuids.has(account.uuid)).length;
    }, 0);
    if (existingTargetCount !== targets.length) {
      port.showStatus("更新失败：部分批量改密目标已不存在，请重新选择", 5000);
      return;
    }
    const reason = (confirmation.reasonValue ?? "").trim();
    const changedAt = formatDateTime(new Date());
    port.write({
      items: state.items.map((item) => {
        const accountUuids = targetAccountUuidsByItem.get(item.uuid);
        if (!accountUuids) return item;
        const nextAccounts = getAccounts(item).map((account) =>
          accountUuids.has(account.uuid)
            ? updateAccountPassword(account, password, changedAt, reason)
            : account
        );
        return syncItemWithAccounts(item, nextAccounts);
      }),
    });
    port.setActiveDialog(null);
    port.write({ passwordVisible: false, visibleHistoryIds: [] });
    port.showStatus(`已更新 ${targets.length} 个账号`);
  }

  function executePasswordConfirmation(confirmation: PendingConfirmation) {
    if (confirmation.action === "update-password") {
      executePasswordUpdate(confirmation);
      return true;
    }
    if (confirmation.action === "bulk-update-password") {
      executeBulkPasswordUpdate(confirmation);
      return true;
    }
    if (confirmation.action === "restore-history") {
      executeRestoreHistoryPassword(confirmation);
      return true;
    }
    return false;
  }

  return {
    derivePasswordState,
    maskPassword,
    toggleHistoryPassword,
    canUseGeneratorForCurrentAccount,
    canUseGeneratorForBulkUpdate,
    useGeneratedPasswordForCurrentDevice,
    useGeneratedPasswordForBulkUpdate,
    openPasswordDialog,
    requestRestoreHistoryPassword,
    executeRestoreHistoryPassword,
    openBulkPasswordDialog,
    setBulkPasswordDeviceType,
    updateBulkUsernameSearch,
    selectBulkUsername,
    isBulkPasswordMatchSelected,
    toggleBulkPasswordMatch,
    selectAllBulkPasswordMatches,
    clearBulkPasswordMatches,
    resetBulkPasswordSelection,
    savePasswordUpdate,
    executePasswordUpdate,
    saveBulkPasswordUpdate,
    executeBulkPasswordUpdate,
    executePasswordConfirmation,
  };
}
