import { platformOperation } from "./platform-operation";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export function createVaultSecurityApi(invoke: Invoke) {
  return {
    lock: () => platformOperation("security", () => invoke<void>("lock_vault")),
    status: () => platformOperation("security", () => invoke<boolean>("get_vault_lock_status")),
    unlock: (password: string) => platformOperation("security", () => invoke<void>("unlock_vault", { password })),
    setup: (password: string) => platformOperation("security", () => invoke<string>("setup_vault_password", { password })),
    change: (currentPassword: string, newPassword: string) => platformOperation("security", () => invoke<string>("change_vault_password", { currentPassword, newPassword })),
    disable: (password: string) => platformOperation("security", () => invoke<void>("disable_vault_password", { password })),
    recover: (recoveryFile: string, newPassword: string) => platformOperation("security", () => invoke<string>("recover_vault_password", { recoveryFile, newPassword })),
  };
}
