import { isPasskeyNameTooLong } from "@purosur/contracts";

/**
 * Reads a trimmed `passkey_name` from the request body: shared by `passkeys-registration-route.ts`
 * and `recovery-redemption-route.ts` so the limit and trimming never drift between them.
 */
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
