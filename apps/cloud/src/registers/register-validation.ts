export interface RegisterFieldValidationFailure {
  field: "name";
  message: string;
}

// Mirrors `@purosur/contracts`'s register name limit because this app's `tsc` build (explicit
// `rootDir`) cannot import that package's untranspiled source; `register-validation.test.ts` guards
// against drift.
export const REGISTER_NAME_MAX_LENGTH = 100;

export function registerNameLength(name: string): number {
  return Array.from(name).length;
}

export function readRegisterName(body: unknown): string | undefined {
  const raw = (body as { name?: unknown } | undefined)?.name;
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function registerNameValidationFailure(
  name: string | undefined,
): RegisterFieldValidationFailure | undefined {
  if (!name) {
    return { field: "name", message: "name must not be empty" };
  }
  if (registerNameLength(name) > REGISTER_NAME_MAX_LENGTH) {
    return {
      field: "name",
      message: `name must be at most ${REGISTER_NAME_MAX_LENGTH} characters`,
    };
  }
  return undefined;
}
