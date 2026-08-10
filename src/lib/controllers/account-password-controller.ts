import type { PendingConfirmation } from "../types";
import { createAccountController } from "./account-controller";
import { createPasswordController } from "./password-controller";
import type {
  AccountPasswordControllerPort,
  AccountPasswordDerivedState,
} from "./account-password-types";

export type {
  AccountPasswordControllerPort,
  AccountPasswordDerivedState,
  AccountPasswordPatch,
  AccountPasswordState,
  AccountSelectionState,
  PasswordUpdateForm,
} from "./account-password-types";

export function createAccountPasswordController(port: AccountPasswordControllerPort) {
  const accountController = createAccountController(port);
  const passwordController = createPasswordController(port);

  function derive(): AccountPasswordDerivedState {
    return {
      ...accountController.deriveAccountState(),
      ...passwordController.derivePasswordState(),
    };
  }

  async function executeConfirmation(confirmation: PendingConfirmation) {
    const accountResult = await accountController.executeAccountConfirmation(confirmation);
    if (accountResult !== false) return accountResult;
    return await passwordController.executePasswordConfirmation(confirmation);
  }

  return {
    ...accountController,
    ...passwordController,
    derive,
    executeConfirmation,
  };
}
