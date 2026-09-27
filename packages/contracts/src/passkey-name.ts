import { codePointLength } from "@purosur/domain";

export const PASSKEY_NAME_MAX_LENGTH = 40;

export function passkeyNameLength(name: string): number {
  return codePointLength(name);
}

export function isPasskeyNameTooLong(name: string): boolean {
  return passkeyNameLength(name) > PASSKEY_NAME_MAX_LENGTH;
}
