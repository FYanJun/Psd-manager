import type {
  AccountForm,
  BulkPasswordForm,
  BulkPasswordMatch,
  BulkUsernameSuggestion,
  DeviceAccount,
  DeviceType,
  PasswordHistory,
  VaultItem,
} from "./types";
import { DEFAULT_ACCOUNT_TAG } from "./constants";
import { getAccounts } from "./vault";
import { fuzzyContains, normalizeSearchValue } from "./utils";

export function createAccountFromForm(
  accountForm: AccountForm,
  id: number,
  updatedAt: string
): DeviceAccount {
  const username = accountForm.username.trim();
  const tag = accountForm.tag.trim() || DEFAULT_ACCOUNT_TAG;
  return {
    id,
    title: username || "未填写用户名",
    username,
    password: accountForm.password,
    tag,
    notes: accountForm.notes.trim(),
    updatedAt,
    history: [],
  };
}

export function formatDeviceAccountInfo(account: DeviceAccount) {
  return [
    account.username ? `${account.username}` : "",
    account.password ? `${account.password}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatDeviceInfo(item: VaultItem) {
  return [
    item.deviceName,
    item.deviceType ? `类型: ${item.deviceType}` : "",
    item.ipAddress ? `IP: ${item.ipAddress}` : "",
    `${getAccounts(item).length} 个账号`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function matchesBulkUsername(account: DeviceAccount, username: string) {
  const target = normalizeSearchValue(username);
  if (!target) return true;
  return normalizeSearchValue(account.username) === target;
}

export function matchesBulkUsernameSearch(account: DeviceAccount, username: string) {
  const target = username.trim();
  if (!target) return false;
  return fuzzyContains(normalizeSearchValue(account.username), target);
}

export function matchesBulkDeviceType(item: VaultItem, deviceType: "全部设备" | DeviceType) {
  return deviceType === "全部设备" || item.deviceType === deviceType;
}

export function getBulkPasswordMatches(items: VaultItem[], form: BulkPasswordForm): BulkPasswordMatch[] {
  return items.filter((item) => matchesBulkDeviceType(item, form.deviceType)).flatMap((item) =>
    getAccounts(item)
      .filter((account) => matchesBulkUsername(account, form.username))
      .map((account) => ({
        itemId: item.id,
        accountId: account.id,
        deviceName: item.deviceName,
        deviceType: item.deviceType,
        deviceTag: item.tag,
        ipAddress: item.ipAddress,
        username: account.username,
        tag: account.tag,
        updatedAt: account.updatedAt || item.updatedAt,
      }))
  );
}

export function getBulkUsernameSuggestions(
  items: VaultItem[],
  form: Pick<BulkPasswordForm, "deviceType">,
  usernameSearch: string
): BulkUsernameSuggestion[] {
  const suggestions = new Map<string, BulkUsernameSuggestion>();

  items.filter((item) => matchesBulkDeviceType(item, form.deviceType)).forEach((item) => {
    getAccounts(item)
      .filter((account) => matchesBulkUsernameSearch(account, usernameSearch))
      .forEach((account) => {
        const username = account.username.trim();
        if (!username) return;

        const key = normalizeSearchValue(username);
        if (!suggestions.has(key)) suggestions.set(key, { username });
      });
  });

  return Array.from(suggestions.values()).sort((left, right) =>
    left.username.localeCompare(right.username, "zh-Hans-CN")
  );
}

export function getBulkPasswordMatchKey(match: Pick<BulkPasswordMatch, "itemId" | "accountId">) {
  return `${match.itemId}:${match.accountId}`;
}

export function updateAccountPassword(account: DeviceAccount, password: string, changedAt: string, reason: string) {
  const historyEntry: PasswordHistory = {
    id: Math.max(0, ...account.history.map((entry) => entry.id)) + 1,
    password: account.password,
    newPassword: password,
    changedAt,
    reason,
  };
  return {
    ...account,
    password,
    updatedAt: changedAt,
    history: account.password ? [historyEntry, ...account.history] : account.history,
  };
}
