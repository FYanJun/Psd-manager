import { platformOperation } from "./platform-operation";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export function createVaultSecurityApi(invoke: Invoke, onWarning: (warning: string) => void = () => undefined) {
  async function updatePassword(command: string, args: Record<string, unknown>): Promise<string> {
    const result = await platformOperation("security", () => invoke<string | { recoveryFile: string; cleanupWarning: string | null }>(command, args));
    if (typeof result === "string") return result;
    if (result.cleanupWarning) onWarning(result.cleanupWarning);
    return result.recoveryFile;
  }
  return {
    lock: () => platformOperation("security", () => invoke<void>("lock_vault")),
    status: () => platformOperation("security", () => invoke<boolean>("get_vault_lock_status")),
    unlock: (password: string) => platformOperation("security", () => invoke<void>("unlock_vault", { password })),
    verify: (password: string) => platformOperation("security", () => invoke<void>("verify_vault_password", { password })),
    setup: (password: string) => updatePassword("setup_vault_password", { password }),
    change: (currentPassword: string, newPassword: string) => updatePassword("change_vault_password", { currentPassword, newPassword }),
    disable: (password: string) => platformOperation("security", () => invoke<void>("disable_vault_password", { password })),
    recover: (recoveryFile: string, newPassword: string) => updatePassword("recover_vault_password", { recoveryFile, newPassword }),
  };
}
