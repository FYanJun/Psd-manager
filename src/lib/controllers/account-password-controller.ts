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

  return {
    ...accountController,
    ...passwordController,
    derive,
  };
}
