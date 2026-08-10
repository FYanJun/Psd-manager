import type { DeviceAccount, VaultItem } from "../types";
import { createBlankAccount, getAccounts } from "../vault";

export function resolveSelectedAccount(item: VaultItem, selectedAccountId: number) {
  const accounts = getAccounts(item);
  return {
    accounts,
    selectedAccount: accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? createBlankAccount(),
  };
}

export function getSelectedAccountTargets(
  accounts: DeviceAccount[],
  selectedAccount: DeviceAccount,
  selectedAccountIds: number[],
) {
  const selectedBatch = accounts.filter((account) => selectedAccountIds.includes(account.id));
  return selectedBatch.length > 0 ? selectedBatch : selectedAccount.id ? [selectedAccount] : [];
}

export function sortPasswordHistory(account: DeviceAccount, descending: boolean) {
  return [...account.history].sort((left, right) => descending ? right.id - left.id : left.id - right.id);
}
