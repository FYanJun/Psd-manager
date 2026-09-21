import { AppError, type AppErrorKind } from "./app-error";
import { getErrorMessage } from "./utils";

// Caller supplies the operation domain. No command arguments or credentials
// are copied into errors, and an existing classified failure is preserved.
export async function platformOperation<T>(kind: AppErrorKind, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(getErrorMessage(error), kind);
  }
}
