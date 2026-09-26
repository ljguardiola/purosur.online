import { REGISTER_NAME_MAX_LENGTH, registerNameLength } from "@purosur/contracts";

export interface RegisterFieldValidationFailure {
  field: "name";
  message: string;
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
