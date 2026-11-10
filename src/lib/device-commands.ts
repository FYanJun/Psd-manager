import type {
  AccountForm,
  BulkPasswordMatch,
  DeviceAccount,
  PasswordHistory,
  VaultItem,
} from "./types";
import { DEFAULT_ACCOUNT_TAG } from "./constants";
import { getAccounts } from "./vault";
import { createUuid } from "./uuid";

export function createAccountFromForm(
  accountForm: AccountForm,
  id: number,
  updatedAt: string
): DeviceAccount {
  const username = accountForm.username.trim();
  const tag = accountForm.tag.trim() || DEFAULT_ACCOUNT_TAG;
  return {
    uuid: createUuid(),
    id,
    title: username || "未填写用户名",
    username,
    password: accountForm.password,
    tag,
    notes: accountForm.notes.trim(),
    updatedAt,
    passwordChangedAt: accountForm.password ? updatedAt : "",
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
    item.assetCode ? `资产编号: ${item.assetCode}` : "",
    item.location ? `位置: ${item.location}` : "",
    item.ipAddress ? `连接地址: ${item.ipAddress}` : "",
    `${getAccounts(item).length} 个账号`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function getBulkPasswordMatches(items: VaultItem[]): BulkPasswordMatch[] {
  return items.flatMap(item => getAccounts(item).map(account => ({
    itemUuid: item.uuid,
    accountUuid: account.uuid,
    deviceName: item.deviceName,
    deviceType: item.deviceType,
    deviceTag: item.tag,
    ipAddress: item.ipAddress,
    username: account.username,
    tag: account.tag,
    updatedAt: account.updatedAt || item.updatedAt,
  })));
}

export function getBulkPasswordMatchKey(match: Pick<BulkPasswordMatch, "itemUuid" | "accountUuid">) {
  return `${match.itemUuid}:${match.accountUuid}`;
}

export function updateAccountPassword(account: DeviceAccount, password: string, changedAt: string, reason: string) {
  const historyEntry: PasswordHistory = {
    uuid: createUuid(),
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
    passwordChangedAt: changedAt,
    history: account.password ? [historyEntry, ...account.history] : account.history,
  };
}
