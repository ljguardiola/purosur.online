import { isPasskeyNameTooLong } from "@purosur/domain";

export function readPasskeyName(body: unknown): string | undefined {
  const rawName = (body as { passkey_name?: unknown } | undefined)?.passkey_name;
  if (typeof rawName !== "string") {
    return undefined;
  }
  const trimmed = rawName.trim();
  if (trimmed.length === 0 || isPasskeyNameTooLong(trimmed)) {
    return undefined;
  }
  return trimmed;
}
