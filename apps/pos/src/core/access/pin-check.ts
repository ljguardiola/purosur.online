import { timingSafeEqual } from "node:crypto";
import { decodePinSalt } from "@purosur/domain";
import { derivePinVerifier } from "./pin-verifier";
import type { SignInRecord, SignInStore } from "./sqlite-sign-in-store";

export interface PinCheckDeps {
  store: Pick<SignInStore, "signInRecord">;
  readPepper: () => Promise<string | undefined>;
  hashPin: (pin: string, salt: Uint8Array) => Promise<string>;
}

export interface SignableRecord {
  record: SignInRecord;
  salt: Uint8Array;
}

export type PinCheck = { kind: "right_pin" } | { kind: "wrong_pin" } | { kind: "unavailable" };

function sameText(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function pinMatches(pepper: string, pinHash: string, record: SignInRecord): boolean {
  return sameText(derivePinVerifier(pepper, pinHash), record.verifier);
}

export function signableRecord(
  store: PinCheckDeps["store"],
  userId: string,
): SignableRecord | undefined {
  const record = store.signInRecord(userId);
  const salt = record === undefined ? undefined : decodePinSalt(record.salt);
  return record === undefined || salt === undefined ? undefined : { record, salt };
}

export async function checkPin(
  deps: Omit<PinCheckDeps, "store">,
  { record, salt }: SignableRecord,
  pin: string,
): Promise<PinCheck> {
  const pepper = await deps.readPepper();
  if (pepper === undefined) {
    return { kind: "unavailable" };
  }
  return pinMatches(pepper, await deps.hashPin(pin, salt), record)
    ? { kind: "right_pin" }
    : { kind: "wrong_pin" };
}
